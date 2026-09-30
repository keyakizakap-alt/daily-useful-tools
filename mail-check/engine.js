/* ============================================================
   おくるまえに — 点検エンジン
   ------------------------------------------------------------
   DOM に依存しない純粋関数のみ。ブラウザからは <script src> で
   グローバル OkuruMae として、Node からは require() で読む。
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OkuruMae = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============================================================
     定義
     ============================================================ */

  var SEVERITIES = ['高', '中', '低'];

  // 重要度ごとの減点。点数 = 100 - Σ(減点)
  var SEVERITY_WEIGHT = { '高': 20, '中': 8, '低': 3 };

  // 重要度ごとの減点の上限。「低」だけで0点にならないようにする
  // （点数は仕上がりの目安で、送信可否は「高」の件数で判断する）
  var SEVERITY_CAP = { '低': 15 };

  var SEVERITY_META = {
    '高': { label: '高', note: 'そのまま送ると相手の信頼や情報を損なうおそれ', mark: '■' },
    '中': { label: '中', note: '相手に違和感や手間を与えるおそれ', mark: '▲' },
    '低': { label: '低', note: '整えるとより読みやすくなる', mark: '●' }
  };

  var CATEGORIES = {
    security:    { label: '機密情報', desc: '本文に書くべきでない情報' },
    keigo:       { label: '敬語の誤り', desc: '相手や立場に合わない言い方' },
    double:      { label: '二重敬語', desc: '敬語が重なっている' },
    humble:      { label: '尊敬・謙譲の混同', desc: '相手の動作に謙譲語を使っている等' },
    vague:       { label: 'あいまい', desc: '期限や返答がはっきりしない' },
    tone:        { label: '言い方の圧', desc: '強く、または冷たく読まれる表現' },
    structure:   { label: '構成', desc: '件名・宛名・結び・署名など' },
    redundant:   { label: '冗長', desc: '短く言い換えられる' },
    notation:    { label: '表記', desc: '慣習的な書き分け' },
    consistency: { label: '文体', desc: '敬体と常体の混在など' }
  };

  var AUDIENCES = {
    external:  '社外の相手',
    boss:      '社内の上司・先輩',
    colleague: '社内の同僚'
  };

  var ALL_AUDIENCES = ['external', 'boss', 'colleague'];

  /* ============================================================
     スパンルール（本文中の位置を特定する指摘）
     ------------------------------------------------------------
     pattern    : g フラグつき正規表現。入れ子の量指定子は使わない
     fix        : 置換文字列 / (match) => string / null（候補なし）
     audiences  : 適用する送信相手（省略時は全員）
     validate   : (match, text) => boolean（省略時は常に true）
     skipInQuote: 引用行を除外するか（省略時 true）
     ============================================================ */

  var SPAN_RULES = [
    /* --- 機密情報 ---------------------------------------------------------- */
    {
      id: 'security.password',
      category: 'security', severity: '高',
      pattern: /(?:パスワード|ぱすわーど|PW|password|passcode)\s*(?:は|:|：|=|＝)\s*([!-~]{6,})/gi,
      message: '本文にパスワードを書いています',
      why: 'メールは転送・誤送信・端末の共有で第三者に渡りやすく、後から取り消せない。別の経路で伝える。',
      fix: null
    },
    {
      id: 'security.apikey',
      category: 'security', severity: '高',
      pattern: /(?:api[_-]?key|apikey|secret|access[_-]?token|token|アクセスキー|シークレット)\s*(?:は|:|：|=|＝)\s*([!-~]{12,})/gi,
      message: '本文にAPIキー・トークンらしき文字列を書いています',
      why: '資格情報はメールに残さない。漏えい時の影響範囲が広い。',
      fix: null
    },
    {
      id: 'security.card',
      category: 'security', severity: '高',
      pattern: /\d(?:[ -]?\d){11,18}/g,
      validate: function (m) { return isLuhnCard(m[0]); },
      message: 'クレジットカード番号らしき数字列があります',
      why: 'カード番号をメール本文で送ることは各社の規約でも推奨されていない。',
      fix: null
    },
    {
      id: 'security.mynumber',
      category: 'security', severity: '高',
      // 後読み（?<!）は対応していないブラウザで構文エラーになり、
      // ファイル全体が読み込めなくなるため、前後の文字は validate で見る
      pattern: /\d{12}/g,
      validate: function (m, text) {
        var before = m.index > 0 ? text.charAt(m.index - 1) : '';
        var after = text.charAt(m.index + m[0].length);
        return !/[\d-]/.test(before) && !/[\d-]/.test(after);
      },
      message: 'マイナンバーらしき12桁の数字があります',
      why: '個人番号は法令上、取扱いと保管に制限がある。メール本文に書かない。',
      fix: null
    },
    {
      id: 'security.account',
      category: 'security', severity: '低',
      pattern: /口座番号\s*(?:は|:|：)?\s*(\d{6,})/g,
      message: '口座番号を本文に書いています',
      why: '振込先のなりすまし詐欺で狙われやすい。請求書等の添付や別経路の併用を検討する。',
      fix: null
    },

    /* --- 敬語の誤り -------------------------------------------------------- */
    {
      id: 'keigo.ryokai',
      category: 'keigo', severity: '中',
      pattern: /了解(?:しました|いたしました|です)/g,
      audiences: ['external', 'boss'],
      message: '「了解」は対等・下位への応答と受け取られます',
      why: '社外や上位の相手には「承知しました」「承りました」が無難。',
      fix: '承知しました'
    },
    {
      id: 'keigo.gokurou',
      category: 'keigo', severity: '中',
      pattern: /ご苦労(?:様|さま)(?:です|でした)/g,
      audiences: ['external', 'boss'],
      message: '「ご苦労様」は上位から下位へのことばです',
      why: '社外や上司には「お疲れ様です」、社外なら「お世話になっております」。',
      fix: 'お疲れ様です'
    },
    {
      id: 'keigo.tondemo',
      category: 'keigo', severity: '中',
      pattern: /とんでもございません/g,
      message: '「とんでもございません」は誤用です',
      why: '「とんでもない」は一語なので「ない」だけを丁寧にできない。',
      fix: 'とんでもないことでございます'
    },
    {
      id: 'keigo.yoroshikatta',
      category: 'keigo', severity: '中',
      pattern: /よろしかったでしょうか/g,
      message: '過去形にする理由がありません',
      why: 'これから確認する内容なので現在形が正しい。',
      fix: 'よろしいでしょうか'
    },
    {
      id: 'keigo.osewasama',
      category: 'keigo', severity: '中',
      pattern: /お世話様(?:です|でした)/g,
      message: '「お世話様」は軽い言い方です',
      why: 'ビジネスメールの冒頭は「お世話になっております」が定型。',
      fix: 'お世話になっております'
    },
    {
      id: 'keigo.kakuiSama',
      category: 'keigo', severity: '中',
      pattern: /各位(?:様|殿)/g,
      message: '「各位」に敬称を重ねています',
      why: '「各位」自体が敬称。「関係者各位」のように使う。',
      fix: '各位'
    },
    {
      id: 'keigo.onchuSama',
      category: 'keigo', severity: '中',
      pattern: /(?:御中様|様御中|御中御中)/g,
      message: '「御中」と「様」は併記しません',
      why: '組織宛は「御中」、個人宛は「様」のいずれか一方。',
      fix: '御中'
    },
    {
      id: 'keigo.uchiSama',
      category: 'keigo', severity: '中',
      pattern: /(?:弊社|当社|私ども)の[^\s、。]{1,6}(?:様|さん)/g,
      audiences: ['external'],
      message: '身内に敬称を付けています',
      why: '社外の相手に対しては、自社の人間は「弊社の田中」のように呼ぶ。',
      fix: function (m) { return m[0].replace(/(?:様|さん)$/, ''); }
    },
    {
      id: 'keigo.goSuruKudasai',
      category: 'keigo', severity: '中',
      pattern: /ご([一-鿿]{1,4})して(ください|下さい|いただ)/g,
      message: '「ご〜する」に「ください」を続けています',
      why: '「ご確認ください」「ご確認いただく」のように「して」を挟まない。',
      fix: function (m) {
        return m[2] === 'いただ' ? 'ご' + m[1] + 'いただ' : 'ご' + m[1] + 'ください';
      }
    },
    {
      id: 'keigo.sumimasen',
      category: 'keigo', severity: '中',
      pattern: /(?:すみません|すいません)/g,
      audiences: ['external'],
      message: '社外には口語的です',
      why: '謝罪なら「申し訳ございません」、依頼の前置きなら「恐れ入りますが」。',
      fix: '申し訳ございません'
    },

    /* --- 尊敬・謙譲の混同 -------------------------------------------------- */
    {
      id: 'humble.aiteMoushi',
      category: 'humble', severity: '高',
      pattern: /((?:お客様|貴社|御社|先生|部長|課長|社長|先方)(?:が|は))申して(?:おり|い)/g,
      message: '相手の発言に謙譲語を使っています',
      why: '「申す」は自分側の動作。相手には「おっしゃる」。',
      fix: function (m) { return m[1] + 'おっしゃってい'; }
    },
    {
      id: 'humble.aiteMousare',
      category: 'humble', severity: '高',
      pattern: /((?:お客様|貴社|御社|先生|部長|課長|社長|先方)(?:が|は))申され/g,
      message: '相手の発言に謙譲語を使っています',
      why: '「申される」は「申す」に尊敬語を重ねた形。相手には「おっしゃる」。',
      fix: function (m) { return m[1] + 'おっしゃい'; }
    },
    {
      id: 'humble.jibunSonkei',
      category: 'humble', severity: '高',
      pattern: /(?:私|当方|弊社)(?:が|は|より)(?:ご覧になり|おっしゃ|お越しになり|お帰りになり)/g,
      message: '自分側の動作に尊敬語を使っています',
      why: '自分の動作は「拝見します」「申します」「伺います」のように謙譲語で述べる。',
      fix: null
    },
    {
      id: 'humble.haikenItadaku',
      category: 'humble', severity: '中',
      pattern: /拝見して(?:いただ|くださ)/g,
      message: '相手の動作に「拝見」を使っています',
      why: '「拝見」は自分が見ること。相手には「ご覧いただく」。',
      fix: function (m) { return m[0].replace('拝見して', 'ご覧'); }
    },

    /* --- 二重敬語 ---------------------------------------------------------- */
    {
      id: 'double.oukagai',
      category: 'double', severity: '中',
      pattern: /お伺い(?:し|いたし|させていただき)ます/g,
      message: '「伺う」が既に謙譲語です',
      why: '「お」＋「伺う」＋「いたす」で敬語が重なっている。',
      fix: '伺います'
    },
    {
      id: 'double.haikenSasete',
      category: 'double', severity: '中',
      pattern: /拝見させていただ(き|く|け)/g,
      message: '「拝見」に「させていただく」を重ねています',
      why: '「拝見」だけで十分に謙譲。',
      fix: function (m) {
        if (m[1] === 'き') return '拝見し';
        if (m[1] === 'く') return '拝見する';
        return '拝見でき';
      }
    },
    {
      id: 'double.ninarare',
      category: 'double', severity: '中',
      pattern: /(?:お読み|ご覧|お聞き|お話し|お帰り|お使い)になられ/g,
      message: '「お〜になる」に「られる」を重ねています',
      why: '「お読みになる」で既に尊敬語。',
      fix: function (m) { return m[0].replace('になられ', 'になり'); }
    },
    {
      id: 'double.ossharare',
      category: 'double', severity: '中',
      pattern: /おっしゃられ/g,
      message: '「おっしゃる」に「られる」を重ねています',
      why: '「おっしゃる」だけで尊敬語。',
      fix: 'おっしゃい'
    },
    {
      id: 'redundant.goSasete',
      category: 'redundant', severity: '低',
      pattern: /ご(確認|連絡|報告|案内|説明|提案|送付|返信)させていただきます/g,
      message: 'やや長い言い方です',
      why: '「ご連絡いたします」で同じ意味をより短く伝えられる。',
      fix: function (m) { return 'ご' + m[1] + 'いたします'; }
    },
    {
      id: 'double.itadakemasudeshouka',
      category: 'double', severity: '低',
      pattern: /いただけますでしょうか/g,
      message: '「ます」と「でしょう」が重なっています',
      why: '「いただけますか」「いただけないでしょうか」のいずれかにする。',
      fix: 'いただけますか'
    },

    /* --- あいまい ---------------------------------------------------------- */
    {
      id: 'vague.naruhaya',
      category: 'vague', severity: '中',
      pattern: /(?:なるはや|なるべく早く|出来るだけ早く|できるだけ早く|早めに)/g,
      message: '期限が人によって違う意味になります',
      why: '「10月2日（木）17時まで」のように日付と時刻で書くと往復が減る。',
      fix: null
    },
    {
      id: 'vague.konshuchu',
      category: 'vague', severity: '中',
      pattern: /(?:今週中|来週中|近日中|そのうち)/g,
      message: '期限がはっきりしません',
      why: '相手の週の区切りは自分と同じとは限らない。日付で示す。',
      fix: null
    },
    {
      id: 'vague.tekigi',
      category: 'vague', severity: '低',
      pattern: /(?:適宜|随時)/g,
      message: '頻度・範囲を相手の判断に委ねています',
      why: '「週1回」「変更があったとき」のように、想定を書くと解釈のずれが減る。',
      fix: null
    },
    {
      id: 'vague.ashita',
      category: 'vague', severity: '低',
      pattern: /(?:明日|明後日|本日中)/g,
      message: '読まれる時点でずれることがあります',
      why: '「明日（10月2日）」のように日付を併記すると誤解がない。',
      fix: null
    },
    {
      id: 'vague.daijoubu',
      category: 'vague', severity: '低',
      pattern: /大丈夫です/g,
      audiences: ['external', 'boss'],
      message: '可否どちらにも読めます',
      why: '「問題ございません」「結構です」など、意味を一つに絞る。',
      fix: '問題ございません'
    },

    /* --- 言い方の圧 -------------------------------------------------------- */
    {
      id: 'tone.shikyu',
      category: 'tone', severity: '中',
      pattern: /至急/g,
      message: '急かす語は相手の予定を無視して読まれます',
      why: '「本日17時までにご返信いただけますか。理由は〜」と期限と理由を書くほうが動いてもらいやすい。',
      fix: null
    },
    {
      id: 'tone.soukyu',
      category: 'tone', severity: '低',
      pattern: /早急に/g,
      message: '急かす語です',
      why: '期限を具体的に書けば「早急に」は不要。',
      fix: null
    },
    {
      id: 'tone.naze',
      category: 'tone', severity: '中',
      pattern: /なぜ[^。\n]{0,12}(?:ないのでしょうか|ないのですか|いただけないのでしょうか)/g,
      message: '詰問に読まれます',
      why: '「〜について、状況をお伺いできますでしょうか」と事実確認の形にする。',
      fix: null
    },
    {
      id: 'tone.zenkai',
      category: 'tone', severity: '中',
      pattern: /前回(?:も|は)(?:お伝え|申し上げ|ご連絡|お願い)/g,
      message: '相手の不履行を責める形になっています',
      why: '経緯は「念のため再度お送りします」と中立に書くと角が立たない。',
      fix: null
    },
    {
      id: 'tone.hazu',
      category: 'tone', severity: '中',
      pattern: /(?:のはず|するはず|届いているはず)(?:です|ですが|ですよね)/g,
      message: '相手の誤りを前提にした言い方です',
      why: '「〜と認識しておりますが、相違ありませんでしょうか」と確認の形にする。',
      fix: null
    },
    {
      id: 'tone.dounatte',
      category: 'tone', severity: '低',
      pattern: /どうなって(?:いますか|いるのでしょうか|いますでしょうか)/g,
      message: '問い詰める調子になります',
      why: '「進捗をお伺いできますでしょうか」が穏当。',
      fix: '進捗をお伺いできますか'
    },

    /* --- 冗長 -------------------------------------------------------------- */
    {
      id: 'redundant.mazuSaisho',
      category: 'redundant', severity: '低',
      pattern: /まず最初に/g,
      message: '同じ意味が重なっています', why: '「まず」だけで足りる。', fix: 'まず'
    },
    {
      id: 'redundant.kanarazuHitsuyou',
      category: 'redundant', severity: '低',
      pattern: /必ず必要/g,
      message: '同じ意味が重なっています', why: '「必要」だけで足りる。', fix: '必要'
    },
    {
      id: 'redundant.ichibanSaiteki',
      category: 'redundant', severity: '低',
      pattern: /(?:一番|最も)最適/g,
      message: '「最適」に最上級が重なっています', why: '「最適」だけで足りる。', fix: '最適'
    },
    {
      id: 'redundant.yakuTeido',
      category: 'redundant', severity: '低',
      pattern: /約([0-9０-９]{1,6}[^\s、。]{0,4})程度/g,
      message: 'おおよそを表す語が重なっています',
      why: '「約30分」または「30分程度」のどちらか一方にする。',
      fix: function (m) { return '約' + m[1]; }
    },
    {
      id: 'redundant.dekimasu',
      category: 'redundant', severity: '低',
      pattern: /することができます/g,
      message: '短く言えます', why: '「できます」で同じ意味。', fix: 'できます'
    },
    {
      id: 'redundant.katachide',
      category: 'redundant', severity: '低',
      pattern: /という形で/g,
      message: '意味のない言い回しです', why: '削っても文意は変わらない。', fix: ''
    },
    {
      id: 'redundant.ninarimasu',
      category: 'redundant', severity: '低',
      pattern: /(?:以上|こちら|資料|それ)になります/g,
      message: '「〜になります」は変化を表す言い方です',
      why: '変化していないので「です」でよい。',
      fix: function (m) { return m[0].replace('になります', 'です'); }
    },
    {
      id: 'redundant.nohou',
      category: 'redundant', severity: '低',
      pattern: /(?:こちら|そちら|あちら)の方(?:で|は|が)/g,
      message: '「の方」でぼかしています',
      why: '「こちらで」と言い切ってよい。',
      fix: function (m) { return m[0].replace('の方', ''); }
    },
    {
      id: 'redundant.atodeKoukai',
      category: 'redundant', severity: '低',
      pattern: /後で後悔/g,
      message: '同じ意味が重なっています', why: '「後悔」だけで足りる。', fix: '後悔'
    },

    /* --- 表記 -------------------------------------------------------------- */
    {
      id: 'notation.itashimasu',
      category: 'notation', severity: '低',
      pattern: /(?:お願い|失礼|承知|確認)致します/g,
      message: '補助動詞はひらがなが一般的です',
      why: '公用文の慣習では、補助動詞の「いたします」はひらがなで書く。',
      fix: function (m) { return m[0].replace('致します', 'いたします'); }
    },
    {
      id: 'notation.kudasai',
      category: 'notation', severity: '低',
      pattern: /(?:(?:て|で)下さい|ご[\u4E00-\u9FFF]{1,4}下さい)/g,
      message: '補助動詞はひらがなが一般的です',
      why: '「ご確認ください」のように、補助動詞の「ください」はひらがな。',
      fix: function (m) { return m[0].replace('下さい', 'ください'); }
    },
    {
      id: 'notation.itadaki',
      category: 'notation', severity: '低',
      pattern: /(?:て|で)頂(き|け|く)/g,
      message: '補助動詞はひらがなが一般的です',
      why: '「ご確認いただき」のように、補助動詞の「いただく」はひらがな。',
      fix: function (m) { return m[0].replace('頂', 'いただ'); }
    },
    {
      id: 'notation.yoroshiku',
      category: 'notation', severity: '低',
      pattern: /宜しく/g,
      message: '当て字です', why: '「よろしく」と書くのが一般的。', fix: 'よろしく'
    },
    {
      id: 'notation.arigatou',
      category: 'notation', severity: '低',
      pattern: /有難う/g,
      message: '当て字です', why: '「ありがとう」と書くのが一般的。', fix: 'ありがとう'
    }
  ];

  /* ============================================================
     文書チェック（本文全体を見る指摘）
     ------------------------------------------------------------
     run(ctx) => finding の元（{ message, why, fix, start, end }）または null
     ctx = { text, subject, lines, bodyLines, audience, plain }
     ============================================================ */

  var DOCUMENT_CHECKS = [
    {
      id: 'structure.subjectEmpty',
      category: 'structure', severity: '中',
      run: function (ctx) {
        if (ctx.subject.trim() !== '' || ctx.text.trim().length < 30) return null;
        return {
          message: '件名が空です',
          why: '件名がないメールは開かれる順番が遅くなり、後から検索もできない。'
        };
      }
    },
    {
      id: 'structure.subjectLong',
      category: 'structure', severity: '低',
      run: function (ctx) {
        if (ctx.subject.length <= 40) return null;
        return {
          message: '件名が長いです（' + ctx.subject.length + '文字）',
          why: 'スマートフォンでは20〜30文字程度で切れる。要点を前に置き40文字以内に収める。'
        };
      }
    },
    {
      id: 'structure.subjectVague',
      category: 'structure', severity: '中',
      run: function (ctx) {
        if (!/^(?:お世話になっております|ご連絡|連絡|お願い|ご質問|質問|報告|ご報告|確認|ご確認)[。！!]?$/.test(ctx.subject.trim())) return null;
        return {
          message: '件名から用件がわかりません',
          why: '「【ご確認】9月分請求書の送付について」のように、何についての何かを入れる。'
        };
      }
    },
    {
      id: 'structure.subjectTag',
      category: 'tone', severity: '低',
      run: function (ctx) {
        if (!/【\s*(?:至急|重要|緊急)\s*】/.test(ctx.subject)) return null;
        return {
          message: '件名に強い符号を付けています',
          why: '多用すると効かなくなる。期限を件名に入れるほうが伝わる（例:「10/2締切」）。'
        };
      }
    },
    {
      id: 'structure.noSalutation',
      category: 'structure', severity: '中',
      run: function (ctx) {
        if (ctx.text.trim() === '') return null;
        var head = ctx.bodyLines.slice(0, 3).join('\n');
        if (/(?:様|さま|御中|各位|さん|殿)/.test(head)) return null;
        return {
          message: '冒頭に宛名がありません',
          why: '1行目に「株式会社〇〇 田中様」のように宛名を置くのが定型。'
        };
      }
    },
    {
      id: 'structure.noGreeting',
      category: 'structure', severity: '低',
      run: function (ctx) {
        if (ctx.text.trim().length < 40) return null;
        var head = ctx.bodyLines.slice(0, 6).join('\n');
        if (/(?:お世話になっております|お世話になります|はじめてご連絡|初めてご連絡|ご無沙汰|お疲れ様|ありがとうございます)/.test(head)) return null;
        return {
          message: '挨拶が見当たりません',
          why: '「いつもお世話になっております。」の一行があると本文に入りやすい。'
        };
      }
    },
    {
      id: 'structure.noClosing',
      category: 'structure', severity: '中',
      run: function (ctx) {
        if (ctx.text.trim().length < 40) return null;
        if (/(?:よろしくお願い|ご検討のほど|ご確認のほど|お願い申し上げます|失礼いたします|お待ちしております)/.test(ctx.text)) return null;
        return {
          message: '結びのことばがありません',
          why: '「よろしくお願いいたします。」で終えると、依頼の区切りがはっきりする。'
        };
      }
    },
    {
      id: 'structure.noSignature',
      category: 'structure', severity: '低',
      run: function (ctx) {
        if (ctx.text.trim().length < 120) return null;
        var tail = ctx.bodyLines.slice(-6).join('\n');
        if (/(?:株式会社|有限会社|合同会社|@|TEL|Tel|電話|[-—ー=＝─]{3,})/.test(tail)) return null;
        return {
          message: '署名が見当たりません',
          why: '会社名・氏名・連絡先があると、相手が別経路で連絡できる。'
        };
      }
    },
    {
      id: 'structure.attachment',
      category: 'structure', severity: '低',
      run: function (ctx) {
        // ctx.plain は引用行を同じ長さの空白に置き換えたもの（位置は原文と一致）
        var idx = ctx.plain.indexOf('添付');
        if (idx < 0) return null;
        return {
          start: idx, end: idx + 2,
          message: '添付ファイルを付け忘れていませんか',
          why: '本文で添付に触れている。送信前にファイルの有無とファイル名を確認する。'
        };
      }
    },
    {
      id: 'structure.longLine',
      category: 'structure', severity: '低',
      run: function (ctx) {
        var limit = 45;
        for (var i = 0; i < ctx.lineRanges.length; i++) {
          var r = ctx.lineRanges[i];
          if (r.quoted) continue;
          if (r.end - r.start > limit) {
            // 行全体を範囲にすると、同じ行の具体的な指摘を覆い隠してしまうため、
            // 位置は持たせず行番号で示す
            return {
              message: (i + 1) + '行目が長いです（' + (r.end - r.start) + '文字）',
              why: '30〜35文字程度で改行すると、スマートフォンでも読みやすい。'
            };
          }
        }
        return null;
      }
    },
    {
      id: 'consistency.mixedStyle',
      category: 'consistency', severity: '低',
      run: function (ctx) {
        if (!/(?:です|ます)[。\n]/.test(ctx.plain)) return null;
        var m = /(?:だ|である)。/.exec(ctx.plain);
        if (!m) return null;
        return {
          message: '敬体（です・ます）と常体（だ・である）が混ざっています',
          why: 'メールは敬体でそろえる。'
        };
      }
    },
    {
      id: 'redundant.saseteItadakuOveruse',
      category: 'redundant', severity: '低',
      run: function (ctx) {
        var n = countOccurrences(ctx.plain, /させていただ/g);
        if (n < 3) return null;
        return {
          message: '「させていただく」が' + n + '回出てきます',
          why: '多用すると回りくどく読まれる。「いたします」「します」に置き換えられる箇所を減らす。'
        };
      }
    },
    {
      id: 'tone.noCushion',
      category: 'tone', severity: '低',
      run: function (ctx) {
        var requests = countOccurrences(ctx.plain, /(?:ください|下さい|お願いします|願います)/g);
        if (requests < 2) return null;
        if (/(?:恐れ入りますが|お手数ですが|お手数をおかけしますが|差し支えなければ|ご多忙|お忙しいところ|可能であれば|ご面倒)/.test(ctx.plain)) return null;
        return {
          message: '依頼が続きますが、前置きの一言がありません',
          why: '「お手数ですが」「恐れ入りますが」を一つ入れると、同じ依頼でも受け取られ方が変わる。'
        };
      }
    }
  ];

  /* ============================================================
     補助関数
     ============================================================ */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function countOccurrences(text, re) {
    var r = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g');
    var n = 0;
    while (r.exec(text) !== null) n++;
    return n;
  }

  // Luhn 検査。カード番号として妥当な桁数・チェックディジットのときだけ true
  function isLuhnCard(raw) {
    var digits = raw.replace(/[^\d]/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    var sum = 0;
    var alt = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var d = digits.charCodeAt(i) - 48;
      if (alt) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  // 行ごとの範囲と引用行の判定
  function buildLineRanges(text) {
    var ranges = [];
    var pos = 0;
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      ranges.push({
        start: pos,
        end: pos + line.length,
        text: line,
        quoted: /^\s*(?:>|＞)/.test(line)
      });
      pos += line.length + 1;
    }
    return ranges;
  }

  function isQuoted(lineRanges, index) {
    for (var i = 0; i < lineRanges.length; i++) {
      if (index >= lineRanges[i].start && index <= lineRanges[i].end) return lineRanges[i].quoted;
    }
    return false;
  }

  // 引用行を同じ文字数の空白に置き換えた本文。
  // 文字数を変えないため、ここで得た位置はそのまま原文の位置として使える。
  function stripQuotes(text, lineRanges) {
    var out = [];
    for (var i = 0; i < lineRanges.length; i++) {
      var line = lineRanges[i];
      out.push(line.quoted ? repeatSpace(line.text.length) : line.text);
    }
    return out.join('\n');
  }

  function repeatSpace(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += ' ';
    return s;
  }

  function severityRank(sev) {
    return SEVERITIES.indexOf(sev);
  }

  // 「無視」の同一性。位置を含めると本文を1文字直しただけで別物になるため、
  // ルールと一致した表現だけで同一と見なす。
  function findingKey(f) {
    return f.ruleId + '|' + f.matched;
  }

  function resolveFix(rule, match) {
    if (typeof rule.fix === 'function') return rule.fix(match);
    if (typeof rule.fix === 'string') return rule.fix;
    return null;
  }

  /* ============================================================
     点検本体
     ============================================================ */

  function runSpanRules(text, audience, lineRanges) {
    var findings = [];
    for (var i = 0; i < SPAN_RULES.length; i++) {
      var rule = SPAN_RULES[i];
      var audiences = rule.audiences || ALL_AUDIENCES;
      if (audiences.indexOf(audience) < 0) continue;

      var re = new RegExp(rule.pattern.source, rule.pattern.flags);
      var m;
      var guard = 0;
      while ((m = re.exec(text)) !== null && guard++ < 5000) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        if (rule.skipInQuote !== false && isQuoted(lineRanges, m.index)) continue;
        if (typeof rule.validate === 'function' && !rule.validate(m, text)) continue;
        findings.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          start: m.index,
          end: m.index + m[0].length,
          matched: m[0],
          message: rule.message,
          why: rule.why,
          suggestion: resolveFix(rule, m)
        });
      }
    }
    return findings;
  }

  function runDocumentChecks(ctx) {
    var findings = [];
    for (var i = 0; i < DOCUMENT_CHECKS.length; i++) {
      var check = DOCUMENT_CHECKS[i];
      var result = check.run(ctx);
      if (!result) continue;
      var hasSpan = typeof result.start === 'number';
      findings.push({
        ruleId: check.id,
        category: check.category,
        severity: check.severity,
        start: hasSpan ? result.start : null,
        end: hasSpan ? result.end : null,
        matched: hasSpan ? ctx.text.slice(result.start, result.end) : '',
        message: result.message,
        why: result.why,
        suggestion: typeof result.fix === 'string' ? result.fix : null
      });
    }
    return findings;
  }

  // 位置が重なる指摘は、重要度の高いもの（同じなら先に始まるもの）を残す
  function resolveOverlaps(findings) {
    var spans = [];
    var others = [];
    for (var i = 0; i < findings.length; i++) {
      (findings[i].start === null ? others : spans).push(findings[i]);
    }
    // 重要度が高い順 → 範囲が狭い（より具体的な）順 → 先に始まる順。
    // 範囲の広い指摘を優先すると、同じ範囲にある個別の指摘が消えてしまう。
    spans.sort(function (a, b) {
      var d = severityRank(a.severity) - severityRank(b.severity);
      if (d !== 0) return d;
      var lenDiff = (a.end - a.start) - (b.end - b.start);
      if (lenDiff !== 0) return lenDiff;
      return a.start - b.start;
    });
    var kept = [];
    for (var j = 0; j < spans.length; j++) {
      var f = spans[j];
      var overlaps = false;
      for (var k = 0; k < kept.length; k++) {
        if (f.start < kept[k].end && kept[k].start < f.end) { overlaps = true; break; }
      }
      if (!overlaps) kept.push(f);
    }
    return kept.concat(others);
  }

  function sortForDisplay(findings) {
    return findings.slice().sort(function (a, b) {
      var d = severityRank(a.severity) - severityRank(b.severity);
      if (d !== 0) return d;
      var as = a.start === null ? -1 : a.start;
      var bs = b.start === null ? -1 : b.start;
      return as - bs;
    });
  }

  /**
   * 本文を点検する。
   * @param {string} text 本文
   * @param {{subject?:string, audience?:string, ignored?:string[]}} [options]
   * @returns {{findings:Array, stats:Object, score:number}}
   */
  function check(text, options) {
    var opts = options || {};
    var body = typeof text === 'string' ? text : '';
    var subject = typeof opts.subject === 'string' ? opts.subject : '';
    var audience = AUDIENCES[opts.audience] ? opts.audience : 'external';
    var ignored = opts.ignored || [];

    var lineRanges = buildLineRanges(body);
    var plain = stripQuotes(body, lineRanges);
    var ctx = {
      text: body,
      subject: subject,
      audience: audience,
      lineRanges: lineRanges,
      bodyLines: plain.split('\n').filter(function (l) { return l.trim() !== ''; }),
      plain: plain
    };

    var raw = runSpanRules(body, audience, lineRanges).concat(runDocumentChecks(ctx));
    var resolved = sortForDisplay(resolveOverlaps(raw));

    var findings = [];
    var counts = { '高': 0, '中': 0, '低': 0 };
    for (var i = 0; i < resolved.length; i++) {
      var f = resolved[i];
      f.key = findingKey(f);
      if (ignored.indexOf(f.key) >= 0) continue;
      f.id = 'f' + findings.length;
      findings.push(f);
      counts[f.severity]++;
    }

    var score = Math.max(0, 100 - deductionFor(counts));
    return {
      findings: findings,
      score: score,
      stats: {
        counts: counts,
        total: findings.length,
        chars: body.length,
        lines: lineRanges.length,
        audience: audience,
        score: score
      }
    };
  }

  // 重要度ごとに減点を合計する。上限が定められた重要度はそこで打ち切る。
  function deductionFor(counts) {
    var total = 0;
    for (var i = 0; i < SEVERITIES.length; i++) {
      var sev = SEVERITIES[i];
      var d = SEVERITY_WEIGHT[sev] * counts[sev];
      total += typeof SEVERITY_CAP[sev] === 'number' ? Math.min(SEVERITY_CAP[sev], d) : d;
    }
    return total;
  }

  /* ============================================================
     修正の適用・描画支援
     ============================================================ */

  function applyFix(text, finding) {
    if (!finding || finding.start === null || typeof finding.suggestion !== 'string') return text;
    return text.slice(0, finding.start) + finding.suggestion + text.slice(finding.end);
  }

  // 後ろから適用し、重なる指摘は先に適用したものを優先する
  function applyFixes(text, findings) {
    var list = (findings || []).filter(function (f) {
      return f && f.start !== null && typeof f.suggestion === 'string';
    }).sort(function (a, b) { return b.start - a.start; });

    var out = text;
    var applied = [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var conflict = false;
      for (var j = 0; j < applied.length; j++) {
        if (f.start < applied[j].end && applied[j].start < f.end) { conflict = true; break; }
      }
      if (conflict) continue;
      out = out.slice(0, f.start) + f.suggestion + out.slice(f.end);
      applied.push(f);
    }
    return out;
  }

  /**
   * ハイライト描画用にテキストを分割する（重なりなしを前提）。
   * @returns {Array<{text:string, findingId:(string|null), severity:(string|null)}>}
   */
  function buildSegments(text, findings) {
    var spans = (findings || []).filter(function (f) {
      return f && f.start !== null && f.end > f.start;
    }).sort(function (a, b) { return a.start - b.start; });

    var segments = [];
    var cursor = 0;
    for (var i = 0; i < spans.length; i++) {
      var f = spans[i];
      if (f.start < cursor) continue; // 重なりは先着を優先
      if (f.start > cursor) {
        segments.push({ text: text.slice(cursor, f.start), findingId: null, severity: null });
      }
      segments.push({
        text: text.slice(f.start, f.end),
        findingId: f.id || null,
        severity: f.severity
      });
      cursor = f.end;
    }
    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), findingId: null, severity: null });
    }
    return segments;
  }

  return {
    check: check,
    applyFix: applyFix,
    applyFixes: applyFixes,
    buildSegments: buildSegments,
    escapeHtml: escapeHtml,
    isLuhnCard: isLuhnCard,
    findingKey: findingKey,
    SPAN_RULES: SPAN_RULES,
    DOCUMENT_CHECKS: DOCUMENT_CHECKS,
    CATEGORIES: CATEGORIES,
    SEVERITIES: SEVERITIES,
    SEVERITY_META: SEVERITY_META,
    SEVERITY_WEIGHT: SEVERITY_WEIGHT,
    SEVERITY_CAP: SEVERITY_CAP,
    AUDIENCES: AUDIENCES
  };
});

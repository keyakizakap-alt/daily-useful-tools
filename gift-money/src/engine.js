/* ============================================================
   つつみかた — 判定エンジン
   ------------------------------------------------------------
   DOM に依存しない純粋関数と相場データのみ。ブラウザからは
   <script src> でグローバル Tsutsumi として、Node からは
   require() で読む。
   相場は一般に流通している目安の「幅」であり、出典を持つ
   統計値ではない。画面側で必ず注記する。
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Tsutsumi = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============================================================
     定義
     ============================================================ */

  // 推奨額の候補。2万・7万など判断が割れる額は推奨に使わない
  // （入力された場合は checkAmount で注意つきで判定する）
  var RECOMMEND_STEPS = [3000, 5000, 10000, 30000, 50000, 100000];

  // 入力を受け付ける上限（大字変換が「萬」の桁までで閉じる範囲）
  var MAX_AMOUNT = 99999999;

  // 「相場より多い」とみなす倍率
  var ABOVE_RATIO = 1.5;

  var MODIFIERS = {
    age: {
      label: 'あなたの年代',
      options: [
        { id: 'low', label: '20代' },
        { id: 'mid', label: '30代' },
        { id: 'high', label: '40代以上' }
      ]
    },
    school: {
      label: '進学先',
      options: [
        { id: 'low', label: '小学校' },
        { id: 'mid', label: '中学校・高校' },
        { id: 'high', label: '大学・専門学校' }
      ]
    }
  };

  var RELIGIONS = [
    { id: 'unknown', label: 'わからない' },
    { id: 'buddhist', label: '仏式（浄土真宗以外）' },
    { id: 'jodoshinshu', label: '仏式（浄土真宗）' },
    { id: 'shinto', label: '神式' },
    { id: 'christian', label: 'キリスト教' }
  ];

  // 宗派で変わる部分（表書き・水引）。場面ごと
  var RELIGIOUS_MANNERS = {
    funeral: {
      unknown: {
        omote: ['御霊前'],
        mizuhiki: '黒白または双銀の結び切り',
        note: '「御霊前」は多くの宗教で使えますが、浄土真宗とキリスト教のプロテスタントでは使いません。仏式とわかっていれば「御香典」も使えます。'
      },
      buddhist: {
        omote: ['御霊前', '御香典'],
        mizuhiki: '黒白または双銀の結び切り（関西など一部地域では黄白）'
      },
      jodoshinshu: {
        omote: ['御仏前', '御香典'],
        mizuhiki: '黒白または双銀の結び切り（関西など一部地域では黄白）',
        note: '浄土真宗では亡くなるとすぐに仏になると考えるため、通夜・葬儀から「御仏前」を使います。'
      },
      shinto: {
        omote: ['御玉串料', '御榊料'],
        mizuhiki: '双銀または黒白の結び切り（蓮の絵柄の袋は仏式用なので避ける）'
      },
      christian: {
        omote: ['御花料'],
        mizuhiki: '水引なしの白無地の封筒、または十字架・百合の絵柄の封筒',
        note: 'カトリックでは「御ミサ料」も使えます。'
      }
    },
    memorial: {
      unknown: {
        omote: ['御供物料'],
        mizuhiki: '黒白・双銀・黄白の結び切り',
        note: '仏式の四十九日以降なら「御仏前」が一般的です。'
      },
      buddhist: {
        omote: ['御仏前', '御供物料'],
        mizuhiki: '黒白・双銀・黄白の結び切り',
        note: '四十九日より前の法要では「御霊前」を使います。'
      },
      jodoshinshu: {
        omote: ['御仏前', '御供物料'],
        mizuhiki: '黒白・双銀・黄白の結び切り'
      },
      shinto: {
        omote: ['御玉串料', '御神饌料'],
        mizuhiki: '双銀または黒白の結び切り'
      },
      christian: {
        omote: ['御花料'],
        mizuhiki: '水引なしの白無地の封筒'
      }
    }
  };

  var CELEBRATION_KNOT = '紅白の蝶結び（何度あってもよいお祝い）';

  var EVENTS = [
    {
      id: 'wedding',
      label: '結婚式に出席',
      kind: 'celebration',
      evenRule: 'strict',
      relationPrompt: '新郎新婦は、あなたの',
      modifier: 'age',
      attending: true,
      relations: [
        { id: 'sibling', label: '兄弟姉妹', range: [30000, 100000], note: '未婚・20代なら3万円、既婚・夫婦で出席なら5万円以上が多い目安です。' },
        { id: 'nephew', label: '甥・姪', range: [50000, 100000] },
        { id: 'cousin', label: 'いとこ', range: [30000, 50000] },
        { id: 'friend', label: '友人・知人', range: [30000, 30000], note: '夫婦で出席する場合は2人で5万円が目安です。' },
        { id: 'boss', label: '職場の上司', range: [30000, 30000] },
        { id: 'colleague', label: '職場の同僚', range: [30000, 30000] },
        { id: 'subordinate', label: '職場の部下・後輩', range: [30000, 50000] },
        { id: 'client', label: '取引先', range: [30000, 30000] }
      ],
      manners: {
        mizuhiki: '紅白または金銀の結び切り（10本）。「一度きり」の意味',
        omote: ['寿', '御結婚御祝'],
        fukusa: '暖色系（赤・朱・えんじ・ピンク）。紫は慶弔どちらにも使える',
        bills: '新札（ピン札）を用意し、肖像のある面を袋の表に向けて、肖像が上に来るように入れる',
        ink: '濃い黒の筆ペン・毛筆',
        timing: '披露宴当日、受付で袱紗から出して両手で渡す',
        notes: ['会費制（北海道など）の場合はご祝儀は不要なことが多い', '2万円は「ペア」として許容されることが増えているが、気にする人もいる']
      }
    },
    {
      id: 'weddingAbsent',
      label: '結婚祝い（欠席・式なし）',
      kind: 'celebration',
      evenRule: 'strict',
      relationPrompt: '結婚するのは、あなたの',
      modifier: 'age',
      relations: [
        { id: 'sibling', label: '兄弟姉妹', range: [30000, 50000] },
        { id: 'nephew', label: '甥・姪', range: [30000, 50000] },
        { id: 'cousin', label: 'いとこ', range: [10000, 30000] },
        { id: 'friend', label: '友人・知人', range: [10000, 10000] },
        { id: 'boss', label: '職場の上司', range: [10000, 10000] },
        { id: 'colleague', label: '職場の同僚', range: [5000, 10000] },
        { id: 'subordinate', label: '職場の部下・後輩', range: [10000, 10000] },
        { id: 'client', label: '取引先', range: [10000, 10000] }
      ],
      manners: {
        mizuhiki: '紅白または金銀の結び切り（10本）',
        omote: ['御結婚御祝', '寿'],
        fukusa: '暖色系（赤・朱・えんじ・ピンク）または紫',
        bills: '新札を用意する',
        ink: '濃い黒の筆ペン・毛筆',
        timing: '式の1〜2か月前から1週間前までに、手渡しか現金書留で',
        notes: ['招待を受けて欠席する場合は、出席時の3分の1〜半分程度が目安', '現金書留で送るときは、祝儀袋ごと現金書留封筒に入れ、お祝いの手紙を添える']
      }
    },
    {
      id: 'funeral',
      label: '香典（通夜・葬儀）',
      kind: 'condolence',
      evenRule: 'soft',
      relationPrompt: '亡くなったのは、あなたの',
      modifier: 'age',
      religious: true,
      relations: [
        { id: 'parent', label: '親・義理の親', range: [50000, 100000], note: '喪主側（自分が施主の家族）なら包まないこともあります。' },
        { id: 'sibling', label: '兄弟姉妹', range: [30000, 50000] },
        { id: 'grandparent', label: '祖父母', range: [10000, 50000] },
        { id: 'relative', label: 'おじ・おば・その他の親戚', range: [10000, 30000] },
        { id: 'friend', label: '友人・知人', range: [5000, 10000] },
        { id: 'boss', label: '職場の上司', range: [5000, 10000] },
        { id: 'colleague', label: '職場の同僚・部下', range: [5000, 10000] },
        { id: 'colleagueFamily', label: '職場の人の家族', range: [3000, 10000], note: '上司・管理職の立場で部下の家族に出す場合は、5千円〜1万円が多い目安です。' },
        { id: 'client', label: '取引先', range: [5000, 10000], note: '会社として出す場合は社内の規定に従ってください。' },
        { id: 'neighbor', label: '近所の人', range: [3000, 5000] }
      ],
      manners: {
        mizuhiki: '黒白または双銀の結び切り',
        omote: ['御霊前'],
        fukusa: '寒色系（紺・深緑・グレー）または紫',
        bills: '新札は避ける（不幸を予期していたと受け取られるため）。新札しかなければ一度折り目をつける。肖像のある面を袋の裏に向けて入れる',
        ink: '薄墨（悲しみの涙で墨が薄まった、の意味）',
        timing: '通夜か葬儀のどちらかで、受付で渡す（両方に参列する場合は通夜で）',
        notes: ['香典辞退と案内があれば、持参しない', '金額が多すぎると、遺族の香典返しの負担になる']
      }
    },
    {
      id: 'memorial',
      label: '法要（四十九日・一周忌など）',
      kind: 'condolence',
      evenRule: 'soft',
      relationPrompt: '故人は、あなたの',
      modifier: 'age',
      religious: true,
      relations: [
        { id: 'parent', label: '親・義理の親', range: [10000, 50000] },
        { id: 'sibling', label: '兄弟姉妹', range: [10000, 50000] },
        { id: 'grandparent', label: '祖父母', range: [10000, 30000] },
        { id: 'relative', label: 'おじ・おば・その他の親戚', range: [10000, 30000] },
        { id: 'friend', label: '友人・知人', range: [5000, 10000] }
      ],
      manners: {
        mizuhiki: '黒白・双銀・黄白の結び切り',
        omote: ['御仏前'],
        fukusa: '寒色系（紺・深緑・グレー）または紫',
        bills: '新札は避けるのが無難。新札しかなければ一度折り目をつける',
        ink: '四十九日までは薄墨、それ以降は濃い墨が一般的',
        timing: '法要の当日、施主に挨拶するときに渡す',
        notes: ['会食（お斎）がある場合は、1人あたり5千円〜1万円ほど上乗せすることが多い', '夫婦で参列する場合は2人分をまとめて1つの袋に入れる']
      }
    },
    {
      id: 'birth',
      label: '出産祝い',
      kind: 'celebration',
      evenRule: 'strict',
      relationPrompt: '赤ちゃんの親は、あなたの',
      modifier: 'age',
      relations: [
        { id: 'sibling', label: '兄弟姉妹', range: [10000, 30000] },
        { id: 'relative', label: '親戚', range: [5000, 10000] },
        { id: 'friend', label: '友人・知人', range: [5000, 10000] },
        { id: 'boss', label: '職場の上司', range: [5000, 10000] },
        { id: 'colleague', label: '職場の同僚', range: [3000, 5000], note: '職場では数人で連名にすることも多いです（④ 連名で包む）。' },
        { id: 'subordinate', label: '職場の部下・後輩', range: [5000, 10000] }
      ],
      manners: {
        mizuhiki: CELEBRATION_KNOT,
        omote: ['御出産御祝', '祝御出産'],
        fukusa: '暖色系または紫',
        bills: '新札を用意する',
        ink: '濃い黒の筆ペン・毛筆',
        timing: '生後7日（お七夜）〜1か月ごろ。産後すぐの訪問は避け、相手の都合を聞いてから',
        notes: ['品物と現金を両方贈る場合は、合わせた額で考える']
      }
    },
    {
      id: 'school',
      label: '入学・進学祝い',
      kind: 'celebration',
      evenRule: 'strict',
      relationPrompt: 'お祝いする子は、あなたの',
      modifier: 'school',
      relations: [
        { id: 'grandchild', label: '孫', range: [10000, 50000] },
        { id: 'nephew', label: '甥・姪', range: [5000, 30000] },
        { id: 'friendChild', label: '友人・知人の子', range: [3000, 10000] }
      ],
      manners: {
        mizuhiki: CELEBRATION_KNOT,
        omote: ['御入学御祝', '祝御入学', '御進学御祝'],
        fukusa: '暖色系または紫',
        bills: '新札を用意する',
        ink: '濃い黒の筆ペン・毛筆',
        timing: '入学式の1か月前〜1週間前まで',
        notes: ['小学校の入学祝いは、ランドセルや学習机など品物で贈ることも多い']
      }
    },
    {
      id: 'newhome',
      label: '新築祝い',
      kind: 'celebration',
      evenRule: 'strict',
      relationPrompt: '家を建てたのは、あなたの',
      modifier: 'age',
      relations: [
        { id: 'parent', label: '親', range: [30000, 100000] },
        { id: 'sibling', label: '兄弟姉妹', range: [10000, 30000] },
        { id: 'relative', label: '親戚', range: [10000, 30000] },
        { id: 'friend', label: '友人・知人', range: [5000, 10000] },
        { id: 'boss', label: '職場の上司', range: [5000, 10000] },
        { id: 'colleague', label: '職場の同僚・部下', range: [5000, 10000] }
      ],
      manners: {
        mizuhiki: CELEBRATION_KNOT,
        omote: ['御新築御祝', '祝御新築'],
        fukusa: '暖色系または紫',
        bills: '新札を用意する',
        ink: '濃い黒の筆ペン・毛筆',
        timing: '新居に移ってから2か月以内。お披露目に招かれたらその日に',
        notes: ['品物で贈るなら、火を連想させるもの（灰皿・赤い品・キャンドル）は避ける', 'マンション購入は「御新居御祝」、中古住宅は「御新居御祝」「御引越御祝」とすることも']
      }
    },
    {
      id: 'sympathy',
      label: 'お見舞い（病気・けが）',
      kind: 'sympathy',
      evenRule: 'soft',
      relationPrompt: '入院しているのは、あなたの',
      modifier: 'age',
      relations: [
        { id: 'family', label: '親・兄弟姉妹', range: [10000, 30000] },
        { id: 'relative', label: '親戚', range: [5000, 10000] },
        { id: 'friend', label: '友人・知人', range: [3000, 10000] },
        { id: 'work', label: '職場の人', range: [3000, 5000] }
      ],
      manners: {
        mizuhiki: '水引なしの白無地の封筒（左側に赤い帯があるものも可）、または紅白の結び切りでのしなし',
        omote: ['御見舞'],
        fukusa: '紫・紺・グレーなど落ち着いた色',
        bills: '新札でなくてよい（新札しかなければそのままでも可）',
        ink: '濃い黒の筆ペン・毛筆',
        timing: '入院直後や手術前後は避け、容体が落ち着いてから。家族に確認してから訪ねる',
        notes: ['目上の人に現金を贈るのは失礼とされることがある。その場合は品物で', '鉢植え（根付く＝寝付く）、シクラメン（死・苦）、菊は避ける']
      }
    }
  ];

  var EVENT_MAP = {};
  EVENTS.forEach(function (ev) { EVENT_MAP[ev.id] = ev; });

  var DAIJI_DIGITS = ['', '壱', '弐', '参', '四', '伍', '六', '七', '八', '九'];
  var KANSUJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  /* ============================================================
     ユーティリティ
     ============================================================ */

  function getEvent(eventId) {
    return Object.prototype.hasOwnProperty.call(EVENT_MAP, eventId) ? EVENT_MAP[eventId] : null;
  }

  function getRelation(ev, relationId) {
    if (!ev) return null;
    for (var i = 0; i < ev.relations.length; i++) {
      if (ev.relations[i].id === relationId) return ev.relations[i];
    }
    return null;
  }

  function formatYen(amount) {
    return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
  }

  // 3万円・5千円・1万5千円 のような話し言葉の表記
  function formatYenShort(amount) {
    var man = Math.floor(amount / 10000);
    var rest = amount % 10000;
    var out = '';
    if (man > 0) out += man + '万';
    if (rest > 0) {
      out += rest % 1000 === 0 ? (rest / 1000) + '千' : String(rest).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    return out + '円';
  }

  function formatRange(range) {
    if (range[0] === range[1]) return formatYenShort(range[0]);
    return formatYenShort(range[0]) + '〜' + formatYenShort(range[1]);
  }

  // 金額の「頭の数字」。千円単位の数から末尾の0を除き、1桁ならその数字を返す
  // 例: 30000 → 3 / 5000 → 5 / 300000 → 3 / 10000 → 1 / 15000 → null（1桁でない）
  function leadingDigit(amount) {
    if (amount < 1000 || amount % 1000 !== 0) return null;
    var sig = String(amount / 1000).replace(/0+$/, '');
    return sig.length === 1 ? Number(sig) : null;
  }

  /* ============================================================
     推奨額
     ============================================================ */

  function candidatesFor(range) {
    return RECOMMEND_STEPS.filter(function (v) { return v >= range[0] && v <= range[1]; });
  }

  function pickByModifier(candidates, modifierValue) {
    if (candidates.length === 0) return null;
    if (modifierValue === 'low') return candidates[0];
    if (modifierValue === 'high') return candidates[candidates.length - 1];
    return candidates[Math.round((candidates.length - 1) / 2)];
  }

  function recommend(eventId, relationId, modifierValue) {
    var ev = getEvent(eventId);
    var rel = getRelation(ev, relationId);
    if (!ev || !rel) return null;
    if (!rel.range) return { amount: null, range: null, note: rel.note || '' };
    var candidates = candidatesFor(rel.range);
    return {
      amount: pickByModifier(candidates, modifierValue),
      range: rel.range.slice(),
      rangeText: formatRange(rel.range),
      candidates: candidates,
      note: rel.note || ''
    };
  }

  /* ============================================================
     包み方
     ============================================================ */

  function getManners(eventId, religionId) {
    var ev = getEvent(eventId);
    if (!ev) return null;
    var base = ev.manners;
    var out = {
      mizuhiki: base.mizuhiki,
      omote: base.omote.slice(),
      fukusa: base.fukusa,
      bills: base.bills,
      ink: base.ink,
      timing: base.timing,
      notes: base.notes.slice()
    };
    if (ev.religious) {
      var table = RELIGIOUS_MANNERS[ev.id];
      var r = Object.prototype.hasOwnProperty.call(table, religionId) ? table[religionId] : table.unknown;
      out.omote = r.omote.slice();
      out.mizuhiki = r.mizuhiki;
      if (r.note) out.notes.unshift(r.note);
    }
    return out;
  }

  /* ============================================================
     金額の判定
     ============================================================ */

  function parseAmount(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return NaN;
    // 全角数字・カンマ・「円」「¥」と、「3万」「1万5千」「5千」の書き方を許容する
    var s = value.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[,，\s円¥￥]/g, '');
    if (/^\d+$/.test(s)) return Number(s);
    var m = /^(?:(\d{1,4})万)?(?:(\d)千)?$/.exec(s);
    if (m && (m[1] || m[2])) return Number(m[1] || 0) * 10000 + Number(m[2] || 0) * 1000;
    return NaN;
  }

  function checkAmount(value, eventId, relationId) {
    var amount = parseAmount(value);
    var results = [];
    if (!Number.isInteger(amount) || amount < 1) {
      return [{ level: 'error', code: 'invalid', message: '金額は1円以上の整数で入力してください。' }];
    }
    if (amount > MAX_AMOUNT) {
      return [{ level: 'error', code: 'too-large', message: '1億円以上の金額には対応していません。' }];
    }

    var ev = getEvent(eventId);
    var rel = getRelation(ev, relationId);

    if (amount % 1000 !== 0) {
      results.push({ level: 'warn', code: 'fraction', message: '千円未満の端数があります。お祝い・お悔やみのお金は千円単位で包むのが一般的です。' });
    }

    if (/[49]/.test(String(Math.floor(amount / 1000)))) {
      results.push({ level: 'warn', code: 'imikazu', message: '「4」（死）や「9」（苦）を含む金額は、慶事・弔事のどちらでも避けられます。' });
    }

    // 偶数かどうかは頭の数字で見る（3万・30万・300万はどれも「3」）。
    // 4 は忌み数として指摘済みなので重ねない
    var lead = leadingDigit(amount);
    var isEven = lead !== null && lead % 2 === 0 && lead !== 4;
    if (ev && isEven) {
      if (ev.evenRule === 'strict') {
        if (lead === 2 && amount >= 10000) {
          results.push({ level: 'info', code: 'even-pair', message: '「2」は「ペア」として許容されることが増えていますが、「割り切れる＝別れ」を気にする人もいます。2万円なら1万円札1枚＋5千円札2枚にすると、お札の枚数は奇数になります。' });
        } else if (lead === 8) {
          results.push({ level: 'info', code: 'even-pair', message: '8は「末広がり」で縁起がよいとされ、偶数でも許容されることが多い数です。' });
        } else {
          results.push({ level: 'warn', code: 'even', message: 'お祝いでは「割り切れる＝別れる」に通じる偶数を避けるのが一般的です（1・3・5・10 が基本）。' });
        }
      } else if (ev.evenRule === 'soft') {
        results.push({ level: 'info', code: 'even-soft', message: '偶数でも大きな問題はありませんが、「重なる」を気にして奇数にする人もいます。' });
      }
    }

    if (rel && rel.range) {
      if (amount < rel.range[0]) {
        var strong = ev.attending === true;
        results.push({
          level: strong ? 'warn' : 'info',
          code: 'below',
          message: '目安（' + formatRange(rel.range) + '）より少なめです。' +
            (strong ? '披露宴に出席する場合、料理や引出物の費用を考えると下限を下回らないのが無難です。' : '関係や事情によっては問題ありません。')
        });
      } else if (amount > rel.range[1] * ABOVE_RATIO) {
        results.push({
          level: 'info',
          code: 'above',
          message: '目安（' + formatRange(rel.range) + '）よりかなり多めです。' +
            (ev.kind === 'condolence' ? '香典が多すぎると、遺族の香典返しの負担になることがあります。' : '相手が気を遣うことがあります。')
        });
      }
    }

    if (results.length === 0) {
      results.push({ level: 'ok', code: 'ok', message: '避けたほうがよい点は見つかりませんでした。' });
    }
    return results;
  }

  function worstLevel(results) {
    var order = ['ok', 'info', 'warn', 'error'];
    var worst = 0;
    results.forEach(function (r) { worst = Math.max(worst, order.indexOf(r.level)); });
    return order[worst];
  }

  /* ============================================================
     お札
     ============================================================ */

  function bills(value, eventId) {
    var amount = parseAmount(value);
    if (!Number.isInteger(amount) || amount < 1000 || amount > MAX_AMOUNT || amount % 1000 !== 0) return null;
    var ev = getEvent(eventId);
    // 慶事の2万円は、枚数を奇数（3枚）にする習慣がある
    if (ev && ev.evenRule === 'strict' && amount === 20000) {
      return [{ value: 10000, count: 1 }, { value: 5000, count: 2 }];
    }
    var out = [];
    var rest = amount;
    [10000, 5000, 1000].forEach(function (v) {
      var n = Math.floor(rest / v);
      if (n > 0) {
        out.push({ value: v, count: n });
        rest -= n * v;
      }
    });
    return out;
  }

  /* ============================================================
     大字・漢数字
     ============================================================ */

  // 0〜9999 を大字に。各位に必ず数字を添える（壱拾・壱阡）＝改ざん防止の書き方
  function daijiGroup(n) {
    var out = '';
    var th = Math.floor(n / 1000);
    var hu = Math.floor(n / 100) % 10;
    var te = Math.floor(n / 10) % 10;
    var on = n % 10;
    if (th) out += DAIJI_DIGITS[th] + '阡';
    if (hu) out += DAIJI_DIGITS[hu] + '百';
    if (te) out += DAIJI_DIGITS[te] + '拾';
    if (on) out += DAIJI_DIGITS[on];
    return out;
  }

  // 0〜9999 を漢数字に。十・百・千の前の「一」は省く
  function kansujiGroup(n) {
    var out = '';
    var units = [[1000, '千'], [100, '百'], [10, '十']];
    var rest = n;
    units.forEach(function (u) {
      var d = Math.floor(rest / u[0]);
      if (d) out += (d === 1 ? '' : KANSUJI_DIGITS[d]) + u[1];
      rest %= u[0];
    });
    if (rest) out += KANSUJI_DIGITS[rest];
    return out;
  }

  function toDaiji(value) {
    var amount = parseAmount(value);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) return null;
    var man = Math.floor(amount / 10000);
    var rest = amount % 10000;
    return (man ? daijiGroup(man) + '萬' : '') + daijiGroup(rest);
  }

  function toKansuji(value) {
    var amount = parseAmount(value);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) return null;
    var man = Math.floor(amount / 10000);
    var rest = amount % 10000;
    // 「一万」は一を省かない
    var manText = man === 1 ? '一' : kansujiGroup(man);
    return (man ? manText + '万' : '') + kansujiGroup(rest);
  }

  function envelopeText(value) {
    var daiji = toDaiji(value);
    if (!daiji) return null;
    return {
      formal: '金' + daiji + '圓',
      formalNari: '金' + daiji + '圓也',
      modern: '金' + daiji + '円',
      kansuji: '金' + toKansuji(value) + '円'
    };
  }

  /* ============================================================
     住所（縦書き用）
     ============================================================ */

  var HYPHENS = /[-‐‑‒–—―−ー－]/g;

  function addressToVertical(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/\d/g, function (d) { return KANSUJI_DIGITS[Number(d)]; })
      // 縦書きでは長音符「ー」が縦棒になり、番地の区切りとして読める
      .replace(HYPHENS, 'ー');
  }

  /* ============================================================
     連名
     ============================================================ */

  var MAX_PEOPLE = 50;

  // 連名の合計として提案する、区切りのよい額
  var NICE_TOTALS = [3000, 5000, 10000, 20000, 30000, 50000, 100000, 200000, 300000, 500000, 1000000];

  function isClean(amount, ev) {
    var levels = checkAmount(amount, ev ? ev.id : null).filter(function (r) {
      return r.level === 'warn' || r.level === 'error';
    });
    return levels.length === 0;
  }

  function groupGift(perPersonValue, peopleValue, eventId) {
    var perPerson = parseAmount(perPersonValue);
    var people = parseAmount(peopleValue);
    if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE) {
      return { error: '人数は1〜' + MAX_PEOPLE + '人で入力してください。' };
    }
    if (!Number.isInteger(perPerson) || perPerson < 1) {
      return { error: '1人あたりの金額は1円以上の整数で入力してください。' };
    }
    var total = perPerson * people;
    if (total > MAX_AMOUNT) {
      return { error: '合計が1億円以上になる金額には対応していません。' };
    }
    var ev = getEvent(eventId);
    var result = {
      total: total,
      people: people,
      perPerson: perPerson,
      checks: checkAmount(total, eventId),
      suggestions: [],
      nameNote: people <= 3
        ? '3名までは全員の名前を書きます（右から目上の順）。'
        : '4名以上は代表者名に「外一同」、または「〇〇部一同」とし、全員の名前を書いた紙を中に入れます。'
    };
    if (!isClean(total, ev)) {
      // 区切りのよい合計のうち、上下それぞれ最も近い無難なものを提案する
      var down = null;
      var up = null;
      NICE_TOTALS.forEach(function (t) {
        if (!isClean(t, ev)) return;
        if (t < total) down = t;
        else if (t > total && up === null) up = t;
      });
      [down, up].forEach(function (t) {
        if (t === null) return;
        // 集金しやすいよう1人あたりは100円単位に切り下げ、差額は代表者が持つ
        var share = Math.floor(t / people / 100) * 100;
        result.suggestions.push({ total: t, perPerson: share, remainder: t - share * people });
      });
    }
    return result;
  }

  return {
    EVENTS: EVENTS,
    MODIFIERS: MODIFIERS,
    RELIGIONS: RELIGIONS,
    RECOMMEND_STEPS: RECOMMEND_STEPS,
    MAX_AMOUNT: MAX_AMOUNT,
    MAX_PEOPLE: MAX_PEOPLE,
    getEvent: getEvent,
    getRelation: getRelation,
    recommend: recommend,
    getManners: getManners,
    parseAmount: parseAmount,
    checkAmount: checkAmount,
    worstLevel: worstLevel,
    bills: bills,
    toDaiji: toDaiji,
    toKansuji: toKansuji,
    envelopeText: envelopeText,
    addressToVertical: addressToVertical,
    groupGift: groupGift,
    formatYen: formatYen,
    formatYenShort: formatYenShort,
    formatRange: formatRange
  };
});

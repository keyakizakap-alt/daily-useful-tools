/* ============================================================
   のしるべ — 相場・マナー・金額点検エンジン
   ------------------------------------------------------------
   DOM に依存しない純粋関数のみ。ブラウザからは <script src> で
   グローバル Noshi として、Node からは require() で読む。
   相場は一般的な目安であり、地域・家の慣習が優先される。
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Noshi = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============================================================
     選択肢の定義
     ============================================================ */

  // 関係は「主役（故人）が、あなたから見て誰か」で表す
  var RELATIONS = [
    { id: 'friend', label: '友人・知人' },
    { id: 'coworker', label: '職場の同僚' },
    { id: 'boss', label: '職場の上司' },
    { id: 'subordinate', label: '職場の部下' },
    { id: 'sibling', label: '兄弟姉妹' },
    { id: 'nephew', label: '甥・姪' },
    { id: 'relative', label: 'その他の親族（おじ・おば・いとこ等）' },
    { id: 'parent', label: '親（義理の親を含む）' },
    { id: 'grandparent', label: '祖父母' },
    { id: 'grandchild', label: '孫' },
    { id: 'friendchild', label: '友人・知人の子ども' }
  ];

  var AGES = [
    { id: '20', label: '20代' },
    { id: '30', label: '30代' },
    { id: '40', label: '40代以上' }
  ];

  var RELIGIONS = [
    { id: 'unknown', label: 'わからない' },
    { id: 'buddhist', label: '仏式' },
    { id: 'jodoshin', label: '仏式（浄土真宗）' },
    { id: 'shinto', label: '神式' },
    { id: 'christian', label: 'キリスト教' }
  ];

  var CHILD_AGES = [
    { id: 'preschool', label: '未就学児', range: [500, 1000] },
    { id: 'lowerElem', label: '小学校低学年', range: [1000, 3000] },
    { id: 'upperElem', label: '小学校高学年', range: [3000, 5000] },
    { id: 'junior', label: '中学生', range: [5000, 5000] },
    { id: 'high', label: '高校生', range: [5000, 10000] },
    { id: 'college', label: '大学生・専門学校生', range: [10000, 10000] }
  ];

  var MIZUHIKI = {
    musubikiri: { label: '結び切り', meaning: 'ほどけない結び方。「一度きりであってほしいこと」に使う' },
    awaji: { label: 'あわじ結び', meaning: '結び切りの一種。両端を引くと強く締まり「末永く」の意味を持つ' },
    chou: { label: '蝶結び（花結び）', meaning: '何度でも結び直せる結び方。「何度あってもうれしいこと」に使う' },
    none: { label: '水引なし', meaning: '水引を付けない白無地の封筒やポチ袋を使う' }
  };

  var KEI = {
    ink: '濃い墨（筆ペン・サインペン可。ボールペンは避ける）',
    newBill: '新札（ピン札）を用意する。「この日を楽しみに準備していた」の意味',
    billFace: '肖像が表・上になるようにそろえて入れる',
    fukusa: '赤・朱・えんじ・ピンクなどの暖色（紫は慶弔どちらにも使える）',
    fold: '裏の折り返しは「下側を上に」重ねる（喜びを受け止める）'
  };

  var CHO = {
    ink: '薄墨（「涙で墨が薄まった」の意味。薄墨の筆ペンが便利）',
    newBill: '新札は避ける。新札しかないときは縦に折り目を1本つける',
    billFace: '肖像が裏・下向きになるようにそろえて入れる',
    fukusa: '紺・グレー・深緑・紫などの寒色',
    fold: '裏の折り返しは「上側を下に」重ねる（悲しみを流す）'
  };

  /* ============================================================
     場面の定義
     amountMode: relation … 関係（と年代）で決まる
                 return   … いただいた金額の割合で決まる
                 child    … 子の年齢で決まる
     amounts[relation] は [min, max] か、年代別 { 20:[..], 30:[..], 40:[..] }
     ============================================================ */

  var SCENES = [
    {
      id: 'wedding',
      label: '結婚祝い（披露宴に出席）',
      group: 'お祝い',
      kind: 'kei',
      wedding: true,
      amountMode: 'relation',
      omote: ['寿', '御結婚御祝'],
      mizuhiki: 'musubikiri',
      mizuhikiColor: '紅白または金銀（10本）',
      noshi: true,
      amounts: {
        friend: [30000, 30000],
        coworker: [30000, 30000],
        boss: [30000, 50000],
        subordinate: [30000, 50000],
        sibling: { 20: [30000, 50000], 30: [50000, 100000], 40: [50000, 100000] },
        nephew: { 20: [30000, 30000], 30: [30000, 50000], 40: [50000, 100000] },
        relative: [30000, 50000]
      },
      notes: [
        '金額は「ご祝儀袋の格」と釣り合わせる。3万円なら水引が印刷でない、しっかりした袋を選ぶ',
        '受付では袱紗から出し、相手に表書きが読める向きで両手で渡す',
        '夫婦で出席する場合は2人分（5万〜7万円程度）を1つの袋にまとめることが多い'
      ]
    },
    {
      id: 'weddingAbsent',
      label: '結婚祝い（欠席・お祝いのみ）',
      group: 'お祝い',
      kind: 'kei',
      wedding: true,
      amountMode: 'relation',
      omote: ['寿', '御結婚御祝'],
      mizuhiki: 'musubikiri',
      mizuhikiColor: '紅白（印刷の水引でもよい）',
      noshi: true,
      amounts: {
        friend: [10000, 10000],
        coworker: [5000, 10000],
        boss: [10000, 10000],
        subordinate: [10000, 10000],
        sibling: [30000, 50000],
        nephew: [10000, 30000],
        relative: [10000, 30000]
      },
      notes: [
        '招待を受けてから欠席を決めた場合は、出席時の1/3〜1/2程度を目安にする',
        '式の1週間前までに、現金書留（祝儀袋ごと入れられる）か手渡しで届ける'
      ]
    },
    {
      id: 'birth',
      label: '出産祝い',
      group: 'お祝い',
      kind: 'kei',
      amountMode: 'relation',
      omote: ['御出産御祝', '祝御出産', '御祝'],
      mizuhiki: 'chou',
      mizuhikiColor: '紅白（5本または7本）',
      noshi: true,
      amounts: {
        friend: [5000, 10000],
        coworker: [3000, 5000],
        boss: [5000, 10000],
        subordinate: [5000, 10000],
        sibling: [10000, 30000],
        relative: [5000, 10000],
        grandchild: [30000, 100000]
      },
      notes: [
        '生後7日（お七夜）〜1か月ごろまでに贈る。母子の体調を優先し、訪問は相手の都合に合わせる',
        '職場の有志でまとめる場合は1人1,000〜3,000円程度が多い'
      ]
    },
    {
      id: 'school',
      label: '入学祝い',
      group: 'お祝い',
      kind: 'kei',
      amountMode: 'relation',
      omote: ['御入学御祝', '祝御入学', '御祝'],
      mizuhiki: 'chou',
      mizuhikiColor: '紅白（5本または7本）',
      noshi: true,
      amounts: {
        sibling: [10000, 30000],
        nephew: [5000, 10000],
        relative: [5000, 10000],
        grandchild: [10000, 50000],
        friendchild: [3000, 5000]
      },
      notes: [
        '入学式の1か月前〜1週間前までに贈る',
        '中学・高校・大学と進むほど金額を上げることが多い（高校・大学は上限寄り）'
      ]
    },
    {
      id: 'newhome',
      label: '新築祝い',
      group: 'お祝い',
      kind: 'kei',
      amountMode: 'relation',
      omote: ['御新築御祝', '祝御新築', '御祝'],
      mizuhiki: 'chou',
      mizuhikiColor: '紅白（5本または7本）',
      noshi: true,
      amounts: {
        friend: [5000, 10000],
        coworker: [5000, 10000],
        boss: [5000, 10000],
        subordinate: [5000, 10000],
        sibling: [10000, 30000],
        relative: [10000, 30000],
        parent: [30000, 100000]
      },
      notes: [
        '新居完成から半年以内、お披露目に招かれたときに持参するのが一般的',
        '品物にする場合、火を連想させるもの（ライター・灰皿・赤いもの）は避ける',
        'マンション購入や中古住宅は「御新居御祝」とする'
      ]
    },
    {
      id: 'funeral',
      label: '香典（通夜・葬儀）',
      group: 'お悔やみ',
      kind: 'cho',
      funeral: true,
      amountMode: 'relation',
      usesReligion: true,
      omote: ['御霊前'],
      mizuhiki: 'musubikiri',
      mizuhikiColor: '黒白または双銀（関西の一部では黄白）',
      noshi: false,
      amounts: {
        friend: { 20: [5000, 5000], 30: [5000, 10000], 40: [5000, 10000] },
        coworker: { 20: [3000, 5000], 30: [5000, 5000], 40: [5000, 10000] },
        boss: { 20: [5000, 5000], 30: [5000, 10000], 40: [10000, 10000] },
        subordinate: [5000, 10000],
        sibling: { 20: [30000, 50000], 30: [50000, 50000], 40: [50000, 50000] },
        relative: { 20: [10000, 10000], 30: [10000, 30000], 40: [10000, 30000] },
        parent: { 20: [30000, 100000], 30: [50000, 100000], 40: [100000, 100000] },
        grandparent: { 20: [10000, 10000], 30: [10000, 30000], 40: [30000, 50000] }
      },
      notes: [
        '通夜・告別式の両方に参列する場合、香典はどちらか一方（多くは通夜）で渡す',
        '中袋の裏には住所・氏名をはっきり書く（遺族が香典返しの準備に使う）',
        '「重ね重ね」を連想させる二重の封筒や、偶数枚のお札は避けるとされる'
      ]
    },
    {
      id: 'memorial',
      label: '法要（四十九日以降）',
      group: 'お悔やみ',
      kind: 'cho',
      funeral: false,
      amountMode: 'relation',
      usesReligion: true,
      omote: ['御仏前', '御供物料'],
      mizuhiki: 'musubikiri',
      mizuhikiColor: '黒白または双銀（関西の一部では黄白）',
      noshi: false,
      ink: '濃い墨でよい（四十九日を過ぎたら薄墨でなくてよいとされる）',
      amounts: {
        friend: [5000, 10000],
        sibling: [10000, 50000],
        relative: [10000, 30000],
        grandparent: [10000, 30000]
      },
      notes: [
        '法要後に会食（お斎）がある場合は、目安に5千〜1万円ほど上乗せすることが多い',
        '四十九日を過ぎると故人は仏になるとされるため、仏式の表書きは「御霊前」ではなく「御仏前」'
      ]
    },
    {
      id: 'mimai',
      label: 'お見舞い（病気・けが）',
      group: 'お見舞い・お返し',
      kind: 'mimai',
      amountMode: 'relation',
      omote: ['御見舞'],
      mizuhiki: 'none',
      mizuhikiColor: '白無地の封筒、または左側に赤い帯の入ったお見舞い袋',
      noshi: false,
      newBill: '新札でなくてよい（気になるときは折り目を1本つける）',
      billFace: '肖像が表・上になるようにそろえて入れる',
      fukusa: '紫・グレーなど落ち着いた色',
      fold: '裏の折り返しは「下側を上に」重ねる',
      amounts: {
        friend: [3000, 5000],
        coworker: [3000, 5000],
        boss: [5000, 10000],
        subordinate: [3000, 5000],
        sibling: [5000, 10000],
        relative: [5000, 10000],
        parent: [10000, 30000],
        grandparent: [5000, 10000]
      },
      notes: [
        '目上の方へ現金を贈るのは失礼とされることがある。上司には品物（本人の負担にならないもの）も検討する',
        '鉢植え（「根付く＝寝付く」）・香りの強い花・4本や9本の花は避ける',
        '紅白の水引を付ける場合は、繰り返さないよう「結び切り」を選ぶ'
      ]
    },
    {
      id: 'kaiki',
      label: '快気祝い（お見舞いのお返し）',
      group: 'お見舞い・お返し',
      kind: 'kei',
      amountMode: 'return',
      returnRatio: [1 / 3, 1 / 2],
      omote: ['快気祝', '快気内祝'],
      mizuhiki: 'musubikiri',
      mizuhikiColor: '紅白（5本または7本）',
      noshi: true,
      amounts: {},
      notes: [
        '退院・床上げから10日〜1か月以内に贈る',
        '「病気が残らない」よう、食べたり使ったりして消えるもの（お菓子・洗剤・タオル）が定番',
        'まだ療養中の場合は「御見舞御礼」とする'
      ]
    },
    {
      id: 'uchiiwai',
      label: '出産内祝い（出産祝いのお返し）',
      group: 'お見舞い・お返し',
      kind: 'kei',
      amountMode: 'return',
      returnRatio: [1 / 3, 1 / 2],
      omote: ['内祝'],
      mizuhiki: 'chou',
      mizuhikiColor: '紅白（5本または7本）',
      noshi: true,
      nameNote: '名入れは赤ちゃんの名前（読みにくい名前にはふりがなを添える）',
      amounts: {},
      notes: [
        '生後1か月ごろ（お宮参りのころ）までに贈る',
        '高額のお祝いをくれた親族には1/3程度でよいとされる'
      ]
    },
    {
      id: 'otoshidama',
      label: 'お年玉',
      group: '季節・その他',
      kind: 'kei',
      amountMode: 'child',
      omote: ['おとしだま', 'お年玉'],
      mizuhiki: 'none',
      mizuhikiColor: 'ポチ袋を使う（水引は不要）',
      noshi: false,
      nameNote: '表に相手の子の名前、裏に自分の名前を書く',
      fukusa: '不要',
      fold: 'ポチ袋はお札を三つ折りにし、肖像が内側になるよう左・右の順に折って入れる',
      amounts: {},
      notes: [
        '目上の方（上司など）の子に渡す場合は「お年賀」「文具料」とする',
        '兄弟姉妹・親戚の間で金額をそろえておくと気まずくならない',
        '松の内（関東は1月7日、関西は1月15日）までに渡す'
      ]
    }
  ];

  var SCENE_MAP = {};
  SCENES.forEach(function (s) { SCENE_MAP[s.id] = s; });

  function findLabel(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
    return '';
  }

  /* ============================================================
     宗教ごとの上書き（香典・法要）
     ============================================================ */

  function religionOverride(scene, religion) {
    if (!scene.usesReligion) return null;
    var funeral = scene.funeral;
    switch (religion) {
      case 'buddhist':
        return funeral
          ? { omote: ['御霊前', '御香典'], notes: [] }
          : { omote: ['御仏前', '御供物料'], notes: [] };
      case 'jodoshin':
        return {
          omote: ['御仏前', '御香典'],
          notes: ['浄土真宗では亡くなるとすぐ仏になるとされるため、通夜・葬儀でも「御霊前」ではなく「御仏前」とする']
        };
      case 'shinto':
        return {
          omote: ['御玉串料', '御榊料', '御神前'],
          mizuhikiColor: '双銀または黒白（蓮の花の柄が入った袋は仏式用なので避ける）',
          notes: ['神式では「御仏前」「御香典」は使わない']
        };
      case 'christian':
        return {
          omote: ['御花料'],
          mizuhiki: 'none',
          mizuhikiColor: '白無地の封筒、または十字架・百合の柄の封筒',
          notes: ['カトリックでは「御ミサ料」も使える。蓮の花の柄や「御仏前」は避ける']
        };
      default:
        return funeral
          ? {
              omote: ['御霊前'],
              notes: ['宗教がわからない場合は「御霊前」が広く使える。ただし浄土真宗・プロテスタントでは不適切とされるため、案内状や会場の表示で確認できればそれに合わせる']
            }
          : {
              omote: ['御供物料', '御仏前'],
              notes: ['宗教がわからない法要では、仏式・神式どちらにも使える「御供物料」が無難']
            };
    }
  }

  /* ============================================================
     金額の目安
     ============================================================ */

  function relationsFor(sceneId) {
    var scene = SCENE_MAP[sceneId];
    if (!scene || scene.amountMode !== 'relation') return [];
    return RELATIONS.filter(function (r) { return Object.prototype.hasOwnProperty.call(scene.amounts, r.id); });
  }

  function roundTo(n, unit) {
    return Math.round(n / unit) * unit;
  }

  function amountGuide(scene, opts) {
    if (scene.amountMode === 'relation') {
      var entry = Object.prototype.hasOwnProperty.call(scene.amounts, opts.relation) ? scene.amounts[opts.relation] : null;
      if (!entry) return null;
      var range = Array.isArray(entry) ? entry : entry[opts.age] || null;
      if (!range) return null;
      var basis = findLabel(RELATIONS, opts.relation) + (Array.isArray(entry) ? '' : '・あなたが' + findLabel(AGES, opts.age));
      return { min: range[0], max: range[1], basis: basis };
    }
    if (scene.amountMode === 'child') {
      for (var i = 0; i < CHILD_AGES.length; i++) {
        if (CHILD_AGES[i].id === opts.childAge) {
          return { min: CHILD_AGES[i].range[0], max: CHILD_AGES[i].range[1], basis: CHILD_AGES[i].label };
        }
      }
      return null;
    }
    if (scene.amountMode === 'return') {
      var received = opts.receivedYen;
      if (!(typeof received === 'number' && isFinite(received) && received > 0)) return null;
      // 品物で返すのが一般的なので、百円単位に丸めた目安にする
      return {
        min: roundTo(received * scene.returnRatio[0], 100),
        max: roundTo(received * scene.returnRatio[1], 100),
        basis: 'いただいた ' + formatYen(received) + ' の1/3〜1/2',
        approx: true
      };
    }
    return null;
  }

  function getGuide(sceneId, opts) {
    var scene = SCENE_MAP[sceneId];
    if (!scene) return null;
    opts = opts || {};
    var base = scene.kind === 'cho' ? CHO : KEI;
    var over = religionOverride(scene, opts.religion) || {};
    var mizuhikiKey = over.mizuhiki || scene.mizuhiki;
    var notes = (over.notes || []).concat(scene.notes);
    return {
      sceneId: scene.id,
      label: scene.label,
      kind: scene.kind,
      omote: (over.omote || scene.omote).slice(),
      mizuhiki: {
        key: mizuhikiKey,
        label: MIZUHIKI[mizuhikiKey].label,
        meaning: MIZUHIKI[mizuhikiKey].meaning,
        color: over.mizuhikiColor || scene.mizuhikiColor
      },
      noshi: scene.noshi,
      ink: scene.ink || base.ink,
      newBill: scene.newBill || base.newBill,
      billFace: scene.billFace || base.billFace,
      fukusa: scene.fukusa || base.fukusa,
      fold: scene.fold || base.fold,
      nameNote: scene.nameNote || '水引の下に、表書きより少し小さくフルネームで書く。連名は3名まで（右が目上）、4名以上は「○○一同」として別紙に全員の名前を書く',
      amount: amountGuide(scene, opts),
      notes: notes
    };
  }

  /* ============================================================
     金額の解釈（全角・漢数字の単位・カンマ混じり）
     ============================================================ */

  var MAX_YEN = 99999999;
  var MAX_INPUT_LENGTH = 30;

  function toHalfWidth(text) {
    return text.replace(/[０-９．，]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    });
  }

  function parseYen(text) {
    if (typeof text !== 'string') return { ok: false, reason: '金額を入力してください' };
    if (text.length > MAX_INPUT_LENGTH) return { ok: false, reason: '金額は' + MAX_INPUT_LENGTH + '文字以内で入力してください' };
    var s = toHalfWidth(text).replace(/[\s,、円圓]/g, '').replace(/^金/, '').replace(/也$/, '');
    if (s === '') return { ok: false, reason: '金額を入力してください' };
    if (/億/.test(s)) return { ok: false, reason: '1億円未満の金額を入力してください' };
    // 「1万5千」「3.5万」「5000」「1万2000」の形だけを受け付ける
    var m = /^(?:(\d+(?:\.\d+)?)[万萬])?(?:(\d+(?:\.\d+)?)[千阡仟])?(\d+)?$/.exec(s);
    if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) {
      return { ok: false, reason: '「30000」「3万」「1万5千」のように数字で入力してください' };
    }
    var yen = 0;
    if (m[1] !== undefined) yen += parseFloat(m[1]) * 10000;
    if (m[2] !== undefined) yen += parseFloat(m[2]) * 1000;
    if (m[3] !== undefined) yen += parseInt(m[3], 10);
    yen = Math.round(yen * 1000) / 1000;
    if (!Number.isInteger(yen)) return { ok: false, reason: '1円未満の端数がある金額は扱えません' };
    if (yen <= 0) return { ok: false, reason: '1円以上の金額を入力してください' };
    if (yen > MAX_YEN) return { ok: false, reason: '1億円未満の金額を入力してください' };
    return { ok: true, yen: yen };
  }

  /* ============================================================
     表示用の書式
     ============================================================ */

  function formatYen(yen) {
    if (yen >= 10000) {
      var man = Math.floor(yen / 10000);
      var rest = yen % 10000;
      if (rest === 0) return man + '万円';
      if (rest % 1000 === 0) return man + '万' + rest / 1000 + '千円';
    } else if (yen >= 1000 && yen % 1000 === 0) {
      return yen / 1000 + '千円';
    }
    return yen.toLocaleString('ja-JP') + '円';
  }

  function formatRange(min, max) {
    if (min === max) return formatYen(min);
    // 「5千〜1万円」のように、前側の「円」は省く
    return formatYen(min).replace(/円$/, '') + '〜' + formatYen(max);
  }

  /* ============================================================
     大字変換
     ============================================================ */

  var DAIJI_DIGITS = ['', '壱', '弐', '参', '四', '伍', '六', '七', '八', '九'];
  var DAIJI_UNITS = ['', '拾', '百', '阡'];

  function fourDigits(n) {
    var out = '';
    var digits = String(n).padStart(4, '0');
    for (var i = 0; i < 4; i++) {
      var d = digits.charCodeAt(i) - 48;
      if (d === 0) continue;
      out += DAIJI_DIGITS[d] + DAIJI_UNITS[3 - i];
    }
    return out;
  }

  function toDaiji(yen) {
    if (!Number.isInteger(yen) || yen <= 0 || yen > MAX_YEN) return '';
    var man = Math.floor(yen / 10000);
    var rest = yen % 10000;
    var body = (man > 0 ? fourDigits(man) + '萬' : '') + fourDigits(rest);
    return '金 ' + body + '円';
  }

  /* ============================================================
     お札の組み合わせ
     ============================================================ */

  function billPlan(yen, sceneId) {
    if (!Number.isInteger(yen) || yen <= 0) return [];
    var scene = SCENE_MAP[sceneId];
    var rest = yen;
    var counts = { 10000: 0, 5000: 0, 1000: 0 };
    [10000, 5000, 1000].forEach(function (bill) {
      counts[bill] = Math.floor(rest / bill);
      rest -= counts[bill] * bill;
    });
    var total = counts[10000] + counts[5000] + counts[1000];
    // 結婚祝いは「割れる」偶数枚を避ける。1万円札1枚を5千円札2枚にくずして奇数枚にする
    if (scene && scene.wedding && total % 2 === 0 && counts[10000] > 0 && yen < 100000) {
      counts[10000] -= 1;
      counts[5000] += 2;
    }
    var plan = [];
    [10000, 5000, 1000].forEach(function (bill) {
      if (counts[bill] > 0) plan.push({ bill: bill, count: counts[bill] });
    });
    if (rest > 0) plan.push({ bill: 1, count: rest });
    return plan;
  }

  /* ============================================================
     金額の点検
     ============================================================ */

  function leadingDigit(yen) {
    return String(yen).charCodeAt(0) - 48;
  }

  function checkAmount(sceneId, yen, guide) {
    var scene = SCENE_MAP[sceneId];
    var out = [];
    if (!scene) return out;
    if (!Number.isInteger(yen) || yen <= 0 || yen > MAX_YEN) {
      return [{ level: 'warn', code: 'invalid', message: '1円以上・1億円未満の整数で入力してください' }];
    }
    var lead = leadingDigit(yen);
    if (lead === 4 || lead === 9) {
      out.push({
        level: 'warn',
        code: 'taboo-digit',
        message: (lead === 4 ? '「4」は「死」' : '「9」は「苦」') + 'を連想させる忌み数とされます。' + formatYen(yen) + 'は避け、前後の金額にするのが無難です'
      });
    }
    var man = yen / 10000;
    if (scene.wedding && Number.isInteger(man)) {
      if (man === 2) {
        out.push({
          level: 'info',
          code: 'two-wedding',
          message: '2万円は「割り切れる」偶数ですが、近年は「ペア」の意味で許容されています。1万円札1枚＋5千円札2枚の3枚にすると角が立ちにくくなります'
        });
      } else if (man % 2 === 0 && man !== 8 && man % 10 !== 0) {
        out.push({
          level: 'warn',
          code: 'even-wedding',
          message: formatYen(yen) + 'は「割り切れる＝別れる」を連想させる偶数です。結婚祝いでは奇数（3万・5万・7万）か、末広がりの8万、区切りの10万にします'
        });
      }
    }
    if (scene.funeral && Number.isInteger(man) && man % 2 === 0 && man % 10 !== 0) {
      out.push({
        level: 'info',
        code: 'even-funeral',
        message: '香典の偶数額（' + formatYen(yen) + '）は気にする方もいます。気になる場合は奇数の金額にするか、5千円札を混ぜてお札を奇数枚にします'
      });
    }
    var unit = scene.amountMode === 'child' ? 500 : 1000;
    if (yen % unit !== 0) {
      out.push({
        level: 'info',
        code: 'unit',
        message: (unit === 500 ? '500円' : '千円') + '単位で包むのが一般的です（硬貨は入れません）'
      });
    }
    if (guide && guide.amount) {
      if (yen > guide.amount.max * 2) {
        out.push({
          level: 'info',
          code: 'over',
          message: '目安（' + formatRange(guide.amount.min, guide.amount.max) + '）の2倍を超えています。多すぎると相手がお返しに困ることがあります'
        });
      } else if (yen < guide.amount.min / 2) {
        out.push({
          level: 'info',
          code: 'under',
          message: '目安（' + formatRange(guide.amount.min, guide.amount.max) + '）の半分を下回っています。連名や品物を添えることも検討できます'
        });
      }
    }
    if (out.length === 0) {
      out.push({ level: 'ok', code: 'ok', message: '忌み数・割り切れる金額・相場との大きな差はありません' });
    }
    return out;
  }

  return {
    RELATIONS: RELATIONS,
    AGES: AGES,
    RELIGIONS: RELIGIONS,
    CHILD_AGES: CHILD_AGES,
    SCENES: SCENES,
    MAX_YEN: MAX_YEN,
    MAX_INPUT_LENGTH: MAX_INPUT_LENGTH,
    relationsFor: relationsFor,
    getGuide: getGuide,
    parseYen: parseYen,
    formatYen: formatYen,
    formatRange: formatRange,
    toDaiji: toDaiji,
    billPlan: billPlan,
    checkAmount: checkAmount
  };
});

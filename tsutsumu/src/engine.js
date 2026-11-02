/* つつむ — 判断ロジック（純粋関数・DOM 非依存）
 * ブラウザでは window.Tsutsumu、Node では module.exports として公開する。
 * 金額・作法は一般的な目安であり、地域・家・宗派の慣習を優先する前提。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Tsutsumu = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // kind: celebration（慶事・結婚）/ gift（一般の祝い）/ sympathy（お見舞い）/ condolence（弔事）/ otoshidama
  const OCCASIONS = {
    wedding: { label: "結婚式に出席", kind: "celebration", group: "keiji" },
    wedding_gift: { label: "結婚祝い（式に出ない）", kind: "celebration", group: "keiji" },
    birth: { label: "出産祝い", kind: "gift", group: "keiji" },
    school: { label: "入園・入学祝い", kind: "gift", group: "keiji" },
    new_home: { label: "新築・新居祝い", kind: "gift", group: "keiji" },
    illness: { label: "お見舞い", kind: "sympathy", group: "mimai" },
    funeral: { label: "香典（通夜・葬儀）", kind: "condolence", group: "choji" },
    memorial: { label: "法要（四十九日・一周忌など）", kind: "condolence", group: "choji" },
    otoshidama: { label: "お年玉", kind: "otoshidama", group: "keiji" },
  };

  const RELATIONS = {
    friend: "友人・知人",
    coworker: "職場の同僚",
    boss: "職場の上司",
    subordinate: "職場の部下",
    neighbor: "近所の方",
    sibling: "兄弟姉妹",
    cousin: "いとこ",
    nephew: "甥・姪",
    relative: "その他の親戚",
    parent: "親（義理の親を含む）",
    grandparent: "祖父母",
    grandchild: "孫",
  };

  const CHILD_AGES = {
    preschool: "小学校入学前",
    elem_low: "小学1〜3年生",
    elem_high: "小学4〜6年生",
    junior: "中学生",
    high: "高校生",
    univ: "大学生・専門学校生",
  };

  const RELIGIONS = {
    unknown: "わからない",
    buddhist: "仏式",
    jodo_shinshu: "仏式（浄土真宗）",
    shinto: "神式",
    christian: "キリスト教式",
  };

  const AGES = { "20s": "20代", "30s": "30代", "40s": "40代以上" };

  // 目安の範囲 [下限, 上限]（円）。一般に紹介されている目安を MVP 用に整理したもの。
  const SOBA = {
    wedding: {
      friend: [30000, 30000], coworker: [30000, 30000], boss: [30000, 50000], subordinate: [30000, 50000],
      sibling: [50000, 100000], cousin: [30000, 50000], nephew: [50000, 100000], relative: [30000, 50000],
    },
    wedding_gift: {
      friend: [10000, 10000], coworker: [5000, 10000], boss: [10000, 10000], subordinate: [10000, 30000],
      sibling: [30000, 50000], cousin: [10000, 30000], nephew: [30000, 50000], relative: [10000, 30000],
    },
    birth: {
      friend: [5000, 10000], coworker: [3000, 5000], boss: [5000, 10000], subordinate: [5000, 10000],
      sibling: [10000, 30000], cousin: [5000, 10000], relative: [5000, 10000], grandchild: [30000, 100000],
    },
    school: {
      friend: [3000, 5000], coworker: [3000, 5000], neighbor: [3000, 5000],
      nephew: [5000, 10000], relative: [5000, 10000], grandchild: [10000, 50000],
    },
    new_home: {
      friend: [5000, 10000], coworker: [5000, 10000], boss: [5000, 10000], subordinate: [10000, 10000],
      sibling: [10000, 30000], relative: [10000, 30000], parent: [30000, 100000],
    },
    illness: {
      friend: [3000, 5000], coworker: [3000, 5000], boss: [5000, 5000], subordinate: [5000, 10000],
      sibling: [10000, 10000], relative: [5000, 10000], parent: [10000, 30000], grandparent: [5000, 10000],
    },
    funeral: {
      friend: [5000, 10000], coworker: [5000, 5000], boss: [5000, 10000], subordinate: [5000, 10000],
      neighbor: [3000, 5000], sibling: [30000, 50000], cousin: [10000, 10000], relative: [10000, 30000],
      parent: [50000, 100000], grandparent: [10000, 30000],
    },
    memorial: {
      friend: [5000, 10000], sibling: [10000, 30000], cousin: [10000, 10000], relative: [10000, 30000],
      parent: [10000, 50000], grandparent: [10000, 30000],
    },
  };

  // お年玉は子どもの年齢で決める
  const OTOSHIDAMA = {
    preschool: [1000, 3000], elem_low: [2000, 3000], elem_high: [3000, 5000],
    junior: [5000, 5000], high: [5000, 10000], univ: [10000, 10000],
  };

  // 場面の種類ごとの「包みやすい金額」
  const STEPS = {
    celebration: [5000, 10000, 20000, 30000, 50000, 70000, 100000],
    gift: [3000, 5000, 10000, 20000, 30000, 50000, 100000],
    sympathy: [3000, 5000, 10000, 20000, 30000, 50000, 100000],
    condolence: [3000, 5000, 10000, 30000, 50000, 100000],
    otoshidama: [1000, 2000, 3000, 5000, 10000],
  };

  const MAX_YEN = 10000000;

  // 辞書の参照は自身のプロパティに限る（"__proto__" や "toString" を値として拾わない）
  const own = (obj, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);

  function occ(occasion) {
    const o = own(OCCASIONS, occasion) ? OCCASIONS[occasion] : null;
    if (!o) throw new RangeError("不明な場面です: " + String(occasion));
    return o;
  }

  function relationsFor(occasion) {
    occ(occasion);
    if (occasion === "otoshidama") return Object.keys(CHILD_AGES).map((k) => ({ key: k, label: CHILD_AGES[k] }));
    return Object.keys(SOBA[occasion]).map((k) => ({ key: k, label: RELATIONS[k] }));
  }

  function sobaRange(occasion, relation) {
    occ(occasion);
    const table = occasion === "otoshidama" ? OTOSHIDAMA : SOBA[occasion];
    if (!own(table, relation)) return null;
    const r = table[relation];
    return [r[0], r[1]];
  }

  // 範囲内で target に最も近い金額（同距離なら高い方）。範囲内に候補がなければ全体から。
  function snap(steps, target, range) {
    const inRange = range ? steps.filter((s) => s >= range[0] && s <= range[1]) : [];
    const pool = inRange.length ? inRange : steps;
    let best = pool[0];
    for (const s of pool) {
      const d = Math.abs(s - target), bd = Math.abs(best - target);
      if (d < bd || (d === bd && s > best)) best = s;
    }
    return best;
  }

  function suggestAmount(input) {
    const { occasion, relation } = input || {};
    const o = occ(occasion);
    const range = sobaRange(occasion, relation);
    if (!range) throw new RangeError("この場面では選べない関係です: " + String(relation));
    const POS = { "20s": 0, "30s": 0.5, "40s": 1 };
    const pos = own(POS, input.age) ? POS[input.age] : 0.5;
    const target = range[0] + (range[1] - range[0]) * pos;
    const steps = STEPS[o.kind];
    const recommended = snap(steps, target, range);
    const alternatives = steps.filter((s) => s >= range[0] && s <= range[1] && s !== recommended);
    return { range, recommended, alternatives };
  }

  function isValidYen(yen) {
    return Number.isInteger(yen) && yen > 0 && yen <= MAX_YEN;
  }

  // 金額の点検。level: ng（避ける）/ caution（注意）/ info（参考）
  function checkAmount(yen, occasion, range) {
    const o = occ(occasion);
    const out = [];
    if (!isValidYen(yen)) {
      return [{ level: "ng", code: "invalid", message: "1円以上・1,000万円以下の整数で入力してください。" }];
    }
    const unit = o.kind === "otoshidama" ? 500 : 1000;
    if (yen % unit !== 0) {
      out.push({
        level: "caution", code: "fraction",
        message: o.kind === "otoshidama"
          ? "お年玉は500円・1,000円単位にすると包みやすくなります。"
          : "祝儀・不祝儀は1,000円単位で包むのが一般的です（硬貨は入れません）。",
      });
    }
    const man = Math.floor(yen / 10000);
    const sen = Math.floor((yen % 10000) / 1000);
    // 万円単位なら「万の数の先頭の数字」か「万の数の一の位」、1万円未満なら千の位が 4・9 のとき避ける
    const bad = (d) => (yen >= 10000 ? Number(String(man)[0]) === d || man % 10 === d : sen === d);
    if (bad(4)) {
      out.push({ level: "ng", code: "four", message: "「4」は「死」を連想させるため、避けるのが一般的です。" });
    } else if (bad(9)) {
      out.push({ level: "ng", code: "nine", message: "「9」は「苦」を連想させるため、避けるのが一般的です。" });
    }
    const round = yen >= 10000 ? yen % 10000 === 0 : yen % 1000 === 0;
    if (o.kind === "celebration") {
      if (yen >= 10000 && round && man % 2 === 0 && man !== 10 && !bad(4)) {
        if (man === 8) {
          out.push({ level: "info", code: "even8", message: "8は「末広がり」で縁起がよいとされ、偶数でも使われます。" });
        } else if (man === 2) {
          out.push({
            level: "info", code: "even2",
            message: "偶数は「割り切れる（別れる）」と気にする人もいます。2万円なら1万円札1枚＋5千円札2枚の3枚にすると奇数枚になります。",
          });
        } else {
          out.push({ level: "caution", code: "even", message: "結婚のお祝いでは、偶数の金額を避ける人が多いです。" });
        }
      }
      if (yen >= 10000 && !round) {
        out.push({ level: "caution", code: "notround", message: "結婚のお祝いは、1万円単位のきりのよい金額が一般的です。" });
      }
    }
    if (o.kind === "condolence" && yen >= 10000 && round && man === 2) {
      out.push({ level: "caution", code: "even2c", message: "弔事でも偶数を避ける考えがあります。1万円か3万円にする人が多いです。" });
    }
    if (o.kind === "condolence" && yen >= 100000) {
      out.push({ level: "info", code: "large", message: "香典が多額だと、遺族の香典返しの負担が大きくなることがあります。" });
    }
    if (range) {
      if (yen < range[0]) {
        out.push({ level: "info", code: "below", message: "目安の範囲より少なめです。関係や地域の慣習も確かめましょう。" });
      } else if (yen > range[1] * 2) {
        out.push({ level: "info", code: "above", message: "目安の範囲より大きく多めです。相手がお返しに気をつかうことがあります。" });
      }
    }
    return out;
  }

  // 避けるべき金額のとき、包みやすい金額の列から近い代わりを返す（同距離なら高い方）
  function nearestSafeAmount(yen, occasion) {
    const o = occ(occasion);
    if (!isValidYen(yen)) return null;
    const steps = STEPS[o.kind];
    if (yen <= steps[steps.length - 1]) return snap(steps, yen, null);
    // 列より大きい額は万の位で調整
    let man = Math.round(yen / 10000);
    while (man % 10 === 4 || man % 10 === 9 || (o.kind === "celebration" && man % 2 === 0 && man % 10 !== 0)) man += 1;
    return man * 10000;
  }

  // 避けるべき金額に近い、包みやすい金額を下・上1つずつ返す
  function safeNeighbors(yen, occasion) {
    const o = occ(occasion);
    if (!isValidYen(yen)) return [];
    const steps = STEPS[o.kind];
    const lower = steps.filter((s) => s < yen).pop();
    let higher = steps.find((s) => s > yen);
    if (higher === undefined) higher = nearestSafeAmount(yen + 10000, occasion);
    return [lower, higher].filter((v) => v !== undefined && v !== null);
  }

  const DEFAULT_PER_PERSON = { celebration: 5000, gift: 3000, sympathy: 3000, condolence: 3000, otoshidama: 1000 };

  const BILL_NEW = {
    new: "新札（折り目のないお札）を用意します。銀行の窓口や両替機で交換できます。",
    used: "新札は「不幸を予期して準備していた」印象になるため避けます。新札しかないときは、縦に一度折り目をつけて入れます。",
    mimai: "新札は「入院を予期して準備していた」印象になるため避けるのが一般的です。新札しかないときは、縦に一度折り目をつけて入れます。",
    soft: "前もって分かっている場面なので新札でもよいとする考えもありますが、折り目をつけた新札かきれいな使用済みのお札が無難です。",
  };

  function billPlan(yen, occasion) {
    const o = occ(occasion);
    if (!isValidYen(yen)) throw new RangeError("金額が不正です");
    const bills = [];
    let rest = yen;
    if (o.kind === "celebration" && yen === 20000) {
      bills.push({ value: 10000, count: 1 }, { value: 5000, count: 2 });
      rest = 0;
    }
    const denoms = o.kind === "otoshidama" ? [10000, 5000, 1000, 500] : [10000, 5000, 1000];
    for (const v of denoms) {
      const c = Math.floor(rest / v);
      if (c > 0) { bills.push({ value: v, count: c }); rest -= c * v; }
    }
    const remainder = rest; // 千円未満など、お札で包めない端数
    const total = bills.reduce((n, b) => n + (b.value >= 1000 ? b.count : 0), 0);
    let newBill, direction;
    if (o.kind === "condolence" && occasion === "funeral") newBill = "used";
    else if (o.kind === "sympathy") newBill = "mimai";
    else if (o.kind === "condolence") newBill = "soft";
    else newBill = "new";
    if (o.kind === "condolence") {
      direction = "お札の向きをそろえ、肖像が袋の裏側・下になるように入れます（悲しみで顔を伏せる意味）。";
    } else if (o.kind === "otoshidama") {
      direction = "肖像が内側になるよう、お札の左側・右側の順に三つ折りにしてポチ袋に入れます。";
    } else {
      direction = "お札の向きをそろえ、肖像が袋の表側・上になるように入れます。";
    }
    const notes = [];
    if (total === 4 || total === 9) notes.push("お札の枚数が" + total + "枚になります。気になる場合は金額か札の組み合わせを変えましょう。");
    if (remainder > 0) notes.push(remainder.toLocaleString("ja-JP") + "円はお札で包めない端数です。");
    return { bills, billCount: total, remainder, newBill, newBillText: BILL_NEW[newBill], direction, notes };
  }

  function envelope(occasion, yen, religion) {
    const o = occ(occasion);
    const rel = own(RELIGIONS, religion) ? religion : "unknown";
    const y = isValidYen(yen) ? yen : 0;
    switch (o.kind) {
      case "celebration":
        return {
          type: "祝儀袋",
          mizuhiki: "結び切り（またはあわじ結び）",
          mizuhikiWhy: "「一度きりであってほしい」お祝いなので、ほどけない結び方を選びます。",
          color: y >= 30000 ? "紅白 または 金銀" : "紅白",
          noshi: true,
          grade: y <= 10000 ? "水引が印刷された簡易な祝儀袋"
            : y <= 30000 ? "実物の水引がついた祝儀袋"
            : y <= 50000 ? "金銀の水引で、ひと回り大きめの祝儀袋"
            : "大判で、鶴亀などの飾りがついた豪華な祝儀袋",
        };
      case "gift":
        return {
          type: "祝儀袋（のし袋）",
          mizuhiki: "蝶結び（花結び）",
          mizuhikiWhy: "「何度あってもうれしい」お祝いなので、結び直せる蝶結びを選びます。",
          color: "紅白",
          noshi: true,
          grade: y <= 10000 ? "水引が印刷されたのし袋" : "実物の水引がついた祝儀袋",
        };
      case "sympathy":
        return {
          type: "お見舞い袋（白封筒、または左側に赤い帯の入った封筒）",
          mizuhiki: "結び切り（水引なしの封筒でも可）",
          mizuhikiWhy: "「繰り返さない」ように、ほどけない結び方を選びます。",
          color: "紅白",
          noshi: false,
          noshiWhy: "のしは付けません。",
          grade: "金額にかかわらず、簡素な袋で構いません",
        };
      case "condolence":
        if (rel === "christian") {
          return {
            type: "白無地の封筒、または十字架・百合の絵柄の袋",
            mizuhiki: "なし（水引のない袋を使います）",
            mizuhikiWhy: "キリスト教式では水引を使わないのが一般的です。市販の不祝儀袋なら、蓮の絵柄のないものを選びます。",
            color: "白",
            noshi: false,
            noshiWhy: "のしは付けません。",
            grade: y <= 5000 ? "白無地の封筒で構いません" : "十字架・百合の絵柄の袋か、上質な白封筒",
          };
        }
        if (rel === "shinto") {
          return {
            type: "不祝儀袋（無地。蓮の絵柄のないもの）",
            mizuhiki: "結び切り（またはあわじ結び）",
            mizuhikiWhy: "「二度と繰り返さない」ように、ほどけない結び方を選びます。",
            color: y >= 30000 ? "双銀（または黒白）" : "黒白 または 双銀",
            noshi: false,
            noshiWhy: "のしは付けません。蓮の絵柄は仏式専用なので使いません。",
            grade: y <= 5000 ? "水引が印刷された無地の不祝儀袋" : "実物の水引がついた無地の不祝儀袋",
          };
        }
        return {
          type: "不祝儀袋",
          mizuhiki: "結び切り（またはあわじ結び）",
          mizuhikiWhy: "「二度と繰り返さない」ように、ほどけない結び方を選びます。",
          color: y >= 30000 ? "双銀（または黒白）" : "黒白（関西など一部の地域では黄白）",
          noshi: false,
          noshiWhy: "のしは慶事の飾りなので付けません。蓮の絵柄の袋は仏式専用です。",
          grade: y <= 5000 ? "水引が印刷された不祝儀袋"
            : y <= 20000 ? "黒白の実物の水引がついた不祝儀袋"
            : "双銀の水引で、ひと回り大きめの不祝儀袋",
        };
      default:
        return {
          type: "ポチ袋",
          mizuhiki: "なし",
          mizuhikiWhy: "ポチ袋で構いません。",
          color: "自由（子どもが喜ぶ柄でよい）",
          noshi: false,
          noshiWhy: "",
          grade: "金額にかかわらずポチ袋。1万円以上なら小さめの封筒でも",
        };
    }
  }

  function omotegaki(occasion, religion) {
    const o = occ(occasion);
    const rel = own(RELIGIONS, religion) ? religion : "unknown";
    const dark = "濃い墨（筆ペン・サインペン）";
    const light = "薄墨（悲しみの涙で墨が薄まった、という意味）";
    switch (occasion) {
      case "wedding":
      case "wedding_gift":
        return {
          main: "寿", alternatives: ["御祝", "御結婚御祝"], ink: dark, inkLevel: "dark",
          note: "4文字の「御結婚御祝」は「死文字」として気にする人もいるため、「寿」か「御祝」が無難です。",
        };
      case "birth":
        return { main: "祝御出産", alternatives: ["御出産御祝", "御祝"], ink: dark, inkLevel: "dark", note: "" };
      case "school":
        return { main: "祝御入学", alternatives: ["祝御入園", "御入学御祝", "御祝"], ink: dark, inkLevel: "dark", note: "入園なら「祝御入園」にします。" };
      case "new_home":
        return {
          main: "祝御新築", alternatives: ["御新居御祝", "御祝"], ink: dark, inkLevel: "dark",
          note: "マンションの購入や引っ越しなど、建てたのでなければ「御新居御祝」にします。",
        };
      case "illness":
        return {
          main: "御見舞", alternatives: ["祈御全快"], ink: dark, inkLevel: "dark",
          note: "目上の方に現金を贈るのは失礼とする考えもあります。気になる場合は品物にしましょう。",
        };
      case "funeral": {
        const map = {
          unknown: { main: "御霊前", alternatives: ["御香典"], note: "宗教が分からないときは「御霊前」が広く使えます。ただし浄土真宗では「御仏前」、キリスト教（プロテスタント）では「御花料」とするため、分かれば合わせましょう。" },
          buddhist: { main: "御霊前", alternatives: ["御香典", "御香料"], note: "" },
          jodo_shinshu: { main: "御仏前", alternatives: ["御香典"], note: "浄土真宗では亡くなってすぐ仏になると考えるため、通夜・葬儀でも「御仏前」とします。" },
          shinto: { main: "御玉串料", alternatives: ["御榊料", "御霊前"], note: "蓮の絵柄の袋は使いません。" },
          christian: { main: "御花料", alternatives: ["献花料", "御ミサ料（カトリック）"], note: "十字架や百合の絵柄の袋、または白無地の封筒を使います。" },
        };
        return Object.assign({ ink: light, inkLevel: "light" }, map[rel]);
      }
      case "memorial": {
        const map = {
          unknown: { main: "御仏前", alternatives: ["御供物料"], note: "法要は仏式が多いため「御仏前」としています。神式なら「御玉串料」、キリスト教式なら「御花料」です。" },
          buddhist: { main: "御仏前", alternatives: ["御供物料"], note: "四十九日より前の法要では「御霊前」とします。" },
          jodo_shinshu: { main: "御仏前", alternatives: ["御供物料"], note: "" },
          shinto: { main: "御玉串料", alternatives: ["御榊料"], note: "" },
          christian: { main: "御花料", alternatives: [], note: "" },
        };
        return Object.assign({ ink: "濃い墨（四十九日以降は薄墨でなくてよいとされます）", inkLevel: "dark" }, map[rel]);
      }
      default:
        return {
          main: "おとしだま", alternatives: ["お年玉"], ink: dark, inkLevel: "dark",
          note: "上司など目上の方のお子さんへは「お年玉」ではなく「文具料」「御祝」とするのが丁寧です。",
        };
    }
  }

  function nameGuide(occasion, people) {
    occ(occasion);
    const n = Number.isInteger(people) && people > 0 ? people : 1;
    if (occasion === "otoshidama") {
      return ["表の左上に子どもの名前（「〇〇ちゃんへ」など）、裏に自分の名前を書きます。"];
    }
    if (n === 1) return ["水引の下の中央に、表書きより少し小さくフルネームを書きます。", "夫婦で贈るときは、中央に夫のフルネーム、その左に妻の名前だけを書くのが一般的です。"];
    if (n <= 3) return ["水引の下に、右から目上の人の順に並べてフルネームを書きます。立場が同じなら五十音順にします。"];
    return [
      "4名以上は全員の名前を表に書かず、「〇〇部一同」「友人一同」などとします。",
      "代表者のフルネームの左に「外一同」と添える書き方もあります。",
      "全員の名前と金額の内訳は、別の紙に書いて中袋に入れます。",
    ];
  }

  const DAIJI = ["", "壱", "弐", "参", "肆", "伍", "陸", "漆", "捌", "玖"];

  function group4(n) {
    // 0〜9999 を大字に。各位の 1 も「壱」を明記する（改ざん防止）
    const units = ["阡", "佰", "拾", ""];
    const digits = String(n).padStart(4, "0").split("").map(Number);
    let s = "";
    digits.forEach((d, i) => { if (d) s += DAIJI[d] + units[i]; });
    return s;
  }

  function toDaiji(yen) {
    if (!Number.isInteger(yen) || yen <= 0 || yen > 99999999) throw new RangeError("1〜99,999,999 の整数で指定してください");
    const man = Math.floor(yen / 10000);
    const rest = yen % 10000;
    return "金" + (man ? group4(man) + "萬" : "") + group4(rest) + "圓也";
  }

  function jointPlan(occasion, people, perPerson) {
    occ(occasion);
    if (!Number.isInteger(people) || people < 2 || people > 100) throw new RangeError("人数は2〜100人で指定してください");
    if (!isValidYen(perPerson) || perPerson * people > MAX_YEN) throw new RangeError("1人あたりの金額が不正です（合計は1,000万円まで）");
    const raw = people * perPerson;
    // 合計は1,000円単位に丸め、4・9 など「避ける」金額なら1,000円ずつ上げる
    let total = Math.max(1000, Math.round(raw / 1000) * 1000);
    let guard = 0;
    while (checkAmount(total, occasion).some((c) => c.level === "ng") && guard++ < 200) total += 1000;
    const share = Math.ceil(total / people / 100) * 100; // 100円単位で切り上げ
    const surplus = share * people - total;
    return { total, share, surplus, raw };
  }

  function returnGift(occasion, yen) {
    occ(occasion);
    const y = isValidYen(yen) ? yen : 0;
    const r500 = (v) => Math.round(v / 500) * 500;
    const range = (lo, hi) => [r500(y * lo), r500(y * hi)];
    switch (occasion) {
      case "wedding":
        return { needed: false, name: "", range: null, timing: "", note: "披露宴の引出物と料理がお返しを兼ねるため、基本的に不要です。" };
      case "wedding_gift":
        return { needed: true, name: "結婚内祝い", range: range(1 / 3, 1 / 2), timing: "挙式後（式がなければ入籍後）1か月以内", note: "いただいた額の半額（半返し）〜3分の1が目安です。" };
      case "birth":
        return { needed: true, name: "出産内祝い", range: range(1 / 3, 1 / 2), timing: "生後1か月ごろ（お宮参りのころ）", note: "いただいた額の3分の1〜半額が目安です。" };
      case "school":
        return { needed: false, name: "", range: null, timing: "", note: "子どもへのお祝いなので、お返しは基本的に不要です。子ども本人からお礼を伝えましょう。" };
      case "new_home":
        return { needed: true, name: "新築内祝い", range: range(1 / 3, 1 / 2), timing: "新居に移ってから1〜2か月以内", note: "新居に招いてもてなすことで、お返しに代える場合もあります。" };
      case "illness":
        return { needed: true, name: "快気祝い", range: range(1 / 3, 1 / 2), timing: "退院・床上げから10日〜1か月ごろ", note: "「病気が残らない」よう、お菓子や洗剤など消えものを選ぶのが一般的です。" };
      case "funeral":
        return { needed: true, name: "香典返し", range: range(1 / 3, 1 / 2), timing: "忌明け（仏式は四十九日）後", note: "当日に一律の品を渡す「当日返し」の場合、高額の香典には忌明け後に差額分を贈ります。" };
      case "memorial":
        return { needed: false, name: "引き物", range: null, timing: "法要の当日", note: "施主が当日に引き物を用意するのが一般的で、別のお返しは基本的に不要です。" };
      default:
        return { needed: false, name: "", range: null, timing: "", note: "お年玉にお返しは不要です。" };
    }
  }

  // ---- 記録 ----
  const RECORD_LIMITS = { person: 40, note: 200, maxRecords: 500 };
  // 制御文字と双方向制御文字を除去
  const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

  function cleanText(v) {
    return typeof v === "string" ? v.replace(UNSAFE_CHARS, "").trim() : "";
  }

  function isValidDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function validateRecord(raw) {
    const errors = [];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["記録の形式が不正です。"] };
    const direction = raw.direction === "received" ? "received" : raw.direction === "gave" ? "gave" : null;
    if (!direction) errors.push("「贈った」か「いただいた」を選んでください。");
    const date = typeof raw.date === "string" ? raw.date : "";
    if (!isValidDate(date)) errors.push("日付を正しく入力してください。");
    const person = cleanText(raw.person);
    if (!person) errors.push("相手の名前を入力してください。");
    else if (person.length > RECORD_LIMITS.person) errors.push("相手の名前は" + RECORD_LIMITS.person + "文字以内にしてください。");
    const occasion = own(OCCASIONS, raw.occasion) ? raw.occasion : null;
    if (!occasion) errors.push("場面を選んでください。");
    const amount = typeof raw.amount === "number" ? raw.amount : Number.NaN;
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_YEN) errors.push("金額は0〜1,000万円の整数で入力してください（品物なら0）。");
    const note = cleanText(raw.note);
    if (note.length > RECORD_LIMITS.note) errors.push("メモは" + RECORD_LIMITS.note + "文字以内にしてください。");
    const id = typeof raw.id === "string" && /^[A-Za-z0-9-]{1,64}$/.test(raw.id) ? raw.id : null;
    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { id, direction, date, person, occasion, amount, note } };
  }

  // JSON 文字列から記録を取り込む。不正な行は捨て、件数を返す。
  function parseRecords(json) {
    let data;
    try { data = JSON.parse(json); } catch (e) { return { records: [], skipped: 0, error: "JSON として読み込めませんでした。" }; }
    const list = Array.isArray(data) ? data : data && Array.isArray(data.records) ? data.records : null;
    if (!list) return { records: [], skipped: 0, error: "記録の一覧が見つかりませんでした。" };
    const records = [];
    const seen = new Set();
    let skipped = 0;
    for (const item of list) {
      if (records.length >= RECORD_LIMITS.maxRecords) { skipped++; continue; }
      const r = validateRecord(item);
      if (r.ok && r.value.id && !seen.has(r.value.id)) { seen.add(r.value.id); records.push(r.value); } else skipped++;
    }
    return { records, skipped, error: null };
  }

  // 画面からの入力をまとめて受け取り、結果を返す。範囲外の値は使わずに inputErrors に入れる（例外を投げない）。
  function plan(input) {
    const i = input || {};
    const o = occ(i.occasion);
    const suggestion = suggestAmount(i);
    const inputErrors = [];
    const isOtoshidama = o.kind === "otoshidama";

    let people = 1;
    if (!isOtoshidama && i.people !== undefined && i.people !== null && i.people !== 1) {
      if (Number.isInteger(i.people) && i.people >= 2 && i.people <= 100) people = i.people;
      else inputErrors.push("人数は1〜100人の整数で入力してください。1人として表示しています。");
    }

    let amount = null;
    if (i.amount !== undefined && i.amount !== null) {
      if (isValidYen(i.amount)) amount = i.amount;
      else inputErrors.push("包む金額は1円以上・1,000万円以下の整数で入力してください。おすすめ金額で表示しています。");
    }

    let joint = null;
    if (people >= 2) {
      if (amount !== null) {
        // 金額を自分で決めた連名: その金額を人数で割る
        const share = Math.ceil(amount / people / 100) * 100;
        joint = { people, perPerson: null, total: amount, share, surplus: share * people - amount, raw: amount, fixed: true };
      } else {
        let perPerson = DEFAULT_PER_PERSON[o.kind];
        if (i.perPerson !== undefined && i.perPerson !== null) {
          if (isValidYen(i.perPerson) && i.perPerson * people <= MAX_YEN) perPerson = i.perPerson;
          else inputErrors.push("1人あたりの金額は、合計が1,000万円以下になるよう入力してください。標準の " + formatYen(perPerson) + " で表示しています。");
        }
        joint = Object.assign({ people, perPerson, fixed: false }, jointPlan(i.occasion, people, perPerson));
      }
    }

    if (amount === null) amount = joint ? joint.total : suggestion.recommended;
    // 連名のときは1人分の目安の範囲と比べても意味がないため、範囲の比較をしない
    const checks = checkAmount(amount, i.occasion, joint ? null : suggestion.range);
    const hasNg = checks.some((c) => c.level === "ng");
    const bills = billPlan(amount, i.occasion);
    if (hasNg) bills.notes = bills.notes.filter((n) => !/枚数/.test(n)); // 同じ問題を二重に知らせない
    return {
      occasion: i.occasion,
      group: o.group,
      kind: o.kind,
      amount,
      people,
      inputErrors,
      suggestion,
      checks,
      safeAlternatives: hasNg ? safeNeighbors(amount, i.occasion) : [],
      bills,
      envelope: envelope(i.occasion, amount, i.religion),
      omotegaki: omotegaki(i.occasion, i.religion),
      names: nameGuide(i.occasion, people),
      daiji: toDaiji(amount),
      joint,
      returnGift: returnGift(i.occasion, amount),
    };
  }

  function formatYen(yen) {
    if (!Number.isFinite(yen)) return "";
    if (yen >= 10000 && yen % 10000 === 0) return (yen / 10000).toLocaleString("ja-JP") + "万円";
    return yen.toLocaleString("ja-JP") + "円";
  }

  return {
    OCCASIONS, RELATIONS, CHILD_AGES, RELIGIONS, AGES, RECORD_LIMITS, MAX_YEN, DEFAULT_PER_PERSON,
    relationsFor, sobaRange, suggestAmount, checkAmount, nearestSafeAmount, safeNeighbors, billPlan, envelope,
    omotegaki, nameGuide, toDaiji, jointPlan, returnGift, validateRecord, parseRecords, plan, formatYen,
  };
});

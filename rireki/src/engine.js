/* ============================================================
   としめくり — 計算エンジン（DOM 非依存の純粋関数）
   ------------------------------------------------------------
   ブラウザ: <script src="src/engine.js"> でグローバル Toshimekuri を公開
   Node    : require('../src/engine.js') で同じオブジェクトを読む
   日付は {y, m, d} の整数で扱い、Date のタイムゾーンの影響を受けない。
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Toshimekuri = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 元号表（新しい順）。改元時はここに1行足す。 */
  var ERAS = [
    { name: '令和', start: { y: 2019, m: 5, d: 1 } },
    { name: '平成', start: { y: 1989, m: 1, d: 8 } },
    { name: '昭和', start: { y: 1926, m: 12, d: 25 } },
    { name: '大正', start: { y: 1912, m: 7, d: 30 } },
  ];
  var MIN_DATE = ERAS[ERAS.length - 1].start;
  /** 生年月日として受け付ける最小日（昭和元年）。 */
  var MIN_BIRTH = { y: 1926, m: 12, d: 25 };
  var MAX_SCHOOL_NAME = 60;
  var MAX_EXTRA_YEARS = 5;

  /** 学歴パターン（UI の選択肢と共通）。 */
  var PATHS = [
    { id: 'juniorHigh', label: '中学校まで' },
    { id: 'high', label: '高等学校' },
    { id: 'kosen', label: '高等専門学校（5年）' },
    { id: 'junior', label: '短期大学（2年）' },
    { id: 'vocational', label: '専門学校' },
    { id: 'univ4', label: '大学（4年）' },
    { id: 'univ6', label: '大学（6年制：医・歯・薬・獣医）' },
    { id: 'master', label: '大学院 修士課程' },
    { id: 'doctor', label: '大学院 博士課程' },
  ];

  var DEFAULT_SCHOOL = {
    elementary: '○○小学校',
    juniorHigh: '○○中学校',
    high: '○○高等学校',
    kosen: '○○工業高等専門学校',
    junior: '○○短期大学',
    vocational: '○○専門学校',
    univ: '○○大学',
    master: '○○大学大学院 修士課程',
    doctor: '○○大学大学院 博士課程',
  };

  var PLACEHOLDER_NAMES = Object.keys(DEFAULT_SCHOOL).map(function (k) { return DEFAULT_SCHOOL[k]; });

  function toNum(date) {
    return date.y * 10000 + date.m * 100 + date.d;
  }

  function isLeap(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function daysInMonth(y, m) {
    return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }

  /** 'YYYY-MM-DD' を厳密に解釈する。実在しない日付は null。 */
  function parseDate(str) {
    if (typeof str !== 'string') return null;
    var mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
    if (!mt) return null;
    var y = Number(mt[1]);
    var m = Number(mt[2]);
    var d = Number(mt[3]);
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
    return { y: y, m: m, d: d };
  }

  function formatIso(date) {
    function pad(n) {
      return n < 10 ? '0' + n : String(n);
    }
    return date.y + '-' + pad(date.m) + '-' + pad(date.d);
  }

  function eraYearLabel(eraName, eraYear) {
    return eraName + (eraYear === 1 ? '元' : String(eraYear)) + '年';
  }

  /** 西暦の年月日 → 和暦。大正より前は RangeError。 */
  function toWareki(y, m, d) {
    var n = toNum({ y: y, m: m, d: d });
    for (var i = 0; i < ERAS.length; i++) {
      var era = ERAS[i];
      if (n >= toNum(era.start)) {
        var eraYear = y - era.start.y + 1;
        return { era: era.name, eraYear: eraYear, label: eraYearLabel(era.name, eraYear) };
      }
    }
    throw new RangeError('大正元年（1912年7月30日）より前の日付は変換できません。');
  }

  /** 元号の最終年（次の元号の開始年）。現行元号は null（上限なし）。 */
  function eraLastYear(index) {
    return index === 0 ? null : ERAS[index - 1].start.y;
  }

  /** 和暦の年 → 西暦の年。元号の期間外は RangeError。 */
  function toSeireki(eraName, eraYear) {
    var index = -1;
    for (var i = 0; i < ERAS.length; i++) {
      if (ERAS[i].name === eraName) index = i;
    }
    if (index < 0) throw new RangeError('対応していない元号です（大正・昭和・平成・令和に対応）。');
    if (!Number.isInteger(eraYear) || eraYear < 1) {
      throw new RangeError('年は1以上の整数で入力してください（元年は1）。');
    }
    var y = ERAS[index].start.y + eraYear - 1;
    var last = eraLastYear(index);
    if (last !== null && y > last) {
      throw new RangeError(
        eraName + 'は' + eraYearLabel(eraName, last - ERAS[index].start.y + 1) + 'までです。'
      );
    }
    return y;
  }

  /**
   * 西暦年に重なる元号の年をすべて返す（改元の年は2つ）。
   * 例: 1989 → ['昭和64年', '平成元年']
   */
  function eraLabelsOfYear(y) {
    var labels = [];
    for (var i = ERAS.length - 1; i >= 0; i--) {
      var start = ERAS[i].start.y;
      var last = eraLastYear(i);
      if (y >= start && (last === null || y <= last)) labels.push(eraYearLabel(ERAS[i].name, y - start + 1));
    }
    return labels;
  }

  /** 和暦の年月日 → 西暦の年月日。その日が元号の期間内かも確かめる。 */
  function warekiDateToSeireki(eraName, eraYear, m, d) {
    var y = toSeireki(eraName, eraYear);
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > daysInMonth(y, m)) {
      throw new RangeError('存在しない日付です。');
    }
    var w = toWareki(y, m, d);
    if (w.era !== eraName) {
      throw new RangeError(
        eraYearLabel(eraName, eraYear) + m + '月' + d + '日は存在しません（その日は' + w.label + 'です）。'
      );
    }
    return { y: y, m: m, d: d };
  }

  /**
   * 年の表記。学歴欄の月は 4月=1日（入学）、3月=31日（卒業）で元号を判定する。
   * それ以外の月は1日で判定する。
   */
  function yearLabel(y, m, mode) {
    if (mode === 'seireki') return y + '年';
    return toWareki(y, m, m === 3 ? 31 : 1).label;
  }

  /** 年月の表記（画面用）。例: '令和7年 3月' / '2025年 3月'。 */
  function formatYm(y, m, mode) {
    return yearLabel(y, m, mode) + ' ' + m + '月';
  }

  /** 早生まれ（1月1日〜4月1日生まれ）か。 */
  function isHayaumare(birth) {
    return birth.m < 4 || (birth.m === 4 && birth.d === 1);
  }

  /** 小学校の入学年（西暦）。 */
  function elementaryEntryYear(birth) {
    return birth.y + (isHayaumare(birth) ? 6 : 7);
  }

  /** ref 時点の満年齢。2月29日生まれは平年は3月1日に加齢する。 */
  function ageOn(birth, ref) {
    var age = ref.y - birth.y;
    var bm = birth.m;
    var bd = birth.d;
    if (bm === 2 && bd === 29 && !isLeap(ref.y)) {
      bm = 3;
      bd = 1;
    }
    if (ref.m < bm || (ref.m === bm && ref.d < bd)) age -= 1;
    return age;
  }

  function clampInt(value, min, max, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    n = Math.trunc(n);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function cleanSchoolName(value, fallback) {
    if (typeof value !== 'string') return fallback;
    return normalizeSchoolName(value) || fallback;
  }

  /** 学校名を正規化する。空になったら ''。 */
  function normalizeSchoolName(value) {
    if (typeof value !== 'string') return '';
    // 制御文字・改行・タブを除く（コピー文字列の列がずれないように）
    // 双方向制御文字・ゼロ幅文字・行区切り（表示の偽装やコピー時の行ずれの原因）も除く
    var s = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '').trim();
    return Array.from(s).slice(0, MAX_SCHOOL_NAME).join('');
  }

  function isValidPath(id) {
    for (var i = 0; i < PATHS.length; i++) if (PATHS[i].id === id) return true;
    return false;
  }

  /**
   * 学歴年表を作る。
   * @returns {{ rows: Array, age: number|null, hayaumare: boolean|null, errors: string[] }}
   */
  function buildTimeline(input) {
    input = input || {};
    var errors = [];
    var birth = parseDate(input.birth);
    var ref = parseDate(input.refDate);

    if (!input.birth) errors.push('生年月日を入力してください。');
    else if (!birth) errors.push('生年月日が正しい日付ではありません。');
    else if (toNum(birth) < toNum(MIN_BIRTH)) errors.push('生年月日は1926年12月25日（昭和元年）以降で入力してください。');

    if (!input.refDate) errors.push('記入日を入力してください。');
    else if (!ref) errors.push('記入日が正しい日付ではありません。');
    else if (toNum(ref) < toNum(MIN_BIRTH)) errors.push('記入日は1926年12月25日（昭和元年）以降で入力してください。');

    if (birth && ref && toNum(birth) > toNum(ref)) errors.push('生年月日が記入日より後になっています。');

    var path = input.path || 'univ4';
    if (!isValidPath(path)) errors.push('最終学歴の選択肢が正しくありません。');

    if (errors.length) return { rows: [], age: null, hayaumare: null, errors: errors, warnings: [] };

    var ext = input.extend || {};
    var extHigh = clampInt(ext.high, 0, MAX_EXTRA_YEARS, 0);
    var extPost = clampInt(ext.post, 0, MAX_EXTRA_YEARS, 0);
    var extGrad = clampInt(ext.grad, 0, MAX_EXTRA_YEARS, 0);
    var ronin = clampInt(input.roninYears, 0, MAX_EXTRA_YEARS, 0);
    var vocYears = clampInt(input.vocationalYears, 1, 4, 2);
    var names = input.schools || {};
    var refNum = toNum(ref);

    var rows = [];
    function add(y, m, school, event) {
      // 入学は4月1日、卒業・修了は3月31日として記入日と比べる
      var when = toNum({ y: y, m: m, d: m === 3 ? 31 : 1 });
      var status = when > refNum ? 'expected' : 'done';
      var label = event;
      if (status === 'expected') label = event === '入学' ? '入学予定' : event + '見込み';
      var placeholder = PLACEHOLDER_NAMES.indexOf(school) >= 0;
      rows.push({ y: y, m: m, school: school, event: event, status: status, placeholder: placeholder, text: school + ' ' + label });
    }

    var e = elementaryEntryYear(birth);
    if (input.includeElementary) {
      var elem = cleanSchoolName(names.elementary, DEFAULT_SCHOOL.elementary);
      add(e, 4, elem, '入学');
      add(e + 6, 3, elem, '卒業');
    }
    var jh = cleanSchoolName(names.juniorHigh, DEFAULT_SCHOOL.juniorHigh);
    if (input.includeElementary) add(e + 6, 4, jh, '入学');
    add(e + 9, 3, jh, '卒業');

    if (path !== 'juniorHigh') {
      var secondaryKind = path === 'kosen' ? 'kosen' : 'high';
      var sec = cleanSchoolName(names.high, DEFAULT_SCHOOL[secondaryKind]);
      var secYears = (secondaryKind === 'kosen' ? 5 : 3) + extHigh;
      add(e + 9, 4, sec, '入学');
      var secEnd = e + 9 + secYears;
      add(secEnd, 3, sec, '卒業');

      var postKind = null;
      var postYears = 0;
      if (path === 'junior') { postKind = 'junior'; postYears = 2; }
      else if (path === 'vocational') { postKind = 'vocational'; postYears = vocYears; }
      else if (path === 'univ4' || path === 'master' || path === 'doctor') { postKind = 'univ'; postYears = 4; }
      else if (path === 'univ6') { postKind = 'univ'; postYears = 6; }

      if (postKind) {
        var post = cleanSchoolName(names.post, DEFAULT_SCHOOL[postKind]);
        var postStart = secEnd + ronin;
        var postEnd = postStart + postYears + extPost;
        add(postStart, 4, post, '入学');
        add(postEnd, 3, post, '卒業');

        if (path === 'master' || path === 'doctor') {
          var master = cleanSchoolName(names.master, DEFAULT_SCHOOL.master);
          // 在学延長は大学院の最後の課程に足す
          var masterEnd = postEnd + 2 + (path === 'master' ? extGrad : 0);
          add(postEnd, 4, master, '入学');
          add(masterEnd, 3, master, '修了');
          if (path === 'doctor') {
            var doctor = cleanSchoolName(names.doctor, DEFAULT_SCHOOL.doctor);
            add(masterEnd, 4, doctor, '入学');
            add(masterEnd + 3 + extGrad, 3, doctor, '修了');
          }
        }
      }
    }

    var warnings = [];
    var jhGrad = toNum({ y: e + 9, m: 3, d: 31 });
    if (jhGrad > refNum) {
      warnings.push('記入日の時点で、まだ中学校を卒業していない年齢です。生年月日と記入日を確かめてください。');
    }
    if (rows.some(function (r) { return r.placeholder; })) {
      warnings.push('学校名が未入力の行があります（「○○」の行）。「詳しい条件」で学校名を入れてからコピーしてください。');
    }
    return { rows: rows, age: ageOn(birth, ref), hayaumare: isHayaumare(birth), errors: [], warnings: warnings };
  }

  /** コピー用のタブ区切り文字列（年<TAB>月<TAB>学歴）。先頭に「学歴」見出し行を付ける。 */
  function formatTimelineText(rows, mode) {
    var lines = ['\t\t学歴'];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      lines.push(yearLabel(r.y, r.m, mode) + '\t' + r.m + '月\t' + r.text);
    }
    return lines.join('\n');
  }

  return {
    ERAS: ERAS,
    PATHS: PATHS,
    MIN_DATE: MIN_DATE,
    MIN_BIRTH: MIN_BIRTH,
    MAX_SCHOOL_NAME: MAX_SCHOOL_NAME,
    parseDate: parseDate,
    formatIso: formatIso,
    toWareki: toWareki,
    toSeireki: toSeireki,
    warekiDateToSeireki: warekiDateToSeireki,
    eraLabelsOfYear: eraLabelsOfYear,
    normalizeSchoolName: normalizeSchoolName,
    yearLabel: yearLabel,
    formatYm: formatYm,
    isHayaumare: isHayaumare,
    elementaryEntryYear: elementaryEntryYear,
    ageOn: ageOn,
    buildTimeline: buildTimeline,
    formatTimelineText: formatTimelineText,
  };
});

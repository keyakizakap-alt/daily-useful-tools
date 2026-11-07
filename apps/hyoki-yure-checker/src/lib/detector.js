// 表記ゆれ検出・統一の純粋ロジック。DOM に依存しないため Node.js から直接テストできる。

const ALNUM_CHARS = "0-9A-Za-z０-９Ａ-Ｚａ-ｚ";
const KATAKANA_CHARS = "ァ-ヶー";
const ALNUM_TOKEN_RE = new RegExp(`[${ALNUM_CHARS}]+`, "g");
const KATAKANA_TOKEN_RE = new RegExp(`[${KATAKANA_CHARS}]{2,}`, "g");
const KATAKANA_TOKEN_TEST_RE = new RegExp(`^[${KATAKANA_CHARS}]+$`);

/**
 * 全角英数字1文字を半角に変換する。全角英数字(U+FF01-FF5E)は
 * 対応する半角文字よりコードポイントが 0xFEE0 だけ大きいという
 * Unicode の性質を利用する。対象外の文字はそのまま返す。
 */
function fullwidthCharToHalfwidth(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0xff01 && code <= 0xff5e) {
    return String.fromCodePoint(code - 0xfee0);
  }
  return ch;
}

/** 全角英数字を含む文字列を半角英数字に正規化する。 */
function normalizeAlnum(token) {
  return Array.from(token).map(fullwidthCharToHalfwidth).join("");
}

/** カタカナ語から長音符号「ー」を取り除いたキーを作る。 */
function normalizeChoon(token) {
  return token.replace(/ー/g, "");
}

function extractTokens(text, regex) {
  return text.match(regex) || [];
}

/**
 * トークン配列を正規化キーでグルーピングし、正規化後の異なり数が
 * 2以上あるものだけを表記ゆれ候補(Finding)として返す。
 */
function groupIntoFindings(tokens, normalize, type, minLength) {
  const groups = new Map();
  for (const token of tokens) {
    if (token.length < minLength) continue;
    const key = normalize(token);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const surfaceCounts = groups.get(key);
    surfaceCounts.set(token, (surfaceCounts.get(token) || 0) + 1);
  }

  const findings = [];
  for (const [key, surfaceCounts] of groups) {
    if (surfaceCounts.size < 2) continue;
    const variants = Array.from(surfaceCounts, ([surface, count]) => ({ surface, count })).sort(
      (a, b) => b.count - a.count || a.surface.localeCompare(b.surface),
    );
    findings.push({ type, key, variants });
  }

  findings.sort((a, b) => a.key.localeCompare(b.key));
  return findings;
}

/** 全角/半角英数字の表記ゆれを検出する。 */
function findAlnumWidthInconsistencies(text) {
  const tokens = extractTokens(text, ALNUM_TOKEN_RE);
  return groupIntoFindings(tokens, normalizeAlnum, "width", 1);
}

/** 長音符号「ー」有無によるカタカナ表記ゆれを検出する。 */
function findKatakanaChoonInconsistencies(text) {
  const tokens = extractTokens(text, KATAKANA_TOKEN_RE);
  return groupIntoFindings(tokens, normalizeChoon, "choon", 2);
}

/** テキスト全体を解析し、検出された表記ゆれ Finding の一覧を返す。 */
function analyzeText(text) {
  return [...findAlnumWidthInconsistencies(text), ...findKatakanaChoonInconsistencies(text)];
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * トークンが英数字トークンかカタカナトークンかによって、その表記が
 * 「そこで途切れている」と判定すべき境界の文字クラスを返す。
 * 英数字トークンとカタカナトークンは互いに隣接しても(例:「ユーザID」
 * 「Aランク」)それぞれ独立した表記とみなすべきなので、境界判定は
 * 種類ごとに別々の文字クラスで行う必要がある
 * (両方をひとつのクラスにまとめると、英数字とカタカナが隣接する
 * ごく一般的な文章で置換が機能しなくなる)。
 */
function boundaryCharsFor(token) {
  return KATAKANA_TOKEN_TEST_RE.test(token) ? KATAKANA_CHARS : ALNUM_CHARS;
}

/**
 * 表記の一覧(surfaces)から、各表記がより大きなトークンの一部として
 * 誤マッチしないよう境界チェック付きの正規表現を組み立てる。
 * 置換とプレビューのハイライトの両方で共通して使う。
 * 長い表記を先に判定するよう並べ替え、短い表記が長い表記の一部として
 * 先にマッチしてしまうのを防ぐ。
 */
function buildBoundaryAwarePattern(surfaces) {
  const unique = [...new Set(surfaces)].sort((a, b) => b.length - a.length);
  const branches = unique.map((s) => {
    const cls = boundaryCharsFor(s);
    return `(?<![${cls}])${escapeRegExp(s)}(?![${cls}])`;
  });
  return new RegExp(branches.join("|"), "g");
}

/**
 * replacements ({ from, to }[]) に基づいてテキスト中の表記を一括置換する。
 * 境界チェック付きの正規表現を使い、より大きなトークンの一部分だけが
 * 誤って置換されないようにする。
 */
function applyUnification(text, replacements) {
  const effective = replacements.filter((r) => r.from !== r.to);
  if (effective.length === 0) return text;

  const pattern = buildBoundaryAwarePattern(effective.map((r) => r.from));
  const toMap = new Map(effective.map((r) => [r.from, r.to]));
  return text.replace(pattern, (match) => toMap.get(match) ?? match);
}

/** Finding から、デフォルトの統一先(出現回数最多の表記)への置換リストを作る。 */
function defaultReplacementsForFinding(finding) {
  const [canonical, ...rest] = finding.variants;
  return rest.map((v) => ({ from: v.surface, to: canonical.surface }));
}

export {
  fullwidthCharToHalfwidth,
  normalizeAlnum,
  normalizeChoon,
  findAlnumWidthInconsistencies,
  findKatakanaChoonInconsistencies,
  analyzeText,
  buildBoundaryAwarePattern,
  applyUnification,
  defaultReplacementsForFinding,
};

// 表記ゆれ検出・統一の純粋ロジック。DOM に依存しないため Node.js から直接テストできる。

const ALNUM_TOKEN_RE = /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]+/g;
const KATAKANA_TOKEN_RE = /[ァ-ヶー]{2,}/g;

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

// トークンを構成しうる文字クラス(英数字全角半角 + カタカナ + 長音符号)。
// 置換対象がこのクラスの文字に前後で隣接している場合、それはより長い
// トークンの一部であることを意味するため、置換対象から除外する
// (例: 「サーバ」→「サーバー」の統一で、既存の「サーバー」内の
// 「サーバ」部分まで誤って再置換されるのを防ぐ)。
const TOKEN_CHAR_CLASS = "0-9A-Za-z0-9０-９Ａ-Ｚａ-ｚァ-ヶー";

/**
 * replacements ({ from, to }[]) に基づいてテキスト中の表記を一括置換する。
 * from が長い順に処理することで、短い表記が長い表記の部分文字列として
 * 誤って置換されるのを防ぐ。さらに前後を境界チェックし、より大きな
 * トークンの一部分だけが誤って置換されないようにする。
 */
function applyUnification(text, replacements) {
  const effective = replacements.filter((r) => r.from !== r.to);
  const sorted = [...effective].sort((a, b) => b.from.length - a.from.length);
  if (sorted.length === 0) return text;

  const alternation = sorted.map((r) => escapeRegExp(r.from)).join("|");
  const pattern = new RegExp(
    `(?<![${TOKEN_CHAR_CLASS}])(?:${alternation})(?![${TOKEN_CHAR_CLASS}])`,
    "g",
  );
  const toMap = new Map(sorted.map((r) => [r.from, r.to]));
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
  applyUnification,
  defaultReplacementsForFinding,
};

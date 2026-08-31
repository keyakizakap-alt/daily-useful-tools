import { analyzeText, applyUnification, buildBoundaryAwarePattern } from "./lib/detector.js";

const inputText = document.getElementById("input-text");
const checkButton = document.getElementById("check-button");
const unifyAllButton = document.getElementById("unify-all-button");
const copyButton = document.getElementById("copy-button");
const copyStatus = document.getElementById("copy-status");
const findingsList = document.getElementById("findings-list");
const findingsStatus = document.getElementById("findings-status");
const preview = document.getElementById("preview");

const TYPE_LABELS = { width: "全角/半角", choon: "長音" };
const TYPE_LEGENDS = {
  width: "全角/半角の表記ゆれをどちらに統一しますか",
  choon: "長音符号の有無による表記ゆれをどちらに統一しますか",
};

let currentFindings = [];
// key -> chosen canonical surface (ラジオボタンでの選択状態を保持)
let selections = new Map();

function isFullwidthChar(ch) {
  const code = ch.codePointAt(0);
  return code >= 0xff01 && code <= 0xff5e;
}

/**
 * 全角/半角の表記ゆれは見た目がほぼ同じ文字(例:「A」と「Ａ」)を
 * 区別する必要があるため、選択肢に「全角」「半角」の注記を付ける。
 * 1トークン内に全角・半角が混在する場合(例:「Ａ1」)はその旨を示す。
 */
function widthHint(surface, type) {
  if (type !== "width") return "";
  const chars = [...surface];
  const hasFull = chars.some(isFullwidthChar);
  const hasHalf = chars.some((c) => !isFullwidthChar(c));
  if (hasFull && hasHalf) return "(全角/半角混在)";
  return hasFull ? "(全角)" : "(半角)";
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function defaultCanonicalFor(finding) {
  return finding.variants[0].surface;
}

function runCheck() {
  const text = inputText.value;
  if (!text.trim()) {
    findingsList.innerHTML = '<p class="empty-state">テキストを入力してください。</p>';
    findingsStatus.textContent = "";
    preview.textContent = "";
    unifyAllButton.disabled = true;
    copyButton.disabled = true;
    return;
  }

  const newFindings = analyzeText(text);
  // 既存の選択(ラジオボタン)は、そのグループがまだ存在し選んでいた
  // 表記が引き続き候補にある限り保持する。1つのグループを統一しても
  // 他のグループでユーザーが選んだ内容が消えないようにするため。
  const newSelections = new Map();
  for (const finding of newFindings) {
    const previousChoice = selections.get(finding.key);
    const stillValid = finding.variants.some((v) => v.surface === previousChoice);
    newSelections.set(finding.key, stillValid ? previousChoice : defaultCanonicalFor(finding));
  }

  currentFindings = newFindings;
  selections = newSelections;
  renderFindings();
  renderPreview();
  unifyAllButton.disabled = currentFindings.length === 0;
  copyButton.disabled = false;
  copyStatus.textContent = "";
}

function renderFindings() {
  if (currentFindings.length === 0) {
    findingsList.innerHTML = '<p class="empty-state">表記ゆれは見つかりませんでした 🎉</p>';
    findingsStatus.textContent = "表記ゆれは見つかりませんでした。";
    return;
  }

  findingsStatus.textContent = `${currentFindings.length}件の表記ゆれが見つかりました。`;

  findingsList.innerHTML = currentFindings
    .map((finding, index) => {
      const chosen = selections.get(finding.key);
      const options = finding.variants
        .map((v) => {
          const id = `variant-${index}-${escapeHtml(v.surface)}`;
          const checked = v.surface === chosen ? "checked" : "";
          const hint = widthHint(v.surface, finding.type);
          return `
            <label class="variant-option" for="${id}">
              <input type="radio" id="${id}" name="group-${index}" value="${escapeHtml(v.surface)}" ${checked} />
              「${escapeHtml(v.surface)}」${hint ? `<span class="hint">${hint}</span>` : ""}に統一
              <span class="count">(${v.count}件)</span>
            </label>`;
        })
        .join("");

      return `
        <div class="finding-card" data-key="${escapeHtml(finding.key)}">
          <span class="badge ${finding.type}">${TYPE_LABELS[finding.type]}</span>
          <fieldset>
            <legend>${TYPE_LEGENDS[finding.type]}</legend>
            ${options}
          </fieldset>
          <div>
            <button type="button" class="unify-one" data-key="${escapeHtml(finding.key)}">
              このグループを統一する
            </button>
          </div>
        </div>`;
    })
    .join("");
}

function renderPreview() {
  const text = inputText.value;
  if (currentFindings.length === 0) {
    preview.textContent = text;
    return;
  }

  const surfaceToType = new Map();
  for (const finding of currentFindings) {
    for (const variant of finding.variants) {
      surfaceToType.set(variant.surface, finding.type);
    }
  }

  // detector.js の applyUnification と同じ境界チェック付きパターンを
  // 使うことで、実際に置換される箇所とハイライト箇所を一致させる
  // (無関係な長いトークンの一部だけがハイライトされるのを防ぐ)。
  const pattern = buildBoundaryAwarePattern([...surfaceToType.keys()]);

  let html = "";
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    const type = surfaceToType.get(match[0]);
    html += `<mark class="${type}">${escapeHtml(match[0])}</mark>`;
    lastIndex = match.index + match[0].length;
  }
  html += escapeHtml(text.slice(lastIndex));
  preview.innerHTML = html;
}

function unifyGroup(key) {
  const finding = currentFindings.find((f) => f.key === key);
  if (!finding) return;
  const canonical = selections.get(key);
  const replacements = finding.variants
    .filter((v) => v.surface !== canonical)
    .map((v) => ({ from: v.surface, to: canonical }));
  inputText.value = applyUnification(inputText.value, replacements);
  runCheck();
}

function unifyAll() {
  const replacements = currentFindings.flatMap((finding) => {
    const canonical = selections.get(finding.key);
    return finding.variants
      .filter((v) => v.surface !== canonical)
      .map((v) => ({ from: v.surface, to: canonical }));
  });
  inputText.value = applyUnification(inputText.value, replacements);
  runCheck();
}

checkButton.addEventListener("click", runCheck);
unifyAllButton.addEventListener("click", unifyAll);

findingsList.addEventListener("change", (event) => {
  const radio = event.target;
  if (radio.name?.startsWith("group-")) {
    const card = radio.closest(".finding-card");
    const key = card?.dataset.key;
    if (key !== undefined) {
      selections.set(key, radio.value);
      renderPreview();
    }
  }
});

findingsList.addEventListener("click", (event) => {
  const button = event.target.closest(".unify-one");
  if (button) unifyGroup(button.dataset.key);
});

/** 非セキュアコンテキスト等で navigator.clipboard が使えない場合のフォールバック。 */
function copyWithFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const ok = document.execCommand("copy");
    return ok;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

copyButton.addEventListener("click", async () => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(inputText.value);
      copyStatus.textContent = "コピーしました。";
      return;
    } catch {
      // フォールバックへ
    }
  }
  copyStatus.textContent = copyWithFallback(inputText.value)
    ? "コピーしました。"
    : "コピーに失敗しました。テキストを選択して手動でコピーしてください。";
});

import { analyzeText, applyUnification } from "./lib/detector.js";

const inputText = document.getElementById("input-text");
const checkButton = document.getElementById("check-button");
const unifyAllButton = document.getElementById("unify-all-button");
const copyButton = document.getElementById("copy-button");
const copyStatus = document.getElementById("copy-status");
const findingsList = document.getElementById("findings-list");
const preview = document.getElementById("preview");

const TYPE_LABELS = { width: "全角/半角", choon: "長音" };

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
 */
function widthHint(surface, type) {
  if (type !== "width") return "";
  return [...surface].some(isFullwidthChar) ? "(全角)" : "(半角)";
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function runCheck() {
  const text = inputText.value;
  if (!text.trim()) {
    findingsList.innerHTML = '<p class="empty-state">テキストを入力してください。</p>';
    preview.textContent = "";
    unifyAllButton.disabled = true;
    copyButton.disabled = true;
    return;
  }

  currentFindings = analyzeText(text);
  selections = new Map(
    currentFindings.map((f) => [f.key, defaultCanonicalFor(f)]),
  );
  renderFindings();
  renderPreview();
  unifyAllButton.disabled = currentFindings.length === 0;
  copyButton.disabled = false;
  copyStatus.textContent = "";
}

function defaultCanonicalFor(finding) {
  return finding.variants[0].surface;
}

function renderFindings() {
  if (currentFindings.length === 0) {
    findingsList.innerHTML = '<p class="empty-state">表記ゆれは見つかりませんでした 🎉</p>';
    return;
  }

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
          ${options}
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

  const surfaces = [...surfaceToType.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    surfaces.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "g",
  );

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

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(inputText.value);
    copyStatus.textContent = "コピーしました。";
  } catch {
    copyStatus.textContent = "コピーに失敗しました。テキストを選択して手動でコピーしてください。";
  }
});

/* くもみち 移転案内（旧URL /gcp-cert/）
   - このブラウザに記録がなければ、すぐ新しいURLへ転送する。
   - 記録が残っていれば、移転先はオリジンが違い記録を読めないため、転送せずに書き出しボタンを出す。
     （移転先と同じオリジンで開かれた場合は記録をそのまま使えるので転送する） */
(function () {
  "use strict";
  const NEW_URL = "https://shikaku-apps.vercel.app/gcp-cert/";
  const KEY = "kumomichi.v1";
  const dest = NEW_URL + (/^#\/[\w-]*$/.test(location.hash) ? location.hash : "");
  document.getElementById("go").href = dest;

  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (_) { /* 保存領域が使えない環境 */ }
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch (_) { data = null; } }

  const sameOrigin = location.origin === new URL(NEW_URL).origin;
  if (!data || typeof data !== "object" || sameOrigin) { location.replace(dest); return; }

  document.getElementById("backup").hidden = false;
  document.getElementById("export").addEventListener("click", function () {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = "kumomichi-backup-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".json";
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    document.getElementById("saved").textContent = name + " を書き出しました。新しいくもみちの「設定 → JSON を読み込む」で取り込めます。";
  });
})();

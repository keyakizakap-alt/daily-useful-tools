/* そらならべ — Service Worker
 *   アプリ本体（HTML / JS / アイコン）だけをキャッシュし、
 *   天気・警報・タイルなどの外部 API は一切キャッシュしない。
 *   予報の中身は app.js 側が localStorage に 3 時間だけ持つ。
 */
const CACHE = "soranarabe-shell-v2";
const SHELL = ["./", "./index.html", "./app.js", "./manifest.webmanifest",
               "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 自分のオリジンのアプリ本体だけを扱う。API とタイルは素通し。
  if (url.origin !== self.location.origin) return;

  // ネットワーク優先・失敗したらキャッシュ（更新をすぐ反映しつつオフラインでも開ける）
  ev.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
  );
});

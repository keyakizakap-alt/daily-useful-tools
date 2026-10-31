/* そらならべ — Service Worker
 *   アプリ本体（HTML / JS / アイコン）だけをキャッシュし、
 *   天気・警報・タイルなどの外部 API は一切キャッシュしない。
 *   予報の中身は app.js 側が localStorage に 3 時間だけ持つ。
 */
const CACHE = "soranarabe-shell-v4";
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
  // 通知の登録などのサーバー API はキャッシュせず、そのまま通す
  if (url.pathname.indexOf("/api/") === 0) return;

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

// 通知をタップしたら、開いている画面があればそれを前に出して該当のタブへ、無ければ新しく開く
self.addEventListener("notificationclick", ev => {
  ev.notification.close();
  const hash = (ev.notification.data && ev.notification.data.hash) || "";
  const safeHash = /^#[a-z]+$/.test(hash) ? hash : "";
  ev.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const mine = list.find(c => new URL(c.url).origin === self.location.origin);
      if (mine) {
        mine.postMessage({ type: "open", hash: safeHash });
        return mine.focus();
      }
      return self.clients.openWindow("./" + safeHash);
    })
  );
});

// サーバー（api/push/cron.js）から届いた通知を表示する。アプリを閉じていても動く。
self.addEventListener("push", ev => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch (e) { d = {}; }
  const title = typeof d.title === "string" && d.title ? d.title.slice(0, 120) : "そらならべ";
  ev.waitUntil(self.registration.showNotification(title, {
    body: typeof d.body === "string" ? d.body.slice(0, 400) : "",
    tag: typeof d.tag === "string" ? d.tag.slice(0, 40) : "soranarabe",
    renotify: true, lang: "ja", icon: "icon-192.png", badge: "icon-192.png",
    data: { hash: typeof d.hash === "string" ? d.hash : "" }
  }));
});

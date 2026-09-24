/* 戦国大名：二度目からすぐ開くための控え。
   本体は「網が先・控えは後ろ盾」──新しい版があればそれを使い、繋がらなければ控えで遊べる。 */
const CACHE = "sengoku-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(()=>{})).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const net = await fetch(req);
      if (net && net.status === 200) { const c = await caches.open(CACHE); c.put(req, net.clone()); }
      return net;
    } catch (_) {
      const hit = await caches.match(req);
      if (hit) return hit;
      const home = await caches.match("./index.html");
      if (home) return home;
      throw _;
    }
  })());
});

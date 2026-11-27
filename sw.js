/**
 * =========================================================================
 * ⚡ Service Worker لمتجر ولوحة تحكم بَيَان ستور (PWA Offline + Instant Speed)
 * =========================================================================
 */
const CACHE_NAME = 'bayan-store-pwa-v5.5.8';
const CORE_SHELL_URLS = [
  './',
  './index.html',
  './admin.html',
  './manifest.json',
  './admin-manifest.json',
  './fonts/cairo.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/admin-192.png',
  './icons/admin-512.png',
  './js/firebase_config.js',
  './js/pwa_install.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        CORE_SHELL_URLS.map((url) => cache.add(url).catch(() => null))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }

  // استثناء طلبات فايربيس والشبكات الخارجية من الكاش لضمان البيانات الحية دائماً
  if (url.origin !== self.location.origin) {
    return;
  }

  const isStaticAsset =
    url.pathname.includes('/icons/') ||
    url.pathname.includes('/fonts/');

  if (isStaticAsset) {
    // Cache-first مع تحديث بالخلفية للأيقونات والخطوط
    event.respondWith(
      caches.match(req).then((cached) => {
        const netFetch = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => { });
            }
            return res;
          })
          .catch(() => cached);
        return cached || netFetch;
      })
    );
    return;
  }

  // Network-first لصفحات HTML وملفات JS لضمان أحدث إصدار فور النشر، مع دعم الأوفلاين
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => { });
        }
        return res;
      })
      .catch(async () => {
        const exact = await caches.match(req);
        if (exact) return exact;
        // احتياطي مهم لتشغيل الروابط ذات ?shop=SHOP_... أثناء الأوفلاين
        const byPath = await caches.match(url.pathname);
        if (byPath) return byPath;
        if (req.mode === 'navigate') {
          return (await caches.match('./index.html')) || Response.error();
        }
        return Response.error();
      })
  );
});

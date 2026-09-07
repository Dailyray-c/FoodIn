const CACHE_NAME = 'food-inventory-v87';   // v2.23.6 扫码接入专用弹窗（二维码扫描+手动输入）；缓存号递增使旧 SW 失效重新预缓存

// 仅预缓存同域静态资源（GitHub Pages 加载快、体积小；不再阻塞等待慢速第三方 CDN）
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './vendor/vue.global.prod.js',
  './vendor/html5-qrcode.min.js',
  './vendor/qrcode.min.js'
];

// 第三方 CDN（Tesseract / OCR 大模型按需加载）：运行时缓存（cache-first），首次访问不阻塞安装
// Vue / html5-qrcode 已本地化到 ./vendor/ 并走 PRECACHE_ASSETS，避开 CDN 受限网络
const CDN_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 不缓存 API 请求（jsonbin、条码查询、Server酱）
  if (url.hostname.includes('jsonbin.io') ||
      url.hostname.includes('api.tianlu') ||
      url.hostname.includes('sct.ftqq.com')) {
    return;
  }

  // 主页面导航：网络优先（始终拿到最新版），失败回退到缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('./', clone));
        return response;
      }).catch(() => {
        return caches.match('./').then((r) => r || caches.match('./index.html'));
      })
    );
    return;
  }

  // 本地静态资源 + 第三方 CDN：缓存优先（stale-while-revalidate），离线/秒开
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // 后台更新缓存副本，下次访问用新版本
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('./'));
    })
  );
});

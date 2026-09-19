const CACHE_NAME = 'food-inventory-v117';   // v2.34.4–2.34.12：弹窗体系收敛（5 个遮罩统一 .fi-modal + tip 说明弹窗支持行动按钮 + 10 类长提示弹窗化）+ 删地点/改地点对分区商品口径修正 + 自动同步顶栏状态指示 + 云同步入口开放到录入/批量页。递增 → 旧 SW 失效，activate 时删除旧缓存

// 仅预缓存「首屏必需」的同域静态资源。
// ❗v2.33.0：html5-qrcode.min.js（375KB）与 qrcode.min.js 已移出这里 ——
//   它们只在打开扫码时才需要，且 index.html 已改为按需注入（ensureScanLib / ensureQrLib）。
//   若仍留在预缓存，安装期会白白下载 395KB 与首屏抢带宽。
//   它们改由「应用首屏后空闲预取」触发本 SW 的运行时 cache-first 逻辑写入缓存，
//   因此离线可用性不变（只是不再与首屏争抢）。
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './vendor/vue.global.prod.js'
];

// 第三方 CDN（Tesseract / OCR 大模型按需加载）：运行时缓存（cache-first），首次访问不阻塞安装
// Vue 已本地化到 ./vendor/ 并走 PRECACHE_ASSETS，避开 CDN 受限网络
const CDN_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

// 后台写缓存：吞掉 rejection 只记日志。
// 场景：SW 被新版本替换时 activate 会删旧缓存，此时仍在飞的 cache.put 会 reject（InvalidStateError），
// 不接住会在控制台刷未处理拒绝，干扰真实错误排查。
function putQuietly(request, response) {
  return caches.open(CACHE_NAME)
    .then((cache) => cache.put(request, response))
    .catch((e) => console.warn('[SW] 写入缓存失败（可忽略）：', request.url || request, e && e.name));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // ❗v2.33.0 修复：原实现 `cache.addAll(...).catch(() => {})` 有两个坑 ——
    //   ① addAll 是「全有或全无」：任一资源 404（如新增图标忘了上传 / 部署白名单漏了一项）
    //      会让**整批**预缓存全部丢弃，页面退化为完全无缓存；
    //   ② 失败被静默吞掉，控制台毫无线索，只能靠猜。
    //   改为逐资源 allSettled：单个失败不影响其余，失败项明确打日志。
    const results = await Promise.allSettled(PRECACHE_ASSETS.map((url) => cache.add(url)));
    const failed = PRECACHE_ASSETS.filter((_, i) => results[i].status === 'rejected');
    if (failed.length) {
      console.warn('[SW] 预缓存部分失败（其余已就绪，应用仍可离线）：' + failed.join(', ')
        + ' —— 请检查这些文件是否已部署到仓库');
    }
  })());
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

  // ★v2.24.4 白名单模式（根治 API 缓存污染）：
  // 旧逻辑是"黑名单" —— 只排除 jsonbin/api.tianlu/sct.ftqq.com，导致条码查询 API
  // （v1.apizero.cn）和 Open Food Facts 被当成静态资源走 cache-first，API 响应被永久缓存：
  // 同一条码第二次查询直接返回旧结果（含"未找到"），永远不再真发请求 → 批量页"无法调用 API"。
  // 现改为白名单：只拦截 ①同域静态资源 ②CDN_RESOURCES 白名单；其余（所有第三方 API）
  // 一律不调用 respondWith，交回浏览器默认网络行为，永不缓存。
  if (event.request.method !== 'GET') return;   // POST 等（jsonbin 写入）一律放行

  const isSameOrigin = url.origin === self.location.origin;
  const isCdn = CDN_RESOURCES.some((u) => event.request.url.indexOf(u) === 0);
  if (!isSameOrigin && !isCdn) return;   // 跨域且非白名单 CDN → 放行（不缓存）

  // 主页面导航：网络优先（始终拿到最新版），失败回退到缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        putQuietly('./', clone);
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
          if (response && response.status === 200) putQuietly(event.request, response);
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          putQuietly(event.request, clone);
        }
        return response;
      }).catch(() => {
        // ❗v2.33.0 修复：原实现这里 `return caches.match('./')` —— 会给**任何**失败的静态资源
        // 返回首页 HTML。于是 `<script src="./vendor/x.js">` 拿到一份 HTML，浏览器报
        // 「Unexpected token '<'」，看起来像代码语法错误，实际是 SW 喂错了内容，极难排查。
        // 走到这里的一定是静态资源（导航请求在上面已单独处理）→ 明确返回 504，
        // 让浏览器按「资源加载失败」正常处理，不再伪造内容。
        return new Response('', {
          status: 504,
          statusText: 'Offline and not cached'
        });
      });
    })
  );
});

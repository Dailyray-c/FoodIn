// ============================================================
// FoodIn 百度 OCR 代理服务  proxy/server.js
// ------------------------------------------------------------
// 为什么需要它：百度 AI 开放平台的接口【不返回 CORS 响应头】，
// 浏览器无法直连（预检 400、POST 401，均无 Access-Control-Allow-Origin）。
// 且官方明确禁止把 AK/SK 硬编码在客户端 —— SK 一旦泄漏可被盗刷额度。
//
// 因此 SK 只存在于本服务的环境变量里，前端只跟本代理说话。
//
// 协议（前端 ↔ 本服务）：
//   GET  /health                 → { ok: true, configured: bool }
//   POST /baidu-ocr  { image: "<base64，不含 data: 前缀>" }
//        → { words: ["...", ...] }            识别成功
//        → 4xx/5xx { error: "...", detail }   失败
//
// 环境变量：
//   BAIDU_AK         百度智能云 API Key      （必填）
//   BAIDU_SK         百度智能云 Secret Key   （必填）
//   PORT             监听端口（宿主注入，默认 8080）
//   ALLOW_ORIGIN     允许的前端来源，默认 *  （生产建议收敛到 Pages 域名）
//
// 启动：node proxy/server.js
// ============================================================

'use strict';

const http = require('http');

const AK = process.env.BAIDU_AK || '';
const SK = process.env.BAIDU_SK || '';
const PORT = Number(process.env.PORT || 8080);
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

// 百度接口上限 10M（base64 后体积约为原图的 4/3），这里留足余量按 10MB body 收
const MAX_BODY = 10 * 1024 * 1024;

// ------------------------------------------------------------
// access_token 缓存：百度签发后有效期 30 天
// 提前 5 分钟过期，避免边界时刻刚好失效
// ------------------------------------------------------------
let tokenCache = { value: '', expireAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.expireAt) return tokenCache.value;

  const url = 'https://aip.baidubce.com/oauth/2.0/token'
    + '?grant_type=client_credentials'
    + '&client_id=' + encodeURIComponent(AK)
    + '&client_secret=' + encodeURIComponent(SK);

  const res = await fetch(url, { method: 'POST' });
  const data = await res.json().catch(() => ({}));

  if (!data.access_token) {
    // 百度会在 error / error_description 里说明原因（AK 错、SK 错、应用未开通 OCR……）
    throw new Error(
      '百度 token 获取失败：' + (data.error_description || data.error || JSON.stringify(data))
    );
  }

  const ttl = (Number(data.expires_in) || 2592000) * 1000;
  tokenCache = { value: data.access_token, expireAt: now + ttl - 5 * 60 * 1000 };
  return tokenCache.value;
}

// ------------------------------------------------------------
// 调用 accurate_basic（高精度版，无位置信息，返回纯文本行）
// 中文票据场景比 general_basic 明显更准，免费额度也够家用
// ------------------------------------------------------------
async function baiduOcr(imageBase64) {
  const token = await getAccessToken();
  const url = 'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic'
    + '?access_token=' + encodeURIComponent(token);

  // 百度要求 x-www-form-urlencoded，image 参数是「base64 后再 urlencode」
  const body = 'image=' + encodeURIComponent(imageBase64);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body,
  });

  const data = await res.json().catch(() => ({}));

  if (data.error_code) {
    throw new Error(
      '百度 OCR 失败 [' + data.error_code + ']：' + (data.error_msg || '未知错误')
    );
  }

  const words = Array.isArray(data.words_result)
    ? data.words_result.map(w => (w && w.words) || '').filter(Boolean)
    : [];

  return { words, count: data.words_result_num || words.length };
}

// ------------------------------------------------------------
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  cors(res);

  // ---- 预检 ----
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = (req.url || '').split('?')[0];

  // ---- 健康检查 / 前端探测代理是否已配置 ----
  if (req.method === 'GET' && path === '/health') {
    send(res, 200, { ok: true, configured: Boolean(AK && SK) });
    return;
  }

  // ---- OCR ----
  if (req.method === 'POST' && path === '/baidu-ocr') {
    let size = 0;
    const chunks = [];
    let aborted = false;

    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        send(res, 413, { error: '图片过大（超过 10MB 限制）' });
        req.destroy();
        return;
      }
      chunks.push(c);
    });

    req.on('end', async () => {
      if (aborted) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        let image = '';
        try {
          image = (JSON.parse(raw || '{}').image || '').trim();
        } catch {
          send(res, 400, { error: '请求体不是合法 JSON' });
          return;
        }

        if (!image) {
          send(res, 400, { error: '缺少 image 字段' });
          return;
        }
        if (!AK || !SK) {
          send(res, 503, {
            error: '代理未配置百度凭证',
            detail: '请在本服务的环境变量中设置 BAIDU_AK 与 BAIDU_SK 后重启。',
          });
          return;
        }

        // 前端可能带 data:image/...;base64, 前缀，这里兜底剥掉
        image = image.replace(/^data:image\/[^;]+;base64,/, '');

        const out = await baiduOcr(image);
        send(res, 200, out);
      } catch (err) {
        send(res, 502, { error: String((err && err.message) || err) });
      }
    });

    req.on('error', () => { try { req.destroy(); } catch {} });
    return;
  }

  send(res, 404, { error: 'Not found', path });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[FoodIn proxy] listening on :' + PORT
    + '  | AK/SK ' + (AK && SK ? '已配置' : '未配置（/health 会返回 configured:false）'));
});

// v2.21.5 CDN 多源回退验证：真实网络加载 Tesseract/Paddle 库 + 回退（route 拦截首 host）
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
const results = [];
const log = (name, ok, extra = '') => results.push({ name, ok, extra });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });

  // ── 1. 正常加载：两个库都能真实下载，且选中 host 属于三 CDN 之一 ──
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('guideShown_v2162', '1'); });
    await page.goto(BASE);
    await page.waitForSelector('nav button:has-text("首页")', { timeout: 15000 });
    const r = await page.evaluate(async () => {
      const f = window.__foodin;
      await f.loadTesseract();
      await f.loadPaddleOcr();
      return { tess: !!window.Tesseract, paddle: !!(window.paddlejs && window.paddlejs.ocr), host: f.tesseractHost() };
    });
    log('CDN1 真实加载 Tesseract 库', !!r.tess);
    log('CDN1 真实加载 Paddle 库', !!r.paddle);
    log('CDN1 选中 host 为三 CDN 之一', ['https://cdn.jsdelivr.net', 'https://fastly.jsdelivr.net', 'https://gcore.jsdelivr.net'].includes(r.host), r.host);
    await ctx.close();
  }

  // ── 2. 回退：拦截 cdn.jsdelivr.net（abort）→ 应从 fastly/gcore 成功加载 ──
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.includes('cdn.jsdelivr.net') && (u.includes('@paddlejs-models/ocr@1.2.4') || u.includes('tesseract.js@5.1.1/dist/tesseract.min.js'))) route.abort();
      else route.continue();
    });
    page.on('request', req => { if (/paddlejs-models|tesseract\.js@5\.1\.1\/dist/.test(req.url())) console.log('[req]', req.url()); });
    page.on('requestfailed', req => { if (/paddlejs-models|tesseract\.js@5\.1\.1\/dist/.test(req.url())) console.log('[reqfail]', req.url(), req.failure() && req.failure().errorText); });
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('guideShown_v2162', '1'); });
    await page.goto(BASE);
    await page.waitForSelector('nav button:has-text("首页")', { timeout: 15000 });
    const r = await page.evaluate(async () => {
      const f = window.__foodin;
      await f.loadTesseract();
      await f.loadPaddleOcr();
      return { tess: !!window.Tesseract, paddle: !!(window.paddlejs && window.paddlejs.ocr), host: f.tesseractHost() };
    });
    log('CDN2 主站被拦后自动回退（Tesseract）', !!r.tess, r.host);
    log('CDN2 主站被拦后自动回退（Paddle）', !!r.paddle);
    log('CDN2 回退后选中 host ≠ 主站', r.host !== 'https://cdn.jsdelivr.net', r.host);
    await ctx.close();
  }

  await browser.close();
  console.log('\n===== v2.21.5 CDN 回退验证 =====');
  let pass = 0;
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.extra ? '  [' + r.extra + ']' : ''}`);
    if (r.ok) pass++;
  }
  console.log(`\n${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})();

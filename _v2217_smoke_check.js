// v2.21.7 smoke: 新诊断入口 + init 失败日志不再静默
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'log' || m.type() === 'warn' || m.type() === 'error') logs.push('[' + m.type() + '] ' + m.text().slice(0, 160)); });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript(() => {
    localStorage.setItem('guideShown_v2162', '1');
    // mock paddlejs: init 失败，验证错误不再静默
    window.__paddleMock = { initFail: true };
    Object.defineProperty(window, 'paddlejs', {
      configurable: true,
      get() { return { ocr: { init: async () => { throw new Error('mock network 403: model chunk fetch failed'); } } }; }
    });
    // stub script loader so lib load "succeeds" immediately
    const realCreate = document.createElement.bind(document);
    document.createElement = function (tag, opts) {
      const el = realCreate(tag, opts);
      if (tag === 'script') {
        setTimeout(() => {
          el.dispatchEvent(new Event('load'));
        }, 10);
      }
      return el;
    };
  });
  await page.goto(BASE);
  await page.waitForSelector('nav button:has-text("首页")', { timeout: 10000 });
  await page.waitForTimeout(500);

  let pass = 0, fail = 0;
  const log = (n, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (extra !== undefined ? '  ' + extra : '')); };

  const keys = await page.evaluate(() => Object.keys(window.__foodin || {}));
  log('S1 __foodin 暴露 paddleStatus/setPaddleModelUrls/resetPaddleState', ['paddleStatus', 'setPaddleModelUrls', 'resetPaddleState'].every(k => keys.includes(k)), JSON.stringify(keys.filter(k => k.includes('addle') || k.includes('Status'))));

  const st = await page.evaluate(() => window.__foodin.paddleStatus());
  log('S2 paddleStatus() 返回完整结构', !!(st && 'ready' in st && 'lastError' in st && 'detUrl' in st), JSON.stringify(st));

  // 触发一次识别（走 tryPaddleOcr → init mock 失败 → 应回退并打印 ❌ 原因）
  await page.evaluate(() => window.__foodin.runOcr(document.createElement('canvas')));
  await page.waitForTimeout(2500);
  const errLog = logs.find(l => l.includes('init 失败'));
  const reasonLog = logs.find(l => l.includes('mock network 403'));
  log('S3 init 失败原因打印到控制台（不再静默）', !!errLog && !!reasonLog, (errLog || '') + (reasonLog ? ' || ' + reasonLog : ''));

  // setPaddleModelUrls + reset 后 paddleStatus 反映自定义地址
  const st2 = await page.evaluate(() => {
    window.__foodin.setPaddleModelUrls('http://127.0.0.1:8000/det/model.json', 'http://127.0.0.1:8000/rec/model.json');
    return window.__foodin.paddleStatus();
  });
  log('S4 setPaddleModelUrls 后状态携带自定义 URL', !!(st2 && st2.detUrl.includes('127.0.0.1') && st2.recUrl.includes('127.0.0.1')), JSON.stringify({ det: st2 && st2.detUrl, rec: st2 && st2.recUrl }));

  console.log('\n=== v2.21.7 smoke: ' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();

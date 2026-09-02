/**
 * 终极验证：同源加载 + 本地 URL + 真实跑 paddlejs init → paddleOcrReady=true
 * 这才是「本地模型托管方案」最终能否替代 bcebos 的关键证据
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { const t = m.type(); if (['log','warn','error','info'].includes(t)) logs.push('[' + t + '] ' + m.text().slice(0, 240)); });
  page.on('pageerror', e => logs.push('[pageerror] ' + String(e).slice(0, 240)));

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__foodin, null, { timeout: 15000 });

  // 1) 注入本地 URL
  await page.evaluate(() => __foodin.setPaddleModelUrls(
    'http://127.0.0.1:8765/_paddle_models/det/model.json',
    'http://127.0.0.1:8765/_paddle_models/rec/model.json'
  ));
  console.log('已注入本地模型 URL');

  // 2) 真实跑 preloadPaddleModel（首次 init 需时 30-90s）
  const t0 = Date.now();
  console.log('开始真实 paddlejs init...');
  let ok = false;
  try {
    ok = await Promise.race([
      page.evaluate(() => __foodin.preloadPaddleModel()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('90s 超时')), 90000))
    ]);
  } catch (e) { console.log('init 异常:', String(e).slice(0, 200)); }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`init 用时 ${dt}s, 返回值=${ok}`);

  // 3) 检查状态
  const status = await page.evaluate(() => __foodin.paddleStatus());
  console.log('paddleStatus:', JSON.stringify(status, null, 2));

  // 4) 关键控制台日志
  console.log('--- 关键控制台输出 ---');
  logs.filter(l => /Paddle|paddle|init|模型|bcebos|CORS|Failed/i.test(l)).slice(0, 25).forEach(l => console.log('  ' + l));

  await browser.close();
  console.log(ok && status.ready ? '\n✅ 终极验证通过：本地模型可用' : '\n❌ 终极验证未通过');
  process.exit(ok && status.ready ? 0 : 1);
})();
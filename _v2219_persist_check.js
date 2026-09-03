/**
 * v2.21.9 端到端验证（需本地服务 8765 运行中 —— python -m http.server 8765 --bind 127.0.0.1）：
 * 场景复现：「刷新页面/重启服务后，Paddle 又只剩 Tesseract」——因为 setPaddleModelUrls 是一次性注入，刷新即丢
 * 验证：
 *  P1 全新会话自动探测：页面打开后无需任何注入，paddleStatus.detUrl 自动指向 127.0.0.1:8765/_paddle_models（autoDetectLocalModels 生效）
 *  P2 探测结果持久化：localStorage 出现 food_inventory_paddle_models_v1
 *  P3 自动静默预加载：不敲任何命令，paddleOcrReady 自动变 true（ensurePaddleReady + startPaddleInit 生效）——真实 paddlejs init
 *  P4 刷新后地址恢复：reload 后 detUrl/recUrl 仍指向本地模型（loadPaddleModelUrls 从 localStorage 恢复）——「刷新丢配置」根因修复
 *  P5 刷新后自动再就绪：reload 后不操作，等待 paddleOcrReady 再次自动变 true
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[err] ' + m.text().slice(0, 200)); });

  let pass = 0, fail = 0;
  const log = (n, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (extra !== undefined ? '  ' + extra : '')); };
  const ps = () => page.evaluate(() => {
    const s = __foodin.paddleStatus();
    const ls = localStorage.getItem('food_inventory_paddle_models_v1');
    return { detUrl: s.detUrl, recUrl: s.recUrl, ready: s.ready, lastError: s.lastError, initElapsedSec: s.initElapsedSec, ls: ls ? JSON.parse(ls) : null, ver: __foodin.settings.version };
  });
  const waitReady = async (label, ms) => {
    const t0 = Date.now();
    let st = null;
    while (Date.now() - t0 < ms) {
      st = await ps();
      if (st.ready) return st;
      await page.waitForTimeout(1000);
    }
    return st;
  };

  // —— P1/P2/P3：全新会话（localStorage 空）——
  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__foodin, null, { timeout: 15000 });
  const ver = await page.evaluate(() => __foodin.settings.version);
  log('P0 应用版本 2.21.12', ver === '2.21.12', 'ver=' + ver);

  // P1: 自动探测（600ms 后启动，HEAD 探测很快）
  const t1 = Date.now();
  let st1 = null;
  while (Date.now() - t1 < 15000) {
    st1 = await ps();
    if (st1.detUrl.includes('127.0.0.1:8765/_paddle_models')) break;
    await page.waitForTimeout(500);
  }
  log('P1 全新会话自动探测到本地模型（零注入）', st1 && st1.detUrl.includes('127.0.0.1:8765/_paddle_models') && st1.recUrl.includes('127.0.0.1:8765/_paddle_models'), JSON.stringify({ det: st1 && st1.detUrl, rec: st1 && st1.recUrl }));
  log('P2 探测结果已持久化到 localStorage', !!(st1 && st1.ls && st1.ls.detUrl && st1.ls.detUrl.includes('_paddle_models')), JSON.stringify(st1 && st1.ls));

  // P3: 自动静默预加载 → 真实 paddlejs init（本地 ~10s）
  const stReady = await waitReady('auto-ready', 120000);
  log('P3 未敲任何命令 paddleOcrReady 自动为 true（真实 init）', !!(stReady && stReady.ready), 'elapsed=' + (stReady && stReady.initElapsedSec) + 's lastError=' + (stReady && stReady.lastError));

  // —— P4/P5：刷新页面（localStorage 保留，模拟用户重开）——
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__foodin, null, { timeout: 15000 });
  // 自动探测在 mount 后 600ms 启动，轮询等地址恢复
  const t4 = Date.now();
  let st2 = null;
  while (Date.now() - t4 < 10000) {
    st2 = await ps();
    if (st2.detUrl.includes('127.0.0.1:8765/_paddle_models')) break;
    await page.waitForTimeout(400);
  }
  log('P4 刷新后模型地址自动恢复（无需再注入）', st2 && st2.detUrl.includes('127.0.0.1:8765/_paddle_models') && st2.recUrl.includes('127.0.0.1:8765/_paddle_models'), JSON.stringify({ det: st2 && st2.detUrl, rec: st2 && st2.recUrl }));
  const stReady2 = await waitReady('re-ready', 120000);
  log('P5 刷新后自动预加载再次完成 paddleOcrReady=true', !!(stReady2 && stReady2.ready), 'elapsed=' + (stReady2 && stReady2.initElapsedSec) + 's lastError=' + (stReady2 && stReady2.lastError));

  console.log('\n=== v2.21.9 本地模型持久化验证: ' + pass + ' 通过 / ' + fail + ' 失败 ===');
  if (errs.length) {
    console.log('---page errors（前 6 条）---');
    errs.slice(0, 6).forEach(e => console.log('  ' + e));
  }
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();

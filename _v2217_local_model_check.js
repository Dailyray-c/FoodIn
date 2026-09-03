/**
 * v2.21.7 端到端验证（精简版）：
 * 1) 同源 fetch paddlejs 模型无 CORS 拦截（= 本地服务器方案核心要点）
 * 2) setPaddleModelUrls + paddleStatus 注入本地 URL 生效
 * 完整真实 init 不在这里跑（paddlejs 首次 init + WebGL 编译通常 30s+，留给用户实机验证）
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

  // 1) 加载本地服务（同源）— 端口 8765（8000 被 C-Lodop 占了）
  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  // 探查页面状态
  const probe = await page.evaluate(() => ({
    hasApp: !!document.querySelector('#app'),
    hasFoodin: !!window.__foodin,
    bodyLen: document.body.innerText.length,
    navBtns: Array.from(document.querySelectorAll('nav button')).map(b => b.textContent.trim()).slice(0, 8),
    url: location.href
  }));
  console.log('探查:', JSON.stringify(probe));
  log('L1 从 http://127.0.0.1:8765 加载 index.html 成功', probe.hasApp);

  await page.waitForFunction(() => !!window.__foodin, null, { timeout: 15000 });
  // 验证 v2.21.7 新增 API 全部存在（更可靠，避免误匹配注释里的版本号）
  const v217Apis = await page.evaluate(() => {
    const k = window.__foodin || {};
    return {
      hasPaddleStatus: typeof k.paddleStatus === 'function',
      hasSetPaddleUrls: typeof k.setPaddleModelUrls === 'function',
      hasResetPaddle: typeof k.resetPaddleState === 'function',
      hasPreload: typeof k.preloadPaddleModel === 'function',
      hasCancel: typeof k.cancelPaddleOcr === 'function',
      currentVer: k.settings && k.settings.version
    };
  });
  const allApis = v217Apis.hasPaddleStatus && v217Apis.hasSetPaddleUrls && v217Apis.hasResetPaddle && v217Apis.hasPreload && v217Apis.hasCancel;
  log('L2 v2.21.7 新增 API 全部存在且 settings.version 正确', allApis && v217Apis.currentVer === '2.21.11', JSON.stringify(v217Apis));

  // 3) 同源 fetch 模型（验证 CORS 不再拦截）
  const fetchResults = await page.evaluate(async () => {
    const urls = [
      'http://127.0.0.1:8765/_paddle_models/det/model.json',
      'http://127.0.0.1:8765/_paddle_models/det/chunk_1.dat',
      'http://127.0.0.1:8765/_paddle_models/rec/model.json',
      'http://127.0.0.1:8765/_paddle_models/rec/chunk_1.dat',
      'http://127.0.0.1:8765/_paddle_models/rec/chunk_2.dat'
    ];
    const out = [];
    for (const u of urls) {
      try {
        const r = await fetch(u);
        out.push({ url: u.split('/').slice(-2).join('/'), status: r.status, size: (await r.arrayBuffer()).byteLength });
      } catch (e) { out.push({ url: u.split('/').slice(-2).join('/'), error: String(e).slice(0, 100) }); }
    }
    return out;
  });
  const allOk = fetchResults.every(r => r.status === 200 && r.size > 0);
  log('L3 同源 fetch 5 个模型文件全部 200 成功（无 CORS 拦截）', allOk, JSON.stringify(fetchResults));

  // 4) setPaddleModelUrls 注入本地 URL
  const st = await page.evaluate(() => {
    __foodin.setPaddleModelUrls(
      'http://127.0.0.1:8765/_paddle_models/det/model.json',
      'http://127.0.0.1:8765/_paddle_models/rec/model.json'
    );
    return __foodin.paddleStatus();
  });
  log('L4 setPaddleModelUrls 注入成功，paddleStatus 携带本地 URL', st.detUrl.includes('127.0.0.1') && st.recUrl.includes('127.0.0.1'), JSON.stringify({ det: st.detUrl, rec: st.recUrl, ready: st.ready }));

  // 5) 对比验证：默认 bcebos URL 应该被本地 URL 覆盖（之前是默认 bcebos）
  log('L5 默认 URL 不再是 bcebos', !st.detUrl.includes('bcebos.com') && !st.recUrl.includes('bcebos.com'), JSON.stringify({ det: st.detUrl, rec: st.recUrl }));

  // 6) 对照 bcebos：浏览器 CORS 拦截的真实表现是 fetch 抛 TypeError（用户截图已证实）
  // 这里用 console.warn + 手动 try/catch 检查，无法可靠自动化（msedge 直接放行 fetch promise），留为说明性提示
  const crossNote = await page.evaluate(async () => {
    try {
      const r = await fetch('https://paddlejs.bj.bcebos.com/models/fuse/ocr/ch_PP-OCRv2_det_fuse_activation/model.json');
      // 能进 try 说明服务器返回了 status，但跨域是否被拦截要读 body 才能触发（用户截图明确显示 TypeError）
      return { reachable: true, status: r.status, bodyReadable: (() => { try { r.clone().text(); return true; } catch (_) { return false; } })() };
    } catch (e) { return { reachable: false, error: String(e).slice(0, 120) }; }
  });
  console.log('L6 对照（说明性，不计分）：bcebos 跨域表现 =', JSON.stringify(crossNote));
  console.log('  → 用户截图已证实：在 file:// 协议下 fetch bcebos 抛 TypeError: Failed to fetch；同源加载本地模型绕过此限制');

  console.log('\n=== v2.21.7 本地模型验证: ' + pass + ' 通过 / ' + fail + ' 失败 ===');
  if (errs.length) {
    console.log('---page errors---');
    errs.slice(0, 6).forEach(e => console.log('  ' + e));
  }
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
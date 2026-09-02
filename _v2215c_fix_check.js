// v2.21.5+ 批量录入 OCR 四联修复验证（mock 场景，不依赖真实下载）
// 修复点：
//  1) 取消并切 Tesseract → settings.ocrEngine 同步切换 + 落盘 + 设置页 radio 同步
//  2) Paddle init 失败后能再次重试（不再永远不可用）——paddle-fail-once：第1次 reject 第2次 resolve
//  3) Tesseract worker 池复用（chi_sim/eng 只建一次）+ 进度单调不回跳（无 100→0 二次周期）
//  4) Paddle 慢时取消后进度条继续走（tess-load 动画 + logger 阶段进度），OCR 能完成
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:8001/index.html';
const CHROME_PATH = 'C:\\Users\\Administrator\\.agent-browser\\browsers\\chrome-152.0.7977.64\\chrome.exe';
const HTML_PATH = 'C:\\Users\\Administrator\\WorkBuddy\\2026-08-08-19-09-36\\index.html';

async function newPage(browser, mode) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript((m) => {
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('guideShown_v2162', '1');
    // ---- mock Tesseract：createWorker 池（新架构），记录创建计数 + 模拟 logger 阶段事件 ----
    window.__tessCreateCount = {};
    window.Tesseract = {
      createWorker: async (lang, oem, opts) => {
        window.__tessCreateCount[lang] = (window.__tessCreateCount[lang] || 0) + 1;
        const L = opts.logger || (() => {});
        if (window.__tessCreateCount[lang] === 1) {
          L({ status: 'loading tesseract core', progress: 0 });
          L({ status: 'loading language traineddata', progress: 0.5 });
          L({ status: 'initializing api', progress: 0 });
        }
        const delay = ms => new Promise(r => setTimeout(r, ms));
        return {
          recognize: async (img) => {
            for (let p = 0.2; p <= 1.0; p += 0.2) { L({ status: 'recognizing text', progress: p }); await delay(25); }
            if (lang === 'eng') return { data: { text: '' } };          // pass2 条码：空 → barcodes 仍空（无碍）
            return { data: { text: '鲜牛奶\n纯牛奶 250ml\n合计 12.50\n' } };  // 无合法 8-14 位条码 → 触发 pass2
          },
          setParameters: async () => {},
          terminate: async () => {}
        };
      }
    };
    // ---- mock paddlejs.ocr（行为由 mode 控制 + 计数） ----
    window.__paddleInitCalls = 0;
    let n = 0;
    const P = {
      init: () => {
        n++; window.__paddleInitCalls = n;
        if (m === 'paddle-slow') return new Promise(() => {});               // 永远 pending（模拟下载慢）
        if (m === 'paddle-fail-once') return n === 1 ? Promise.reject(new Error('mock fail #1')) : Promise.resolve();
        if (m === 'paddle-fail') return Promise.reject(new Error('always fail'));
        return Promise.resolve();
      },
      recognize: async () => {
        if (m === 'paddle-ok') return { text: ['测试 Paddle 识别', '蒙牛纯牛奶 250ml', '¥ 5.50'], points: [] };
        if (m === 'paddle-fail-once') return { text: ['乐事薯片 原味', '净含量 70g'], points: [] };
        return { text: [], points: [] };
      }
    };
    window.paddlejs = { ocr: P };
    // ---- 进度采样器（读 body 的 N% 文本） ----
    window.__prog = [];
    window.__progSampler = null;
    window.__startProg = () => { window.__prog = []; window.__progSampler = setInterval(() => { const mm = (document.body.textContent || '').match(/(\d+)%/); if (mm) window.__prog.push(+mm[1]); }, 20); };
    window.__stopProg = () => { clearInterval(window.__progSampler); window.__progSampler = null; };
  }, mode || 'paddle-ok');
  await page.goto(BASE);
  await page.waitForSelector('nav button:has-text("首页")', { timeout: 15000 });
  return { ctx, page };
}

let pass = 0, fail = 0;
const log = (name, ok, extra) => {
  if (ok) { pass++; console.log('  PASS ' + name + (extra !== undefined ? '  ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  ' + extra : '')); }
};
const isMonotonic = arr => arr.every((v, i) => i === 0 || v >= arr[i - 1]);

// 进入批量录入页
async function gotoBatch(page) {
  const btns = Array.from(await page.$$('nav button'));
  for (const b of btns) { if (/扫码/.test(await b.textContent())) { await b.click(); break; } }
  await page.waitForTimeout(200);
  const entry = await page.locator('text=/小票批量录入/').first();
  if (await entry.count() > 0) { await entry.click(); await page.waitForTimeout(300); }
  // 校验确实在批量页
  return await page.evaluate(() => /小票批量录入/.test(document.body.textContent || ''));
}

// 在页面里触发一次 OCR 并 await 完成
async function runOcrAndWait(page) {
  return page.evaluate(async () => {
    window.__startProg();
    const canvas = document.createElement('canvas');
    canvas.width = 100; canvas.height = 100;
    const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 100, 100);
    await window.__foodin.runOcr(canvas);
    window.__stopProg();
    return {
      engine: window.__foodin.settings ? undefined : undefined,   // placeholder（下方读 ocr 结果面板）
      prog: window.__prog.slice()
    };
  });
}
// 读 OCR 结果面板当前引擎标注与行数
async function readOcrPanel(page) {
  return page.evaluate(() => {
    const t = document.body.textContent || '';
    const engine = t.includes('Paddle 本地') ? 'paddle' : (t.includes('Tesseract') && !t.includes('Paddle 本地') ? 'tesseract' : '');
    const hasLines = /鲜牛奶|纯牛奶|乐事薯片|蒙牛纯牛奶/.test(t);
    // debug：抓识别区附近文本
    const idx = t.indexOf('识别到文字');
    const snippet = idx >= 0 ? t.slice(idx, idx + 100) : '(no 识别到文字)';
    return { engine, hasLines, snippet };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_PATH });

  // A. 取消并切 Tesseract → 引擎同步 + 落盘 + 设置页 radio（核心修复 1a）
  {
    const { ctx, page } = await newPage(browser, 'paddle-slow');
    const inBatch = await gotoBatch(page);
    log('A0 进入批量录入页', inBatch);
    // 触发 OCR（不 await，UI 进入 paddle-dl）
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100; canvas.height = 100;
      canvas.getContext('2d').fillRect(0, 0, 100, 100);
      window.__foodin.runOcr(canvas);
    });
    // 等取消按钮出现（paddle-dl 阶段）
    let btnFound = false;
    for (let i = 0; i < 30; i++) {
      btnFound = await page.evaluate(() => Array.from(document.querySelectorAll('button')).some(b => /取消并切 Tesseract/.test(b.textContent || '')));
      if (btnFound) break;
      await page.waitForTimeout(100);
    }
    log('A1 paddle-dl 阶段出现取消按钮', btnFound);
    // 文案检查
    const copy = await page.evaluate(() => (document.body.textContent || '').includes('正在下载识别模型'));
    log('A2 paddle-dl 文案「正在下载识别模型」', copy);
    // 点真实按钮
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(b => /取消并切 Tesseract/.test(b.textContent || '')); if (b) b.click(); });
    // 立即断言内存 settings 已切 tesseract
    const engineMem = await page.evaluate(() => window.__foodin.settings.ocrEngine);
    log('A3 取消后 settings.ocrEngine=tesseract（内存同步）', engineMem === 'tesseract', '实际 ' + engineMem);
    // localStorage 落盘
    const stored = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('food_inventory_settings') || '{}'); return s.ocrEngine; });
    log('A4 取消后 localStorage 落盘 ocrEngine=tesseract', stored === 'tesseract', '实际 ' + stored);
    // 等 OCR 完成（fallback tesseract mock），进度应到 100
    await page.waitForFunction(() => !(document.body.textContent || '').match(/\d+%/), { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    // 设置页 radio 同步检查
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('nav button')).find(b => /设置/.test(b.textContent || '')); if (b) b.click(); });
    await page.waitForTimeout(300);
    const radio = await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="tesseract"]');
      const rp = document.querySelector('input[type="radio"][value="paddle"]');
      return { tessChecked: !!(r && r.checked), paddleChecked: !!(rp && rp.checked) };
    });
    log('A5 设置页 Tesseract radio 自动高亮（v-model 同步）', radio.tessChecked === true && radio.paddleChecked === false);
    // paddleOcrReady 后台若已就绪会为 true（slow 场景不会）；确认引擎已持久化为 tesseract 后不再显示取消按钮的 phase 条件
    await ctx.close();
  }

  // B. Paddle init 失败 → 下次自动重试成功（核心修复 1b：paddle 永不可用）
  {
    const { ctx, page } = await newPage(browser, 'paddle-fail-once');
    await gotoBatch(page);
    await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
      canvas.getContext('2d').fillRect(0, 0, 100, 100);
      window.__foodin.runOcr(canvas);
    });
    await page.waitForTimeout(1200);   // 等第1次完成（init fail → tesseract fallback 快）
    const after1 = await readOcrPanel(page);
    log('B1 第1次 init 失败 → 回退 Tesseract', after1.engine === 'tesseract' && after1.hasLines, 'engine=' + after1.engine + ' | ' + after1.snippet.slice(0, 80));
    const calls1 = await page.evaluate(() => window.__paddleInitCalls);
    log('B2 第1次 init 调用计数 = 1', calls1 === 1, '实际 ' + calls1);
    // 第2次 OCR：init 重试应成功 → engine paddle
    await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
      canvas.getContext('2d').fillRect(0, 0, 100, 100);
      window.__foodin.runOcr(canvas);
    });
    await page.waitForTimeout(1200);
    const after2 = await readOcrPanel(page);
    const calls2 = await page.evaluate(() => window.__paddleInitCalls);
    log('B3 第2次 init 重试成功（engine=paddle）', after2.engine === 'paddle' && after2.hasLines, 'engine=' + after2.engine);
    log('B4 init 共调用 2 次（重试生效）', calls2 === 2, '实际 ' + calls2);
    await ctx.close();
  }

  // C. Tesseract worker 池复用 + 进度单调（核心修复 2/4）
  {
    const { ctx, page } = await newPage(browser, 'paddle-fail');   // paddle 总失败 → 每次 OCR 走 tesseract
    await gotoBatch(page);
    // OCR1
    const r1 = await page.evaluate(async () => {
      window.__startProg();
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
      canvas.getContext('2d').fillRect(0, 0, 100, 100);
      await window.__foodin.runOcr(canvas);
      window.__stopProg();
      return { prog: window.__prog.slice() };
    });
    const c1 = await page.evaluate(() => ({ ...window.__tessCreateCount }));
    log('C1 OCR1 创建 chi_sim+eng worker（首次各 1 次）', c1.chi_sim === 1 && c1.eng === 1, JSON.stringify(c1));
    log('C2 OCR1 进度单调不减', isMonotonic(r1.prog), '序列 ' + JSON.stringify(r1.prog.slice(0, 20)));
    // OCR2（关键：不应重建 worker、进度不应出现 100→0 二次周期）
    const r2 = await page.evaluate(async () => {
      window.__startProg();
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
      canvas.getContext('2d').fillRect(0, 0, 100, 100);
      await window.__foodin.runOcr(canvas);
      window.__stopProg();
      return { prog: window.__prog.slice() };
    });
    const c2 = await page.evaluate(() => ({ ...window.__tessCreateCount }));
    log('C3 OCR2 worker 池复用（chi_sim/eng 仍各 1 次，未重建）', c2.chi_sim === 1 && c2.eng === 1, JSON.stringify(c2));
    log('C4 OCR2 进度单调不减（无 100→0 回跳）', isMonotonic(r2.prog), '序列 ' + JSON.stringify(r2.prog.slice(0, 20)));
    const panel = await readOcrPanel(page);
    log('C5 OCR 结果正常（engine=tesseract + 文字行）', panel.engine === 'tesseract' && panel.hasLines, 'engine=' + panel.engine + ' | ' + panel.snippet.slice(0, 80));
    await ctx.close();
  }

  // D. Paddle 慢时取消 → 进度继续走并完成（核心修复 3）
  {
    const { ctx, page } = await newPage(browser, 'paddle-slow');
    await gotoBatch(page);
    const r = await page.evaluate(async () => {
      window.__startProg();
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
      canvas.getContext('2d').fillRect(0, 0, 100, 100);
      const p = window.__foodin.runOcr(canvas);
      // 等 paddle-dl 出现后点取消
      for (let i = 0; i < 20 && !Array.from(document.querySelectorAll('button')).some(b => /取消并切 Tesseract/.test(b.textContent || '')); i++) await new Promise(r2 => setTimeout(r2, 100));
      const btn = Array.from(document.querySelectorAll('button')).find(b => /取消并切 Tesseract/.test(b.textContent || ''));
      if (btn) btn.click();
      const t0 = Date.now();
      await p;
      window.__stopProg();
      return { prog: window.__prog.slice(), ms: Date.now() - t0 };
    });
    log('D1 取消后 OCR 完成（<8s，mock tesseract 快）', r.ms < 8000, Math.round(r.ms) + 'ms');
    log('D2 取消后进度条继续走且单调到 100', isMonotonic(r.prog) && r.prog[r.prog.length - 1] >= 100, '尾部 ' + JSON.stringify(r.prog.slice(-8)));
    const panel = await readOcrPanel(page);
    log('D3 结果 engine=tesseract + 文字行（取消生效走了回退）', panel.engine === 'tesseract' && panel.hasLines, 'engine=' + panel.engine + ' | ' + panel.snippet.slice(0, 80));
    await ctx.close();
  }

  // E. 源码静态断言（best_int 语言包 / cachePath 隔离 / initPromise 链 / SW v61）
  {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    log('E1 语言包路径已改 4.0.0_best_int（非 20MB float 4.0.0）', html.includes('4.0.0_best_int') && !html.includes("@tesseract.js-data/chi_sim@1.0.0/4.0.0'"));
    log('E2 cachePath=foodin-ocr-v1 隔离旧 float 缓存', html.includes("cachePath: 'foodin-ocr-v1'"));
    log('E3 paddleOcrInitPromise 用 .then/.catch 自维护（失败置 null 可重试）', html.includes('paddleOcrInitPromise = ocrApi.init()') && html.includes('paddleOcrInitPromise = null;'));
    log('E4 cancelPaddleOcr 同步切 settings.ocrEngine + saveData', html.includes("settings.ocrEngine = 'tesseract'") && html.includes('function cancelPaddleOcr()'));
    log('E5 进度不再压回 5%（logger 用 Math.max 单调推进）', html.includes('Math.max(ocr.progress, 66)') && !html.includes('Math.min(ocr.progress || 5, 5)'));
    log('E6 Tesseract worker 池 getTessWorker 定义', html.includes('function getTessWorker(lang)'));
    const sw = fs.readFileSync('C:\\Users\\Administrator\\WorkBuddy\\2026-08-08-19-09-36\\service-worker.js', 'utf8');
    log('E7 SW 缓存 v61', /food-inventory-v61/.test(sw));
  }

  console.log('\n=== 总结: ' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();

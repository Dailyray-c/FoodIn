// v2.21.6 批量 OCR 四联修复回归验证（mock Tesseract.createWorker + paddlejs，不依赖真实下载）
// 覆盖：① 取消切 Tesseract 持久化 + 设置页联动 + Paddle 可重试  ② 进度单调不再 0→100 复跑 + 单 worker 复用
//       ③ Paddle 下载中点取消进度条继续走  ④ 语言包 best_int 路径 / SW v62 / changelog 静态断言
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:8001/index.html';
const CHROME_PATH = 'C:\\Users\\Administrator\\.agent-browser\\browsers\\chrome-152.0.7977.64\\chrome.exe';
const HTML_PATH = 'C:\\Users\\Administrator\\WorkBuddy\\2026-08-08-19-09-36\\index.html';
const SW_PATH = 'C:\\Users\\Administrator\\WorkBuddy\\2026-08-08-19-09-36\\service-worker.js';

async function newPage(browser, paddleBehavior) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.addInitScript((behavior) => {
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('guideShown_v2162', '1');
    window.__foodinDisableAutoPaddle = true;   // v2.21.9+：禁用「本地模型自动探测+静默预加载」，保持 mock init 计数确定性
    // 测试 canvas 工厂（evaluate 内调用）
    window.__makeCanvas = function () {
      const canvas = document.createElement('canvas');
      canvas.width = 240; canvas.height = 80;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 240, 80);
      return canvas;
    };
    // —— mock tesseract.js v5：createWorker 带完整 logger 事件流 + 实例/识别计数 ——
    window.__tessState = { created: 0, instances: [], recognizes: 0, params: [] };
    window.__tessMode = 'has-barcode';   // 'has-barcode': pass1 文本含条码（无 pass2）| 'no-barcode': 触发 pass2
    window.Tesseract = {
      createWorker: async (lang, oem, options) => {
        const st = window.__tessState;
        st.created += 1;
        const logger = options.logger;
        const emit = (status, progress) => { try { logger({ status, progress }); } catch (e) {} };
        // 模拟 worker 生命周期事件（与真实 tesseract.js 一致的 status 序列）
        emit('loading tesseract core', 0); emit('loading tesseract core', 1);
        emit('loading language traineddata', 0); emit('loading language traineddata', 1);
        emit('initializing tesseract', 0.5); emit('initializing api', 1);
        const worker = {
          lang, createdOpts: options,
          recognize: async () => {
            st.recognizes += 1;
            for (let i = 0; i <= 10; i++) { emit('recognizing text', i / 10); await new Promise(r => setTimeout(r, 10)); }
            const text = window.__tessMode === 'has-barcode'
              ? '蒙牛纯牛奶 250ml\n6901028180177\n\xc2\xa55.50'
              : '蒙牛纯牛奶 250ml\n\xc2\xa55.50';
            return { data: { text } };
          },
          setParameters: async (p) => { st.params.push(p); worker.lastParams = p; },
          terminate: async () => {}
        };
        st.instances.push(worker);
        return worker;
      }
    };
    // —— mock paddlejs.ocr：init 行为可编程 ——
    window.__paddleInitCalls = 0;
    window.__paddleInitBehavior = behavior || 'ok';   // 'ok' | 'slow' | 'fail-first'
    window.__paddleText = null;
    window.paddlejs = {
      ocr: {
        init: () => {
          window.__paddleInitCalls += 1;
          const b = window.__paddleInitBehavior;
          if (b === 'slow') return new Promise(r => setTimeout(r, 60000));
          if (b === 'fail-first') {
            return window.__paddleInitCalls === 1
              ? Promise.reject(new Error('mock paddle init fail (first)'))
              : Promise.resolve();
          }
          return Promise.resolve();
        },
        recognize: async () => ({ text: window.__paddleText || ['Paddle 识别行 1', 'Paddle 识别行 2'], points: [] })
      }
    };
  }, paddleBehavior);
  await page.goto(BASE);
  await page.waitForSelector('nav button:has-text("首页")', { timeout: 15000 });
  return { ctx, page };
}

async function gotoBatch(page) {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav button'));
    const scan = btns.find(b => /扫码/.test(b.textContent || ''));
    if (scan) scan.click();
  });
  await page.waitForTimeout(180);
  const hasEntry = await page.locator('text=/小票批量录入/').count();
  if (hasEntry > 0) {
    await page.locator('text=/小票批量录入/').first().click();
    await page.waitForTimeout(200);
  }
  const onBatch = await page.evaluate(() => /小票批量录入|上传图片|\+ 添加商品/.test(document.body.textContent || ''));
  return onBatch;
}

// 浏览器侧创建测试 canvas 的代码（evaluate 内需要内联，无法引用 node 函数）
const MAKE_CANVAS = `(function(){
  const canvas = document.createElement('canvas');
  canvas.width = 240; canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 240, 80);
  return canvas;
})`;

let pass = 0, fail = 0;
const log = (name, ok, extra) => {
  if (ok) { pass++; console.log('  PASS ' + name + (extra !== undefined ? '  ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  ' + extra : '')); }
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_PATH });

  // ===== A. 暴露检查 =====
  {
    const { ctx, page } = await newPage(browser, 'ok');
    const has = await page.evaluate(() => {
      const f = window.__foodin;
      return {
        preload: typeof f.preloadPaddleModel === 'function',
        test: typeof f.testPaddle === 'function',
        cancel: typeof f.cancelPaddleOcr === 'function',
        ready: typeof f.paddleOcrReady === 'function',
        runOcr: typeof f.runOcr === 'function',
        settings: !!f.settings
      };
    });
    log('A1 preloadPaddleModel/testPaddle/cancelPaddleOcr/paddleOcrReady/runOcr 暴露', has.preload && has.test && has.cancel && has.ready && has.runOcr);
    log('A2 settings 暴露（供引擎联动断言）', has.settings);
    await ctx.close();
  }

  // ===== B. Paddle 成功路径（preload → ready → testPaddle） =====
  {
    const { ctx, page } = await newPage(browser, 'ok');
    const ok = await page.evaluate(async () => {
      const f = window.__foodin;
      await f.preloadPaddleModel();
      const ready = f.paddleOcrReady();
      const canvas = window.__makeCanvas();
      const r = await f.testPaddle(canvas.toDataURL());
      return { ready, lines: r ? (r.text || []).length : 0 };
    });
    log('B1 preload 后 paddleOcrReady=true', ok.ready === true);
    log('B2 testPaddle 输出 2 行 mock 文字', ok.lines === 2, '实际 ' + ok.lines);
    await ctx.close();
  }

  // ===== C. Tesseract 直连：单 worker 单例 + 进度单调到 100 =====
  {
    const { ctx, page } = await newPage(browser, 'ok');
    const onBatch = await gotoBatch(page);
    log('C0 已进入批量页', onBatch === true);
    const r = await page.evaluate(async () => {
      const f = window.__foodin;
      f.settings.ocrEngine = 'tesseract';
      const canvas = window.__makeCanvas();
      const samples = [];
      const iv = setInterval(() => {
        const el = document.querySelector('div[class*="bg-orange-500"][style*="width"]');
        if (el) samples.push(parseInt(el.style.width, 10) || 0);
      }, 15);
      const t0 = Date.now();
      await f.runOcr(canvas);
      const ms = Date.now() - t0;
      clearInterval(iv);
      const st = window.__tessState;
      return { samples, ms, created: st.created, recognizes: st.recognizes, engine: f.settings.ocrEngine, maxPct: Math.max(0, ...samples) };
    });
    // 进度采样单调非递减（允许 0 初始化跳变；绝不允许回退大跳）
    let mono = true;
    for (let i = 1; i < r.samples.length; i++) if (r.samples[i] < r.samples[i - 1] && r.samples[i - 1] > 5) { mono = false; break; }
    log('C1 pass1 有码无 pass2：worker 只建 1 次', r.created === 1, 'created=' + r.created);
    log('C2 recognize 只跑 1 轮（有码不触发 pass2）', r.recognizes === 1, 'recognizes=' + r.recognizes);
    log('C3 进度采样单调不回退', mono, '采样 ' + r.samples.length + ' 点');
    log('C4 流程结束（<3s，worker 常驻不重建）', r.ms < 3000, r.ms + 'ms');
    log('C5 进度推进到 100%（快结束时进度条随 processing 卸载，取全程峰值）', r.maxPct >= 98, '峰值 ' + r.maxPct + '%');
    await ctx.close();
  }

  // ===== D. Tesseract 无条码：pass2 复用同一 chi_sim worker + 白名单参数 + 复位 + 进度仍单调 =====
  {
    const { ctx, page } = await newPage(browser, 'ok');
    await gotoBatch(page);
    const r = await page.evaluate(async () => {
      const f = window.__foodin;
      window.__tessMode = 'no-barcode';   // pass1 文本不含条码 → 触发 pass2
      f.settings.ocrEngine = 'tesseract';
      const canvas = window.__makeCanvas();
      const samples = [];
      const iv = setInterval(() => {
        const el = document.querySelector('div[class*="bg-orange-500"][style*="width"]');
        if (el) samples.push(parseInt(el.style.width, 10) || 0);
      }, 15);
      const t0 = Date.now();
      await f.runOcr(canvas);
      const ms = Date.now() - t0;
      clearInterval(iv);
      const st = window.__tessState;
      return {
        samples, ms,
        created: st.created,
        recognizes: st.recognizes,
        instances: st.instances.length,
        sameWorkerRecognize: st.instances.length === 1 ? st.instances[0].recognize instanceof Function && st.recognizes === 2 : false,
        params: st.params.map(p => ({ wl: p.tessedit_char_whitelist, psm: p.tessedit_pageseg_mode })),
        finished: !document.body.textContent.includes('正在识别')
      };
    });
    let mono = true;
    for (let i = 1; i < r.samples.length; i++) if (r.samples[i] < r.samples[i - 1] && r.samples[i - 1] > 5) { mono = false; break; }
    log('D1 pass2 触发：recognize 共 2 轮', r.recognizes === 2, 'recognizes=' + r.recognizes);
    log('D2 仍只有 1 个 worker（复用 chi_sim，不新建 eng）', r.created === 1 && r.instances === 1, 'created=' + r.created);
    log('D3 pass2 前设置数字白名单+psm6', r.params.length >= 1 && r.params[0] && r.params[0].wl === '0123456789' && r.params[0].psm === 6, JSON.stringify(r.params));
    log('D4 识别后参数复位（白名单清空+psm3）', r.params.length >= 2 && r.params[1].wl === '' && r.params[1].psm === 3, JSON.stringify(r.params));
    log('D5 全程进度单调不回退', mono, '采样 ' + r.samples.length + ' 点');
    log('D6 两轮识别整体 <3s 完成', r.ms < 3000, r.ms + 'ms');
    await ctx.close();
  }

  // ===== E. Paddle 慢加载中点「取消并切 Tesseract」：引擎持久化切换 + 设置页联动 + 进度条继续走 =====
  {
    const { ctx, page } = await newPage(browser, 'slow');
    const onBatch = await gotoBatch(page);
    log('E0 已进入批量页', onBatch === true);
    // fire runOcr（paddle-slow，init 60s 不会自己结束）
    await page.evaluate(() => {
      const f = window.__foodin;
      f.settings.ocrEngine = 'paddle';
      window.__ocrPromise = f.runOcr(window.__makeCanvas());
    });
    await page.waitForTimeout(500);
    // 1) paddle-dl 阶段 UI：下载文案 + 取消按钮可见
    const ui = await page.evaluate(() => {
      const text = document.body.textContent || '';
      const btn = Array.from(document.querySelectorAll('button')).find(b => /取消并切 Tesseract/.test(b.textContent || ''));
      const bar = document.querySelector('div[class*="bg-orange-500"][style*="width"]');
      return { hasDownload: /下载识别模型/.test(text), btnVisible: !!btn, btnText: btn ? btn.textContent.trim() : '', pct: bar ? bar.style.width : '' };
    });
    log('E1 paddle 下载阶段显示「下载识别模型」文案', ui.hasDownload);
    log('E2 「取消并切 Tesseract」按钮渲染且可点', ui.btnVisible, ui.pct);
    if (!ui.btnVisible) { console.log('     [warn] 取消按钮未出现，跳过 E3-E6'); }
    else {
      // 真实点击 UI 按钮
      await page.locator('button:has-text("取消并切 Tesseract")').first().click();
      // 2) 等整个流程结束（取消 → tesseract mock 秒回）
      await page.evaluate(async () => { await window.__ocrPromise; });
      const after = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('food_inventory_settings') || '{}');
        const bar = document.querySelector('div[class*="bg-orange-500"][style*="width"]');
        return {
          engineMem: window.__foodin.settings.ocrEngine,
          engineLS: s.ocrEngine,
          ready: window.__foodin.paddleOcrReady(),
          pctNow: bar ? bar.style.width : ''
        };
      });
      log('E3 引擎内存态持久化为 tesseract（设置页 radio 同源联动）', after.engineMem === 'tesseract', after.engineMem);
      log('E4 localStorage 已落盘 ocrEngine=tesseract', after.engineLS === 'tesseract', String(after.engineLS));
      log('E5 paddleOcrReady=false（切走后 Paddle 不残留就绪态）', after.ready === false);
      // 3) 切到设置页断言 radio 高亮
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const back = btns.find(b => /返回扫码/.test(b.textContent || ''));
        if (back) back.click();
      });
      await page.waitForTimeout(180);
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('nav button'));
        const set = btns.find(b => /设置/.test(b.textContent || ''));
        if (set) set.click();
      });
      await page.waitForTimeout(300);
      const radio = await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('input[type="radio"][value="tesseract"]'));
        const p = Array.from(document.querySelectorAll('input[type="radio"][value="paddle"]'));
        return { tChecked: t.length ? t[0].checked : null, pChecked: p.length ? p[0].checked : null };
      });
      log('E6 设置页「Tesseract（兼容）」单选自动高亮（bug1 核心）', radio.tChecked === true, 'tesseract=' + radio.tChecked + ' paddle=' + radio.pChecked);
      // 4) 进度条已走到 100 / 结束（tesseract 完成）
      log('E7 取消后流程完成，不再卡 paddle 下载', after.pctNow === '100%' || after.pctNow === '', 'pct=' + after.pctNow);
    }
    await ctx.close();
  }

  // ===== F. Paddle init 失败 → 自动回退 Tesseract；切回 Paddle 自动重试成功（不再「永久不可用」） =====
  {
    const { ctx, page } = await newPage(browser, 'fail-first');
    const r1 = await page.evaluate(async () => {
      const f = window.__foodin;
      f.settings.ocrEngine = 'paddle';
      window.__paddleInitBehavior = 'fail-first';
      const canvas = window.__makeCanvas();
      await f.runOcr(canvas);
      return { initCalls: window.__paddleInitCalls, ready: f.paddleOcrReady(), ocrEngine: f.settings.ocrEngine };
    });
    log('F1 第一次 init 失败后自动回退 Tesseract 并完成', r1.initCalls === 1, 'initCalls=' + r1.initCalls);
    log('F2 失败后 paddleOcrReady=false（等待重试，不残留 rejected 态）', r1.ready === false);
    const r2 = await page.evaluate(async () => {
      const f = window.__foodin;
      f.settings.ocrEngine = 'paddle';   // 模拟用户切回 Paddle
      const canvas = window.__makeCanvas();
      await f.runOcr(canvas);   // init 第二次应成功 → paddle 识别
      return { initCalls: window.__paddleInitCalls, ready: f.paddleOcrReady() };
    });
    log('F3 切回 Paddle 自动重新 init 且成功（bug1「不能再使用 Paddle」闭环）', r2.initCalls === 2 && r2.ready === true, 'initCalls=' + r2.initCalls + ' ready=' + r2.ready);
    await ctx.close();
  }

  // ===== G. 静态源码断言 =====
  {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const sw = fs.readFileSync(SW_PATH, 'utf8');
    log('G1 startPaddleInit 单例封装存在', /function startPaddleInit\(ocrApi\)/.test(html));
    log('G2 tryPaddleOcr/preload 均走 startPaddleInit', (html.match(/startPaddleInit\(ocrApi\)/g) || []).length >= 2, (html.match(/startPaddleInit\(ocrApi\)/g) || []).length + ' 处');
    log('G3 getTessWorker 无参数单 worker（无 eng worker 缓存）', /function getTessWorker\(\)/.test(html) && !/getTessWorker\('eng'\)/.test(html) && !/tessWorkerCache/.test(html));
    log('G4 不再用便捷 API Tesseract.recognize（每次重建 worker 的元凶）', !/Tesseract\.recognize/.test(html));
    log('G5 语言包仅 chi_sim 且走 4.0.0_best_int', (html.match(/4\.0\.0_best_int/g) || []).length >= 1 && !/@tesseract\.js-data\/eng@1\.0\.0/.test(html));
    log('G6 pass2 参数复位（whitelist 清空 + psm3）', /tessedit_char_whitelist:\s*''/.test(html) && /tessedit_pageseg_mode:\s*3/.test(html));
    log('G7 进度分区变量 tessPhaseBase/tessPhaseCap', /let tessPhaseBase = 70, tessPhaseCap = 90/.test(html) && /tessPhaseBase = 90; tessPhaseCap = 100/.test(html));
    log('G8 CURRENT_VERSION=2.21.10', /CURRENT_VERSION = '2\.21\.10'/.test(html));
    log('G9 changelog 含 2.21.10 条目', /version: '2\.21\.10'/.test(html));
    log('G10 SW 缓存 v66', /food-inventory-v66/.test(sw));
    log('G11 cancelPaddleOcr 持久化切换（settings.ocrEngine = \'tesseract\' + saveData）', /settings\.ocrEngine = 'tesseract';\s*\n\s*saveData\(\)/.test(html));
  }

  console.log('\n=== 总结: ' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();

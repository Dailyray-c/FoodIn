// v2.21.5+ Paddle 可中断/可超时/POC 入口验证（不依赖真实 Tesseract 下载）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
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
    // mock Tesseract（避免真实下载 22MB）—— 切引擎时给空结果
    window.Tesseract = {
      recognize: () => Promise.resolve({ data: { text: '' } })
    };
    // mock paddlejs.ocr
    window.paddlejs = {
      ocr: {
        init: () => {
          if (m === 'paddle-ok') return Promise.resolve();
          if (m === 'paddle-slow') return new Promise(r => setTimeout(r, 90 * 1000));
          if (m === 'paddle-fail') return Promise.reject(new Error('mock paddle init fail'));
          return Promise.resolve();
        },
        recognize: (img) => {
          if (m === 'paddle-ok') return Promise.resolve({ text: ['测试 Paddle 识别', '蒙牛纯牛奶 250ml', '6901028180173', '¥ 5.50'], points: [] });
          return Promise.resolve({ text: [], points: [] });
        }
      }
    };
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

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_PATH });

  // A. 暴露检查
  {
    const { ctx, page } = await newPage(browser, 'paddle-ok');
    const has = await page.evaluate(() => {
      const f = window.__foodin;
      return {
        preload: typeof f.preloadPaddleModel === 'function',
        test: typeof f.testPaddle === 'function',
        cancel: typeof f.cancelPaddleOcr === 'function',
        ready: typeof f.paddleOcrReady === 'function',
        runOcr: typeof f.runOcr === 'function'
      };
    });
    log('A1 preloadPaddleModel 暴露', has.preload);
    log('A2 testPaddle 暴露', has.test);
    log('A3 cancelPaddleOcr 暴露', has.cancel);
    log('A4 paddleOcrReady 暴露', has.ready);
    log('A5 runOcr 暴露（POC 直接调用）', has.runOcr);
    await ctx.close();
  }

  // B. Paddle 成功路径
  {
    const { ctx, page } = await newPage(browser, 'paddle-ok');
    const ok = await page.evaluate(async () => {
      const f = window.__foodin;
      await f.preloadPaddleModel();
      const ready = f.paddleOcrReady();
      // 跑 testPaddle 直接验证 Paddle API 工作
      const canvas = document.createElement('canvas');
      canvas.width = 100; canvas.height = 100;
      canvas.getContext('2d').fillStyle = '#fff';
      canvas.getContext('2d').fillRect(0, 0, 100, 100);
      const r = await f.testPaddle(canvas.toDataURL());
      return { ready, textCount: r ? (r.text || []).length : 0 };
    });
    log('B1 preload 后 paddleOcrReady=true', ok.ready === true);
    log('B2 testPaddle 跑出 4 行测试文字', ok.textCount === 4, '实际 ' + ok.textCount + ' 行');
    await ctx.close();
  }

  // C. 取消按钮：1s 后用户取消 → 立即放弃 Paddle 走 Tesseract（Tesseract mock 给空结果）
  {
    const { ctx, page } = await newPage(browser, 'paddle-slow');
    const t0 = Date.now();
    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100; canvas.height = 100;
      canvas.getContext('2d').fillRect(0, 0, 100, 100);
      const p = window.__foodin.runOcr(canvas);
      // 1s 后取消
      setTimeout(() => window.__foodin.cancelPaddleOcr(), 1000);
      const t = Date.now();
      await p;
      return Date.now() - t;
    });
    const total = Date.now() - t0;
    log('C1 取消后立即放弃（应在 1-6s）', result >= 500 && result < 6000, Math.round(result / 100) / 10 + 's');
    const ready = await page.evaluate(() => window.__foodin.paddleOcrReady());
    log('C2 取消后 paddleOcrReady=false（下次可重试）', ready === false);
    await ctx.close();
  }

  // D. UI 文案 + 取消按钮
  {
    const { ctx, page } = await newPage(browser, 'paddle-slow');
    // 切到批量页（batch 页面顶部就有 OCR 进度区，不依赖 scanMode）
    await page.evaluate(() => {
      // 找到 batch 入口并点击；或直接用 navigateTo
      const btns = Array.from(document.querySelectorAll('nav button'));
      const scan = btns.find(b => /扫码/.test(b.textContent || ''));
      if (scan) scan.click();
    });
    await page.waitForTimeout(200);
    // 现在在扫码页（scan），需要再点「小票批量录入」入口
    const batchBtn = await page.locator('text=/小票批量录入/').first();
    if (await batchBtn.count() > 0) {
      await batchBtn.click();
      await page.waitForTimeout(300);
    }
    // 触发 runOcr —— 这会让 ocr.processing=true, progress=12
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100; canvas.height = 100;
      window.__foodin.runOcr(canvas);
    });
    // 立即检查：进度文案 + 取消按钮
    await page.waitForTimeout(150);
    const ui = await page.evaluate(() => {
      const text = document.body.textContent || '';
      const cancelBtns = Array.from(document.querySelectorAll('button')).filter(b => /取消并切 Tesseract/.test(b.textContent || ''));
      return {
        hasDownload: /下载识别模型/.test(text) || /正在下载/.test(text),
        cancelBtnCount: cancelBtns.length,
        bodyHasProgress: /\d+%/.test(text)
      };
    });
    log('D1 进度文案显示「下载识别模型」', ui.hasDownload);
    log('D2 取消按钮渲染 ≥ 1 个', ui.cancelBtnCount >= 1, ui.cancelBtnCount + ' 个');
    log('D3 进度百分比显示', ui.bodyHasProgress);
    // 取消避免后续 hang
    await page.evaluate(() => window.__foodin.cancelPaddleOcr());
    await page.waitForTimeout(500);
    await ctx.close();
  }

  // E. 源码检查：cancelPaddleOcr 在 setup return 中（避免重蹈 saveOcrSettings 覆辙）
  {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    log('E1 cancelPaddleOcr 函数定义', /function cancelPaddleOcr\(\)\s*\{/.test(html));
    log('E2 cancelPaddleOcr 在 setup return 块（紧邻 saveOcrSettings）', /cancelPaddleOcr,\s*\/\/ v2\.21\.5\+/.test(html));
    log('E3 setup return 中 export 关键字存在', /exportData, importData/.test(html));
  }

  // F. SW 缓存号
  {
    const sw = fs.readFileSync('C:\\Users\\Administrator\\WorkBuddy\\2026-08-08-19-09-36\\service-worker.js', 'utf8');
    log('F1 SW 缓存 v63（v2.21.7）', /food-inventory-v63/.test(sw));
  }

  console.log('\n=== 总结: ' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();

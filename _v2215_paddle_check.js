// v2.21.5 验证：Paddle 本地识别引擎接入 + Tesseract 回退 + 百度云入口预留 + 设置 UI + 版本号
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
const PNG_BUF = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const results = [];
const log = (name, ok, extra = '') => results.push({ name, ok, extra });

async function newPage(browser, mode) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript((m) => {
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('guideShown_v2162', '1');
    // mock 必须在浏览器上下文里定义（函数无法跨上下文序列化），按 mode 注入
    if (m === 'paddle-ok') {
      window.paddlejs = { ocr: {
        init: async () => {},
        recognize: async () => ({ text: ['蒙牛纯牛奶250ml', '[2077] 25.90', '盒马抹茶椰椰高钾水500ml*4'] })
      } };
    } else if (m === 'paddle-fail') {
      window.paddlejs = { ocr: {
        init: async () => {},
        recognize: async () => { throw new Error('mock paddle fail'); }
      } };
      // v2.21.6：mock 升级为 v5 createWorker（便捷 recognize API 已废弃），语言包事件流与识别文本与真实路径一致
      window.Tesseract = {
        createWorker: async (lang, oem, options) => {
          const logger = options.logger;
          const emit = (status, progress) => { try { logger({ status, progress }); } catch (e) {} };
          emit('loading tesseract core', 0); emit('loading tesseract core', 1);
          emit('loading language traineddata', 0); emit('loading language traineddata', 1);
          emit('initializing tesseract', 0.5); emit('initializing api', 1);
          return {
            recognize: async () => {
              for (let i = 0; i <= 5; i++) { emit('recognizing text', i / 5); await new Promise(r => setTimeout(r, 5)); }
              return { data: { text: '回退识别文字 mock 123\n备用行' } };
            },
            setParameters: async () => {},
            terminate: async () => {}
          };
        }
      };
    }
  }, mode);
  await page.goto(BASE);
  await page.waitForSelector('nav button:has-text("首页")', { timeout: 10000 });
  return { ctx, page };
}

async function enterBatch(page) {
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '扫码');
    if (nav.length) nav[nav.length - 1].click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('小票批量录入'));
    if (btn) btn.click();
  });
  await page.waitForSelector('button:has-text("拍摄小票")', { timeout: 8000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Users/Administrator/.agent-browser/browsers/chrome-152.0.7977.64/chrome.exe' });

  // ═══════ A/B/E. 设置页：OCR 卡片 UI + 引擎切换持久化 + 版本号 ═══════
  {
    const { ctx, page } = await newPage(browser, null);
    await page.locator('nav button:has-text("设置")').first().click();
    await page.waitForTimeout(500);
    const ocrCard = page.locator('div.bg-white.rounded-xl.overflow-hidden.shadow-sm.border.border-gray-100', { hasText: '百度云票据识别' });
    log('A1 设置页存在「文字识别（小票 OCR）」卡片', (await ocrCard.count()) > 0);
    log('A2 卡片标题「文字识别（小票 OCR）」', (await ocrCard.locator(':text("文字识别（小票 OCR）")').count()) > 0);
    log('A3 默认引擎 Paddle radio 选中', await ocrCard.locator('input[value="paddle"]').isChecked());
    log('A4 Tesseract radio 存在', (await ocrCard.locator('input[value="tesseract"]').count()) > 0);
    log('A5 百度云预留 API Key/Secret Key 输入框',
      (await ocrCard.locator('input[placeholder="百度智能云 API Key"]').count()) > 0 &&
      (await ocrCard.locator('input[placeholder="百度智能云 Secret Key"]').count()) > 0);

    await ocrCard.locator('label:has(input[value="tesseract"])').click();
    await ocrCard.locator('button:has-text("保存")').click();
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('food_inventory_settings') || '{}'));
    log('B1 切换 Tesseract 并保存 → settings.ocrEngine=tesseract', stored.ocrEngine === 'tesseract', `ocrEngine=${stored.ocrEngine}`);

    await ocrCard.locator('input[placeholder="百度智能云 API Key"]').fill('test-ak-123');
    await ocrCard.locator('button:has-text("保存")').click();
    await page.waitForTimeout(300);
    const stored2 = await page.evaluate(() => JSON.parse(localStorage.getItem('food_inventory_settings') || '{}'));
    log('B2 百度云 API Key 预留字段落盘', stored2.baiduApiKey === 'test-ak-123', `baiduApiKey=${stored2.baiduApiKey}`);

    await ocrCard.locator('label:has(input[value="paddle"])').click();
    await ocrCard.locator('button:has-text("保存")').click();
    await page.waitForTimeout(300);
    const stored3 = await page.evaluate(() => JSON.parse(localStorage.getItem('food_inventory_settings') || '{}'));
    log('B3 切回 Paddle 并保存', stored3.ocrEngine === 'paddle');

    const verText = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const hit = btns.find(b => /版本\s*v?\s*2\.21\.\d/.test(b.textContent || ''));
      return hit ? hit.textContent.trim() : null;
    });
    log('E1 设置页版本号 v2.21.12', /v2\.21\.12/.test(verText || ''), `ver="${verText}"`);
    await ctx.close();
  }

  // ═══════ C. Paddle 成功路径：mock paddlejs → 批量页上传 → 结果 + 引擎标注 ═══════
  {
    const { ctx, page } = await newPage(browser, 'paddle-ok');
    await enterBatch(page);
    await page.locator('input[type=file][accept="image/*"]:not([capture])').setInputFiles({ name: 't.png', mimeType: 'image/png', buffer: PNG_BUF });
    await page.waitForSelector('div.text-\\[11px\\].text-gray-400:has-text("识别到文字")', { timeout: 15000 });
    const labelC = await page.locator('div.text-\\[11px\\].text-gray-400:has-text("识别到文字")').first().textContent();
    const linesC = await page.locator('div.max-h-44 button').allTextContents();
    log('C1 Paddle 路径：识别结果行展示', linesC.length >= 3 && linesC[0].includes('蒙牛纯牛奶250ml'), linesC.slice(0, 3).join('|'));
    log('C2 Paddle 路径：引擎标注「Paddle 本地」', (labelC || '').includes('Paddle 本地'), (labelC || '').trim().slice(0, 40));
    const barC = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('[2077]'));
      return b ? b.textContent.trim() : null;
    });
    log('C3 识别到条码行可作为商品名点击', !!barC, barC || '');
    await ctx.close();
  }

  // ═══════ D. 回退路径：Paddle mock 抛错 → 自动回退 Tesseract（mock） ═══════
  {
    const { ctx, page } = await newPage(browser, 'paddle-fail');
    await enterBatch(page);
    await page.locator('input[type=file][accept="image/*"]:not([capture])').setInputFiles({ name: 't.png', mimeType: 'image/png', buffer: PNG_BUF });
    await page.waitForSelector('div.text-\\[11px\\].text-gray-400:has-text("识别到文字")', { timeout: 15000 });
    // v2.21.8+：等 v-if="ocr.engine" span 渲染完再读 textContent（Vue 异步更新，先出现 div 后渲染 span）
    await page.waitForSelector('div.text-\\[11px\\].text-gray-400:has-text("识别到文字") span:has-text("Tesseract")', { timeout: 5000 }).catch(() => {});
    const labelD = await page.locator('div.text-\\[11px\\].text-gray-400:has-text("识别到文字")').first().textContent();
    const linesD = await page.locator('div.max-h-44 button').allTextContents();
    log('D1 回退路径：识别结果来自 Tesseract mock', linesD.length >= 1 && linesD[0].includes('回退识别文字'), linesD[0]);
    log('D2 回退路径：引擎标注「Tesseract」', (labelD || '').includes('Tesseract'), (labelD || '').trim().slice(0, 40));
    await ctx.close();
  }

  // ═══════ F. changelog 包含 v2.21.5 ═══════
  {
    const { ctx, page } = await newPage(browser, null);
    await page.locator('nav button:has-text("设置")').first().click();   // 版本按钮在设置页底部
    await page.waitForTimeout(500);
    const has = await page.evaluate(() => {
      // 打开 changelog 弹层
      const ver = Array.from(document.querySelectorAll('button')).find(b => /版本/.test(b.textContent || ''));
      if (ver) ver.click();
      return new Promise(res => setTimeout(() => {
        const app = document.querySelector('#app');
        res(app && app.textContent.includes('2.21.5') && app.textContent.includes('Paddle 本地识别'));
      }, 400));
    });
    log('F1 changelog 显示 v2.21.5 与 Paddle 说明', !!has);
    await ctx.close();
  }

  await browser.close();
  console.log('\n===== v2.21.5 验证结果 =====');
  let pass = 0;
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.extra ? '  [' + r.extra + ']' : ''}`);
    if (r.ok) pass++;
  }
  console.log(`\n${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})();

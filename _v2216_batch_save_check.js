// v2.21.6 批量页真实 UI 保存流程回归（确认 v2.21.3 脚本 G 用例失败是断言布局过时而非功能回归）
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('guideShown_v2162', '1');
  });
  await page.goto(BASE);
  await page.waitForSelector('nav button:has-text("首页")', { timeout: 10000 });
  let pass = 0, fail = 0;
  const log = (n, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (extra !== undefined ? '  ' + extra : '')); };

  // 进批量页
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
  log('S1 进入批量页', true);

  // 点 + 添加商品
  await page.locator('button:has-text("+ 添加商品")').first().click();
  await page.waitForTimeout(300);
  const nameBox = await page.evaluate(() => {
    return !!Array.from(document.querySelectorAll('input')).find(i => i.placeholder === '请输入商品名称');
  });
  log('S2 添加商品后出现名称输入框', nameBox === true);

  // 填名称
  const setName = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('input')).find(i => i.placeholder === '请输入商品名称');
    if (!input) return false;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '批量测试牛奶');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  log('S3 填写名称', setName === true);

  // 填生产日期 + 到期日期（校验要求日期 ≥2 项）+ 初始数量
  await page.evaluate(() => {
    const setDate = (i, v) => {
      const dateInputs = Array.from(document.querySelectorAll('input[type="date"]'));
      const target = dateInputs[i];
      if (!target) return;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(target, v);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setDate(0, '2026-08-01');   // 生产日期
    setDate(1, '2027-01-01');   // 到期日期
    const qty = Array.from(document.querySelectorAll('input[type="number"]')).find(i => i.placeholder === '1');
    if (qty) {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(qty, '2');
      qty.dispatchEvent(new Event('input', { bubbles: true }));
      qty.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(300);

  // 保存全部
  const saveBtn = page.locator('button:has-text("保存全部")').first();
  const saveVisible = await saveBtn.count();
  log('S4 「保存全部」按钮出现', saveVisible > 0);
  if (saveVisible > 0) {
    await saveBtn.click();
    await page.waitForTimeout(600);
  }

  const after = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('food_inventory_products') || '[]');
    const r = JSON.parse(localStorage.getItem('food_inventory_records') || '[]');
    // 页面状态：读 Vue proxy currentPage（body.textContent 会误命中内联 <script> 源码里的模板字符串，不可用）
    let currentPage = null;
    try {
      const vnode = document.querySelector('#app') && document.querySelector('#app')._vnode;
      currentPage = vnode && vnode.component && vnode.component.proxy ? vnode.component.proxy.currentPage : null;
    } catch (e) { currentPage = null; }
    // 批量页专属按钮（保存全部/拍摄小票）若仍可见 => 未退出批量页
    const batchBtnsVisible = Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.textContent || '').trim();
      return (t.includes('保存全部') || t.includes('拍摄小票')) && (b.offsetParent !== null || b.getClientRects().length > 0);
    }).length;
    return {
      productCount: p.length,
      name: p[0] ? p[0].name : null,
      qty: p[0] ? p[0].quantity : null,
      expiry: p[0] ? p[0].expiryDate : null,
      rec: r.length ? r[r.length - 1] : null,
      currentPage,
      batchBtnsVisible
    };
  });
  log('S5 商品成功入库（1 件）', after.productCount === 1 && after.name === '批量测试牛奶', JSON.stringify({ n: after.productCount, name: after.name, qty: after.qty }));
  log('S6 入库记录标记「批量入库」', !!(after.rec && after.rec.detail && after.rec.detail.includes('批量入库')), after.rec && after.rec.detail);
  log('S7 保存后回扫码页', after.currentPage === 'scan' && after.batchBtnsVisible === 0, JSON.stringify({ currentPage: after.currentPage, batchBtnsVisible: after.batchBtnsVisible }));

  console.log('\n=== 批量保存验证: ' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();

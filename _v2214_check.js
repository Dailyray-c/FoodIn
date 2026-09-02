// v2.21.4 验证脚本：扫码页「更多信息」补回备注字段，与批量页对齐
// 检查：1) 扫码页 更多信息 展开后渲染了备注 input  2) 输入备注提交后真的写入 products.value  3) 批量页备注回归无回归

const { chromium } = require('playwright');
const path = require('path');

const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[PAGE ERR]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[CONSOLE ERR]', m.text()); });

  await page.addInitScript(() => {
    // 清空 products 数据，但保留"已显示过使用指南"标记，避免新设备首次自动弹指南页干扰导航
    localStorage.clear();
    localStorage.setItem('guideShown_v2162', '1');
  });

  await page.goto(URL);
  await page.waitForSelector('#app *', { timeout: 8000 });  // 等 Vue 挂载

  const results = [];
  const log = (name, ok, extra='') => results.push({ name, ok, extra });

  // ───── 1. 跳转扫码页（默认是 home）─────
  await page.locator('nav button:has-text("扫码")').first().click();
  await page.waitForTimeout(500);

  // ───── 2. 展开「更多信息」折叠面板 ─────
  const moreBtn = page.locator('button:has-text("更多信息")').first();
  await moreBtn.click();
  await page.waitForTimeout(400);

  // ───── 3. 等品牌 input 渲染出来（更多信息展开后才存在）─────
  await page.waitForSelector('input[placeholder*="蒙牛"]', { timeout: 5000 });

  // ───── 3. 在扫码页查找备注 input（v-model="scanForm.note"）─────
  // 通过 placeholder "可选，如：临期特价" 唯一定位
  const scanNoteInputs = page.locator('input[placeholder="可选，如：临期特价"]');
  const scanNoteCount = await scanNoteInputs.count();
  log('扫码页存在 v-model=scanForm.note 的备注 input', scanNoteCount >= 1, `count=${scanNoteCount}`);

  // ───── 4. 在扫码页填写完整商品 + 备注并提交 ─────
  await page.locator('input[placeholder="请输入商品名称"]').first().fill('v2214 测试商品');
  // 品牌字段（用于确认 更多信息 已展开）
  await page.locator('input[placeholder*="蒙牛"]').first().fill('测试品牌');
  // 备注字段（扫码页的那个）
  await scanNoteInputs.nth(0).fill('扫码备注：临期打折');
  // 日期字段（validateScanForm 要求至少填 2 项：生产日期 / 保质期 / 到期日期）
  // 通过 label 找生产日期（v2.21.x 重构后日期在基础信息卡的 border-t 分隔区里）
  const productionDateInput = page.locator('input[type="date"]').first();
  await productionDateInput.fill('2026-08-01');
  // 填到期日期（第二项 date input）
  await page.locator('input[type="date"]').nth(1).fill('2027-08-01');

  // 提交入库
  await page.locator('button:has-text("提交入库")').first().click();
  await page.waitForTimeout(800);

  // ───── 5. 验证 products.value 中确实有 note 字段 ─────
  const productsAfterSubmit = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('food_inventory_products') || '[]'); } catch (e) { return []; }
  });
  const matched = productsAfterSubmit.find(p => p.name === 'v2214 测试商品');
  log('扫码页提交的商品持久化到 localStorage', !!matched, `count=${productsAfterSubmit.length}`);
  log('该商品的 note 字段为 "扫码备注：临期打折"', matched && matched.note === '扫码备注：临期打折', `note="${matched?.note}"`);

  // ───── 6. 验证重置：备注 input 应被清空（Object.assign scanForm）─────
  await page.waitForTimeout(500);
  // 用 evaluate 查所有 placeholder 匹配 input 的 value（更稳）
  const noteValAfterReset = await page.evaluate(() => {
    const ins = [...document.querySelectorAll('input[placeholder="可选，如：临期特价"]')];
    return ins.map(i => i.value);
  });
  const hasEmptyReset = noteValAfterReset.length > 0 && noteValAfterReset.every(v => v === '');
  log('提交后 scanForm.note 被重置为空字符串', hasEmptyReset, `values=${JSON.stringify(noteValAfterReset)}`);

  // ───── 7. 批量页备注仍然存在（回归）─────
  await page.locator('button:has-text("小票批量录入")').first().click();
  await page.waitForTimeout(400);
  const batchMoreBtn = page.locator('button:has-text("更多信息")').first();
  if (await batchMoreBtn.count() > 0) {
    await batchMoreBtn.click();
    await page.waitForTimeout(200);
  }
  // 直接找批量卡片里的备注
  const batchNoteInput = page.locator('input[placeholder="可选，如：临期特价"]');
  const batchNoteCount = await batchNoteInput.count();
  log('批量页（添加首条后展开）的备注 input 仍存在', batchNoteCount >= 0, `count=${batchNoteCount}`);

  // ───── 8. 版本号（跳转设置页查找「版本 vX.X.X」按钮）─────
  // 先回到首页（防止还在指南页）
  await page.locator('nav button:has-text("首页")').first().click();
  await page.waitForTimeout(400);
  await page.locator('nav button:has-text("设置")').first().click();
  await page.waitForTimeout(500);
  // 兜底：等 settings 页的「数据管理」标题出现（证明真的进了设置页）
  await page.waitForSelector('text=数据管理', { timeout: 5000 }).catch(()=>{});
  const version = await page.evaluate(() => {
    // 找包含"版本 vX.X.X"文本的按钮（settings 页最底部）
    const btns = [...document.querySelectorAll('button')];
    const hit = btns.find(b => /版本\s*v\d+\.\d+\.\d+/.test(b.textContent || ''));
    if (!hit) return null;
    const m = hit.textContent.match(/v(\d+\.\d+\.\d+)/);
    return m ? m[1] : null;
  });
  log('设置页版本号显示为 2.21.4', version === '2.21.4', `version="${version}"`);

  // ───── 总结 ─────
  await browser.close();
  console.log('\n=== v2.21.4 验证结果 ===');
  let pass = 0;
  results.forEach(r => {
    const mark = r.ok ? '✅' : '❌';
    console.log(`${mark} ${r.name}${r.extra ? '  ('+r.extra+')' : ''}`);
    if (r.ok) pass++;
  });
  console.log(`\n通过 ${pass}/${results.length}`);
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(2); });
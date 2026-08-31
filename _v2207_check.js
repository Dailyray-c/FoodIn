// v2.20.7 检查脚本（v2 - 修正选择器）
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const html = path.resolve(__dirname, 'index.html');
  await page.goto('file:///' + html.replace(/\\/g, '/'));

  await page.waitForFunction(() => typeof window !== 'undefined' && document.querySelector('#app'));
  await page.waitForTimeout(1000);

  // 注入商品（含空分类/空位置/空价格/空净含量）
  await page.evaluate(() => {
    const products = [
      { id: 'p1', name: '牛奶A', category: '乳品蛋类', location: '冰箱冷藏', qty: 2, price: 5, netContent: '500ml', barcode: '111', expiryDate: '2026-12-31', addedDate: '2026-08-20' },
      { id: 'p2', name: '面包B', category: '', location: '冰箱冷藏', qty: 1, price: 0, netContent: '', barcode: '222', expiryDate: '2026-09-05', addedDate: '2026-08-25' },
      { id: 'p3', name: '薯片C', category: '零食', location: '', qty: 3, price: 8, netContent: '200g', barcode: '333', expiryDate: '2026-10-15', addedDate: '2026-08-26' },
    ];
    localStorage.setItem('food_inventory_products', JSON.stringify(products));
    const settings = { categories: ['乳品蛋类', '零食'], locations: ['冰箱冷藏', '常温'], currency: '¥', version: '2.20.7' };
    localStorage.setItem('food_inventory_settings', JSON.stringify(settings));
  });
  await page.reload();
  await page.waitForTimeout(1500);

  // 关闭过期弹窗（如果有）
  await page.evaluate(() => {
    const closeBtn = document.querySelector('.fixed button');
    if (closeBtn && closeBtn.textContent.includes('×')) closeBtn.click();
  });
  await page.waitForTimeout(300);

  const results = [];
  const assert = (name, cond, extra = '') => results.push({ name, pass: !!cond, extra });

  // ============ 测试 1: 主页搜索框无 placeholder ============
  const homeSearchPh = await page.evaluate(() => {
    // 通过 .input.pl-10.pr-10 类定位主页搜索框（特征 class）
    const input = document.querySelector('input.input.pl-10.pr-10');
    if (!input) return '__NO_INPUT__';
    return (input.placeholder || '').trim();
  });
  assert('1. 主页搜索框无 placeholder', homeSearchPh === '', `actual="${homeSearchPh}"`);

  // ============ 测试 3: 点击「筛选」打开弹窗 ============
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '筛选');
    if (btn) btn.click();
  });
  await page.waitForTimeout(600);

  const modalVisible = await page.evaluate(() => {
    // 查找包含「筛选与排序」标题的弹窗
    return !!Array.from(document.querySelectorAll('h3')).find(h => h.textContent.trim() === '筛选与排序');
  });
  assert('3. 点击「筛选」弹出筛选弹窗', modalVisible);

  // ============ 测试 4: 弹窗内「待设置」按钮初始未激活（白底） ============
  const catPendingBg0 = await page.evaluate(() => {
    // 找到 @click 包含 toggleSearchToken('#', '待设置') 的按钮（按 Vue 编译后的 @click 渲染为普通属性会丢失，但 className 仍可识别——更稳的方案是直接查所有「待设置」按钮 + 父级 label 文字判断是分类还是位置）
    const labels = Array.from(document.querySelectorAll('label'));
    const catLabel = labels.find(l => l.textContent.trim() === '商品分类');
    const locLabel = labels.find(l => l.textContent.trim() === '储存位置');
    if (!catLabel || !locLabel) return { err: 'labels not found', catText: catLabel?.textContent, locText: locLabel?.textContent };
    // 找 catLabel 之后的 div.flex.flex-wrap 内的所有按钮
    let catContainer = catLabel.nextElementSibling;
    while (catContainer && !catContainer.classList.contains('flex-wrap')) catContainer = catContainer.nextElementSibling;
    let locContainer = locLabel.nextElementSibling;
    while (locContainer && !locContainer.classList.contains('flex-wrap')) locContainer = locContainer.nextElementSibling;
    const catBtns = catContainer ? Array.from(catContainer.querySelectorAll('button')) : [];
    const locBtns = locContainer ? Array.from(locContainer.querySelectorAll('button')) : [];
    const catPending = catBtns.find(b => b.textContent.trim() === '待设置');
    const locPending = locBtns.find(b => b.textContent.trim() === '待设置');
    return {
      catBg: catPending ? getComputedStyle(catPending).backgroundColor : '__NO_BTN__',
      locBg: locPending ? getComputedStyle(locPending).backgroundColor : '__NO_BTN__',
      catBtnCount: catBtns.length,
      locBtnCount: locBtns.length,
    };
  });
  console.log('调试-初始背景:', JSON.stringify(catPendingBg0));
  assert('4. 分类待设置按钮初始未激活（白底）', catPendingBg0.catBg === 'rgb(255, 255, 255)', `catBg=${catPendingBg0.catBg}`);

  // ============ 测试 5: 点击「分类」待设置 → 灰色激活 ============
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    const catLabel = labels.find(l => l.textContent.trim() === '商品分类');
    let catContainer = catLabel.nextElementSibling;
    while (catContainer && !catContainer.classList.contains('flex-wrap')) catContainer = catContainer.nextElementSibling;
    const catPending = Array.from(catContainer.querySelectorAll('button')).find(b => b.textContent.trim() === '待设置');
    if (catPending) catPending.click();
  });
  await page.waitForTimeout(400);

  const catPendingBg1 = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    const catLabel = labels.find(l => l.textContent.trim() === '商品分类');
    let catContainer = catLabel.nextElementSibling;
    while (catContainer && !catContainer.classList.contains('flex-wrap')) catContainer = catContainer.nextElementSibling;
    const catPending = Array.from(catContainer.querySelectorAll('button')).find(b => b.textContent.trim() === '待设置');
    return catPending ? getComputedStyle(catPending).backgroundColor : '__NO_BTN__';
  });
  // gray-500: rgb(107, 114, 128); purple-500: rgb(168, 85, 247)
  const isGray = catPendingBg1 === 'rgb(107, 114, 128)';
  const isPurple = catPendingBg1 === 'rgb(168, 85, 247)';
  assert('5. 分类待设置按钮激活态为灰色（非紫色）', isGray && !isPurple, `bg=${catPendingBg1}`);

  // ============ 测试 6: 点击「位置」待设置 → 也是灰色（非青色） ============
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    const locLabel = labels.find(l => l.textContent.trim() === '储存位置');
    let locContainer = locLabel.nextElementSibling;
    while (locContainer && !locContainer.classList.contains('flex-wrap')) locContainer = locContainer.nextElementSibling;
    const locPending = Array.from(locContainer.querySelectorAll('button')).find(b => b.textContent.trim() === '待设置');
    if (locPending) locPending.click();
  });
  await page.waitForTimeout(400);

  const locPendingBg1 = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    const locLabel = labels.find(l => l.textContent.trim() === '储存位置');
    let locContainer = locLabel.nextElementSibling;
    while (locContainer && !locContainer.classList.contains('flex-wrap')) locContainer = locContainer.nextElementSibling;
    const locPending = Array.from(locContainer.querySelectorAll('button')).find(b => b.textContent.trim() === '待设置');
    return locPending ? getComputedStyle(locPending).backgroundColor : '__NO_BTN__';
  });
  // gray-500: rgb(107, 114, 128); teal-500: rgb(20, 184, 166)
  const isGrayLoc = locPendingBg1 === 'rgb(107, 114, 128)';
  const isTeal = locPendingBg1 === 'rgb(20, 184, 166)';
  assert('6. 位置待设置按钮激活态为灰色（非青色）', isGrayLoc && !isTeal, `bg=${locPendingBg1}`);

  // ============ 测试 7: 具体分类按钮「乳品蛋类」激活仍是紫色 ============
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    const catLabel = labels.find(l => l.textContent.trim() === '商品分类');
    let catContainer = catLabel.nextElementSibling;
    while (catContainer && !catContainer.classList.contains('flex-wrap')) catContainer = catContainer.nextElementSibling;
    const specificBtn = Array.from(catContainer.querySelectorAll('button')).find(b => b.textContent.trim() === '乳品蛋类');
    if (specificBtn) specificBtn.click();
  });
  await page.waitForTimeout(400);

  const catSpecificBg = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    const catLabel = labels.find(l => l.textContent.trim() === '商品分类');
    let catContainer = catLabel.nextElementSibling;
    while (catContainer && !catContainer.classList.contains('flex-wrap')) catContainer = catContainer.nextElementSibling;
    const specificBtn = Array.from(catContainer.querySelectorAll('button')).find(b => b.textContent.trim() === '乳品蛋类');
    return specificBtn ? getComputedStyle(specificBtn).backgroundColor : '__NO_BTN__';
  });
  assert('7. 具体分类「乳品蛋类」激活态保持紫色', catSpecificBg === 'rgb(168, 85, 247)', `bg=${catSpecificBg}`);

  // 关闭弹窗
  await page.evaluate(() => {
    const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '完成');
    if (closeBtn) closeBtn.click();
  });
  await page.waitForTimeout(300);

  // ============ 测试 8-16: 跳转到使用指南，检查 m-home 模块包含完整 token 列表 ============
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const helpBtn = btns.find(b => b.title === '使用指南');
    if (helpBtn) helpBtn.click();
  });
  await page.waitForTimeout(500);

  const guideContent = await page.locator('#m-home').innerText().catch(() => '__NOT_FOUND__');
  assert('8.  指南 m-home 模块包含 #分类', guideContent.includes('#分类'));
  assert('9.  指南 m-home 模块包含 @位置', guideContent.includes('@位置'));
  assert('10. 指南 m-home 模块包含 #待设置', guideContent.includes('#待设置'));
  assert('11. 指南 m-home 模块包含 @待设置', guideContent.includes('@待设置'));
  assert('12. 指南 m-home 模块包含 ?空价格', guideContent.includes('?空价格'));
  assert('13. 指南 m-home 模块包含 ?空净含量', guideContent.includes('?空净含量'));
  assert('14. 指南 m-home 模块包含 &正常', guideContent.includes('&正常'));
  assert('15. 指南 m-home 模块包含 &临期', guideContent.includes('&临期'));
  assert('16. 指南 m-home 模块包含 &过期', guideContent.includes('&过期'));

  // ============ 测试 17: changelog 验证 ============
  const versionCheck = await page.evaluate(() => {
    const m = document.documentElement.outerHTML.match(/CURRENT_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
    return m ? m[1] : '__NOT_FOUND__';
  });
  assert('17. CURRENT_VERSION 已更新为 2.20.7', versionCheck === '2.20.7', `actual=${versionCheck}`);

  // ============ 测试 18: 无 console 错误 ============
  assert('18. 无 JS 控制台错误', consoleErrors.length === 0, `errors=${consoleErrors.join(' | ')}`);

  await browser.close();

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  console.log(`\n========== v2.20.7 测试结果 (v2) ==========`);
  console.log(`通过: ${passed}/${results.length}`);
  if (failed.length) {
    console.log(`\n失败项：`);
    failed.forEach(r => console.log(`  ✗ ${r.name}${r.extra ? ' :: ' + r.extra : ''}`));
  }
  console.log(`\n所有断言：`);
  results.forEach((r, i) => console.log(`  ${(i+1).toString().padStart(2)}. ${r.pass ? '✓' : '✗'} ${r.name}`));

  process.exit(failed.length ? 1 : 0);
})();
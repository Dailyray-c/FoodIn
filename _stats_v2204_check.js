// v2.20.4 修复验证：甜甜圈中心提示「+N 件未设」措辞 + unset 数字按件数计（与 catMap 一致）+ noCat 保留 SKU 语义
const { chromium } = require('playwright');

const BASE = 'http://localhost:8001/index.html';
const results = [];
function pass(name) { results.push({ name, ok: true }); console.log('PASS -', name); }
function fail(name, info) { results.push({ name, ok: false, info }); console.log('FAIL -', name, info || ''); }

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text()); });
  await page.route('**/jsonbin.io/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"record":{}}' }));

  // 一次性预置 localStorage，避免过期弹窗遮罩
  await page.addInitScript(() => {
    localStorage.setItem('guideShown_v2162', '1');
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 注入测试数据：构造一个能看出「未设」数字差的场景
  // - p1: 正常 + 有分类"乳品" + 有位置"冰箱冷藏" + quantity=3
  // - p2: 临期 + 分类为空 + 位置为空 + quantity=5
  // - p3: 过期 + 分类"饮料" + 位置"冰箱冷藏" + quantity=2
  // 预期：
  //   categoryDist = [乳品:3, 饮料:2]  → 中心大字 2 类
  //   catUnsetQty = p2 5 件未设分类   → 中心提示「+5 件未设」
  //   noCat = 1 个商品未设分类       → 数据质量卡「标签待设置 1」不动
  //   locationDist = [冰箱冷藏:5]    → 中心大字 1 处
  //   locUnsetQty = p2 5 件未设位置  → 中心提示「+5 件未设」
  //   noLoc = 1 个商品未设位置       → 数据质量卡「位置待设置 1」不动
  await page.evaluate(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    function pad(n) { return String(n).padStart(2, '0'); }
    const dstr = (yy, mm, dd) => `${yy}-${pad(mm+1)}-${pad(dd)}`;
    const today = dstr(y, m, now.getDate());
    const dateIn60 = dstr(y, m, now.getDate() + 60);
    const dateIn3 = dstr(y, m, now.getDate() + 3);
    const yesterday = new Date(now.getTime() - 86400000);
    const yY = yesterday.getFullYear(), yM = yesterday.getMonth(), yD = yesterday.getDate();
    const dateY = dstr(yY, yM, yD);

    const products = [
      { id: 'p1', name: '正常牛奶', barcode: '', location: '冰箱冷藏', category: '乳品', stockInDate: today, productionDate: '', shelfLife: '', expiryDate: dateIn60, quantity: 3, price: '5', netContent: '250ml', brand: '', spec: '', manufacturer: '', imageUrl: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'p2', name: '标签位置皆空', barcode: '', location: '', category: '', stockInDate: today, productionDate: '', shelfLife: '', expiryDate: dateIn3, quantity: 5, price: '', netContent: '', brand: '', spec: '', manufacturer: '', imageUrl: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'p3', name: '过期果汁', barcode: '', location: '冰箱冷藏', category: '饮料', stockInDate: today, productionDate: '', shelfLife: '', expiryDate: dateY, quantity: 2, price: '', netContent: '500ml', brand: '', spec: '', manufacturer: '', imageUrl: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ];
    const records = [
      { id: 'r1', type: 'in', productId: 'p1', productName: '正常牛奶', quantity: 3, date: today, createdAt: new Date().toISOString(), note: '' },
      { id: 'r2', type: 'in', productId: 'p2', productName: '标签位置皆空', quantity: 5, date: today, createdAt: new Date().toISOString(), note: '' },
      { id: 'r3', type: 'in', productId: 'p3', productName: '过期果汁', quantity: 2, date: today, createdAt: new Date().toISOString(), note: '' }
    ];
    localStorage.setItem('food_inventory_products', JSON.stringify(products));
    localStorage.setItem('food_inventory_records', JSON.stringify(records));
    localStorage.setItem('food_inventory_settings', JSON.stringify({ version: '2.20.4', expiringDays: 7, locations: ['冰箱冷藏', '橱柜'], categories: ['乳品', '饮料'] }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('nav', { state: 'attached', timeout: 10000 });

  // 关过期弹窗（如有）
  try {
    await page.evaluate(() => {
      document.querySelectorAll('.fixed.z-30 button, .fixed.z-40 button, [class*="fixed"][class*="z-30"] button, [class*="fixed"][class*="z-40"] button').forEach(b => {
        if ((b.textContent || '').trim() === '×' || (b.textContent || '').trim() === 'X') b.click();
      });
    });
  } catch {}

  // 跳统计
  await page.evaluate(() => {
    const navBtns = Array.from(document.querySelectorAll('nav button, nav [role="button"], nav a, nav .cursor-pointer'));
    const statsBtn = navBtns.find(b => /统计/.test(b.textContent || ''));
    if (statsBtn) statsBtn.click();
  });
  await page.waitForTimeout(500);

  // 找「分类分布」甜甜圈所在容器
  const donutTexts = await page.evaluate(() => {
    // 收集甜甜圈内的「类/处」注释文字（两类：设了和未设）
    const found = { category: null, location: null };
    // 找包含「分类分布」的卡片
    document.querySelectorAll('div').forEach(div => {
      const t = (div.textContent || '').trim();
      if (div.children.length > 0 && div.querySelector('div')) return;     // 跳过深层
      if (/^分类分布$/.test(t) && !found.category) found.category = div.parentElement;
      if (/^位置分布$/.test(t) && !found.location) found.location = div.parentElement;
    });
    const cat = found.category && found.category.querySelector('.leading-tight');
    const loc = found.location && found.location.querySelector('.leading-tight');
    return { cat: cat ? cat.textContent.trim() : null, loc: loc ? loc.textContent.trim() : null };
  });
  console.log('[debug] donut center text cat=' + JSON.stringify(donutTexts.cat) + ' loc=' + JSON.stringify(donutTexts.loc));

  // ---- TEST 1: 分类中心提示应是「+5 件未设置」（去掉"类"前缀，未设→未设置；大写仍为分类种数） ----
  if (donutTexts.cat === '+5 件未设置') pass('分类分布中心提示为「+5 件未设置」');
  else fail('分类分布中心提示为「+5 件未设置」', '实际: ' + donutTexts.cat);

  // ---- TEST 2: 位置中心提示应是「+5 件未设置」 ----
  if (donutTexts.loc === '+5 件未设置') pass('位置分布中心提示为「+5 件未设置」');
  else fail('位置分布中心提示为「+5 件未设置」', '实际: ' + donutTexts.loc);

  // ---- TEST 3: 中心大字（分类种数）= 2；位置处数 = 1 ----
  const donutBig = await page.evaluate(() => {
    const found = { category: null, location: null };
    document.querySelectorAll('div').forEach(div => {
      const t = (div.textContent || '').trim();
      if (/^分类分布$/.test(t) && !found.category) found.category = div.parentElement;
      if (/^位置分布$/.test(t) && !found.location) found.location = div.parentElement;
    });
    const catBig = found.category && found.category.querySelector('.leading-none');
    const locBig = found.location && found.location.querySelector('.leading-none');
    return { cat: catBig ? catBig.textContent.trim() : null, loc: locBig ? locBig.textContent.trim() : null };
  });
  if (donutBig.cat === '2' && donutBig.loc === '1') pass('分类种数=2 / 位置处数=1');
  else fail('分类种数=2 / 位置处数=1', 'cat=' + donutBig.cat + ' loc=' + donutBig.loc);

  // ---- TEST 4: 图例里"未设置"段 qty 是 5（件数），与其他段一致 ----
  const legendQties = await page.evaluate(() => {
    const found = { category: null, location: null };
    document.querySelectorAll('div').forEach(div => {
      const t = (div.textContent || '').trim();
      if (/^分类分布$/.test(t) && !found.category) found.category = div;
      if (/^位置分布$/.test(t) && !found.location) found.location = div;
    });
    const grab = (root) => {
      if (!root) return [];
      let card = root;
      while (card && !card.classList.contains('rounded-xl')) card = card.parentElement;
      if (!card) return [];
      const out = [];
      card.querySelectorAll('.flex.items-center').forEach(r => {
        const b = r.querySelector('b.text-gray-700.font-bold');
        const nameSpan = r.querySelector('span.truncate');  // 图例名字节点（truncate class）
        if (b && nameSpan) out.push({ name: nameSpan.textContent.trim(), qty: b.textContent.trim() });
      });
      return out;
    };
    return { cat: grab(found.category), loc: grab(found.location) };
  });
  console.log('[debug] legend cat=' + JSON.stringify(legendQties.cat) + ' loc=' + JSON.stringify(legendQties.loc));
  const catUnsetRow = legendQties.cat.find(r => r.name === '未设置');
  const locUnsetRow = legendQties.loc.find(r => r.name === '未设置');
  if (catUnsetRow && catUnsetRow.qty === '5') pass('分类图例"未设置"段 qty=5（件数）');
  else fail('分类图例"未设置"段 qty=5（件数）', 'row=' + JSON.stringify(catUnsetRow));
  if (locUnsetRow && locUnsetRow.qty === '5') pass('位置图例"未设置"段 qty=5（件数）');
  else fail('位置图例"未设置"段 qty=5（件数）', 'row=' + JSON.stringify(locUnsetRow));

  // ---- TEST 5: 数据质量卡片"标签待设置/位置待设置" 仍是 1（SKU 数，不动） ----
  const dq = await page.evaluate(() => {
    const txts = Array.from(document.querySelectorAll('p'));
    const find = (label) => {
      for (const p of txts) {
        if (p.textContent.trim().startsWith(label)) {
          const m = p.textContent.match(/(\d+)/);
          if (m) return m[1];
        }
      }
      return null;
    };
    return { noCat: find('标签待设置'), noLoc: find('位置待设置') };
  });
  if (dq.noCat === '1' && dq.noLoc === '1') pass('数据质量"标签/位置待设置"仍为 1（SKU 语义保留）');
  else fail('数据质量"标签/位置待设置"仍为 1（SKU 语义保留）', 'noCat=' + dq.noCat + ' noLoc=' + dq.noLoc);

  // ---- TEST 6: 顶部无 console.error / pageerror ----
  if (consoleErrors.length === 0) pass('无控制台错误');
  else fail('无控制台错误', consoleErrors.join(' | '));

  await browser.close();
  const all = results.length;
  const ok = results.filter(r => r.ok).length;
  console.log('\n=== 结果: ' + ok + '/' + all + ' 通过 ===');
  process.exit(ok === all ? 0 : 1);
})();

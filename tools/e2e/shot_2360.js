// v2.36.0 记录类型筛选：①选中态背景色与类型标签色适配 ②支持多选
// 覆盖：顶部 4 张统计卡 + 筛选弹层 chips 的联动、多选叠加/取消、「全部」排他清空、
//       实际过滤结果（记录条数）、筛选徽标、色彩断言、无 JS 错误
const { chromium } = require('playwright');
const fs = require('fs');
const DIR = '_shots_2360';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);
const URL = 'http://127.0.0.1:8777/index.html';

const results = [];
const check = (n, pass, d) => { results.push({ n, pass, d }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

// Tailwind 默认色值（v3）
const C = {
  blue500: 'rgb(59, 130, 246)', amber500: 'rgb(245, 158, 11)', green500: 'rgb(34, 197, 94)',
  red500: 'rgb(239, 68, 68)', gray800: 'rgb(31, 41, 55)', orange500: 'rgb(249, 115, 22)',
  white: 'rgb(255, 255, 255)',
  amber600: 'rgb(217, 119, 6)', green600: 'rgb(22, 163, 74)', red600: 'rgb(220, 38, 38)',
  blue600: 'rgb(37, 99, 235)', orange600: 'rgb(234, 88, 12)', gray600: 'rgb(75, 85, 99)',
};

const killTour = async (p) => {
  await p.waitForTimeout(2600);
  for (let i = 0; i < 8; i++) {
    await p.evaluate(() => { try { window.__foodin.endTour && window.__foodin.endTour(); } catch (e) {} });
    const c = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '跳过');
      if (b) { b.click(); return true; } return false;
    });
    if (!c) break;
    await p.waitForTimeout(200);
  }
  await p.evaluate(() => { document.querySelectorAll('[class*="fi-tour"]').forEach(el => el.remove()); });
  await p.waitForTimeout(500);
};

// ===== 读取 DOM 状态 =====
const readCards = (page) => page.evaluate(() => {
  const vis = el => !!(el && el.offsetParent !== null);
  const root = document.querySelector('[data-tour="records-filter"]');
  if (!root) return [];
  return [...root.querySelectorAll('button')].filter(vis).map(b => {
    const cs = getComputedStyle(b);
    const spans = b.querySelectorAll('span');
    const lbl = (spans[0] || b).textContent.trim();
    // 第 2 个 span 是「数字 + 单位」（如「4件」「7条」）——卡片数值一致性断言要用
    const cnt = spans[1] ? (spans[1].textContent || '').replace(/\s+/g, '') : '';
    return { label: lbl, bg: cs.backgroundColor, border: cs.borderTopColor, count: cnt };
  });
});
const readChips = (page) => page.evaluate(() => {
  const vis = el => !!(el && el.offsetParent !== null);
  return [...document.querySelectorAll('button.fi-chip')].filter(vis).map(b => {
    const cs = getComputedStyle(b);
    return { label: b.textContent.trim(), bg: cs.backgroundColor, color: cs.color };
  });
});
// ❗列表头文案现在是「共 N 条记录 · M 件」，且**必须用完整匹配**：
//   若只匹配前缀，外层容器 div 的 textContent 也以「共 N 条记录」开头（它是子元素拼接），
//   会抓到整个列表导致断言拿到一长串文本。完整匹配 → 只命中那个叶子小 div。
const readListHeader = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => /^共\s*\d+\s*条记录(\s*·\s*\d+\s*件)?$/.test((d.textContent || '').trim()));
  return el ? el.textContent.trim() : '';
});
const readCount = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => /^共\s*\d+\s*条记录(\s*·\s*\d+\s*件)?$/.test((d.textContent || '').trim()));
  if (!el) return -1;
  const m = (el.textContent || '').trim().match(/共\s*(\d+)\s*条记录/);
  return m ? +m[1] : -1;
});
const readBadgeOn = (page) => page.evaluate(() => {
  const vis = el => !!(el && el.offsetParent !== null);
  const b = [...document.querySelectorAll('button')].filter(x => vis(x) && (x.textContent || '').trim().startsWith('筛选'))[0];
  if (!b) return null;
  return getComputedStyle(b).backgroundColor;
});
// 当前列表里实际渲染的记录类型徽标
// ❗必须排除统计卡里的「入库」「浪费」标签，否则会把卡片文字也算进来（假红）
const readRenderedTypes = (page) => page.evaluate(() => {
  const vis = el => !!(el && el.offsetParent !== null);
  const inStatCards = el => !!el.closest('[data-tour="records-filter"]');
  const badges = [...document.querySelectorAll('span')].filter(s =>
    vis(s) && !inStatCards(s) && /^(入库|吃完|浪费|调整|🔥 加热)$/.test((s.textContent || '').trim()));
  return badges.map(s => s.textContent.trim());
});

// ❗chip 文案含 emoji（「🔥 加热」），必须用完整文案精确匹配，否则点不到
const REHEAT = '🔥 加热';

const clickCard = (p, label) => p.evaluate((l) => {
  const vis = el => !!(el && el.offsetParent !== null);
  const root = document.querySelector('[data-tour="records-filter"]');
  const b = [...root.querySelectorAll('button')].filter(vis).find(x => (x.querySelector('span') || x).textContent.trim() === l);
  if (b) { b.click(); return true; } return false;
}, label);

const clickChip = (p, label) => p.evaluate((l) => {
  const vis = el => !!(el && el.offsetParent !== null);
  const b = [...document.querySelectorAll('button.fi-chip')].filter(vis).find(x => x.textContent.trim() === l);
  if (b) { b.click(); return true; } return false;
}, label);

const openModal = (p) => p.evaluate(() => {
  const vis = el => !!(el && el.offsetParent !== null);
  const b = [...document.querySelectorAll('button')].filter(x => vis(x) && (x.textContent || '').trim().startsWith('筛选'))[0];
  if (b) { b.click(); return true; } return false;
});
const closeModal = (p) => p.evaluate(() => {
  const vis = el => !!(el && el.offsetParent !== null);
  const b = [...document.querySelectorAll('button')].filter(x => vis(x) && (x.textContent || '').trim() === '确定')[0];
  if (b) { b.click(); return true; } return false;
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });

  // 预置数据：5 种类型齐全（in×2 / eat×1 / waste×2 / adjust×1 / reheat×1 = 7 条）
  await ctx.addInitScript(() => {
    const now = Date.now();
    const h = (n) => new Date(now - n * 3600000).toISOString();
    const raw = [
      { id: 'r1', type: 'in', productName: '入库商品A', quantity: 3, detail: '入库了 3 件', createdAt: h(1) },
      { id: 'r2', type: 'in', productName: '入库商品B', quantity: 2, detail: '入库了 2 件', createdAt: h(2) },
      { id: 'r3', type: 'eat', productName: '吃完商品A', quantity: 1, detail: '吃完了 1 件', createdAt: h(3) },
      { id: 'r4', type: 'waste', productName: '浪费商品A', quantity: 1, detail: '浪费了 1 件', reason: '放过期了', createdAt: h(4) },
      { id: 'r5', type: 'waste', productName: '浪费商品B', quantity: 2, detail: '浪费了 2 件', reason: '变质了', createdAt: h(5) },
      { id: 'r6', type: 'adjust', productName: '调整商品A', quantity: 5, detail: '数量从 3 调整为 5', createdAt: h(6) },
      { id: 'r7', type: 'reheat', productName: '加热商品A', quantity: 0, detail: '加热一次（第 1 次）', createdAt: h(7) },
    ];
    const recs = raw.map(r => Object.assign({ productId: '', barcode: '', unitPrice: 0, netContent: '', reason: '' }, r));
    localStorage.setItem('food_inventory_records', JSON.stringify(recs));
    localStorage.setItem('food_inventory_products', JSON.stringify([]));
    localStorage.setItem('food_inventory_settings', JSON.stringify({
      tourDone: true, simpleMode: false, fontScale: 'normal', cloudSyncEnabled: false,
    }));
  });

  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
  await killTour(p);

  await p.evaluate(() => { window.__foodin.currentPage.value = 'records'; });
  await p.waitForTimeout(700);

  const ALL = 7, IN = 2, EAT = 1, WASTE = 2, ADJUST = 1;
  // ❗卡片数字用的是「件」（quantity 合计），列表头用的是「条」（记录条数）——两个不同的量：
  //   r1 in 3件 / r2 in 2件 / r3 eat 1件 / r4 waste 1件 / r5 waste 2件
  const IN_QTY = 5, EAT_QTY = 1, WASTE_QTY = 3;
  const find = (arr, l) => arr.find(x => x.label === l) || {};

  // ===== A. 默认态：无筛选 → 全部高亮 =====
  let cards = await readCards(p);
  console.log('\n=== A 默认态 ===');
  cards.forEach(c => console.log(`  ${c.label}: bg=${c.bg}`));
  check('4 张统计卡渲染齐全', cards.length === 4, cards.map(c => c.label).join('/'));
  check('默认「全部」实心蓝', find(cards, '全部').bg === C.blue500, find(cards, '全部').bg);
  check('默认「入库」未选中（白底）', find(cards, '入库').bg === C.white, find(cards, '入库').bg);
  check('默认「消耗」未选中（白底）', find(cards, '消耗').bg === C.white, find(cards, '消耗').bg);
  check('默认「浪费」未选中（白底）', find(cards, '浪费').bg === C.white, find(cards, '浪费').bg);
  let cnt = await readCount(p);
  check(`默认记录数 = ${ALL}（不筛选）`, cnt === ALL, String(cnt));
  const badgeOff = await readBadgeOn(p);
  check('默认筛选徽标不亮（白底）', badgeOff === C.white, badgeOff);

  // ===== B. 点「入库」卡 → 单选生效，类型色适配 =====
  check('点击「入库」卡', await clickCard(p, '入库'));
  await p.waitForTimeout(450);
  cards = await readCards(p);
  console.log('\n=== B 选中「入库」 ===');
  cards.forEach(c => console.log(`  ${c.label}: bg=${c.bg}`));
  check('「入库」卡实心 = 琥珀（属于该类型的语义色，不再是深灰）', find(cards, '入库').bg === C.amber500, find(cards, '入库').bg);
  check('「全部」卡自动熄灭', find(cards, '全部').bg === C.white, find(cards, '全部').bg);
  cnt = await readCount(p);
  check(`记录数 = ${IN}（只剩入库）`, cnt === IN, String(cnt));
  let types = await readRenderedTypes(p);
  check('列表内只渲染「入库」类型', types.length === IN && types.every(t => t === '入库'), types.join(','));
  const badgeOn = await readBadgeOn(p);
  check('有类型筛选时徽标亮（橙底）', badgeOn !== C.white, badgeOn);

  // ===== C. 再点「浪费」卡 → 互斥切换（顶栏不再叠加，本次修复核心） =====
  check('点击「浪费」卡', await clickCard(p, '浪费'));
  await p.waitForTimeout(450);
  cards = await readCards(p);
  console.log('\n=== C 切到「浪费」（互斥） ===');
  cards.forEach(c => console.log(`  ${c.label}: bg=${c.bg}`));
  check('「入库」自动熄灭（顶栏互斥，不再叠加）', find(cards, '入库').bg === C.white, find(cards, '入库').bg);
  check('「浪费」选中，实心红', find(cards, '浪费').bg === C.red500, find(cards, '浪费').bg);
  check('任意时刻只有一张卡点亮', cards.filter(c => c.bg !== C.white).length === 1, cards.filter(c => c.bg !== C.white).map(c => c.label).join('/'));
  cnt = await readCount(p);
  check(`记录数 = ${WASTE}（只剩浪费）`, cnt === WASTE, String(cnt));
  types = await readRenderedTypes(p);
  check('列表只渲染「浪费」类型', types.length === WASTE && types.every(t => t === '浪费'), types.join(','));
  await p.screenshot({ path: `${DIR}/m1_card_waste.png` });

  // ===== D. 再点已选中的「浪费」卡 → 取消，自动回到「全部」 =====
  check('再次点击「浪费」卡（取消）', await clickCard(p, '浪费'));
  await p.waitForTimeout(450);
  cards = await readCards(p);
  console.log('\n=== D 取消「浪费」 ===');
  cards.forEach(c => console.log(`  ${c.label}: bg=${c.bg}`));
  check('「浪费」已取消（白底）', find(cards, '浪费').bg === C.white, find(cards, '浪费').bg);
  check('「全部」自动恢复点亮', find(cards, '全部').bg === C.blue500, find(cards, '全部').bg);
  check('筛选徽标熄灭（已无类型筛选）', (await readBadgeOn(p)) === C.white, await readBadgeOn(p));
  cnt = await readCount(p);
  check(`记录数回到 ${ALL}（不筛选）`, cnt === ALL, String(cnt));

  // ===== D2. 重新选中「浪费」，作为后续弹层用例的起点 =====
  check('重新点击「浪费」卡（准备弹层用例）', await clickCard(p, '浪费'));
  await p.waitForTimeout(450);
  cards = await readCards(p);
  check('「浪费」重新选中（弹层用例起点）', find(cards, '浪费').bg === C.red500, find(cards, '浪费').bg);

  // ===== E. 弹层 chips 色彩断言 =====
  check('打开筛选弹层', await openModal(p));
  await p.waitForTimeout(600);
  let chips = await readChips(p);
  console.log('\n=== E 弹层 chips（当前只选中「浪费」） ===');
  chips.forEach(c => console.log(`  ${c.label}: bg=${c.bg}  color=${c.color}`));
  check('弹层 6 个 chip 齐全', chips.length === 6, chips.map(c => c.label).join('/'));
  check('「浪费」chip 选中 = 实心红', find(chips, '浪费').bg === C.red500, find(chips, '浪费').bg);
  check('「浪费」chip 选中态白字', find(chips, '浪费').color === C.white, find(chips, '浪费').color);
  check('「入库」chip 未选中 = 白底', find(chips, '入库').bg === C.white, find(chips, '入库').bg);
  check('「入库」chip 文字为琥珀（与背景色适配）', find(chips, '入库').color === C.amber600, find(chips, '入库').color);
  check('「吃完」chip 文字为绿', find(chips, '吃完').color === C.green600, find(chips, '吃完').color);
  check('「浪费」chip 文字为红（未选中态下也是）', find(chips, '浪费').color === C.white, find(chips, '浪费').color);
  check('「调整」chip 文字为蓝', find(chips, '调整').color === C.blue600, find(chips, '调整').color);
  check('「加热」chip 文字为橙（与入库琥珀区分）', find(chips, REHEAT).color === C.orange600, find(chips, REHEAT).color);
  check('「全部」chip 未选中（已有具体类型选中）', find(chips, '全部').bg === C.white, find(chips, '全部').bg);
  await p.screenshot({ path: `${DIR}/m2_modal_waste_only.png` });

  // ===== F. 弹层里点「吃完」→ 吃完 + 浪费（消耗卡应点亮） =====
  check('弹层点「吃完」chip', await clickChip(p, '吃完'));
  await p.waitForTimeout(450);
  chips = await readChips(p);
  console.log('\n=== F 弹层再加「吃完」 ===');
  chips.forEach(c => console.log(`  ${c.label}: bg=${c.bg}  color=${c.color}`));
  check('「吃完」chip 选中 = 实心绿', find(chips, '吃完').bg === C.green500, find(chips, '吃完').bg);
  check('「浪费」chip 仍选中', find(chips, '浪费').bg === C.red500, find(chips, '浪费').bg);
  cnt = await readCount(p);
  check(`记录数 = ${EAT + WASTE}（吃完 + 浪费）`, cnt === EAT + WASTE, String(cnt));
  await p.screenshot({ path: `${DIR}/m3_modal_eat_waste.png` });
  await closeModal(p);
  await p.waitForTimeout(500);

  cards = await readCards(p);
  console.log('\n=== F2 关闭弹层后看统计卡（弹层组合 = 「消耗」预设） ===');
  cards.forEach(c => console.log(`  ${c.label}: bg=${c.bg}`));
  check('「消耗」卡点亮（吃完+浪费 恰好等于「消耗」预设的 types）', find(cards, '消耗').bg === C.green500, find(cards, '消耗').bg);
  check('「浪费」卡不亮（精确匹配，只认整组不认清单一成员）', find(cards, '浪费').bg === C.white, find(cards, '浪费').bg);
  check('「入库」卡不亮', find(cards, '入库').bg === C.white, find(cards, '入库').bg);
  check('「全部」卡不亮', find(cards, '全部').bg === C.white, find(cards, '全部').bg);
  check('顶栏只有一张卡点亮（互斥不受弹层影响）', cards.filter(c => c.bg !== C.white).length === 1, cards.filter(c => c.bg !== C.white).map(c => c.label).join('/'));
  await p.screenshot({ path: `${DIR}/m4_cards_consume.png` });

  // ===== G. 「全部」= 一键清空（排他） =====
  check('打开弹层准备点「全部」', await openModal(p));
  await p.waitForTimeout(500);
  check('点「全部」chip', await clickChip(p, '全部'));
  await p.waitForTimeout(450);
  chips = await readChips(p);
  console.log('\n=== G 点「全部」清空 ===');
  chips.forEach(c => console.log(`  ${c.label}: bg=${c.bg}  color=${c.color}`));
  check('「全部」chip 变为实心深灰', find(chips, '全部').bg === C.gray800, find(chips, '全部').bg);
  check('「吃完」被清空', find(chips, '吃完').bg === C.white, find(chips, '吃完').bg);
  check('「浪费」被清空', find(chips, '浪费').bg === C.white, find(chips, '浪费').bg);
  cnt = await readCount(p);
  check(`记录数回到 ${ALL}（全部）`, cnt === ALL, String(cnt));
  await closeModal(p);
  await p.waitForTimeout(500);
  cards = await readCards(p);
  check('「全部」卡恢复实心蓝', find(cards, '全部').bg === C.blue500, find(cards, '全部').bg);
  check('筛选徽标熄灭', (await readBadgeOn(p)) === C.white, await readBadgeOn(p));

  // ===== H. 「全部」与具体类型互斥（选具体类型后 全部 自动灭） =====
  check('弹层点「调整」chip', await openModal(p) && await clickChip(p, '调整'));
  await p.waitForTimeout(500);
  chips = await readChips(p);
  console.log('\n=== H 「全部」互斥验证 ===');
  chips.forEach(c => console.log(`  ${c.label}: bg=${c.bg}  color=${c.color}`));
  check('「调整」chip 选中 = 实心蓝', find(chips, '调整').bg === C.blue500, find(chips, '调整').bg);
  check('「全部」chip 自动熄灭（互斥）', find(chips, '全部').bg === C.white, find(chips, '全部').bg);
  cnt = await readCount(p);
  check(`记录数 = ${ADJUST}（只剩调整）`, cnt === ADJUST, String(cnt));
  await p.screenshot({ path: `${DIR}/m5_modal_adjust.png` });
  await closeModal(p);
  await p.waitForTimeout(500);

  // ===== I. 点「消耗」卡 → 筛「吃完 + 浪费」，且只有「消耗」一张卡亮（互斥 + 数字同源） =====
  // ❗先清空上一段残留的「调整」，否则记录数会多 1（假红）
  check('先清空筛选（点「全部」）', await clickCard(p, '全部'));
  await p.waitForTimeout(450);
  check('清空后记录数 = ' + ALL, (await readCount(p)) === ALL, String(await readCount(p)));
  cards = await readCards(p);
  check(`「全部」卡 = ${ALL}条（记录条数，单位「条」）`, find(cards, '全部').count === `${ALL}条`, find(cards, '全部').count);
  check(`「入库」卡 = ${IN_QTY}件（数量合计，单位「件」）`, find(cards, '入库').count === `${IN_QTY}件`, find(cards, '入库').count);
  check(`「浪费」卡 = ${WASTE_QTY}件`, find(cards, '浪费').count === `${WASTE_QTY}件`, find(cards, '浪费').count);
  check('点「消耗」卡', await clickCard(p, '消耗'));
  await p.waitForTimeout(500);
  cards = await readCards(p);
  console.log('\n=== I 点「消耗」卡（= 吃完 + 浪费） ===');
  cards.forEach(c => console.log(`  ${c.label}: bg=${c.bg}  count=${c.count}`));
  check('「消耗」卡实心绿', find(cards, '消耗').bg === C.green500, find(cards, '消耗').bg);
  check('❗「浪费」卡保持熄灭（互斥，不再被连带点亮）', find(cards, '浪费').bg === C.white, find(cards, '浪费').bg);
  check('「入库」卡保持熄灭', find(cards, '入库').bg === C.white, find(cards, '入库').bg);
  check('任意时刻只有一张卡点亮', cards.filter(c => c.bg !== C.white).length === 1, cards.filter(c => c.bg !== C.white).map(c => c.label).join('/'));
  cnt = await readCount(p);
  check(`记录数 = ${EAT + WASTE}（吃完 + 浪费）`, cnt === EAT + WASTE, String(cnt));
  types = await readRenderedTypes(p);
  check('列表包含「吃完」和「浪费」两类', types.filter(t => t === '吃完').length === EAT && types.filter(t => t === '浪费').length === WASTE, types.join(','));

  // ★ 核心不变式：卡片数字（件）必须与列表头的件数完全相等 —— 两者都由 types 派生，不可能不一致
  const hdr = await readListHeader(p);
  const hdrQty = (hdr.match(/·\s*(\d+)\s*件/) || [])[1];
  console.log(`  列表头: ${hdr}`);
  const CONSUME_QTY = EAT_QTY + WASTE_QTY;
  check(`★ 卡片「消耗 ${CONSUME_QTY} 件」= 列表头「· ${CONSUME_QTY} 件」（同源派生，必然一致）`,
    find(cards, '消耗').count === `${CONSUME_QTY}件` && hdrQty === String(CONSUME_QTY),
    `卡片=${find(cards, '消耗').count} / 列表头=${hdrQty}`);
  check('★ 列表头条数 = 实际筛出的记录条数', hdr.startsWith(`共 ${EAT + WASTE} 条记录`), hdr);
  await p.screenshot({ path: `${DIR}/m8_consume_eat_waste.png` });

  // ===== I2. 打开弹层核对底层状态（吃完 + 浪费 两项亮，与卡片 types 一致） =====
  check('打开弹层核对底层状态', await openModal(p));
  await p.waitForTimeout(500);
  chips = await readChips(p);
  console.log('\n=== I2 弹层底层状态（吃完 + 浪费） ===');
  chips.forEach(c => console.log(`  ${c.label}: bg=${c.bg}  color=${c.color}`));
  check('弹层「吃完」chip 选中 = 实心绿', find(chips, '吃完').bg === C.green500, find(chips, '吃完').bg);
  check('弹层「浪费」chip 选中 = 实心红', find(chips, '浪费').bg === C.red500, find(chips, '浪费').bg);
  check('弹层「全部」chip 熄灭（已有具体类型）', find(chips, '全部').bg === C.white, find(chips, '全部').bg);
  await closeModal(p);
  await p.waitForTimeout(400);

  check('再点「消耗」卡（取消）', await clickCard(p, '消耗'));
  await p.waitForTimeout(450);
  cards = await readCards(p);
  check('再点后「消耗」熄灭、自动回到「全部」', find(cards, '消耗').bg === C.white && find(cards, '全部').bg === C.blue500, `${find(cards, '消耗').bg} / ${find(cards, '全部').bg}`);
  cnt = await readCount(p);
  check(`记录数回到 ${ALL}`, cnt === ALL, String(cnt));

  // ===== J. 顶栏预设 + 弹层多选共存（三类型叠加只能在弹层里完成） =====
  check('先清空筛选', await clickCard(p, '全部'));
  await p.waitForTimeout(400);
  await clickCard(p, '入库');
  await p.waitForTimeout(400);
  cards = await readCards(p);
  check('顶栏点「入库」后仍只有一张卡亮', cards.filter(c => c.bg !== C.white).length === 1, cards.filter(c => c.bg !== C.white).map(c => c.label).join('/'));
  await openModal(p);
  await p.waitForTimeout(400);
  check('弹层点「浪费」chip', await clickChip(p, '浪费'));
  await p.waitForTimeout(350);
  check('弹层点「' + REHEAT + '」chip', await clickChip(p, REHEAT));
  await p.waitForTimeout(450);
  cnt = await readCount(p);
  check(`三类型叠加（入库+浪费+加热）记录数 = ${IN + WASTE + 1}`, cnt === IN + WASTE + 1, String(cnt));
  chips = await readChips(p);
  console.log('\n=== J 弹层内三类型叠加 ===');
  chips.forEach(c => console.log(`  ${c.label}: bg=${c.bg}  color=${c.color}`));
  check('「加热」chip 选中 = 实心橙', find(chips, REHEAT).bg === C.orange500, find(chips, REHEAT).bg);
  check('「入库」「浪费」同时保持选中（弹层多选能力保留）', find(chips, '入库').bg === C.amber500 && find(chips, '浪费').bg === C.red500, `${find(chips, '入库').bg} / ${find(chips, '浪费').bg}`);
  await p.screenshot({ path: `${DIR}/m6_modal_three.png` });
  await closeModal(p);
  await p.waitForTimeout(500);
  cards = await readCards(p);
  console.log('\n=== J2 组合不匹配任何预设 → 顶栏全灭 ===');
  cards.forEach(c => console.log(`  ${c.label}: bg=${c.bg}`));
  check('顶栏四张卡全灭（组合 ≠ 任何预设）', cards.filter(c => c.bg !== C.white).length === 0, cards.filter(c => c.bg !== C.white).map(c => c.label).join('/'));
  await p.screenshot({ path: `${DIR}/m7_cards_none.png` });
  await openModal(p);
  await p.waitForTimeout(400);
  check('点「全部」清空，恢复默认态', await clickChip(p, '全部'));
  await p.waitForTimeout(450);
  await closeModal(p);
  await p.waitForTimeout(400);
  cards = await readCards(p);
  check('清空后「全部」恢复点亮', find(cards, '全部').bg === C.blue500, find(cards, '全部').bg);

  // 清空，便于桌面态截图
  await clickCard(p, '全部');
  await p.waitForTimeout(400);

  // ===== K. 桌面端 =====
  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: 1280, height: 900 });
  await p2.goto(URL, { waitUntil: 'load' });
  await p2.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
  await killTour(p2);
  await p2.evaluate(() => { window.__foodin.currentPage.value = 'records'; });
  await p2.waitForTimeout(700);
  await clickCard(p2, '入库');
  await p2.waitForTimeout(400);
  const dCards = await readCards(p2);
  console.log('\n=== K 桌面端 ===');
  dCards.forEach(c => console.log(`  ${c.label}: bg=${c.bg}`));
  check('桌面：「入库」卡实心琥珀', find(dCards, '入库').bg === C.amber500, find(dCards, '入库').bg);
  await openModal(p2);
  await p2.waitForTimeout(600);
  const dChips = await readChips(p2);
  dChips.forEach(c => console.log(`  ${c.label}: bg=${c.bg}  color=${c.color}`));
  check('桌面：弹层 chip 色彩一致', find(dChips, '入库').bg === C.amber500 && find(dChips, REHEAT).color === C.orange600, `${find(dChips, '入库').bg} / ${find(dChips, REHEAT).color}`);
  await p2.screenshot({ path: `${DIR}/d1_modal.png` });

  const realErrs = errs.filter(e => !/favicon|net::ERR_|service-worker|Failed to load resource|points:|jsonbin|ERR_/i.test(e));
  check('无 JS 运行时错误', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log('\n===== 汇总 =====');
  console.log(`总计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  failed.forEach(f => console.log('  - ' + f.n + (f.d ? '  (' + f.d + ')' : '')));
  fs.writeFileSync(`${DIR}/result.txt`, results.map(r => `${r.pass ? 'PASS' : 'FAIL'}\t${r.n}\t${r.d || ''}`).join('\n'));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

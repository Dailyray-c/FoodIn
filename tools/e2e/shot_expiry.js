// v2.37.0 过期提醒重构：分组顺序（即将过期 → 已过期）/ 已过期按过期时长短→长 /
//   即将过期内部顺序不变 / 逐项折叠与恢复 / 折叠持久化 / 折叠自动失效 / 字号三档 / 无 JS 错误
// 产物：_shots_expiry/*.png + _shots_expiry/result.txt
// ❗本套件仅覆盖「过期提醒弹窗」区域；改动别处无需跑它（见 docs/E2E测试手册.md §5 影响映射）
const { chromium } = require('playwright');
const fs = require('fs');

const DIR = '_shots_expiry';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
const URL = 'http://127.0.0.1:8777/index.html';

const results = [];
const check = (n, pass, d) => {
  results.push({ n, pass, d: d === undefined ? '' : String(d) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '  — ' + d : ''}`);
};

function d(offset) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + offset);
  const p = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

// 种子：即将过期 3（2/3/6 天）+ 已过期 3（-1/-10/-40）+ 新鲜 1
const SEED = (fontScale, overrides) => {
  const prods = [
    { id: 'e3', name: '奶酪 200g', quantity: 1, location: '冰箱', category: '乳品蛋类', expiryDate: d(6), shelfLife: '7天' },
    { id: 'e1', name: '酸奶 风味发酵乳', quantity: 2, location: '冰箱', category: '乳品蛋类', expiryDate: d(2), shelfLife: '7天' },
    { id: 'e2', name: '培根 原切', quantity: 1, location: '冰箱', category: '冷冻食品', expiryDate: d(3), shelfLife: '7天' },
    { id: 'x3', name: '三文鱼 刺身', quantity: 1, location: '冰箱', category: '冷冻食品', expiryDate: d(-40), shelfLife: '7天' },
    { id: 'x1', name: '牛奶 全脂', quantity: 1, location: '冰箱', category: '乳品蛋类', expiryDate: d(-1), shelfLife: '7天' },
    { id: 'x2', name: '火腿 切片', quantity: 1, location: '冰箱', category: '冷冻食品', expiryDate: d(-10), shelfLife: '7天' },
    { id: 'f1', name: '鸡蛋 30枚', quantity: 1, location: '冰箱', category: '乳品蛋类', expiryDate: d(30), shelfLife: '30天' },
  ].map(p => (overrides && overrides[p.id] ? Object.assign({}, p, overrides[p.id]) : p));
  return `(() => {
    // ❗addInitScript 每次导航（含 reload）都会重跑：用 flag 只种一次，
    //    否则第 6/7 场景里「改数据后 reload」会被种子覆盖回原值（测试假失败）。
    if (localStorage.getItem('__e2e_expiry_seeded')) return;
    localStorage.setItem('__e2e_expiry_seeded', '1');
    localStorage.setItem('food_inventory_products', ${JSON.stringify(JSON.stringify(prods))});
    localStorage.setItem('food_inventory_records', '[]');
    localStorage.setItem('food_inventory_settings', JSON.stringify({
      tourDone: true, expiringDays: 7, fontScale: '${fontScale}',
      places: [{ name: '冰箱', zones: [], partitioned: false, layout: '', newZoneInput: '' }],
      categories: ['乳品蛋类', '冷冻食品'], builtinCategories: ['剩菜剩饭'], locations: [],
    }));
    sessionStorage.setItem('expiryReminderShown', 'true');
  })();`;
};

const snap = page => page.evaluate(() => {
  const box = document.querySelector('.fi-modal-box');
  if (!box) return { open: false };
  const heads = [...box.querySelectorAll('h4')].map(h => ({
    text: h.textContent.replace(/\s+/g, ' ').trim(),
    top: Math.round(h.getBoundingClientRect().top),
  }));
  const cards = [...box.querySelectorAll('.space-y-1\\.5 > div')].map(el => {
    const name = el.querySelector('.text-sm.font-medium');
    const day = el.querySelector('.leading-none');
    const chips = [...el.querySelectorAll('button')].map(b => ({
      text: b.textContent.trim(),
      h: Math.round(b.getBoundingClientRect().height * 10) / 10,
    }));
    return {
      name: name ? name.textContent.trim() : '',
      days: day ? day.textContent.trim() : '',
      chips,
      bg: getComputedStyle(el).backgroundColor,
      dayColor: day ? getComputedStyle(day).color : '',
    };
  });
  const foldRow = [...box.querySelectorAll('button')].find(b => b.textContent.includes('已折叠'));
  const bell = document.querySelector('button[title="过期提醒"]');
  return {
    open: true,
    heads,
    cards,
    foldedRowText: foldRow ? foldRow.textContent.replace(/\s+/g, ' ').trim() : '',
    hintShown: box.textContent.includes('折叠后不再提醒，可随时展开恢复'),
    hasUnfoldAll: [...box.querySelectorAll('button')].some(b => b.textContent.trim() === '全部恢复'),
    bellBadge: bell && bell.querySelector('span') ? bell.querySelector('span').textContent.trim() : '',
    stored: localStorage.getItem('food_inventory_expiry_folded') || '',
  };
});

const openReminder = async (page) => {
  await page.click('button[title="过期提醒"]');
  await page.waitForTimeout(380);
};

const clickChip = async (page, text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('.fi-modal-box button')].find(x => x.textContent.trim() === t);
  if (!b) throw new Error('找不到按钮: ' + t);
  b.click();
}, text);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ===== 1. 初始状态：分组顺序 + 两侧内部顺序 =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.addInitScript({ content: SEED('normal') });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await openReminder(page);
    const s = await snap(page);
    await page.screenshot({ path: `${DIR}/1_initial.png` });

    console.log('\n=== 1 初始状态 ===');
    check('弹窗已打开', s.open === true);
    check('分组数为 2', s.heads.length === 2, JSON.stringify(s.heads.map(h => h.text)));
    check('第一个分组是「即将过期」', /^即将过期 \(3\)$/.test(s.heads[0] ? s.heads[0].text : ''), s.heads[0] && s.heads[0].text);
    check('第二个分组是「已过期」', /^已过期 \(3\)$/.test(s.heads[1] ? s.heads[1].text : ''), s.heads[1] && s.heads[1].text);
    check('即将过期标题位于已过期之上', s.heads[0].top < s.heads[1].top, `${s.heads[0].top} < ${s.heads[1].top}`);

    const exp = s.cards.slice(0, 3).map(c => `${c.name}/${c.days}`).join(' | ');
    check('即将过期内部顺序＝到期日由近到远（酸奶2→培根3→奶酪6）',
      s.cards[0] && s.cards[0].name.indexOf('酸奶') === 0 && s.cards[0].days === '2' &&
      s.cards[1] && s.cards[1].name.indexOf('培根') === 0 && s.cards[1].days === '3' &&
      s.cards[2] && s.cards[2].name.indexOf('奶酪') === 0 && s.cards[2].days === '6', exp);

    const expd = s.cards.slice(3).map(c => `${c.name}/${c.days}`).join(' | ');
    check('已过期按过期时长短→长（牛奶1→火腿10→三文鱼40）',
      s.cards[3] && s.cards[3].name.indexOf('牛奶') === 0 && s.cards[3].days === '1' &&
      s.cards[4] && s.cards[4].name.indexOf('火腿') === 0 && s.cards[4].days === '10' &&
      s.cards[5] && s.cards[5].name.indexOf('三文鱼') === 0 && s.cards[5].days === '40', expd);

    check('每张即将过期卡都有「折叠」按钮',
      s.cards.slice(0, 3).every(c => c.chips.some(x => x.text === '折叠')),
      JSON.stringify(s.cards.slice(0, 3).map(c => c.chips.map(x => x.text))));
    check('已过期卡无操作按钮', s.cards.slice(3).every(c => c.chips.length === 0));
    check('初始无「已折叠」行', s.foldedRowText === '', s.foldedRowText);
    check('初始铃铛角标＝6', s.bellBadge === '6', s.bellBadge);
    check('新鲜商品未进入提醒', s.cards.length === 6, s.cards.length);

    // ===== 2. 折叠一条 =====
    console.log('\n=== 2 折叠第一条（酸奶） ===');
    await clickChip(page, '折叠');
    await page.waitForTimeout(350);
    const f = await snap(page);
    await page.screenshot({ path: `${DIR}/2_folded.png` });
    check('折叠后即将过期降为 (2)', /^即将过期 \(2\)$/.test(f.heads[0].text), f.heads[0].text);
    check('折叠后卡片总数 5', f.cards.length === 5, f.cards.length);
    check('折叠项不再出现在即将过期', !f.cards.slice(0, 2).some(c => c.name.indexOf('酸奶') === 0));
    check('出现「已折叠 1 项」入口', /已折叠 1 项/.test(f.foldedRowText), f.foldedRowText);
    check('收起态显示说明文案', f.hintShown === true);
    check('铃铛角标同步降为 5', f.bellBadge === '5', f.bellBadge);
    let stored = {};
    try { stored = JSON.parse(f.stored || '{}'); } catch (e) { stored = {}; }
    check('折叠状态已落盘且带到期日', stored.e1 === d(2), f.stored);

    // ===== 3. 展开已折叠 =====
    console.log('\n=== 3 展开已折叠 ===');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.fi-modal-box button')].find(x => x.textContent.includes('已折叠'));
      b.click();
    });
    await page.waitForTimeout(350);
    const e = await snap(page);
    await page.screenshot({ path: `${DIR}/3_expanded.png` });
    check('展开后卡片回到 6 张', e.cards.length === 6, e.cards.length);
    check('展开入口变为「收起」', /收起/.test(e.foldedRowText), e.foldedRowText);
    const foldedCard = e.cards.find(c => c.name.indexOf('酸奶') === 0);
    check('折叠卡为灰底且提供「恢复」', !!foldedCard && foldedCard.chips.some(x => x.text === '恢复') && foldedCard.bg !== 'rgb(255, 255, 255)', foldedCard && `${foldedCard.bg} / ${JSON.stringify(foldedCard.chips.map(x => x.text))}`);
    check('提供「全部恢复」入口', e.hasUnfoldAll === true);
    check('折叠卡数字弱化为灰色', !!foldedCard && foldedCard.dayColor === 'rgb(156, 163, 175)', foldedCard && foldedCard.dayColor);
    check('展开不改变即将过期计数（已折叠仍不计入）', /^即将过期 \(2\)$/.test(e.heads[0].text), e.heads[0].text);

    // ===== 4. 刷新后持久化 =====
    console.log('\n=== 4 刷新持久化 ===');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await openReminder(page);
    const r = await snap(page);
    await page.screenshot({ path: `${DIR}/4_reload.png` });
    check('刷新后仍保持折叠 (2)', /^即将过期 \(2\)$/.test(r.heads[0].text), r.heads[0].text);
    check('刷新后仍是 5 张卡', r.cards.length === 5, r.cards.length);

    // ===== 5. 单项恢复 =====
    console.log('\n=== 5 单项恢复 ===');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.fi-modal-box button')].find(x => x.textContent.includes('已折叠'));
      b.click();
    });
    await page.waitForTimeout(300);
    await clickChip(page, '恢复');
    await page.waitForTimeout(350);
    const rb = await snap(page);
    await page.screenshot({ path: `${DIR}/5_restored.png` });
    check('恢复后回到 (3)', /^即将过期 \(3\)$/.test(rb.heads[0].text), rb.heads[0].text);
    check('恢复后「已折叠」行消失', rb.foldedRowText === '', rb.foldedRowText);
    check('恢复后角标回到 6', rb.bellBadge === '6', rb.bellBadge);
    check('恢复后落盘清空', rb.stored === '' || rb.stored === '{}', rb.stored);

    await ctx.close();
  }

  // ===== 6. 折叠自动失效：改到期日 =====
  {
    console.log('\n=== 6 折叠自动失效（改期） ===');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript({ content: SEED('normal') });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await openReminder(page);
    await clickChip(page, '折叠');
    await page.waitForTimeout(300);
    // 把被折叠商品（酸奶）改到 5 天后：日期变了 → 折叠应失效并重新出现
    await page.evaluate((newDate) => {
      const ps = JSON.parse(localStorage.getItem('food_inventory_products'));
      ps.find(x => x.id === 'e1').expiryDate = newDate;
      localStorage.setItem('food_inventory_products', JSON.stringify(ps));
    }, d(5));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await openReminder(page);
    const s6 = await snap(page);
    await page.screenshot({ path: `${DIR}/6_refold_invalidated.png` });
    check('改期后折叠自动失效（重新出现在即将过期）',
      /^即将过期 \(3\)$/.test(s6.heads[0].text) && s6.cards.some(c => c.name.indexOf('酸奶') === 0),
      s6.heads[0].text);
    check('失效条目被清理出存储', !/e1/.test(s6.stored), s6.stored);
    await ctx.close();
  }

  // ===== 7. 折叠项熬成过期 → 自动落入已过期组 =====
  {
    console.log('\n=== 7 折叠项转为过期 ===');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript({ content: SEED('normal') });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await openReminder(page);
    await clickChip(page, '折叠');
    await page.waitForTimeout(300);
    // 把被折叠商品改成昨天到期：仍是同一日期字段比较 → 折叠条件「仍处于即将过期」不成立
    await page.evaluate((newDate) => {
      const ps = JSON.parse(localStorage.getItem('food_inventory_products'));
      ps.find(x => x.id === 'e1').expiryDate = newDate;
      localStorage.setItem('food_inventory_products', JSON.stringify(ps));
      const hold = JSON.parse(localStorage.getItem('food_inventory_expiry_folded') || '{}');
      hold.e1 = newDate;   // 假设日期同步了，仍应因「已过期」而失效
      localStorage.setItem('food_inventory_expiry_folded', JSON.stringify(hold));
    }, d(-1));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await openReminder(page);
    const s7 = await snap(page);
    await page.screenshot({ path: `${DIR}/7_expired_not_hidden.png` });
    const expiredHead = s7.heads.find(h => /已过期/.test(h.text));
    check('折叠项转为过期后不会被藏起来',
      !!expiredHead && /\(4\)/.test(expiredHead.text) && s7.cards.some(c => c.name.indexOf('酸奶') === 0),
      expiredHead && expiredHead.text);
    check('转为过期的条目已从折叠存储清理', !/e1/.test(s7.stored), s7.stored);
    await ctx.close();
  }

  // ===== 8. 全部折叠 → 全部恢复 =====
  {
    console.log('\n=== 8 全部折叠 / 全部恢复 ===');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript({ content: SEED('normal') });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await openReminder(page);
    for (let i = 0; i < 3; i++) {
      const has = await page.evaluate(() => [...document.querySelectorAll('.fi-modal-box button')].some(b => b.textContent.trim() === '折叠'));
      if (!has) break;
      await clickChip(page, '折叠');
      await page.waitForTimeout(220);
    }
    const all = await snap(page);
    await page.screenshot({ path: `${DIR}/8_all_folded.png` });
    check('全部折叠后即将过期分组整体消失', !all.heads.some(h => /即将过期/.test(h.text)), JSON.stringify(all.heads.map(h => h.text)));
    check('全部折叠后「已折叠 3 项」', /已折叠 3 项/.test(all.foldedRowText), all.foldedRowText);
    // 角标 = 未折叠即将过期 + 已过期 = 0 + 3；折叠只减「即将过期」那部分
    check('全部折叠后角标只余已过期的 3', all.bellBadge === '3', all.bellBadge);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.fi-modal-box button')].find(x => x.textContent.includes('已折叠'));
      b.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.fi-modal-box button')].find(x => x.textContent.trim() === '全部恢复');
      b.click();
    });
    await page.waitForTimeout(350);
    const back = await snap(page);
    await page.screenshot({ path: `${DIR}/9_all_restored.png` });
    check('全部恢复后回到 (3)', /^即将过期 \(3\)$/.test(back.heads[0].text), back.heads[0].text);
    check('全部恢复后存储清空', !back.stored || back.stored === '{}', back.stored);
    await ctx.close();
  }

  // ===== 9. 字号三档：折叠胶囊高度 =====
  {
    console.log('\n=== 9 字号三档（折叠胶囊几何） ===');
    const expect = { normal: 28, large: 30, xlarge: 31.5 };
    for (const fs of ['normal', 'large', 'xlarge']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.addInitScript({ content: SEED(fs) });
      await page.goto(URL, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
      await page.waitForTimeout(600);
      await openReminder(page);
      const s = await snap(page);
      await page.screenshot({ path: `${DIR}/fs_${fs}.png` });
      const chip = s.cards[0] && s.cards[0].chips.find(c => c.text === '折叠');
      const overflow = await page.evaluate(() => {
        const el = document.querySelector('.fi-modal-box');
        return el ? el.scrollWidth > el.clientWidth + 1 : false;
      });
      check(`${fs}：折叠胶囊高度＝${expect[fs]}px`, !!chip && Math.abs(chip.h - expect[fs]) <= 1, chip && chip.h);
      check(`${fs}：弹窗无横向溢出`, overflow === false);
      await ctx.close();
    }
  }

  // ===== 10. 桌面视口 =====
  {
    console.log('\n=== 10 桌面视口 ===');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript({ content: SEED('normal') });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await openReminder(page);
    const s = await snap(page);
    await page.screenshot({ path: `${DIR}/10_desktop.png` });
    check('桌面：两分组顺序一致', /即将过期/.test(s.heads[0].text) && /已过期/.test(s.heads[1].text), JSON.stringify(s.heads.map(h => h.text)));
    check('桌面：卡片数与手机一致（6）', s.cards.length === 6, s.cards.length);
    await ctx.close();
  }

  // ===== 11. 无 JS 运行时错误 =====
  console.log('\n=== 11 运行时错误 ===');
  const realErrs = errs.filter(e => !/favicon|net::ERR_|Failed to load resource|_paddle_models|points:|service-worker|jsonbin|ERR_/i.test(e));
  check('无 JS 运行时错误', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log('\n===== 汇总 =====');
  console.log(`总计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  failed.forEach(f => console.log('  - ' + f.n + (f.d ? '  (' + f.d + ')' : '')));
  fs.writeFileSync(`${DIR}/result.txt`, results.map(r => `${r.pass ? 'PASS' : 'FAIL'}\t${r.n}\t${r.d || ''}`).join('\n'));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

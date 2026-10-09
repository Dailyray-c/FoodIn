// v2.35.1 高级设置页「四张配置卡平铺」—— 截图 + 断言
// 重点：不再有二次点击（列表行 → 详情页），四张卡在本页直接可配置
const { chromium } = require('playwright');
const fs = require('fs');
const DIR = '_shots_2351';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

const URL = 'http://127.0.0.1:8777/index.html';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const killTour = async (p) => {
  await p.evaluate(() => { try { window.__foodin.endTour && window.__foodin.endTour(); } catch (e) {} });
  for (let i = 0; i < 6; i++) {
    const clicked = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '跳过');
      if (b) { b.click(); return true; }
      return false;
    });
    if (!clicked) break;
    await p.waitForTimeout(150);
  }
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    document.querySelectorAll('[class*="fi-tour"]').forEach(el => el.remove());
    [...document.querySelectorAll('div')].forEach(el => {
      if (el.textContent && el.textContent.includes('欢迎使用 FoodIn') && el.className.includes('fixed')) el.remove();
    });
  });
  await p.waitForTimeout(300);
};

const goPage = async (p, page, wait = 600) => {
  await p.evaluate((pg) => { window.__foodin.currentPage.value = pg; }, page);
  await p.waitForTimeout(wait);
};

// 点「高级设置」入口卡进二级页。openAdvancedSettings 不在 window.__foodin 白名单里，必须真实点击。
const openAdvanced = async (p) => {
  const ok = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => (x.textContent || '').includes('高级设置'));
    if (b) { b.click(); return true; }
    return false;
  });
  await p.waitForTimeout(700);
  return ok;
};

// 卡片标题 → 卡体里的关键控件文案，用来断言「卡体已在本页展开」
const CARDS = [
  { title: '云端数据同步',  color: 'indigo', bodyKey: 'REST URL',                     settingKey: 'cloudSyncEnabled' },   // v2.36.0：jsonbin → Upstash 后字段改为 REST URL / REST Token，旧值 'API Key (X-Master-Key)' 已不存在
  { title: '条码查询增强',  color: 'orange', bodyKey: 'API Key',                        settingKey: 'barcodeLookupEnabled' },
  { title: '名称清洗规则',  color: 'violet', bodyKey: '英文大小写',                     settingKey: 'nameCleanEnabled' },
  { title: '文字识别（小票 OCR）', color: 'green', bodyKey: '识别引擎',                 settingKey: 'ocrEnabled' },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
  await killTour(p);

  // ===== 1. 设置主页：入口卡在，四张原卡不在 =====
  await goPage(p, 'settings', 700);
  const home = await p.evaluate(() => {
    const cardTitles = [...document.querySelectorAll('div.text-sm, .fi-card-title')].map(e => (e.textContent || '').trim());
    return {
      hasEntry: cardTitles.includes('高级设置'),
      leaked: ['云端数据同步', '条码查询增强', '名称清洗规则', '文字识别（小票 OCR）'].filter(t => cardTitles.includes(t)),
    };
  });
  check('设置主页有「高级设置」入口卡', home.hasEntry);
  check('设置主页无配置卡泄漏', home.leaked.length === 0, JSON.stringify(home.leaked));
  await p.screenshot({ path: `${DIR}/m1_settings_home.png` });

  // ===== 2. 进高级设置页：四张卡平铺，无二次点击 =====
  check('点击入口卡可进入', await openAdvanced(p));
  check('进入 settingsAdvanced', (await p.evaluate(() => window.__foodin.currentPage.value)) === 'settingsAdvanced');

  const flat = await p.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    const cards = [...document.querySelectorAll('.fi-card')].filter(vis);
    return {
      cardCount: cards.length,
      titles: [...document.querySelectorAll('div.text-sm')].filter(vis).map(e => e.textContent.trim()),
      switches: [...document.querySelectorAll('input[type="checkbox"]')].filter(vis).length,
      topBar: (() => { const e = document.querySelector('.fi-hint.leading-tight'); return e ? e.textContent.trim() : ''; })(),
    };
  });
  check('本页平铺 4 张卡', flat.cardCount === 4, '实际 ' + flat.cardCount);
  check('四张卡标题齐全', CARDS.every(c => flat.titles.includes(c.title)), JSON.stringify(flat.titles.slice(0, 6)));
  check('手机顶栏页名 = 高级设置', flat.topBar === '高级设置', JSON.stringify(flat.topBar));
  console.log('       可见开关数 =', flat.switches);

  await p.screenshot({ path: `${DIR}/m2_flat_top.png` });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${DIR}/m3_flat_bottom.png` });
  await p.evaluate(() => window.scrollTo(0, 0));

  // ===== 3. 无二次点击：点卡片头不再跳页 =====
  const beforeClick = await p.evaluate(() => window.__foodin.currentPage.value);
  await p.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    const t = [...document.querySelectorAll('div.text-sm')].filter(vis).find(e => e.textContent.trim() === '云端数据同步');
    // 点标题文字（不是开关）
    if (t) t.click();
  });
  await p.waitForTimeout(500);
  check('点卡片标题不再跳转（无二次点击）',
    (await p.evaluate(() => window.__foodin.currentPage.value)) === beforeClick);

  // ===== 4. 每张卡：开关开 → 卡体在本页展开 =====
  for (const c of CARDS) {
    const setOn = await p.evaluate(async (key) => {
      window.__foodin.settings[key] = true;
      await new Promise(r => setTimeout(r, 600));
      return window.__foodin.settings[key];
    }, c.settingKey);
    await p.waitForTimeout(600);
    const bodyVisible = await p.evaluate((bk) => {
      // 找出包含该文案的最小可见容器
      const all = [...document.querySelectorAll('label, div')];
      const hit = all.find(e => (e.textContent || '').trim().startsWith(bk) && e.offsetParent !== null);
      return !!hit;
    }, c.bodyKey);
    check(`「${c.title}」开启后卡体在本页展开`, bodyVisible, `(${c.bodyKey})`);
  }

  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${DIR}/m4_all_expanded.png` });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${DIR}/m5_all_expanded_bottom.png` });

  // ===== 5. 开关切换仍写盘（走真实点击路径，不是直接改 reactive）=====
  const persist = await p.evaluate(async () => {
    const vis = el => !!(el && el.offsetParent !== null);
    // 找到「文字识别」卡上的开关（该卡头部唯一的 checkbox）
    const title = [...document.querySelectorAll('div.text-sm')].filter(vis).find(e => e.textContent.trim() === '文字识别（小票 OCR）');
    const card = title.closest('.fi-card');
    const cb = card.querySelector('input[type="checkbox"]');
    const before = cb.checked;
    cb.click();
    await new Promise(r => setTimeout(r, 700));
    return {
      before,
      after: cb.checked,
      stored: JSON.parse(localStorage.getItem('food_inventory_settings') || '{}').ocrEnabled,
    };
  });
  check('真实点击开关可切换', persist.before !== persist.after, `${persist.before} → ${persist.after}`);
  check('开关切换写盘正常', persist.stored === persist.after, `localStorage.ocrEnabled=${persist.stored}`);
  // 还原
  await p.evaluate(async () => {
    const vis = el => !!(el && el.offsetParent !== null);
    const title = [...document.querySelectorAll('div.text-sm')].filter(vis).find(e => e.textContent.trim() === '文字识别（小票 OCR）');
    const cb = title.closest('.fi-card').querySelector('input[type="checkbox"]');
    if (!cb.checked) cb.click();
    await new Promise(r => setTimeout(r, 600));
  });

  // ===== 6. 名称清洗「整理历史」弹窗仍可用 =====
  const modalOk = await p.evaluate(async () => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('整理历史名称'));
    if (!b) return 'button-missing';
    b.click();
    await new Promise(r => setTimeout(r, 700));
    const vis = [...document.querySelectorAll('h3')].filter(e => e.offsetParent !== null).map(e => e.textContent.trim());
    return vis.includes('整理历史名称');
  });
  check('「整理历史名称」弹窗仍可打开', modalOk === true, String(modalOk));
  await p.screenshot({ path: `${DIR}/m6_clean_modal.png` });
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '取消');
    if (b) b.click();
  });
  await p.waitForTimeout(400);

  // ===== 7. 返回设置 =====
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '设置' && x.querySelector('svg polyline'));
    if (b) b.click();
  });
  await p.waitForTimeout(500);
  check('返回按钮回到设置主页', (await p.evaluate(() => window.__foodin.currentPage.value)) === 'settings');

  // ===== 8. 简洁模式屏蔽（走真实开关；简洁模式开关在设置主页「简洁模式」卡上）=====
  // 标题文本用 includes 匹配（真值是「简洁模式」+ 副标题「大字号 · 只保留常用功能」同在一个 div 里）
  // 注意：简洁模式卡不是 .fi-card（用的是自定义卡片类），所以用「向上找最近的含 checkbox 的祖先」定位开关
  const clickSimpleToggle = async (page, want) => {
    return page.evaluate(async (w) => {
      const vis = el => !!(el && el.offsetParent !== null);
      const title = [...document.querySelectorAll('div.text-sm')].filter(vis)
        .find(e => (e.textContent || '').includes('简洁模式'));
      if (!title) return 'title-missing';
      let el = title.parentElement;
      let cb = null;
      for (let i = 0; i < 6 && el; i++) {
        const found = el.querySelector('input[type="checkbox"]');
        if (found) { cb = found; break; }
        el = el.parentElement;
      }
      if (!cb) return 'checkbox-missing';
      if (cb.checked !== w) { cb.click(); await new Promise(r => setTimeout(r, 800)); }
      return cb.checked;
    }, want);
  };

  // 8a. 简洁模式开启时，高级设置页整块被容器条件挡住（无白屏残卡）
  await goPage(p, 'settings', 600);
  const swOn = await clickSimpleToggle(p, true);
  check('真实开关可开启简洁模式', swOn === true, 'checked=' + swOn);
  await goPage(p, 'settingsAdvanced', 600);
  const advCards = await p.evaluate(() => [...document.querySelectorAll('.fi-card')].filter(e => e.offsetParent !== null).length);
  check('简洁模式下高级设置页无内容', advCards === 0, 'cards=' + advCards);

  // 8b. 简洁模式关闭后，高级设置页恢复
  await goPage(p, 'settings', 600);
  const swOff = await clickSimpleToggle(p, false);
  check('真实开关可关闭简洁模式', swOff === false, 'checked=' + swOff);
  await goPage(p, 'settingsAdvanced', 600);
  const advCardsBack = await p.evaluate(() => [...document.querySelectorAll('.fi-card')].filter(e => e.offsetParent !== null).length);
  check('关闭简洁模式后高级设置页恢复 4 张卡', advCardsBack === 4, 'cards=' + advCardsBack);


  // ===== 9. 桌面版 =====
  const dCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const d = await dCtx.newPage();
  await d.goto(URL, { waitUntil: 'load' });
  await d.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
  await killTour(d);
  await goPage(d, 'settings', 700);
  await d.screenshot({ path: `${DIR}/d1_settings_home.png` });
  await openAdvanced(d);
  await d.screenshot({ path: `${DIR}/d2_flat.png` });

  // 桌面双栏：成对比较 —— 卡片顺序为 [卡1, 卡2, 卡3, 卡4]，
  // 双栏下 卡1/卡2 同行、卡3/卡4 同行，因此应断言 top[0]===top[1] 且 top[2]===top[3]。
  const rowTop = await d.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    return [...document.querySelectorAll('.fi-card')].filter(vis).map(c => Math.round(c.getBoundingClientRect().top));
  });
  const pairsOk = rowTop.length === 4 && rowTop[0] === rowTop[1] && rowTop[2] === rowTop[3];
  check('桌面双栏同行卡片顶部齐平', pairsOk, JSON.stringify(rowTop));

  await d.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await d.waitForTimeout(400);
  await d.screenshot({ path: `${DIR}/d3_flat_bottom.png` });

  const realErrs = errs.filter(e => !/favicon|net::ERR_|service-worker|Failed to load resource|points:/i.test(e));
  check('无 JS 运行时错误', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log('\n===== 汇总 =====');
  console.log(`总计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  if (failed.length) failed.forEach(f => console.log('  - ' + f.name + (f.detail ? '  (' + f.detail + ')' : '')));
  fs.writeFileSync(`${DIR}/result.txt`, results.map(r => `${r.pass ? 'PASS' : 'FAIL'}\t${r.name}\t${r.detail || ''}`).join('\n'));
  console.log('截图:', DIR, fs.readdirSync(DIR).join(', '));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

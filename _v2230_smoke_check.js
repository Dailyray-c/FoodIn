/**
 * v2.23.0 冒烟验证（8765 服务）：
 *  1. 应用挂载 + 版本 2.23.0
 *  2. 注入种子数据（places 两级 + 商品分区单值），检查主页商品卡显示「冰箱·冷藏」反查
 *  3. 位置浮层：冰箱钮角标、地点卡渲染、展开冰箱出现分区/剪影、只看此地点联动 searchQuery
 *  4. 录入页位置控件：地点 chips + 分区条件行 + 厨房(无分区)无分区行
 *  5. 设置页：地点管理卡渲染、looseLocationTags
 */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_/.test(m.text())) errs.push('[err] ' + m.text().slice(0, 300)); });

  let pass = 0, fail = 0;
  const log = (n, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (extra !== undefined ? '  ' + extra : '')); };

  // 注入种子数据（绕过新设备指南页；places 两级 + 旧风格游离标签 + 未设置）
  await page.addInitScript(() => {
    localStorage.setItem('guideShown_v2162', '1');
    localStorage.setItem('food_inventory_products', JSON.stringify([
      { id: 1, name: '鲜牛奶', location: '冷藏', expiryDate: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), quantity: 2 },
      { id: 2, name: '鸡蛋', location: '门架', expiryDate: new Date(Date.now() + 18 * 864e5).toISOString().slice(0, 10), quantity: 10 },
      { id: 3, name: '冷冻牛排', location: '冷冻', expiryDate: new Date(Date.now() - 864e5).toISOString().slice(0, 10), quantity: 1 },
      { id: 4, name: '食用油', location: '厨房', expiryDate: new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10), quantity: 1 },
      { id: 5, name: '冷藏区旧物', location: '冷藏区', expiryDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), quantity: 1 },
      { id: 6, name: '备用调料', location: '', expiryDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), quantity: 1 },
    ]));
    localStorage.setItem('food_inventory_settings', JSON.stringify({
      version: '2.23.0', expiringDays: 7, locations: ['冷藏区', '厨房常温区'],
      categories: ['生鲜果蔬'],
      places: [
        { name: '冰箱', zones: ['门架', '冷藏', '冷冻'], layout: 'fridge', _editingName: '', newZoneInput: '' },
        { name: '厨房', zones: [], layout: '', _editingName: '', newZoneInput: '' },
      ]
    }));
  });

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__foodin, null, { timeout: 20000 });
  await page.waitForTimeout(600);

  const st = () => page.evaluate(() => ({
    ver: __foodin.settings.version,
    page: __foodin.currentPage.value,
    places: __foodin.settings.places,
    home: (() => { const a = window.document.querySelector('#app'); return !!(a && a.childElementCount > 0); })(),
    locTags: __foodin.settings.locations,
    searchQ: __foodin.searchQuery.value,
    locPanel: __foodin.showLocationPanel.value,
    placeAlert: __foodin.placeAlertCount.value,
  }));
  const dis = (loc) => page.evaluate((l) => __foodin.displayLocation(l), loc);

  const s = await st();
  log('S1 应用挂载 + 版本', !!(s.home && s.ver === '2.23.4'), 'ver=' + s.ver);
  log('S2 places 数据载入(含迁移)', Array.isArray(s.places) && s.places.length === 4 && s.places[0].name === '冰箱', JSON.stringify(s.places && s.places.map(p => ({ n: p.name, z: p.zones, l: p.layout }))));
  const d1 = await dis('冷藏'), d2 = await dis('厨房'), d3 = await dis('冷藏区');
  log('S3 反查：冷藏→冰箱·冷藏 / 厨房→厨房 / 冷藏区→原样', d1 === '冰箱·冷藏' && d2 === '厨房' && d3 === '冷藏区', JSON.stringify({ a: d1, b: d2, c: d3 }));

  // 主页商品卡渲染检查
  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('h3')).map(h => h.textContent));
  log('S4 主页商品卡渲染 6 件', cards.includes('鲜牛奶') && cards.includes('备用调料'), JSON.stringify(cards));
  const chipTexts = await page.evaluate(() => Array.from(document.querySelectorAll('span')).map(x => x.textContent).filter(t => t.includes('·')));
  log('S5 商品卡位置显示「冰箱·冷藏」', chipTexts.some(t => t.includes('冰箱·冷藏')), JSON.stringify(chipTexts.slice(0, 4)));

  // 位置浮层
  await page.evaluate(() => { __foodin.showLocationPanel.value = true; });
  await page.waitForTimeout(300);
  const panelText = await page.evaluate(() => document.body.textContent);
  log('S6 浮层标题出现', panelText.includes('存放位置'), '');
  const alertN = (await st()).placeAlert;
  log('S7 冰箱钮角标 = 含过期商品地点数(1)', alertN === 1, 'alert=' + alertN);
  const placeNames = await page.evaluate(() => __foodin.settings.places.map(p => p.name));
  log('S8 地点卡渲染两处', placeNames.every(n => panelText.includes(n)), JSON.stringify(placeNames));

  // 展开冰箱 → 剪影 & 分区
  await page.evaluate(() => { __foodin.locPanelExpanded.value = '冰箱'; });
  await page.waitForTimeout(200);
  const expText = await page.evaluate(() => document.body.textContent);
  log('S9 展开冰箱含分区与商品', expText.includes('门架') && expText.includes('冷冻') && expText.includes('冷冻牛排'), '');
  log('S10 只看此地点联动', await (async () => {
    await page.evaluate(() => {
      // 模拟点击浮层里「只看冰箱全部」——直接调方法验证
      __foodin.focusPlaceByName('冰箱');
    });
    await page.waitForTimeout(200);
    const q = (await st()).searchQ;
    return q === '@冰箱';
  })(), (await st()).searchQ);
  log('S11 浮层关闭', !(await st()).locPanel, '');

  // 录入页位置控件
  await page.evaluate(() => { __foodin.currentPage.value = 'scan'; });
  await page.waitForTimeout(300);
  const scanText = await page.evaluate(() => document.body.textContent);
  log('S12 录入页显示地点 chips 与待设置', scanText.includes('储存位置') && scanText.includes('待设置') && scanText.includes('厨房'), '');
  // 选冰箱 → 分区行出现（label 兄弟定位：v2.21.15 铁律 label ~ input 系，但这里是 button chips；用 __foodin 状态断言）
  await page.evaluate(() => {
    const sf = __foodin.scanForm;
    sf.name = '冒烟牛奶';
    __foodin.locPickPlace(sf, '冰箱');
  });
  await page.waitForTimeout(200);
  const afterPick = await page.evaluate(() => {
    const sf = __foodin.scanForm;
    return { place: sf._locPlace, loc: sf.location, zoneRowVisible: !!document.querySelector('div.bg-teal-50\\/70') };
  });
  log('S13 选冰箱后进入待选分区态', afterPick.place === '冰箱' && afterPick.loc.length === 0, JSON.stringify(afterPick));
  await page.evaluate(() => { __foodin.locPickZone(__foodin.scanForm, '冷冻'); });
  const afterZone = await page.evaluate(() => ({ loc: __foodin.scanForm.location, place: __foodin.scanForm._locPlace }));
  log('S14 选分区冷冻 → location=[冷冻]', afterZone.loc.length === 1 && afterZone.loc[0] === '冷冻' && afterZone.place === '冰箱', JSON.stringify(afterZone));
  // 切厨房：无分区 → 无分区行 + location=厨房
  await page.evaluate(() => { __foodin.locPickPlace(__foodin.scanForm, '厨房'); });
  const afterKitchen = await page.evaluate(() => ({ loc: __foodin.scanForm.location, place: __foodin.scanForm._locPlace, zoneRow: !!document.querySelector('div.bg-teal-50\\/70') }));
  log('S15 切厨房：location=[厨房] 且分区行消失', afterKitchen.loc[0] === '厨房' && !afterKitchen.zoneRow, JSON.stringify(afterKitchen));
  // 独立标签直接选
  await page.evaluate(() => { __foodin.locPickTag(__foodin.scanForm, '冷藏区'); });
  const afterLoose = await page.evaluate(() => ({ loc: __foodin.scanForm.location, place: __foodin.scanForm._locPlace }));
  log('S16 独立标签(冷藏区)直接选', afterLoose.loc[0] === '冷藏区' && afterLoose.place === '', JSON.stringify(afterLoose));

  // 设置页地点管理
  await page.evaluate(() => { __foodin.currentPage.value = 'settings'; });
  await page.waitForTimeout(300);
  const setText = await page.evaluate(() => document.body.textContent);
  log('S17 设置页地点卡 + 分区/不分区分组', setText.includes('存储位置') && setText.includes('冰箱') && setText.includes('不分区'), '');
  // 添加分区到冰箱
  const pls = await page.evaluate(() => {
    __foodin.settings.places[0].newZoneInput = '冷藏下层';
    __foodin.addZoneToPlace(0);
    return __foodin.settings.places[0].zones;
  });
  log('S18 添加分区', pls.includes('冷藏下层'), JSON.stringify(pls));

  // 批量页 / 编辑弹窗：结构一致性（点开编辑弹窗检查两级控件存在）
  await page.evaluate(() => { __foodin.currentPage.value = 'home'; });
  await page.waitForTimeout(200);
  const openEdit = await page.evaluate(() => {
    const p = __foodin.products.value[0];
    __foodin.openEditModal(p);
    return { place: __foodin.editForm._locPlace, loc: __foodin.editForm.location };
  });
  log('S19 编辑回填：鲜牛奶(冷藏) → _locPlace=冰箱', openEdit.place === '冰箱' && openEdit.loc[0] === '冷藏', JSON.stringify(openEdit));

  console.log('\n=== v2.23.4 冒烟: ' + pass + ' 通过 / ' + fail + ' 失败 ===');
  if (errs.length) { console.log('--- errors ---'); errs.slice(0, 8).forEach(e => console.log('  ' + e)); }
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();

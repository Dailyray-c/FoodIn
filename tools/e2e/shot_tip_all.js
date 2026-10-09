// v2.34.7：10 类改造后的提示弹窗全量截图验证（手机 ×3 档字号 + 桌面）
// ❗只用 window.__foodin 里真实暴露的 API；未暴露的走真实 UI 点击
const { chromium } = require('playwright');

const URL = 'http://localhost:8777/index.html';
const OUT = '_shots_tip';

const CASES = [
  { id: 'p0_1_ocr',       title: 'P0-1 文字识别已关闭',       kind: 'js', fn: 'tipOcrOff' },
  { id: 'p0_2_addplace',  title: 'P0-2 已新增地点',           kind: 'js', fn: 'addPlaceJs' },
  { id: 'p0_3_batchdate', title: 'P0-3 批量日期有误',         kind: 'js', fn: 'batchDate' },
  { id: 'p0_4_undo',      title: 'P0-4 撤销入库已移出库存',   kind: 'js', fn: 'undoIn' },
  { id: 'p1_5_proxy',     title: 'P1-5 代理探测失败',         kind: 'js', fn: 'proxyFail' },
  { id: 'p1_6_cfgcode',   title: 'P1-6 不是有效配置码',       kind: 'js', fn: 'cfgCode' },
  { id: 'p1_7_shelflife', title: 'P1-7 保质期格式不正确',     kind: 'js', fn: 'shelfLife' },
  { id: 'p1_8_delplace',  title: 'P1-8 已删除地点',           kind: 'js', fn: 'delPlace' },
  { id: 'p2_9_rename',    title: 'P2-9 重命名地点并列商品',   kind: 'js', fn: 'renamePlace' },
  { id: 'p2_10_rmcat',    title: 'P2-10 移除分类级联',        kind: 'js', fn: 'removeCat' },
];

// 各用例在页面上下文中的触发体
const BODY = {
  tipOcrOff: `__foodin.tipOcrOff();`,

  // newPlaceInput 现已暴露
  // v2.34.8 起「新增地点」弹窗只在**第一个地点**时弹出（之后改走 toast）。
  // 本用例验的就是这个首次引导弹窗 → 先清空预置地点，否则 places 非空永远不弹（历史 FAIL 根因）。
  addPlaceJs: `
    __foodin.settings.places.length = 0;
    __foodin.newPlaceInput.value = '阳台置物架';
    __foodin.addPlace();
  `,

  // 批量录入：构造一条生产日期在未来的条目，丢进 batchItems 后整体提交
  batchDate: `
    const f = __foodin;
    f.batchItems.value = [{
      id: 'b1', name: '酸奶', quantity: 1, productionDate: '2027-12-31',
      shelfLife: '30天', shelfLifeUnit: 'day', expiryDate: '',
      location: [], category: [], barcode: ''
    }];
    await new Promise(r => setTimeout(r, 200));
    f.submitAllBatch();
  `,

  // 撤销入库：confirmRevoke(记录) 置入待撤销态 → executeRevoke() 无参执行
  // ❗revokePreview 是 computed ref（对象），不是函数，不能调用
  undoIn: `
    const f = __foodin;
    const r = f.records.value.find(x => x.type === 'in');
    if (!r) throw new Error('无入库记录');
    f.confirmRevoke(r);
    await new Promise(res => setTimeout(res, 200));
    f.executeRevoke();
  `,

  // 代理探测：地址指向不可达域名 → 走 catch 分支（也是弹窗化覆盖的路径）
  proxyFail: `
    const f = __foodin;
    if (typeof f.verifyBaiduProxy !== 'function') throw new Error('verifyBaiduProxy 未暴露');
    await f.verifyBaiduProxy();
  `,

  cfgCode: `__foodin.handleConfigCodeText('https://not-a-config-code');`,

  // 编辑保存校验：openEditModal + editForm 均已暴露，saveEdit 未暴露 → 点真实「保存」按钮
  shelfLife: `
    const f = __foodin;
    f.openEditModal(f.products.value.find(p => p.id === 'p1'));
    await new Promise(r => setTimeout(r, 350));
    f.editForm.shelfLife = '@@bad@@';
    f.editForm._slTouched = true;
    await new Promise(r => setTimeout(r, 100));
    const btns = Array.from(document.querySelectorAll('button'));
    const save = btns.find(b => /^保存/.test((b.textContent || '').trim()));
    if (!save) throw new Error('找不到保存按钮');
    save.click();
  `,

  delPlace: `__foodin.removePlace(0);`,

  renamePlace: `
    const f = __foodin;
    f.startRename('place', 0);
    f.renaming.value = '大冰箱';
    f.confirmRename();
  `,

  removeCat: `__foodin.removeCategory(__foodin.settings.categories.indexOf('乳制品'));`,
};

// 全部走 JS 触发（所需 API 均已暴露），无需 UI 兜底
const UI_RENAME_PLACE = null;
const UI_REMOVE_CAT = null;

(async () => {
  const browser = await chromium.launch();
  const summary = [];

  const matrix = [
    { tag: 'mobile',  width: 375,  height: 760, tiers: ['normal', 'xlarge'] },
    { tag: 'desktop', width: 1280, height: 900, tiers: ['normal'] },
  ];

  for (const vp of matrix) {
    for (const fs of vp.tiers) {
      for (const c of CASES) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push('pageerror: ' + e));
        page.on('console', m => {
          const t = m.text();
          if (m.type() === 'error' && !/404|_paddle_models|Failed to load resource/.test(t)) errs.push('console: ' + t);
        });

        await page.addInitScript((args) => {
          const [f] = args;
          const prods = [{ id: 'p1', name: '牛奶', quantity: 1, location: '冰箱', category: '乳制品',
            productionDate: '2026-09-01', expiryDate: '2026-12-31', shelfLife: '120天' }];
          ['酸奶', '黄油', '奶酪', '淡奶油', '鸡蛋', '培根', '火腿', '鸡胸', '牛排', '三文鱼'].forEach((n, i) => {
            prods.push({ id: 'p' + (i + 2), name: n, quantity: i + 1, location: '冰箱', category: '乳制品',
              productionDate: '2026-09-01', expiryDate: '2026-12-31', shelfLife: '120天' });
          });
          localStorage.setItem('food_inventory_products', JSON.stringify(prods));
          localStorage.setItem('food_inventory_records', JSON.stringify([
            { id: 'r1', productId: 'p1', productName: '牛奶', type: 'in', quantity: 1,
              date: '2026-09-10', time: '10:00', location: '冰箱', category: '乳制品' },
          ]));
          localStorage.setItem('food_inventory_settings', JSON.stringify({
            fontScale: f, tourDone: true, ocrEnabled: false,
            places: [
              { name: '冰箱', zones: [], partitioned: false, layout: '', newZoneInput: '' },
              { name: '餐边柜', zones: [], partitioned: false, layout: '', newZoneInput: '' },
            ],
            categories: ['乳制品', '零食'], builtinCategories: ['其他'],
            expiringDays: 7, ocrProxyUrl: 'https://foodin-proxy-does-not-exist.invalid',
          }));
          sessionStorage.setItem('expiryReminderShown', 'true');
        }, [fs]);

        await page.goto(URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(700);

        let triggerErr = null;
        try {
          await page.evaluate(`(async () => { ${BODY[c.fn]} })()`);
        } catch (e) { triggerErr = String(e).split('\n')[0]; }
        await page.waitForTimeout(700);

        const info = await page.evaluate(() => {
          const el = document.querySelector('.fi-tip-box');
          if (!el) return { shown: false };
          const r = el.getBoundingClientRect();
          return {
            shown: true,
            title: (el.querySelector('.fi-tip-title') || {}).textContent || '',
            pointCount: el.querySelectorAll('.fi-tip-point').length,
            w: Math.round(r.width), h: Math.round(r.height),
            left: Math.round(r.left), right: Math.round(r.right),
            overflowX: r.left < -1 || r.right > window.innerWidth + 1,
            clippedY: r.height > window.innerHeight,
          };
        });

        await page.screenshot({ path: `${OUT}/${vp.tag}_${fs}_${c.id}.png` });
        summary.push({ vp: vp.tag, fs, id: c.id, triggerErr, ...info, errs });
        await ctx.close();
      }
    }
  }

  await browser.close();

  let fail = 0;
  for (const s of summary) {
    const ok = s.shown && !s.overflowX && !s.clippedY && !s.triggerErr && s.errs.length === 0;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.vp}/${s.fs} ${s.id}` +
      (s.shown ? `  「${s.title}」 ${s.w}x${s.h} 要点${s.pointCount}` : '  ✗未出现弹窗') +
      (s.overflowX ? '  ✗横向溢出' : '') + (s.clippedY ? '  ✗纵向超出' : '') +
      (s.triggerErr ? `  ✗${s.triggerErr}` : '') +
      (s.errs.length ? `  ✗${s.errs.join(' | ')}` : ''));
  }
  console.log(`\n合计 ${summary.length - fail}/${summary.length} 通过`);
  process.exit(fail ? 1 : 0);
})();

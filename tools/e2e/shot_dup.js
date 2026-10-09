// v2.36.0 修复验证：重复 id 商品下「改名 / 删除」必须作用于用户点的那一张卡
const { chromium } = require('playwright');
const fs = require('fs');
const DIR = '_shots_dup';
const URL = 'http://localhost:8777/index.html';

const results = [];
const check = (n, pass, d) => { results.push({ n, pass, d }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const mk = (id, name, qty) => Object.assign({
  id, name, quantity: qty, category: ['饮料'], location: ['餐边柜', '左侧'],
  expiryDate: '2026-09-16', productionDate: '2026-09-15', shelfLife: '1天',
  barcode: '', unitPrice: 0, netContent: '', brand: '', spec: '', manufacturer: '',
  imageUrl: '', note: '', reason: ''
});

const killTour = async (p) => {
  await p.waitForTimeout(2800);
  for (let i = 0; i < 8; i++) {
    await p.evaluate(() => { try { window.__foodin.endTour && window.__foodin.endTour(); } catch (e) {} });
    const c = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '跳过'); if (b) { b.click(); return true; } return false; });
    if (!c) break;
    await p.waitForTimeout(200);
  }
  await p.waitForTimeout(400);
};

const clickBtn = (p, text, nth = 0) => p.evaluate(([t, n]) => {
  const vis = el => !!(el && el.offsetParent !== null);
  const bs = [...document.querySelectorAll('button')].filter(b => vis(b) && (b.textContent || '').trim() === t);
  if (bs[n]) { bs[n].click(); return true; }
  return false;
}, [text, nth]);

const setInput = (p, labelText, val) => p.evaluate(([lb, v]) => {
  const vis = el => !!(el && el.offsetParent !== null);
  const inp = [...document.querySelectorAll('input')].filter(vis).find(i => {
    const L = i.closest('div') && i.closest('div').querySelector('label');
    return L && (L.textContent || '').trim() === lb;
  });
  if (!inp) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, v);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}, [labelText, val]);

const mem = (p) => p.evaluate(() => window.__foodin.products.value.map(x => ({ id: x.id, name: x.name, qty: x.quantity })));

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch();

  // ===== 用例 1：同 id 两条正常商品 → 点第二张卡改名，必须只改第二张 =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errs = [];
    await ctx.addInitScript((ps) => {
      localStorage.setItem('food_inventory_settings', JSON.stringify({ tourDone: true, simpleMode: false, fontScale: 'normal', cloudSyncEnabled: false }));
      localStorage.setItem('food_inventory_records', '[]');
      localStorage.setItem('food_inventory_products', JSON.stringify(ps));
    }, [mk('dup1', 'AAA第一张', 2), mk('dup1', 'BBB第二张', 5)]);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e).slice(0, 150)));
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await killTour(p);

    console.log('\n=== 1 同 id 两条商品：启动后应已自愈（id 被拆开） ===');
    let m = await mem(p);
    console.log('  ' + JSON.stringify(m));
    check('两条商品都还在（未被误删）', m.length === 2, String(m.length));
    check('★ id 已被拆开（不再重复）', m.length === 2 && m[0].id !== m[1].id, m.map(x => x.id).join(' / '));
    check('名称未被改动', m.map(x => x.name).sort().join(',') === 'AAA第一张,BBB第二张', m.map(x => x.name).join(','));

    // 点第二张卡的「编辑」→ 改名 → 保存
    await clickBtn(p, '编辑', 1);
    await p.waitForTimeout(600);
    const formName = await p.evaluate(() => {
      const vis = el => !!(el && el.offsetParent !== null);
      const i = [...document.querySelectorAll('input')].filter(vis).find(x => {
        const L = x.closest('div') && x.closest('div').querySelector('label');
        return L && (L.textContent || '').trim() === '商品名称';
      });
      return i ? i.value : '(无)';
    });
    check('点第 2 张卡「编辑」→ 弹窗显示的是第 2 张的名称', formName === 'BBB第二张', formName);
    await setInput(p, '商品名称', 'RENAMED第二张');
    await clickBtn(p, '保存');
    await p.waitForTimeout(800);
    m = await mem(p);
    console.log('  改名后: ' + JSON.stringify(m));
    check('★ 只有第 2 张改名成功（第 1 张保持原样）',
      m.filter(x => x.name === 'RENAMED第二张').length === 1 && m.filter(x => x.name === 'AAA第一张').length === 1,
      m.map(x => x.name).join(' / '));

    // ===== 删除第 2 张，第 1 张必须留下 =====
    await clickBtn(p, '编辑', 1);
    await p.waitForTimeout(600);
    await clickBtn(p, '删除商品');
    await p.waitForTimeout(700);
    const confirmTxt = await p.evaluate(() => {
      const vis = el => !!(el && el.offsetParent !== null);
      const boxes = [...document.querySelectorAll('.fi-modal-box')].filter(vis);
      return boxes.length ? (boxes[0].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    });
    console.log('  删除确认弹窗: ' + confirmTxt);
    check('删除确认弹窗指向第 2 张（不是另一条）', /RENAMED第二张/.test(confirmTxt), confirmTxt.slice(0, 60));
    await clickBtn(p, '直接删除（移除商品及入库记录，不产生记录）');
    await p.waitForTimeout(900);
    m = await mem(p);
    console.log('  删除后: ' + JSON.stringify(m));
    check('★ 只删掉第 2 张，第 1 张完好', m.length === 1 && m[0].name === 'AAA第一张', JSON.stringify(m));
    await p.screenshot({ path: `${DIR}/dup1_after_delete.png` });

    const real = errs.filter(e => !/favicon|net::ERR_|service-worker|Failed to load resource|jsonbin/i.test(e));
    check('无 JS 运行时错误', real.length === 0, real.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ===== 用例 2：同 id（一正常一脏）→ 脏的被清、正常的留下 =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((ps) => {
      localStorage.setItem('food_inventory_settings', JSON.stringify({ tourDone: true, simpleMode: false, fontScale: 'normal', cloudSyncEnabled: false }));
      localStorage.setItem('food_inventory_records', '[]');
      localStorage.setItem('food_inventory_products', JSON.stringify(ps));
    }, [mk('dup2', '正常商品', 2), mk('dup2', '', 0)]);
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await killTour(p);
    console.log('\n=== 2 同 id（一正常一脏） ===');
    const m = await mem(p);
    console.log('  ' + JSON.stringify(m));
    check('脏的那条被清、正常的留下', m.length === 1 && m[0].name === '正常商品', JSON.stringify(m));
    await ctx.close();
  }

  // ===== 用例 3：正常商品删除（回归，确保没改坏） =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((ps) => {
      localStorage.setItem('food_inventory_settings', JSON.stringify({ tourDone: true, simpleMode: false, fontScale: 'normal', cloudSyncEnabled: false }));
      localStorage.setItem('food_inventory_records', '[]');
      localStorage.setItem('food_inventory_products', JSON.stringify(ps));
    }, [mk('ok1', '普通商品', 3)]);
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await killTour(p);
    console.log('\n=== 3 普通商品删除（回归） ===');
    await clickBtn(p, '编辑');
    await p.waitForTimeout(600);
    await clickBtn(p, '删除商品');
    await p.waitForTimeout(700);
    await clickBtn(p, '直接删除（移除商品及入库记录，不产生记录）');
    await p.waitForTimeout(900);
    const m = await mem(p);
    check('普通商品可正常删除', m.length === 0, JSON.stringify(m));
    await ctx.close();
  }

  // ===== 用例 4：确定性 id —— 两个独立 context 拆出的新 id 必须一致（v2.36.3） =====
  {
    const runOnce = async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addInitScript((ps) => {
        sessionStorage.setItem('expiryReminderShown', 'true');
        localStorage.setItem('food_inventory_settings', JSON.stringify({ tourDone: true, simpleMode: false, fontScale: 'normal', cloudSyncEnabled: false }));
        localStorage.setItem('food_inventory_records', '[]');
        localStorage.setItem('food_inventory_products', JSON.stringify(ps));
      }, [mk('det1', 'AAA第一张', 2), mk('det1', 'BBB第二张', 5)]);
      const p = await ctx.newPage();
      await p.goto(URL, { waitUntil: 'load' });
      await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
      await p.waitForTimeout(1200);
      const ids = await p.evaluate(() => window.__foodin.products.value.map(x => x.id).sort());
      await ctx.close();
      return ids.join(',');
    };
    console.log('\n=== 4 确定性 id（跨 context 一致） ===');
    const a = await runOnce(), b = await runOnce();
    console.log('  A: ' + a + '   B: ' + b);
    check('★ 两个独立 context 拆出的 id 完全一致（幂等/多设备可收敛）', a === b && a.split(',').length === 2, a + ' vs ' + b);
  }

  // ===== 用例 5：同名重复 → 流水**不得**被迁移（修 D2） =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((ps) => {
      sessionStorage.setItem('expiryReminderShown', 'true');
      localStorage.setItem('food_inventory_settings', JSON.stringify({ tourDone: true, simpleMode: false, fontScale: 'normal', cloudSyncEnabled: false }));
      localStorage.setItem('food_inventory_products', JSON.stringify(ps));
      localStorage.setItem('food_inventory_records', JSON.stringify([
        { id: 'r1', type: 'eat', productId: 'same2', productName: '同名商品', quantity: -1, detail: '正常吃完 -1', unitPrice: 0, netContent: '', reason: '', createdAt: new Date().toISOString() },
      ]));
    }, [mk('same2', '同名商品', 2), mk('same2', '同名商品', 5)]);
    const p = await ctx.newPage();
    const logs = [];
    p.on('console', m => logs.push(m.text()));
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await p.waitForTimeout(1500);
    console.log('\n=== 5 同名重复：流水归属不可判定 → 保守不迁移 ===');
    const st = await p.evaluate(() => ({
      ids: window.__foodin.products.value.map(x => x.id),
      recPid: window.__foodin.records.value[0] && window.__foodin.records.value[0].productId,
      recLen: window.__foodin.records.value.length,
    }));
    console.log('  ' + JSON.stringify(st));
    check('id 仍被拆开', st.ids.length === 2 && st.ids[0] !== st.ids[1], st.ids.join('/'));
    check('★ 同名时流水保持原归属（未被搬走）', st.recPid === 'same2', String(st.recPid));
    check('流水未丢失', st.recLen === 1, String(st.recLen));
    check('控制台如实报告了无法判定', logs.some(x => /保持原归属/.test(x)), logs.filter(x=>/保持原归属/.test(x))[0] || '(无)');
    await ctx.close();
  }

  // ===== 用例 6：幂等 —— 再次自愈应为 0 拆分 =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((ps) => {
      sessionStorage.setItem('expiryReminderShown', 'true');
      localStorage.setItem('food_inventory_settings', JSON.stringify({ tourDone: true, simpleMode: false, fontScale: 'normal', cloudSyncEnabled: false }));
      localStorage.setItem('food_inventory_records', '[]');
      localStorage.setItem('food_inventory_products', JSON.stringify(ps));
    }, [mk('idem1', '甲', 2), mk('idem1', '乙', 5)]);
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await p.waitForTimeout(1200);
    const again = await p.evaluate(() => window.__foodin.dedupeProductIds());
    console.log('\n=== 6 幂等 ===');
    console.log('  再次自愈: ' + JSON.stringify(again));
    check('★ 已拆开后再次自愈为 0（幂等，不新增商品）', again && again.split === 0 && again.groups === 0, JSON.stringify(again));
    const n = await p.evaluate(() => window.__foodin.products.value.length);
    check('商品数仍为 2', n === 2, String(n));
    await ctx.close();
  }

  // ===== 用例 7：备份导入同 id 撞车 → 两条都保留（P0，旧实现静默覆盖） =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((ps) => {
      sessionStorage.setItem('expiryReminderShown', 'true');
      localStorage.setItem('food_inventory_settings', JSON.stringify({ tourDone: true, simpleMode: false, fontScale: 'normal', cloudSyncEnabled: false }));
      localStorage.setItem('food_inventory_records', '[]');
      localStorage.setItem('food_inventory_products', JSON.stringify(ps));
    }, [mk('imp1', '本地商品', 2)]);
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await p.waitForTimeout(1200);
    console.log('\n=== 7 导入同 id 撞车（不同商品）→ 两条都保留 ===');
    // 导入入口是「数据整理」折叠区里的隐藏 file input（未展开不在 DOM）→ 直接调用拆出来的应用函数
    await p.evaluate((payload) => { window.__foodin.applyImportPayload(payload); }, {
      products: [mk('imp1', '导入商品', 7)],
      records: [{ id: 'ir1', type: 'in', productId: 'imp1', productName: '导入商品', quantity: 7, detail: '入库 +7', unitPrice: 0, netContent: '', reason: '', createdAt: new Date().toISOString() }],
    });
    await p.waitForTimeout(1200);
    const st = await p.evaluate(() => ({
      names: window.__foodin.products.value.map(x => x.name).sort(),
      ids: window.__foodin.products.value.map(x => x.id).sort(),
      localId: (window.__foodin.products.value.find(x => x.name === '本地商品') || {}).id,
      impId: (window.__foodin.products.value.find(x => x.name === '导入商品') || {}).id,
      recPid: (window.__foodin.records.value[0] || {}).productId,
    }));
    console.log('  ' + JSON.stringify(st));
    check('★ 本地与导入的两条商品都在（旧实现会丢掉本地那条）', st.names.join(',') === '导入商品,本地商品', st.names.join(','));
    check('两条 id 互异', st.ids.length === 2 && st.ids[0] !== st.ids[1], st.ids.join('/'));
    check('本地商品保留了原 id', st.localId === 'imp1', String(st.localId));
    check('导入件拿到了新 id', !!st.impId && st.impId !== 'imp1' && st.impId !== undefined, String(st.impId));
    check('★ 导入的流水已改挂到导入件的新 id', st.recPid === st.impId, String(st.recPid) + ' vs ' + String(st.impId));
    await ctx.close();
  }

  // ===== 用例 8：自愈结果进入事件流（云同步已开启时必须能上云） =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // 让云端推送失败（500）→ 待推事件保留，便于断言
    await ctx.route('**/upstash.io/**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }));
    await ctx.addInitScript((ps) => {
      sessionStorage.setItem('expiryReminderShown', 'true');
      localStorage.setItem('food_inventory_records', '[]');
      localStorage.setItem('food_inventory_products', JSON.stringify(ps));
      localStorage.setItem('food_inventory_settings', JSON.stringify({
        tourDone: true, simpleMode: false, fontScale: 'normal',
        cloudSyncEnabled: true, cloudApiKey: 'tok', cloudBinId: 'https://demo.upstash.io', cloudLastSync: '',
      }));
    }, [mk('ev1', '事件甲', 2), mk('ev1', '事件乙', 3)]);
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
    await p.waitForTimeout(2500);
    console.log('\n=== 8 自愈结果进入事件流（可上云） ===');
    const st = await p.evaluate(() => {
      const raw = localStorage.getItem('food_inventory_sync_v2');
      const o = raw ? JSON.parse(raw) : {};
      const ids = window.__foodin.products.value.map(x => x.id);
      const newId = ids.find(x => x !== 'ev1');
      const evts = (o.pendingEvents || []).filter(e => e.kind === 'product');
      return {
        ids, newId,
        upsertNew: evts.some(e => e.op === 'upsert' && e.key === newId),
        delOld: evts.some(e => e.op === 'delete' && e.key === 'ev1'),
        productEvtCount: evts.length,
      };
    });
    console.log('  ' + JSON.stringify(st));
    check('拆分确实发生', st.ids.length === 2 && !!st.newId, st.ids.join('/'));
    check('★ 新 id 生成了 upsert 事件（结果可上云）', st.upsertNew === true, String(st.upsertNew));
    check('★ 未对保留条的原 id 生成 delete', st.delOld === false, String(st.delOld));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log('\n===== 汇总 =====');
  console.log(`总计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  failed.forEach(f => console.log('  - ' + f.n + (f.d ? '  (' + f.d + ')' : '')));
  fs.writeFileSync(`${DIR}/result.txt`, results.map(r => `${r.pass ? 'PASS' : 'FAIL'}\t${r.n}\t${r.d || ''}`).join('\n'));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

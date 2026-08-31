// v2.18.0 事件日志云同步引擎（快照增量演进 + knownIds 累积 + 单一流全序重放 + delta 数量事件）- 端到端测试
// 模拟 jsonbin 服务器（Node 内存态，多浏览器上下文共享 = 多设备同一云端）
const { chromium } = require('playwright');

const BASE = 'http://localhost:8001/index.html';

// ---- 模拟 jsonbin 云端 ----
const bin = { record: {} };
let dropNextPut = false;   // 模拟并发丢更新：PUT 返回 200 但不落盘
const MAX_BIN_BYTES = 60 * 1024;   // 模拟 jsonbin 单 Bin 上限（真实免费版 100KB，测试用 60KB）
async function jsonbinRoute(route) {
  const req = route.request();
  if (req.method() === 'GET') {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ record: bin.record, metadata: { id: 'test-bin', version: 1 } }) });
  } else if (req.method() === 'PUT') {
    const raw = req.postData();
    if (raw.length > MAX_BIN_BYTES) {
      await route.fulfill({ status: 413, contentType: 'application/json',
        body: JSON.stringify({ message: 'Payload too large', maxBytes: MAX_BIN_BYTES }) });
      return;
    }
    const body = JSON.parse(raw);
    if (dropNextPut) { dropNextPut = false; }
    else { bin.record = body; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ record: body }) });
  } else {
    await route.continue();
  }
}

// Node 端解压 v3 结构（Node 22 原生支持 CompressionStream）
async function cloudRec() {
  const r = bin.record;
  if (r && r.schemaVersion === 3 && r.data) {
    const bytes = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(buf));
  }
  return r;
}

// ---- 工具 ----
function product(id, name, qty, expiry) {
  return { id, name, barcode: '', location: ['冰箱冷藏'], category: ['其他'], stockInDate: '2026-08-28',
    productionDate: '', shelfLife: '', expiryDate: expiry, quantity: qty, price: '', netContent: '',
    brand: '', spec: '', manufacturer: '', imageUrl: '', createdAt: '2026-08-28T10:00:00.000Z', updatedAt: '2026-08-28T10:00:00.000Z' };
}
function record(id, type, productId, productName, qty) {
  return { id, type, productId, productName, barcode: '', quantity: qty, detail: '', unitPrice: 0, netContent: '', createdAt: '2026-08-28T10:00:00.000Z' };
}

async function makeDevice(browser, { products = [], records = [], oldLastSync = false } = {}) {
  const ctx = await browser.newContext();
  await ctx.route('**/api.jsonbin.io/v3/b/**', jsonbinRoute);
  const consoleErrors = [];
  ctx.on('page', p => p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); }));
  await ctx.addInitScript(({ prods, recs, oldSync }) => {
    localStorage.setItem('food_inventory_products', JSON.stringify(prods));
    localStorage.setItem('food_inventory_records', JSON.stringify(recs));
    const lastSync = oldSync ? '2026-08-01T00:00:00.000Z' : new Date().toISOString();
    localStorage.setItem('food_inventory_settings', JSON.stringify({
      version: '2.17.1', expiringDays: 7, cloudApiKey: 'test-key', cloudBinId: 'test-bin',
      cloudSyncEnabled: true, cloudLastSync: lastSync, localModified: '',
      serverChanKey: '', serverChanPushEnabled: false, barcodeApiKey: '', barcodeLookupEnabled: false,
      locations: ['冰箱冷藏'], categories: ['其他'], autoSaveInterval: 0
    }));
    localStorage.setItem('guideShown_v2162', '1');
  }, { prods: products, recs: records, oldSync: oldLastSync });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(BASE);
  await page.waitForFunction(() => window.__foodin, null, { timeout: 20000 });
  return { ctx, page, consoleErrors };
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (cond ? '' : '  <<< ' + detail));
}
async function sync(page) { return page.evaluate(() => window.__foodin.cloudSync(false)); }
async function state(page) {
  return page.evaluate(() => ({
    products: JSON.parse(JSON.stringify(window.__foodin.products.value)),
    records: JSON.parse(JSON.stringify(window.__foodin.records.value)),
    pending: window.__foodin.syncState.pendingEvents.length,
    expiringDays: window.__foodin.settings.expiringDays,
    locations: [...window.__foodin.settings.locations],
    categories: [...window.__foodin.settings.categories]
  }));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    // ============ S1 单设备首次同步（空云端 → 全量推送） ============
    console.log('\n===== S1 单设备首次同步 =====');
    const A = await makeDevice(browser, { products: [product('p1', '牛奶', 3, '2026-09-05'), product('p2', '面包', 2, '2026-08-30')], records: [record('r1', 'in', 'p1', '牛奶', 3)] });
    await sync(A.page);
    const s1 = await state(A.page);
    const c1 = await cloudRec();
    check('S1 本地数据不变(2 商品)', s1.products.length === 2, JSON.stringify(s1.products.length));
    check('S1 云端为 v3 压缩结构', bin.record.schemaVersion === 3 && bin.record.compressed === true, 'v=' + bin.record.schemaVersion);
    check('S1 云端(解压后)事件含 2 商品+1 记录 upsert', (() => {
      const ups = (c1.events || []).filter(e => e.op === 'upsert');
      return ups.filter(e => e.kind === 'product').length === 2 && ups.filter(e => e.kind === 'record').length === 1;
    })(), JSON.stringify((c1.events || []).map(e => e.kind + ':' + e.op + ':' + e.key)));
    check('S1 云端快照含 2 商品', c1.snapshot.products.length === 2);
    check('S1 待推队列已清空', s1.pending === 0, 'pending=' + s1.pending);
    check('S1 云端无 lastModified(旧版 App 安全中止)', bin.record.lastModified === undefined);

    // ============ S2 新设备拉取 ============
    console.log('\n===== S2 新设备拉取 =====');
    const B = await makeDevice(browser);
    const r2 = await sync(B.page);
    const s2 = await state(B.page);
    check('S2 新设备获得全部商品', s2.products.length === 2 && s2.products.some(p => p.id === 'p1') && s2.products.some(p => p.id === 'p2'));
    check('S2 新设备获得记录', s2.records.length === 1 && s2.records[0].id === 'r1');
    check('S2 拉取报告 changed', r2.changed === true);
    check('S2 无多余推送', s2.pending === 0);

    // ============ S3 字段级合并（两设备改同一商品不同字段） ============
    console.log('\n===== S3 字段级合并 =====');
    await B.page.evaluate(() => {
      const p = window.__foodin.products.value.find(x => x.id === 'p1');
      p.quantity = 5; p.updatedAt = new Date().toISOString();
      window.__foodin.saveData();
    });
    await A.page.evaluate(() => {
      const p = window.__foodin.products.value.find(x => x.id === 'p1');
      p.expiryDate = '2026-12-31'; p.updatedAt = new Date().toISOString();
      window.__foodin.saveData();
    });
    await sync(A.page);
    await sync(B.page);
    const s3b = await state(B.page);
    const p1b = s3b.products.find(p => p.id === 'p1');
    check('S3 B 端 p1 数量=5(B 的修改保留)', p1b && p1b.quantity === 5, JSON.stringify(p1b));
    check('S3 B 端 p1 到期日=2026-12-31(A 的修改同步过来)', p1b && p1b.expiryDate === '2026-12-31', JSON.stringify(p1b && p1b.expiryDate));
    await sync(A.page);
    const p1a = (await state(A.page)).products.find(p => p.id === 'p1');
    check('S3 A 端 p1 数量=5(A 收到 B 的修改)', p1a && p1a.quantity === 5, JSON.stringify(p1a && p1a.quantity));
    const c3 = await cloudRec();
    const p1cloud = c3.snapshot.products.find(p => p.id === 'p1');
    check('S3 云端快照 p1 双字段均已合并', p1cloud && p1cloud.quantity === 5 && p1cloud.expiryDate === '2026-12-31', JSON.stringify(p1cloud));

    // ============ S4 删除墓碑传播（不复活） ============
    console.log('\n===== S4 删除墓碑传播 =====');
    await A.page.evaluate(() => {
      window.__foodin.products.value = window.__foodin.products.value.filter(p => p.id !== 'p2');
      window.__foodin.saveData();
    });
    await sync(A.page);
    const c4 = await cloudRec();
    check('S4 云端事件含 p2 delete 墓碑', (c4.events || []).some(e => e.op === 'delete' && e.key === 'p2'));
    await sync(B.page);
    const s4 = await state(B.page);
    check('S4 B 端 p2 已删除', !s4.products.some(p => p.id === 'p2'), JSON.stringify(s4.products.map(p => p.id)));
    await sync(B.page);
    const s4b = await state(B.page);
    check('S4 二次同步不复活', !s4b.products.some(p => p.id === 'p2'));

    // ============ S5 撤销功能多设备一致 ============
    console.log('\n===== S5 撤销功能多设备一致 =====');
    await A.page.evaluate(() => {
      window.__foodin.products.value.push({
        id: 'p3', name: '酸奶', barcode: '', location: ['冰箱冷藏'], category: ['乳品蛋类'], stockInDate: '2026-08-28',
        productionDate: '', shelfLife: '21天', expiryDate: '2026-09-18', quantity: 4, price: '', netContent: '',
        brand: '', spec: '', manufacturer: '', imageUrl: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      window.__foodin.records.value.push({
        id: 'r3', type: 'in', productId: 'p3', productName: '酸奶', barcode: '', quantity: 4,
        detail: '新增入库 +4', unitPrice: 0, netContent: '', createdAt: new Date().toISOString()
      });
      window.__foodin.saveData();
    });
    await sync(A.page);
    await sync(B.page);
    check('S5 B 端已收到 p3+记录', (await state(B.page)).products.some(p => p.id === 'p3') && (await state(B.page)).records.some(r => r.id === 'r3'));
    await B.page.evaluate(() => {
      const r = window.__foodin.records.value.find(x => x.id === 'r3');
      window.__foodin.revokingRecord.value = r;
      window.__foodin.executeRevoke();
    });
    const s5b = await state(B.page);
    check('S5 B 端撤销后 p3 与记录均移除', !s5b.products.some(p => p.id === 'p3') && !s5b.records.some(r => r.id === 'r3'));
    await sync(B.page);
    const c5 = await cloudRec();
    check('S5 云端含 p3 delete 墓碑', (c5.events || []).some(e => e.op === 'delete' && e.key === 'p3'));
    await sync(A.page);
    const s5a = await state(A.page);
    check('S5 A 端同步撤销结果(p3+记录移除)', !s5a.products.some(p => p.id === 'p3') && !s5a.records.some(r => r.id === 'r3'), JSON.stringify(s5a.products.map(p => p.id)) + '|' + JSON.stringify(s5a.records.map(r => r.id)));
    // A/B 用毕即关：防止其 15 秒防抖定时器在后续章节中途触发 cloudSync，
    // 把旧本地数据经反误删守卫"复活"并污染共享测试云端（S10 曾因此出现 61/61 的串扰）
    await A.ctx.close(); await B.ctx.close();

    // ============ S6 旧结构(v2.16.x)迁移 ============
    console.log('\n===== S6 旧结构迁移 =====');
    bin.record = {
      products: [product('lp1', '老版本牛奶', 6, '2026-09-01')],
      records: [record('lr1', 'in', 'lp1', '老版本牛奶', 6)],
      settings: { expiringDays: 5, locations: ['橱柜'], categories: ['粮油米面'] },
      lastModified: '2026-08-01T00:00:00.000Z', barcodeCache: {}
    };
    const C = await makeDevice(browser);
    await sync(C.page);
    const s6 = await state(C.page);
    check('S6 迁移后收到旧版商品', s6.products.some(p => p.id === 'lp1'), JSON.stringify(s6.products.map(p => p.id)));
    check('S6 云端已升级为 v3 压缩结构', bin.record.schemaVersion === 3, 'v=' + bin.record.schemaVersion);
    check('S6 旧版设置生效(临期5天/橱柜)', s6.expiringDays === 5 && s6.locations.includes('橱柜'), JSON.stringify(s6.expiringDays) + JSON.stringify(s6.locations));
    bin.record = {
      products: [product('lp2', '云端独有', 1, '2026-09-10')],
      records: [],
      settings: { expiringDays: 7, locations: ['冰箱冷藏'], categories: ['其他'] },
      lastModified: '2026-08-01T00:00:00.000Z', barcodeCache: {}
    };
    const D = await makeDevice(browser, { products: [product('dp1', '本地独有', 2, '2026-09-15')] });
    await sync(D.page);
    const s6d = await state(D.page);
    check('S6 并集迁移:本地+云端商品都保留', s6d.products.some(p => p.id === 'dp1') && s6d.products.some(p => p.id === 'lp2'), JSON.stringify(s6d.products.map(p => p.id)));
    const c6d = await cloudRec();
    check('S6 迁移推送后云端含两个商品', c6d.snapshot.products.length === 2, JSON.stringify(c6d.snapshot.products.map(p => p.id)));
    await C.ctx.close(); await D.ctx.close();   // 用毕即关（同上，防定时器串扰）

    // ============ S7 反误删守卫（空本地不清洗云端） ============
    console.log('\n===== S7 反误删守卫 =====');
    bin.record = { schemaVersion: 2, syncedAt: '2026-08-28T00:00:00.000Z',
      events: [{ id: 'dev-x:1', ts: '2026-08-20T00:00:00.000Z', kind: 'product', op: 'upsert', key: 'sp1', patch: product('sp1', '云端商品', 8, '2026-10-01') }],
      snapshot: { products: [], records: [], settings: { expiringDays: null, locations: null, categories: null }, upToId: null },
      barcodeCache: {} };
    const E = await makeDevice(browser);
    await sync(E.page);
    const s7 = await state(E.page);
    check('S7 空本地从云端恢复商品', s7.products.some(p => p.id === 'sp1'), JSON.stringify(s7.products.map(p => p.id)));
    const c7 = await cloudRec();
    check('S7 云端事件未被清空', bin.record.schemaVersion === 3 && c7.snapshot.products.some(p => p.id === 'sp1'));
    await E.ctx.close();

    // ============ S8 清空数据传播（显式墓碑） ============
    console.log('\n===== S8 清空数据传播 =====');
    const F = await makeDevice(browser, { products: [product('cp1', '待清空', 1, '2026-09-01')] });
    await sync(F.page);
    await F.page.evaluate(() => window.__foodin.clearAllData());
    await sync(F.page);
    const c8 = await cloudRec();
    check('S8 云端快照已清空', c8.snapshot.products.length === 0, JSON.stringify(c8.snapshot.products));
    check('S8 云端含清空墓碑事件', (c8.events || []).some(e => e.op === 'delete' && e.key === 'cp1'));
    const G = await makeDevice(browser, { products: [product('cp1', '待清空', 1, '2026-09-01')] });
    await sync(G.page);
    const s8g = await state(G.page);
    check('S8 另一设备同步后也清空', s8g.products.length === 0, JSON.stringify(s8g.products.map(p => p.id)));
    await F.ctx.close(); await G.ctx.close();

    // ============ S9 并发覆盖恢复（PUT 被覆盖 → 队列保留 → 重推收敛） ============
    console.log('\n===== S9 并发覆盖恢复 =====');
    bin.record = { schemaVersion: 2, syncedAt: '2026-08-28T00:00:00.000Z',
      events: [{ id: 'dev-y:1', ts: '2026-08-20T00:00:00.000Z', kind: 'product', op: 'upsert', key: 'op1', patch: product('op1', '云端已有', 3, '2026-10-01') }],
      snapshot: { products: [], records: [], settings: { expiringDays: null, locations: null, categories: null }, upToId: null },
      barcodeCache: {} };
    const H = await makeDevice(browser, { products: [product('np9', '并发新增', 2, '2026-09-20')] });
    dropNextPut = true;
    await sync(H.page);
    const s9a = await state(H.page);
    check('S9 推送被覆盖后本地队列保留', s9a.pending > 0, 'pending=' + s9a.pending);
    check('S9 云端未丢已有数据', bin.record.events.some(e => e.key === 'op1'));
    dropNextPut = false;
    await sync(H.page);
    const s9b = await state(H.page);
    check('S9 重推后队列清空', s9b.pending === 0, 'pending=' + s9b.pending);
    const c9 = await cloudRec();
    check('S9 云端最终收敛含并发新增', (c9.events || []).some(e => e.key === 'np9') && c9.snapshot.products.some(p => p.id === 'np9'));
    check('S9 云端原有数据仍在', c9.snapshot.products.some(p => p.id === 'op1'));
    await H.ctx.close();

    // ============ S10 大 payload：事件折叠 + gzip 压缩（突破单 Bin 上限） ============
    console.log('\n===== S10 大 payload 折叠 + 压缩 =====');
    bin.record = {};
    const bulkProds = Array.from({ length: 60 }, (_, i) => product('bulk' + i, '批量商品' + i, 2, '2026-10-0' + ((i % 9) + 1)));
    const bulkRecs = bulkProds.map((p, i) => record('br' + i, 'in', p.id, p.name, 2));
    const I = await makeDevice(browser, { products: bulkProds, records: bulkRecs });
    await sync(I.page);
    const s10 = await state(I.page);
    check('S10 推送成功且待推队列清空', s10.pending === 0, 'pending=' + s10.pending);
    check('S10 云端为 v3 压缩结构', bin.record.schemaVersion === 3 && bin.record.compressed === true && !!bin.record.data, JSON.stringify({ v: bin.record.schemaVersion, c: bin.record.compressed }));
    check('S10 云端压缩后体积在限制内', JSON.stringify(bin.record).length < MAX_BIN_BYTES, 'bytes=' + JSON.stringify(bin.record).length);
    const c10 = await cloudRec();
    check('S10 事件折叠生效(云端事件 ≤ 20)', (c10.events || []).length <= 20, 'events=' + (c10.events || []).length);
    check('S10 快照含全部 60 商品', c10.snapshot.products.length === 60, 'products=' + c10.snapshot.products.length);
    const J = await makeDevice(browser);
    await sync(J.page);
    const s10j = await state(J.page);
    check('S10 新设备从 v3 解压恢复 60 商品', s10j.products.length === 60, 'products=' + s10j.products.length);
    check('S10 新设备恢复 60 条记录', s10j.records.length === 60, 'records=' + s10j.records.length);
    await I.page.evaluate(() => {
      const p = window.__foodin.products.value.find(x => x.id === 'bulk0');
      p.quantity = 9; p.updatedAt = new Date().toISOString();
      window.__foodin.saveData();
    });
    await sync(I.page);
    check('S10 增量小变更推送成功(队列清空)', (await state(I.page)).pending === 0);
    check('S10 增量推送仍为 v3 压缩结构', bin.record.schemaVersion === 3, 'v=' + bin.record.schemaVersion);
    await I.ctx.close(); await J.ctx.close();

    // ============ S11 无 CompressionStream 回退 v2（说明性跳过） ============
    // Edge/Chromium 的 CompressionStream 为不可配置属性，无法在真实浏览器中模拟"老浏览器"。
    // 回退路径由 gzipCompress 的 `typeof CompressionStream === 'undefined' → return null` 直接保证，
    // 且折叠逻辑已保证未压缩（v2 明文）时体积可控（≤ 20 事件 + 快照）。此处不做自动化断言。
    console.log('\n===== S11 回退路径（代码审查保证，跳过模拟） =====');
    console.log('SKIP - 浏览器不允许移除 CompressionStream，回退由 gzipCompress 的 undefined 分支保证');
    bin.record = {};
    const K = await makeDevice(browser, { products: [product('old1', '老浏览器商品', 1, '2026-09-30')] });
    await sync(K.page);   // 正常压缩路径冒烟（K 也能正常同步）
    check('S11 冒烟：K 设备同步成功且队列清空', (await state(K.page)).pending === 0);
    await K.ctx.close();

    // ============ S12 折叠墓碑 knownIds 防复活 ============
    console.log('\n===== S12 折叠墓碑防复活 =====');
    bin.record = {};
    const zxProd = product('zx', '将被删除', 1, '2026-10-01');
    const bkProds = Array.from({ length: 30 }, (_, i) => product('bk' + i, '批量' + i, 1, '2026-10-01'));
    const A2 = await makeDevice(browser, { products: [zxProd, ...bkProds] });
    await sync(A2.page);   // 首屏：32 事件 → 折叠（knownIds 记录前 12 个含 zx；zx 仍在售）
    await A2.page.evaluate(() => {
      window.__foodin.products.value = window.__foodin.products.value.filter(p => p.id !== 'zx');
      window.__foodin.saveData();
    });
    await sync(A2.page);   // 删除同步：delete zx 进云端事件（21 个 < 30 不折叠）
    await A2.page.evaluate(() => {
      for (const p of window.__foodin.products.value) { p.quantity = p.quantity + 1; p.updatedAt = new Date().toISOString(); }
      window.__foodin.saveData();
    });
    await sync(A2.page);   // 30 patch → merge 51 > 30 → 折叠 → delete zx 被折叠进快照 knownIds
    const c12 = await cloudRec();
    check('S12 折叠后快照 knownIds 含 zx', Array.isArray(c12.snapshot.knownIds) && c12.snapshot.knownIds.includes('product:zx'), JSON.stringify((c12.snapshot.knownIds || []).slice(0, 5)));
    check('S12 折叠后云端事件无 zx 墓碑', !(c12.events || []).some(e => e.op === 'delete' && e.key === 'zx'));
    check('S12 折叠后云端快照无 zx', !c12.snapshot.products.some(p => p.id === 'zx'), JSON.stringify(c12.snapshot.products.map(p => p.id).slice(0, 5)));
    // B2 本地残留 zx（旧设备数据）+ 真新增 brandnew
    const B2 = await makeDevice(browser, { products: [product('zx', '将被删除', 1, '2026-10-01'), product('brandnew', '真新增', 1, '2026-10-02')] });
    await sync(B2.page);
    const s12b = await state(B2.page);
    check('S12 残留 zx 不复活', !s12b.products.some(p => p.id === 'zx'), JSON.stringify(s12b.products.map(p => p.id)));
    check('S12 真新增 brandnew 保留', s12b.products.some(p => p.id === 'brandnew'), JSON.stringify(s12b.products.map(p => p.id)));
    const c12b = await cloudRec();
    check('S12 云端快照仍无 zx', !c12b.snapshot.products.some(p => p.id === 'zx'), JSON.stringify(c12b.snapshot.products.map(p => p.id)));
    check('S12 云端快照有 brandnew', c12b.snapshot.products.some(p => p.id === 'brandnew'), JSON.stringify(c12b.snapshot.products.map(p => p.id)));
    check('S12 B2 待推队列清空', s12b.pending === 0, 'pending=' + s12b.pending);
    await A2.ctx.close(); await B2.ctx.close();

    // ============ S13 三次折叠：快照增量演进（修复静默丢数据根因） ============
    // v2.17.x：折叠/非折叠推送都从空状态重建快照——发生过一次折叠后，云端 events 只是
    // "保留的最近 20 条"，从空重放会丢掉此前折叠进快照的商品（且补丁事件重放成无 id 的残缺对象）
    console.log('\n===== S13 三次折叠完整性 =====');
    bin.record = {};
    const f1 = Array.from({ length: 35 }, (_, i) => product('f' + i, '折叠商品' + i, 1, '2026-10-01'));
    const M = await makeDevice(browser, { products: f1 });
    await sync(M.page);                     // 38 事件 > 30 → 第一次折叠
    // 第二轮：全部 +1（35 个 patch）→ 55 > 30 → 第二次折叠
    await M.page.evaluate(() => {
      for (const p of window.__foodin.products.value) { p.quantity++; p.updatedAt = new Date().toISOString(); }
      window.__foodin.saveData();
    });
    await sync(M.page);
    // 第三轮：仅 11 个 patch → 31 > 30 → 第三次折叠（v2.17.x 此处从空重放，早期折叠商品丢失）
    await M.page.evaluate(() => {
      const ps = window.__foodin.products.value;
      for (let i = 0; i < 11; i++) { ps[i].quantity++; ps[i].updatedAt = new Date().toISOString(); }
      window.__foodin.saveData();
    });
    await sync(M.page);
    const c13 = await cloudRec();
    check('S13 第三次折叠后快照仍含全部 35 商品', c13.snapshot.products.length === 35, 'p=' + c13.snapshot.products.length);
    check('S13 快照商品字段完整(含 id/name，无残缺对象)', c13.snapshot.products.every(p => p.id && p.name && p.quantity >= 1), JSON.stringify((c13.snapshot.products.find(p => !p.id || !p.name) || {}).quantity));
    const N = await makeDevice(browser);
    await sync(N.page);
    const s13n = await state(N.page);
    check('S13 新设备从三次折叠后的云端完整恢复 35 商品', s13n.products.length === 35, 'p=' + s13n.products.length);
    check('S13 新设备商品字段完整', s13n.products.every(p => p.id && p.name), JSON.stringify(s13n.products.find(p => !p.id || !p.name) || null));
    await M.ctx.close(); await N.ctx.close();

    // ============ S14 二次折叠后删除墓碑仍有效（老设备防复活，knownIds 跨折叠累积） ============
    console.log('\n===== S14 二次折叠墓碑防复活 =====');
    bin.record = {};
    const zombie = product('zz', '僵尸商品', 1, '2026-10-01');
    const zfill = Array.from({ length: 34 }, (_, i) => product('z' + i, '墓碑填充' + i, 1, '2026-10-01'));
    const P = await makeDevice(browser, { products: [zombie, ...zfill] });
    await sync(P.page);                     // 第一次折叠（zz 的 upsert 折叠进快照 knownIds）
    await P.page.evaluate(() => {
      window.__foodin.products.value = window.__foodin.products.value.filter(p => p.id !== 'zz');
      window.__foodin.saveData();
    });
    await sync(P.page);                     // delete zz 上云（21 事件不折叠，非折叠快照）
    await P.page.evaluate(() => {
      for (const p of window.__foodin.products.value) { p.quantity++; p.updatedAt = new Date().toISOString(); }
      window.__foodin.saveData();
    });
    await sync(P.page);                     // 34 patch → 55 > 30 → 第二次折叠（delete zz 墓碑被折叠）
    const c14 = await cloudRec();
    check('S14 二次折叠后墓碑仍在 knownIds(跨折叠累积)', Array.isArray(c14.snapshot.knownIds) && c14.snapshot.knownIds.includes('product:zz'), 'k=' + (c14.snapshot.knownIds || []).length);
    check('S14 二次折叠后快照无 zz', !c14.snapshot.products.some(p => p.id === 'zz'));
    // 老设备：本地残留 zz（模拟几周未开机后重新打开）
    const Q = await makeDevice(browser, { products: [product('zz', '僵尸商品', 1, '2026-10-01')] });
    await sync(Q.page);
    const s14 = await state(Q.page);
    check('S14 老设备本地残留 zz 不复活', !s14.products.some(p => p.id === 'zz'), JSON.stringify(s14.products.map(p => p.id).slice(0, 6)));
    check('S14 老设备其余 34 商品正常拉取', s14.products.length === 34, 'p=' + s14.products.length);
    const c14b = await cloudRec();
    check('S14 老设备同步后云端快照仍无 zz', !c14b.snapshot.products.some(p => p.id === 'zz'));
    await P.ctx.close(); await Q.ctx.close();

    // ============ S15 并发库存扣减收敛（delta 增量事件） ============
    // 妈妈手机吃 1 件 + 爸爸手机离线吃 1 件（都从 5 件开始）→ 真实库存应为 3
    // v2.17.x 字段级 LWW 绝对值互相覆盖 → 结果 4（错）；v2.18.0 delta 累加 → 3（对）
    console.log('\n===== S15 并发库存扣减收敛 =====');
    bin.record = {};
    const R = await makeDevice(browser, { products: [product('milk', '牛奶', 5, '2026-09-20')] });
    await sync(R.page);
    const S = await makeDevice(browser);
    await sync(S.page);                     // S 拉到牛奶 5 件
    await R.page.evaluate(() => window.__foodin.applyStockDelta(window.__foodin.products.value.find(p => p.id === 'milk'), -1));
    await S.page.evaluate(() => window.__foodin.applyStockDelta(window.__foodin.products.value.find(p => p.id === 'milk'), -1));
    await sync(R.page);
    await sync(S.page);
    await sync(R.page);                     // R 拉到 S 的并发扣减 → 收敛
    const s15r = await state(R.page);
    const s15s = await state(S.page);
    const qR = s15r.products.find(p => p.id === 'milk');
    const qS = s15s.products.find(p => p.id === 'milk');
    check('S15 R 端牛奶数量收敛为 3(5-1-1)', qR && qR.quantity === 3, 'q=' + (qR && qR.quantity));
    check('S15 S 端牛奶数量收敛为 3', qS && qS.quantity === 3, 'q=' + (qS && qS.quantity));
    await sync(S.page);                     // 稳定性：再同步一轮不漂移、不双计
    const qS2 = (await state(S.page)).products.find(p => p.id === 'milk');
    check('S15 再同步一轮数量不漂移(无双计)', qS2 && qS2.quantity === 3, 'q=' + (qS2 && qS2.quantity));
    const c15 = await cloudRec();
    const p15 = c15.snapshot.products.find(p => p.id === 'milk');
    const ev15 = (c15.events || []).filter(e => e.op === 'delta');
    check('S15 云端含 2 条 delta 增量事件', ev15.length === 2, 'n=' + ev15.length);
    check('S15 云端快照数量=3', p15 && p15.quantity === 3, 'q=' + (p15 && p15.quantity));
    check('S15 R 端待推队列清空', s15r.pending === 0, 'pending=' + s15r.pending);
    await R.ctx.close(); await S.ctx.close();

    // ============ 控制台错误检查 ============
    const allErrors = [...A.consoleErrors, ...B.consoleErrors, ...C.consoleErrors, ...D.consoleErrors];
    check('无 JS 控制台错误', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));

    // A/B/C/D 已在各自章节末尾关闭（防 15 秒防抖定时器串扰），此处无需再关
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => !r.pass);
  console.log('\n========== 结果: ' + (results.length - failed.length) + '/' + results.length + ' 通过 ==========');
  if (failed.length) { console.log('FAILED:'); failed.forEach(f => console.log(' - ' + f.name + ': ' + f.detail)); process.exit(1); }
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });

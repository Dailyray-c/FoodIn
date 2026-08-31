// v2.20.2 统计页验证：①书面化日期标签 ②使用指南统计模块重写 ③电脑版库存经济+数据质量平铺 ④无 JS 报错
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  ctx.on('page', p => p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); }));
  await ctx.addInitScript(() => {
    localStorage.setItem('guideShown_v2162', '1');
    const now = Date.now();
    const t = new Date(now - 2 * 86400000).toISOString();
    const products = [
      { id: 'p0', name: '合味道杯面 89克', stockInDate: '2026-08-01', expiryDate: '2026-09-15', category: ['粮油米面'], location: ['冰箱冷藏'], quantity: 2, price: 10, netContent: '89g', createdAt: t, updatedAt: t },
      { id: 'p1', name: '矿泉水 550ml', stockInDate: '2026-08-02', expiryDate: '2027-01-01', category: ['其他'], location: ['冰箱冷藏'], quantity: 3, price: 5, netContent: '550ml', createdAt: t, updatedAt: t },
      { id: 'p2', name: '酸奶 100g', stockInDate: '2026-08-28', expiryDate: '2026-09-02', category: ['乳品蛋类'], location: ['冰箱冷藏'], quantity: 2, price: 8, netContent: '100g', createdAt: t, updatedAt: t },
      { id: 'p3', name: '吐司面包', stockInDate: '2026-08-20', expiryDate: '2026-08-29', category: ['烘焙'], location: ['常温柜'], quantity: 1, price: 6, netContent: '400g', createdAt: t, updatedAt: t },
      { id: 'p4', name: '散装零食', stockInDate: '2026-08-10', expiryDate: '', category: ['零食'], location: [], quantity: 1, price: 3, netContent: '', createdAt: t, updatedAt: t }
    ];
    const records = [
      { id: 'r0', type: 'in', productName: '合味道杯面 89克', productId: 'p0', quantity: 2, unitPrice: 10, createdAt: t },
      { id: 'r1', type: 'eat', productName: '合味道杯面 89克', productId: 'p0', quantity: 1, unitPrice: 10, createdAt: t },
      { id: 'r2', type: 'waste', productName: '矿泉水 550ml', productId: 'p1', quantity: 1, unitPrice: 5, createdAt: t }
    ];
    localStorage.setItem('food_inventory_products', JSON.stringify(products));
    localStorage.setItem('food_inventory_records', JSON.stringify(records));
    localStorage.setItem('food_inventory_settings', JSON.stringify({ version: '2.20.2', expiringDays: 7, locations: ['冰箱冷藏'], categories: ['粮油米面', '其他'], autoSaveInterval: 5, cloudApiKey: '', cloudBinId: '', cloudSyncEnabled: false, cloudLastSync: '', localModified: '', serverChanKey: '', serverChanPushEnabled: false, barcodeApiKey: '', barcodeLookupEnabled: false }));
    if ('serviceWorker' in navigator) navigator.serviceWorker.register = () => Promise.reject(new Error('disabled'));
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8001/index.html', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const btn = document.querySelector('.fixed.inset-0 .bg-white button.text-gray-400'); if (btn) btn.click(); });
  await page.waitForTimeout(500);

  // ===== ① 统计页：书面化日期标签 =====
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('nav button, footer button, [class*="bottom"] button')).find(x => x.textContent.includes('统计')); if (b) b.click(); });
  await page.waitForTimeout(1200);
  const labels = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => ['今日', '近一周', '近一月', '本年度', '今天', '一周', '一月', '今年'].includes(t));
    const text = document.body.innerText;
    return {
      labels: btns,
      allFormal: ['今日', '近一周', '近一月', '本年度'].every(l => btns.includes(l)),
      noOld: !btns.some(b => ['今天', '一周', '一月', '今年'].includes(b)),
      hasCustomHint: text.includes('自定义')
    };
  });

  // ===== ② 使用指南统计模块 =====
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.title === '使用指南'); if (b) b.click(); });
  await page.waitForTimeout(1000);
  const guide = await page.evaluate(() => {
    const text = document.body.innerText;
    const mod = document.getElementById('m-stats');
    const mtext = mod ? mod.innerText : '';
    return {
      title: mtext.includes('趋势与金额'), noLedger: !mtext.includes('账本'),
      hasFormalRange: mtext.includes('今日') && mtext.includes('近一周') && mtext.includes('近一月') && mtext.includes('本年度'),
      hasNetCash: mtext.includes('净支出'), hasDonut: mtext.includes('甜甜圈'),
      hasThreeBar: mtext.includes('三色柱状'), hasDataQuality: mtext.includes('数据质量'),
      hasClickHint: mtext.includes('点击状态标签') && mtext.includes('点击图例'),
      noOld: !mtext.includes('近30天') && !mtext.includes('深度指标') && !mtext.includes('概览四数') && !mtext.includes('类型分布'),
      hasFigFormal: mtext.includes('今日') && mtext.includes('本年度'),
      hasFig3Bar: (mtext.match(/近 6 个月 采购 vs 消耗 vs 浪费/g) || []).length > 0,
      hasFigMoney: mtext.includes('采购金额') && mtext.includes('消耗金额') && mtext.includes('+¥41'),
      figCap: text.includes('统计页：浪费临期 + 三色趋势 + 当期金额 + 甜甜圈分布')
    };
  });

  // ===== ③ 电脑版：库存经济 + 数据质量平铺 =====
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === '统计'); if (b) b.click(); });
  await page.waitForTimeout(1000);
  const desktop = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div'));
    const byTitle = (title) => {
      const h = all.find(d => d.textContent.trim() === title && d.children.length <= 2);
      return h ? h.parentElement : null;
    };
    const eco = byTitle('库存经济');
    const dq = byTitle('数据质量');
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width) }; };
    const ecoR = r(eco), dqR = r(dq);
    const ecoPs = eco ? Array.from(eco.querySelectorAll('p')).map(p => Math.round(p.getBoundingClientRect().top)) : [];
    const dqPs = dq ? Array.from(dq.querySelectorAll('p')).map(p => Math.round(p.getBoundingClientRect().top)) : [];
    return {
      ecoRect: ecoR, dqRect: dqR,
      sameRow: ecoR && dqR ? Math.abs(ecoR.top - dqR.top) <= 2 : false,
      ecoWide: ecoR ? ecoR.w >= 380 : false,
      ecoRow3: ecoPs.length >= 3 && ecoPs[0] === ecoPs[1] && ecoPs[2] > ecoPs[0],
      dqGrid2x2: dqPs.length >= 4 && dqPs[0] === dqPs[1] && dqPs[2] === dqPs[3] && dqPs[2] > dqPs[0]
    };
  });

  console.log(JSON.stringify({ labels, guide, desktop, consoleErrors }, null, 2));

  // ===== 截图（手机统计页 / 桌面 f 区块 / 指南统计模块） =====
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === '统计'); if (b) b.click(); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '_stats_v2202_mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '_stats_v2202_desktop.png', fullPage: true });
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.title === '使用指南'); if (b) b.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const m = document.getElementById('m-stats'); if (m) m.scrollIntoView(); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '_stats_v2202_guide.png', fullPage: false });
  await browser.close();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });

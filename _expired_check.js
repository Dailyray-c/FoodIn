// v2.20.2 库存经济「已过期」提示修复验证：
// 场景A：有过期商品但未填价格 → 显示「已过期 N 件（金额未计）」，不再误报「无已过期商品」
// 场景B：过期商品部分有价格 → 「已过期 2 件 · ¥xx.x（1 件未填价格，金额未计）」
// 场景C：无过期商品 → 仍显示「无已过期商品」
const { chromium } = require('playwright');

const SETTINGS = JSON.stringify({ version: '2.20.2', expiringDays: 7, locations: ['冰箱冷藏'], categories: ['粮油米面'], autoSaveInterval: 5, cloudApiKey: '', cloudBinId: '', cloudSyncEnabled: false, cloudLastSync: '', localModified: '', serverChanKey: '', serverChanPushEnabled: false, barcodeApiKey: '', barcodeLookupEnabled: false });

async function loadProducts(browser, products) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  ctx.on('page', p => p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); }));
  const t = new Date(Date.now() - 2 * 86400000).toISOString();
  await ctx.addInitScript(({ products, t }) => {
    localStorage.setItem('guideShown_v2162', '1');
    localStorage.setItem('food_inventory_products', JSON.stringify(products));
    localStorage.setItem('food_inventory_records', JSON.stringify([]));
    localStorage.setItem('food_inventory_settings', SETTINGS);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register = () => Promise.reject(new Error('disabled'));
  }, { products, t });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8001/index.html', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const btn = document.querySelector('.fixed.inset-0 .bg-white button.text-gray-400'); if (btn) btn.click(); });
  await page.waitForTimeout(500);
  // 切到统计页
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('nav button, footer button, [class*="bottom"] button')).find(x => x.textContent.includes('统计')); if (b) b.click(); });
  await page.waitForTimeout(1200);
  const ecoText = await page.evaluate(() => {
    // 找到「库存经济」卡（含库存货值/可吃天数）
    const card = Array.from(document.querySelectorAll('div')).find(d => d.textContent.includes('库存货值') && d.textContent.includes('可吃天数'));
    return card ? card.innerText.replace(/\n+/g, ' | ') : '';
  });
  await ctx.close();
  return { ecoText, consoleErrors };
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // 场景A+B：pA 过期无价格、pB 过期有价格¥6、pC 正常有价格
  const t = new Date(Date.now() - 2 * 86400000).toISOString();
  const mix = [
    { id: 'pA', name: '临期酸奶', stockInDate: '2026-08-20', expiryDate: '2026-08-25', category: ['乳品蛋类'], location: ['冰箱冷藏'], quantity: 1, price: '', netContent: '100g', createdAt: t, updatedAt: t },
    { id: 'pB', name: '吐司面包', stockInDate: '2026-08-10', expiryDate: '2026-08-20', category: ['烘焙'], location: ['常温柜'], quantity: 1, price: 6, netContent: '400g', createdAt: t, updatedAt: t },
    { id: 'pC', name: '矿泉水', stockInDate: '2026-08-28', expiryDate: '2027-01-01', category: ['其他'], location: ['冰箱冷藏'], quantity: 2, price: 5, netContent: '550ml', createdAt: t, updatedAt: t }
  ];
  const rA = await loadProducts(browser, mix);

  // 场景C：全部正常无过期
  const fresh = [
    { id: 'pD', name: '矿泉水', stockInDate: '2026-08-28', expiryDate: '2027-01-01', category: ['其他'], location: ['冰箱冷藏'], quantity: 2, price: 5, netContent: '550ml', createdAt: t, updatedAt: t }
  ];
  const rC = await loadProducts(browser, fresh);

  console.log(JSON.stringify({
    sceneAB: {
      ecoText: rA.ecoText,
      hasExpired2: rA.ecoText.includes('已过期 2 件'),
      hasAmount: rA.ecoText.includes('¥6.0'),
      hasUnpriced: rA.ecoText.includes('1 件未填价格，金额未计'),
      noFalseNegative: !rA.ecoText.includes('无已过期商品'),
      consoleErrors: rA.consoleErrors
    },
    sceneC: {
      ecoText: rC.ecoText,
      hasNoExpired: rC.ecoText.includes('无已过期商品'),
      consoleErrors: rC.consoleErrors
    }
  }, null, 2));
  await browser.close();
})();

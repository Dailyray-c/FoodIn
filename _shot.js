const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('guideShown_v2162', '1');
    const now = Date.now();
    const products = [
      {id:'p0',name:'合味道杯面(猪骨浓汤) 89NG (89克)',stockInDate:'2025-08-01',expiryDate:'2026-08-15',category:['粮油米面'],location:['冰箱冷藏'],quantity:5,price:3.5,createdAt:now,updatedAt:now},
      {id:'p1',name:'矿泉水 550ml',stockInDate:'2025-08-02',expiryDate:'2027-01-01',category:['其他'],location:['冰箱冷藏'],quantity:5,price:2,createdAt:now,updatedAt:now},
    ];
    const records = [];
    const types = ['in','eat','waste'];
    for (let i = 0; i < 12; i++) {
      const p = products[i % 2]; const t = types[i % 3];
      records.push({id:'r'+i,type:t,productName:p.name,productId:p.id,quantity:1,price:3.5,timestamp:now-i*3600000*6,stockInDate:p.stockInDate,expiryDate:p.expiryDate,category:p.category,location:p.location});
    }
    localStorage.setItem('food_inventory_products', JSON.stringify(products));
    localStorage.setItem('food_inventory_records', JSON.stringify(records));
    localStorage.setItem('food_inventory_settings', JSON.stringify({version:'2.16.6',expiringDays:7,locations:['冰箱冷藏'],categories:['粮油米面','其他'],autoSaveInterval:5,cloudApiKey:'',cloudBinId:'',cloudSyncEnabled:false,cloudLastSync:'',localModified:'',serverChanKey:'',serverChanPushEnabled:false,barcodeApiKey:'',barcodeLookupEnabled:false}));
    if ('serviceWorker' in navigator) navigator.serviceWorker.register = () => Promise.reject(new Error('disabled'));
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8001/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  // 关掉过期提醒弹窗
  await page.evaluate(() => {
    const btn = document.querySelector('.fixed.inset-0 .bg-white button.text-gray-400');
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);
  // 主页滚到底
  await page.evaluate(() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '_home_bottom.png' });
  const hd = await page.evaluate(() => {
    const main = document.querySelector('main');
    const home = document.querySelector('main > div');
    // 找最后一个子元素及其底边
    const kids = Array.from(home.children).map(c => ({ cls: (c.className||'').toString().slice(0,40), top: Math.round(c.getBoundingClientRect().top), bottom: Math.round(c.getBoundingClientRect().bottom), h: c.offsetHeight }));
    return { mainH: main.offsetHeight, mainScroll: main.scrollHeight, mainTop: Math.round(main.getBoundingClientRect().top), mainBottom: Math.round(main.getBoundingClientRect().bottom), kids };
  });
  console.log(JSON.stringify(hd, null, 2));
  await browser.close();
})().catch(e => console.error('ERR:', e.message));

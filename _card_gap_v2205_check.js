// 同时验证主页 + 记录页 mobile/tablet/desktop 的卡片间距都是 12px
const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let pass = 0, fail = 0;
  for (const vp of VIEWPORTS) {
    for (const page of ['home', 'records']) {
      const p = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
      p.on('pageerror', e => console.log(`  [pageerror]`, e.message));
      await p.addInitScript(() => { try { localStorage.setItem('guideShown_v2162', '1'); } catch (e) {} });

      const products = [
        { id: 'r1', name: '商品一', qty: 1, expiryDate: '2024-08-01', location: '鬓边柜', category: '茶叶' },
        { id: 'r2', name: '商品二', qty: 1, expiryDate: '2024-08-01' },
        { id: 'r3', name: '商品三', qty: 1, expiryDate: '2026-08-16' },
      ];
      const records = [];
      const today = new Date();
      const yday = new Date(today); yday.setDate(yday.getDate() - 1);
      records.push({ id: 'rec1', productId: 'r1', productName: '商品一', type: 'in',  qty: 1, createdAt: today.toISOString(), price: 0 });
      records.push({ id: 'rec2', productId: 'r1', productName: '商品一', type: 'eat', qty: 1, createdAt: today.toISOString(), price: 0 });
      records.push({ id: 'rec3', productId: 'r2', productName: '商品二', type: 'in',  qty: 2, createdAt: yday.toISOString(),  price: 0 });
      records.push({ id: 'rec4', productId: 'r3', productName: '商品三', type: 'waste', qty: 1, createdAt: yday.toISOString(), price: 0 });

      await p.addInitScript(({ products, records, page }) => {
        localStorage.setItem('food_inventory_products', JSON.stringify(products));
        localStorage.setItem('food_inventory_records', JSON.stringify(records));
        localStorage.setItem('food_inventory_settings', JSON.stringify({ version: '2.20.5', themeColor: '#ef4444', expiryWarningDays: 30 }));
        // 切到对应页面
        // 通过 hash 或全局 Vue app 不行——直接 reload 后用 URL 参数触发页切换也麻烦。
        // 简化：手动 evaluate 改 currentPage
      }, { products, records, page });
      await p.goto('file:///C:/Users/Administrator/WorkBuddy/2026-08-08-19-09-36/index.html', { waitUntil: 'load' });
      await p.waitForTimeout(700);
      // 关弹窗
      await p.evaluate(() => { document.querySelectorAll('button').forEach(b => { if ((b.textContent||'').trim()==='×') b.click(); }); });
      await p.waitForTimeout(300);

      // 切页
      const navBtnText = page === 'home' ? '首页' : '记录';
      await p.evaluate((txt) => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(b => (b.textContent||'').trim() === txt);
        if (b) b.click();
      }, navBtnText);
      await p.waitForTimeout(500);

      const data = await p.evaluate(() => {
        // 卡片：home = .border-l-4，records = .bg-white 不含 .border-l-4
        const homeCards = Array.from(document.querySelectorAll('main .bg-white.rounded-xl'))
          .filter(el => el.classList.contains('border-l-4') && /商品[一二三]/.test(el.textContent));
        const recCards = Array.from(document.querySelectorAll('main .bg-white.rounded-xl'))
          .filter(el => !el.classList.contains('border-l-4') && !/暂无|已显示/.test(el.textContent) && el.querySelector('button'));
        const cards = homeCards.length >= 2 ? homeCards : recCards;
        const meta = cards.map(c => { const r = c.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; });
        const parent = cards[0] ? cards[0].parentElement : null;
        const cs = parent ? getComputedStyle(parent) : null;
        return { kind: homeCards.length>=2 ? 'home' : 'records', count: cards.length, cards: meta, parent: cs ? { display: cs.display, gap: cs.gap } : null };
      });

      const expected = '12px';
      const okParentGap = data.parent.gap === expected;
      const okGap = (() => {
        if (data.cards.length < 2) return null;
        if (data.parent.display === 'flex') return data.cards[1].top - data.cards[0].bottom === 12;
        if (data.parent.display === 'grid') return data.cards[1].left - data.cards[0].right === 12;
        return null;
      })();
      const verdict = okParentGap && okGap ? '✓' : '✗';
      console.log(`[${page}/${vp.name}] ${verdict} parent.display=${data.parent.display} parent.gap=${data.parent.gap}  measured=${JSON.stringify(okGap)}`);
      if (okParentGap && okGap) pass++; else fail++;
      await p.close();
    }
  }
  await browser.close();
  console.log(`\n总结：${pass} pass / ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})();

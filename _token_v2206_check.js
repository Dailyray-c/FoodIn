// v2.20.6 验证：日期筛选布局 / 甜甜圈去重 / token 语法统一（#待设置 @待设置 ?空价格 ?空净含量 &状态）
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8001/index.html';
const results = [];
function pass(n){ results.push({n,ok:true}); console.log('PASS -', n); }
function fail(n,i){ results.push({n,ok:false,info:i}); console.log('FAIL -', n, i||''); }

function buildProducts() {
  const pad = n => String(n).padStart(2,'0');
  const localDateStr = (off) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + off);
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
  };
  const today = localDateStr(0);
  const in60  = localDateStr(60);
  const in3   = localDateStr(3);
  const exDate = localDateStr(-1);
  const mk = (id, name, cat, loc, price, net, exp, qty) => ({
    id, name, barcode:'', location:loc, category:cat, stockInDate:today,
    productionDate:'', shelfLife:'', expiryDate:exp, quantity:qty,
    price:String(price), netContent:net, brand:'', spec:'', manufacturer:'', imageUrl:'',
    createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
  });
  return [
    mk('p1','QA01','c01','L1',5,'500g',in60,3),
    mk('p2','QA02','c02','L1','','200g',in60,1),      // 空价格
    mk('p3','QA03','','','', '',in60,1),               // 空分类/空位置/空价格/空净含量
    mk('p4','QA04','c03','L2',8,'1L',exDate,1),        // 过期
    mk('p5','QA05','c04','L1',2,'100g',in3,1),         // 临期
    mk('p6','QA06','c05','L3',10,'250ml',in60,1),
    mk('p7','QA07','c06','L1',1,'a',in60,1),
    mk('p8','QA08','c07','L2',1,'a',in60,1),
    mk('p9','QA09','c08','L3',1,'a',in60,1),
    mk('p10','QA10','c09','L1',1,'a',in60,1),
    mk('p11','QA11','c10','L2',1,'a',in60,1),
    mk('p12','QA12','c11','L3',1,'a',in60,1),
    mk('p13','QA13','c12','L1',1,'a',in60,1),
    mk('p14','QA14','c01','L1',1,'a',in60,1),
    mk('p15','QA15','c02','L2',1,'a',in60,1),
    mk('p16','QA16','c03','L3',1,'a',in60,1),
    mk('p17','QA17','c04','L1',1,'a',in60,1),
    mk('p18','QA18','c05','L2',1,'a',in60,1)
  ];
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Users/Administrator/.agent-browser/browsers/chrome-152.0.7977.64/chrome.exe' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('pageerror: '+e.message));
  page.on('console', m => { if (m.type()==='error') consoleErrors.push('console.error: '+m.text()); });
  await page.route('**/jsonbin.io/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"record":{}}' }));
  await page.addInitScript(() => localStorage.setItem('guideShown_v2162','1'));
  await page.goto(BASE, { waitUntil:'networkidle' });

  await page.evaluate((prods) => {
    localStorage.setItem('food_inventory_products', JSON.stringify(prods));
    localStorage.setItem('food_inventory_records', JSON.stringify([]));
    localStorage.setItem('food_inventory_settings', JSON.stringify({ version:'2.20.6', expiringDays:7, locations:['L1','L2','L3'], categories:['c01','c02','c03','c04','c05','c06','c07','c08','c09','c10','c11','c12'], autoSaveInterval:0 }));
  }, buildProducts());
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForSelector('nav', { state:'attached', timeout:10000 });
  // 关过期提醒弹窗
  await page.evaluate(() => {
    document.querySelectorAll('.fixed button').forEach(b => {
      const t=(b.textContent||'').trim(); if (t==='×'||t==='X'||t==='×') b.click();
    });
  });

  const closeModals = async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.fixed button').forEach(b => {
        const t=(b.textContent||'').trim(); if (t==='×'||t==='X'||t==='×') b.click();
      });
    });
    await page.waitForTimeout(120);
  };

  // ===== T1+T2：日期筛选布局 =====
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('nav button')).find(x => /统计/.test(x.textContent||''));
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  const dateLayout = async () => page.evaluate(() => {
    const inp = document.querySelector('input[type="date"]');
    if (!inp) return null;
    const customRow = inp.parentElement;
    const outer = customRow.parentElement;
    const presetRow = outer.children[0];
    const cs = getComputedStyle(outer);
    return {
      flexDirection: cs.flexDirection,
      presetTop: presetRow.getBoundingClientRect().top,
      customTop: customRow.getBoundingClientRect().top
    };
  });
  const dlDesktop = await dateLayout();
  if (dlDesktop && dlDesktop.flexDirection === 'row') pass('桌面端日期筛选为单行(flex row)');
  else fail('桌面端日期筛选为单行(flex row)', JSON.stringify(dlDesktop));
  if (dlDesktop && Math.abs(dlDesktop.presetTop - dlDesktop.customTop) < 6) pass('桌面端预设行与自定义行同高(一行)');
  else fail('桌面端预设行与自定义行同高(一行)', JSON.stringify(dlDesktop));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const dlMobile = await dateLayout();
  if (dlMobile && dlMobile.flexDirection === 'column') pass('移动端日期筛选为两行(flex column)');
  else fail('移动端日期筛选为两行(flex column)', JSON.stringify(dlMobile));
  if (dlMobile && dlMobile.customTop - dlMobile.presetTop > 10) pass('移动端预设行与自定义行分两行');
  else fail('移动端预设行与自定义行分两行', JSON.stringify(dlMobile));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200);

  // ===== T3：甜甜圈调色板去重 =====
  const allGrads = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach(e => {
      const bi = getComputedStyle(e).backgroundImage || '';
      if (bi.includes('conic-gradient')) out.push(bi);
    });
    return out;
  });
  function distinctColors(g) {
    if (!g) return null;
    const cols = (g.match(/rgba?\([^)]*\)/g) || []).map(c=>c.replace(/\s+/g,' '));
    const GRAY = 'rgb(156, 163, 175)';
    const colored = cols.filter(c => c !== GRAY);
    // 浏览器把每个色标序列化为 `color fromdeg, color todeg`，故每种色出现两次；段数 = colored/2
    return { total: cols.length, colored: colored.length, segCount: colored.length / 2, distinctColored: new Set(colored).size, hasGray: cols.includes(GRAY) };
  }
  // 分类甜甜圈段数最多（12 彩色 + 灰色未设置）→ 取颜色数最多的那条
  const catGrad = allGrads.slice().sort((a,b)=> (b.match(/rgba?\([^)]*\)/g)||[]).length - (a.match(/rgba?\([^)]*\)/g)||[]).length)[0];
  const catColors = distinctColors(catGrad);
  console.log('[debug] cat donut colors=', JSON.stringify(catColors), 'gradsFound='+allGrads.length, 'perGrad='+JSON.stringify(allGrads.map(g=>(g.match(/rgba?\([^)]*\)/g)||[]).length)));
  // 关键：12 个彩色段互不相同（distinctColored === segCount），无重复色相；含灰色未设置段
  if (catColors && catColors.distinctColored === catColors.segCount && catColors.segCount >= 12 && catColors.hasGray)
    pass('分类甜甜圈颜色去重(12段色相互不相同+灰色未设置)');
  else fail('分类甜甜圈颜色去重', JSON.stringify(catColors));
  // 位置甜甜圈：也取一条含灰色的（排除库存状态甜甜圈 3 段无灰）
  const locGrad = allGrads.find(g => (g.match(/rgba?\([^)]*\)/g)||[]).includes('rgb(156, 163, 175)') && g !== catGrad);
  const locColors = distinctColors(locGrad);
  if (locColors && locColors.distinctColored === locColors.segCount && locColors.hasGray)
    pass('位置甜甜圈颜色去重(彩色段互不相同+灰色未设置)');
  else fail('位置甜甜圈颜色去重', JSON.stringify(locColors));

  // ===== T4-T12：token 筛选（UI 计数）=====
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('nav button')).find(x => /(首页|主页|库存)/.test(x.textContent||''));
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await closeModals();
  const searchSel = 'input.input.pl-10.pr-10';
  const countCards = async (token) => {
    await page.fill(searchSel, token);
    await page.waitForTimeout(180);
    return await page.evaluate(() => document.querySelectorAll('main h3').length);
  };
  const expect = async (token, want, label) => {
    const n = await countCards(token);
    if (n === want) pass(label + ` (${token} → ${n})`);
    else fail(label + ` (${token} → ${n})`, `期望 ${want}`);
  };
  await expect('#待设置', 1, '空分类→#待设置 命中1');
  await expect('@待设置', 1, '空位置→@待设置 命中1');
  await expect('?空价格', 2, '空价格→?空价格 命中2');
  await expect('?空净含量', 1, '空净含量→?空净含量 命中1');
  await expect('&正常', 16, '正常→&正常 命中16');
  await expect('&临期', 1, '临期→&临期 命中1');
  await expect('&过期', 1, '过期→&过期 命中1');
  await expect('空价格', 0, '旧token空价格(全文) 命中0(回归)');
  await expect('?正常', 0, '旧token?正常(全文) 命中0(回归)');
  await page.fill(searchSel, '');
  await page.waitForTimeout(120);

  // ===== T13：主页筛选弹窗 待设置 按钮 =====
  await page.click('button:has-text("筛选")');
  await page.waitForTimeout(250);
  const daiSettings = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const ds = btns.filter(b => (b.textContent||'').trim()==='待设置');
    return ds.length;
  });
  if (daiSettings >= 2) pass('主页筛选弹窗含「待设置」按钮(分类+位置)');
  else fail('主页筛选弹窗含「待设置」按钮', 'count='+daiSettings);
  // 点分类维度「待设置」→ 写入 #待设置
  await page.evaluate(() => {
    // 找到分类区(含「商品分类」label)下的待设置按钮
    const labels = Array.from(document.querySelectorAll('label'));
    const catLabel = labels.find(l => (l.textContent||'').includes('商品分类'));
    const section = catLabel ? catLabel.parentElement : null;
    const btn = section ? Array.from(section.querySelectorAll('button')).find(b => (b.textContent||'').trim()==='待设置') : null;
    if (btn) btn.click();
  });
  await page.waitForTimeout(150);
  const searchVal1 = await page.inputValue(searchSel);
  if (searchVal1.includes('#待设置')) pass('点分类「待设置」写入 #待设置');
  else fail('点分类「待设置」写入 #待设置', 'search='+searchVal1);
  await page.click('button:has-text("完成")');
  await page.waitForTimeout(150);
  await page.fill(searchSel, '');
  await page.waitForTimeout(120);

  // ===== T14：主页吸顶 临期 卡 → &临期 =====
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').includes('临期'));
    if (b) b.click();
  });
  await page.waitForTimeout(150);
  const searchVal2 = await page.inputValue(searchSel);
  if (searchVal2.includes('&临期')) pass('主页吸顶「临期」卡写入 &临期');
  else fail('主页吸顶「临期」卡写入 &临期', 'search='+searchVal2);
  await page.fill(searchSel, '');
  await page.waitForTimeout(120);

  // ===== T15：统计页数据质量点击 =====
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('nav button')).find(x => /统计/.test(x.textContent||''));
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('p'));
    const t = ps.find(p => (p.textContent||'').startsWith('标签待设置'));
    if (t) t.click();
  });
  await page.waitForTimeout(200);
  const searchVal3 = await page.inputValue(searchSel);
  if (searchVal3.includes('#待设置')) pass('统计页「标签待设置」→ #待设置');
  else fail('统计页「标签待设置」→ #待设置', 'search='+searchVal3);
  // 再测「未填价格」
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('nav button')).find(x => /统计/.test(x.textContent||''));
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('p'));
    const t = ps.find(p => (p.textContent||'').startsWith('未填价格'));
    if (t) t.click();
  });
  await page.waitForTimeout(200);
  const searchVal4 = await page.inputValue(searchSel);
  if (searchVal4.includes('?空价格')) pass('统计页「未填价格」→ ?空价格');
  else fail('统计页「未填价格」→ ?空价格', 'search='+searchVal4);

  // ===== T16：无控制台错误 =====
  if (consoleErrors.length === 0) pass('无控制台错误');
  else fail('无控制台错误', consoleErrors.join(' | '));

  await browser.close();
  const all = results.length, ok = results.filter(r=>r.ok).length;
  console.log('\n=== 结果: '+ok+'/'+all+' 通过 ===');
  process.exit(ok===all?0:1);
})();

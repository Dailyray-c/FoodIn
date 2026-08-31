// v2.21.3 UI 修正验证：scan 页（单个录入）UI 对齐批量页卡片结构——条形码融入基础信息卡第一项、净含量·单件商品在初始数量前、更多信息移除总价/价格/净含量
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8001/index.html';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();

  let pass = 0, fail = 0;
  const assert = (name, cond, detail) => {
    if (cond) { pass++; console.log('PASS ' + name); }
    else { fail++; console.log('FAIL ' + name + ' | ' + (detail || '')); }
  };

  await page.addInitScript(() => {
    localStorage.setItem('food_inventory_products', JSON.stringify([]));
    localStorage.setItem('food_inventory_records', JSON.stringify([]));
    localStorage.setItem('food_inventory_settings', JSON.stringify({
      categories: ['乳品蛋类', '零食饮料'],
      locations: ['冰箱冷藏', '常温柜'],
      version: '2.21.3'
    }));
    localStorage.setItem('guideShown_v2162', '1');
  });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/NotAllowedError|Permission denied|getUserMedia|NotFoundError/i.test(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(BASE);
  await page.waitForTimeout(800);

  // ========== A. 版本号仍是 2.21.3 ==========
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '设置');
    if (nav.length) nav[nav.length - 1].click();
  });
  await page.waitForTimeout(400);
  const ver = await page.evaluate(() => document.body.textContent.includes('2.21.3'));
  assert('A. 版本号保持 2.21.3', ver);

  // ========== 进入扫码页 ==========
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '扫码');
    if (nav.length) nav[nav.length - 1].click();
  });
  await page.waitForTimeout(400);

  // ========== B. scan 页：顶部保留批量录入入口 ==========
  const scanTop = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const entry = btns.find(b => b.textContent.includes('小票批量录入'));
    return { hasEntry: !!entry, hasSubmit: btns.some(b => b.textContent.trim() === '提交入库') };
  });
  assert('B. scan 页顶部保留「小票批量录入」入口', scanTop.hasEntry, JSON.stringify(scanTop));
  assert('B2. scan 页保留「提交入库」按钮（单个录入为主）', scanTop.hasSubmit, JSON.stringify(scanTop));

  // ========== C. scan 页基础信息卡字段顺序 ==========
  const scanCard = await page.evaluate(() => {
    const mainCard = Array.from(document.querySelectorAll('div.bg-white.rounded-xl')).find(c =>
      c.textContent.includes('基础信息') && c.textContent.includes('日期信息') && !c.textContent.includes('小票批量录入'));
    if (!mainCard) return { found: false };
    const order = [];
    const walk = (node) => {
      if (!node || order.length > 25) return;
      if (node.nodeType === 1) {
        if (node.tagName === 'LABEL') {
          const t = node.textContent.trim().replace(/·单件商品/g, '').trim();
          if (['条形码', '商品名称', '分类', '储存位置', '净含量', '总价', '初始数量', '生产日期', '保质期', '到期日期'].includes(t)) order.push(t);
        } else if (node.tagName === 'DIV' && node.classList.contains('text-sm') && node.classList.contains('font-semibold')) {
          const t = node.textContent.trim();
          if (t === '基础信息' || t === '日期信息') order.push(t);
        }
        Array.from(node.childNodes || []).forEach(walk);
      }
    };
    walk(mainCard);
    const barcodeLabel = Array.from(mainCard.querySelectorAll('label')).find(l => l.textContent.trim() === '条形码');
    return {
      found: true,
      order,
      hasBarcodeLabel: mainCard.textContent.includes('条形码'),
      hasCamBtn: !!mainCard.querySelector('button[title="扫码录入"]'),
      hasQueryBtn: Array.from(mainCard.querySelectorAll('button')).some(b => ['查询', '更新'].includes(b.textContent.trim())),
      hasBorderT: /pt-2 border-t/.test(mainCard.innerHTML),
      barcodeLabelClass: barcodeLabel ? barcodeLabel.className : null,
      netLabelHTML: (() => {
        const l = Array.from(mainCard.querySelectorAll('label')).find(x => x.textContent.includes('净含量'));
        return l ? l.innerHTML : null;
      })(),
      noStockInInDateGroup: !Array.from(mainCard.querySelectorAll('label')).some(l => l.textContent.trim() === '入库日期')
    };
  });
  assert('C. scan 基础信息卡含条形码+相机+查询按钮', scanCard.found && scanCard.hasBarcodeLabel && scanCard.hasCamBtn && scanCard.hasQueryBtn, JSON.stringify(scanCard));
  assert('C2. 字段顺序 = 条形码→名称→分类→位置→净含量+总价→数量→日期(生产/保质/到期)',
    JSON.stringify(scanCard.order) === JSON.stringify(['基础信息', '条形码', '商品名称', '分类', '储存位置', '净含量', '总价', '初始数量', '日期信息', '生产日期', '保质期', '到期日期']),
    JSON.stringify(scanCard.order));
  assert('C3. 净含量 label 右侧带「·单件商品」小字', !!scanCard.netLabelHTML && scanCard.netLabelHTML.includes('·单件商品'), scanCard.netLabelHTML || 'null');
  assert('C4. 条形码 label 不粗体（与其他字段一致）', !!scanCard.barcodeLabelClass && !scanCard.barcodeLabelClass.includes('font-semibold') && scanCard.barcodeLabelClass.includes('text-xs'), scanCard.barcodeLabelClass || 'null');
  assert('C5. 日期信息组不再含「入库日期」', scanCard.noStockInInDateGroup);

  // ========== D. scan 页更多信息：移除价格/净含量，保留品牌/厂家/图片 ==========
  await page.evaluate(() => {
    const more = Array.from(document.querySelectorAll('div.border.border-gray-200.rounded-xl')).find(c => c.textContent.includes('更多信息'));
    const btn = more && more.querySelector('button');
    btn && btn.click();
  });
  await page.waitForTimeout(300);
  const scanMore = await page.evaluate(() => {
    const more = Array.from(document.querySelectorAll('div.border.border-gray-200.rounded-xl')).find(c => c.textContent.includes('更多信息'));
    const html = more ? more.innerHTML : '';
    const stockInInput = more ? Array.from(more.querySelectorAll('input')).find(i => i.type === 'date') : null;
    return {
      found: !!more,
      hasBrand: html.includes('品牌'),
      hasManufacturer: html.includes('生产厂家'),
      hasImage: html.includes('商品图片'),
      hasViewImg: html.includes('查看图片'),
      hasStockIn: html.includes('入库日期'),
      stockInDisabled: stockInInput ? stockInInput.disabled : false,
      noNet: !html.includes('净含量'),
      noPrice: !html.includes('价格'),
      noTotal: !html.includes('总价'),
      noSpec: !html.includes('规格')
    };
  });
  assert('D. scan 更多信息含品牌/厂家/图片/入库日期', scanMore.found && scanMore.hasBrand && scanMore.hasManufacturer && scanMore.hasImage && scanMore.hasViewImg && scanMore.hasStockIn, JSON.stringify(scanMore));
  assert('D2. scan 更多信息入库日期保持锁定（disabled）', scanMore.stockInDisabled, JSON.stringify(scanMore));
  assert('D3. scan 更多信息已移除净含量/价格/总价/规格', scanMore.noNet && scanMore.noPrice && scanMore.noTotal && scanMore.noSpec, JSON.stringify(scanMore));

  // ========== E. scan 页提交入库流程正常 ==========
  await page.evaluate(() => {
    const setVal = (el, val) => {
      if (!el) return false;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const mainCard = Array.from(document.querySelectorAll('div.bg-white.rounded-xl')).find(c => c.textContent.includes('基础信息') && c.textContent.includes('日期信息'));
    const inputs = mainCard ? Array.from(mainCard.querySelectorAll('input')) : [];
    const nameInput = inputs.find(i => i.placeholder === '请输入商品名称');
    const dateInputs = inputs.filter(i => i.type === 'date');
    const prodInput = dateInputs[0];   // 日期组第一个 date = 生产日期（入库日期已移入更多信息）
    const shelfLabel = mainCard ? Array.from(mainCard.querySelectorAll('label')).find(l => l.textContent.trim() === '保质期') : null;
    const shelfInput = shelfLabel ? shelfLabel.parentElement.querySelector('input[type="number"]') : null;
    setVal(nameInput, '测试牛奶');
    setVal(prodInput, '2026-08-01');
    setVal(shelfInput, '12');
    return { ok: !!nameInput && !!prodInput && !!shelfInput };
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '提交入库');
    btn && btn.click();
  });
  await page.waitForTimeout(800);
  const save1 = await page.evaluate(() => {
    const products = JSON.parse(localStorage.getItem('food_inventory_products') || '[]');
    return { count: products.length, name: products[0]?.name || null };
  });
  assert('E. scan 页单个提交入库正常', save1.count === 1 && save1.name === '测试牛奶', JSON.stringify(save1));

  // ========== F. batch 页卡片结构同步 ==========
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('小票批量录入'));
    btn && btn.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ 添加商品');
    btn && btn.click();
  });
  await page.waitForTimeout(400);
  const batchCard = await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('div.space-y-3'));
    const itemContainer = containers.find(el => /商品\s*\d+/.test(el.textContent));
    const mainCard = itemContainer ? Array.from(itemContainer.children).find(c => c.classList.contains('bg-white') && c.textContent.includes('基础信息')) : null;
    if (!mainCard) return { found: false };
    const order = [];
    const walk = (node) => {
      if (!node || order.length > 25) return;
      if (node.nodeType === 1) {
        if (node.tagName === 'LABEL') {
          const t = node.textContent.trim().replace(/·单件商品/g, '').trim();
          if (['条形码', '商品名称', '分类', '储存位置', '净含量', '总价', '初始数量', '生产日期', '保质期', '到期日期'].includes(t)) order.push(t);
        } else if (node.tagName === 'DIV' && node.classList.contains('text-sm') && node.classList.contains('font-semibold')) {
          const t = node.textContent.trim();
          if (t === '基础信息' || t === '日期信息') order.push(t);
        }
        Array.from(node.childNodes || []).forEach(walk);
      }
    };
    walk(mainCard);
    return {
      found: true,
      order,
      hasCamBtn: !!mainCard.querySelector('button[title="扫码录入"]')
    };
  });
  // 展开更多信息后再检查折叠区内容（选择器：border-gray-200 的独立折叠区，避免误匹配头部横条）
  await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('div.space-y-3'));
    const itemContainer = containers.find(el => /商品\s*\d+/.test(el.textContent));
    const moreSection = itemContainer && Array.from(itemContainer.children).find(c => c.classList.contains('border-gray-200'));
    const btn = moreSection && moreSection.querySelector('button');
    btn && btn.click();
  });
  await page.waitForTimeout(300);
  const batchMore = await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('div.space-y-3'));
    const itemContainer = containers.find(el => /商品\s*\d+/.test(el.textContent));
    const moreSection = itemContainer && Array.from(itemContainer.children).find(c => c.classList.contains('border-gray-200'));
    const html = moreSection ? moreSection.innerHTML : '';
    const stockInInput = moreSection ? Array.from(moreSection.querySelectorAll('input')).find(i => i.type === 'date') : null;
    return {
      moreFound: !!moreSection,
      noTotal: !html.includes('总价'),
      noNet: !html.includes('净含量'),
      hasNote: html.includes('备注'),
      hasStockIn: html.includes('入库日期'),
      stockInDisabled: stockInInput ? stockInInput.disabled : false
    };
  });
  assert('F. batch 卡片：条形码第一项 + 相机按钮', batchCard.found && batchCard.hasCamBtn, JSON.stringify(batchCard));
  assert('F2. batch 字段顺序与 scan 一致（条形码→名称→分类→位置→净含量+总价→数量→生产/保质/到期）',
    JSON.stringify(batchCard.order) === JSON.stringify(['基础信息', '条形码', '商品名称', '分类', '储存位置', '净含量', '总价', '初始数量', '日期信息', '生产日期', '保质期', '到期日期']),
    JSON.stringify(batchCard.order));
  assert('F3. batch 更多信息已移除总价/净含量，含入库日期(锁定)+备注', batchMore.moreFound && batchMore.noTotal && batchMore.noNet && batchMore.hasNote && batchMore.hasStockIn && batchMore.stockInDisabled, JSON.stringify(batchMore));

  // ========== G. batch 保存流程正常 ==========
  await page.evaluate(() => {
    const setVal = (el, val) => {
      if (!el) return false;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const containers = Array.from(document.querySelectorAll('div.space-y-3'));
    const itemContainer = containers.find(el => /商品\s*\d+/.test(el.textContent));
    const mainCard = itemContainer ? Array.from(itemContainer.children).find(c => c.classList.contains('bg-white') && c.textContent.includes('基础信息')) : null;
    const inputs = mainCard ? Array.from(mainCard.querySelectorAll('input')) : [];
    const nameInput = inputs.find(i => i.placeholder === '请输入商品名称');
    const dateInputs = inputs.filter(i => i.type === 'date');
    const prodInput = dateInputs[0];   // 日期组第一个 date = 生产日期
    const shelfLabel = mainCard ? Array.from(mainCard.querySelectorAll('label')).find(l => l.textContent.trim() === '保质期') : null;
    const shelfInput = shelfLabel ? shelfLabel.parentElement.querySelector('input[type="number"]') : null;
    setVal(nameInput, '测试酸奶');
    setVal(prodInput, '2026-08-02');
    setVal(shelfInput, '20');
    return { ok: !!nameInput && !!prodInput && !!shelfInput };
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('保存全部'));
    btn && btn.click();
  });
  await page.waitForTimeout(800);
  const save2 = await page.evaluate(() => {
    const products = JSON.parse(localStorage.getItem('food_inventory_products') || '[]');
    const records = JSON.parse(localStorage.getItem('food_inventory_records') || '[]');
    const last = records[records.length - 1];
    return { count: products.length, names: products.map(p => p.name), lastDetail: last?.detail || null };
  });
  assert('G. batch 保存全部正常（2 商品 + 批量入库记录）',
    save2.count === 2 && save2.names.includes('测试酸奶') && save2.lastDetail?.includes('批量入库'),
    JSON.stringify(save2));

  // ========== G2. 主页编辑弹窗「更多信息」补回备注 ==========
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '首页');
    if (nav.length) nav[nav.length - 1].click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '编辑');
    btn && btn.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const more = Array.from(document.querySelectorAll('div.border.border-gray-200.rounded-xl')).find(c => c.textContent.includes('更多信息'));
    const btn = more && more.querySelector('button');
    btn && btn.click();
  });
  await page.waitForTimeout(300);
  const editMore = await page.evaluate(() => {
    const more = Array.from(document.querySelectorAll('div.border.border-gray-200.rounded-xl')).find(c => c.textContent.includes('更多信息'));
    const html = more ? more.innerHTML : '';
    const noteInput = more ? Array.from(more.querySelectorAll('input')).find(i => i.placeholder.includes('临期特价')) : null;
    return { hasNote: html.includes('备注'), noteInputFound: !!noteInput };
  });
  assert('G2. 主页编辑弹窗更多信息含备注字段', editMore.hasNote && editMore.noteInputFound, JSON.stringify(editMore));

  // ========== H. 无控制台错误 ==========
  assert('H. 无控制台错误', consoleErrors.length === 0, consoleErrors.join(' || ') || '');

  console.log('');
  console.log(`==== 总计 ${pass + fail} 个断言（PASS ${pass} / FAIL ${fail}） ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(err => { console.error('测试异常:', err); process.exit(2); });

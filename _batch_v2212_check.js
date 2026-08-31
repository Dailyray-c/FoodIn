// v2.21.2 增量验证（彻底修复版）：批量录入 UI 统一 + OCR 去 emoji + 净含量 label 统一 + 扫码图标高亮 + 问号路由
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
      version: '2.21.1'
    }));
    localStorage.setItem('guideShown_v2162', '1');
  });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/NotAllowedError|Permission denied|getUserMedia/i.test(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(BASE);
  await page.waitForTimeout(800);

  // ========== A. 版本号（先切到设置页，打开更新日志弹层，读取 changelog 文本） ==========
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '设置');
    if (nav.length) nav[nav.length - 1].click();
  });
  await page.waitForTimeout(400);
  // 点 "版本 v2.21.x" 按钮打开 changelog 弹层
  await page.evaluate(() => {
    const versionBtn = Array.from(document.querySelectorAll('button')).find(b => /版本\s*v\d+\.\d+\.\d+/.test(b.textContent));
    versionBtn && versionBtn.click();
  });
  await page.waitForTimeout(400);
  const ver = await page.evaluate(() => {
    // changelog 渲染在 .fixed inset-0 弹层内，但 #app.textContent 也包含
    const allText = document.body.textContent;
    return {
      hasVersion: allText.includes('2.21.2'),
      hasUI: allText.includes('批量录入 UI 统一'),
      hasRefactor: allText.includes('重构（批量录入 UI 统一）')
    };
  });
  assert('A. 版本号 2.21.2 已发布到 changelog', ver.hasVersion, JSON.stringify(ver));
  assert('A2. changelog 包含「批量录入 UI 统一」改项说明', ver.hasUI, JSON.stringify(ver));
  // 关闭弹层
  await page.evaluate(() => {
    // 找弹层内的 X 按钮（无文字 + 含 svg line）
    const closeBtn = Array.from(document.querySelectorAll('button')).find(b => {
      const t = b.textContent.trim();
      return t === '' && !!b.querySelector('svg line');
    });
    closeBtn && closeBtn.click();
  });
  await page.waitForTimeout(300);

  // ========== 进入批量录入页（扫码 → 小票批量录入 → + 添加商品） ==========
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '扫码');
    if (nav.length) nav[nav.length - 1].click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('小票批量录入'));
    btn && btn.click();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ 添加商品');
    btn && btn.click();
  });
  await page.waitForTimeout(700);

  // ========== B. 批量商品卡片结构彻底统一到 scan 页 ==========
  // 商品卡组容器内 4 个子：1) 头部（商品 N + 删除，纯横条） + 2) 条形码独立白底卡 + 3) 基础信息/日期信息合并白底卡 + 4) 更多信息独立折叠区（border 样式，与 scan 完全一致）
  const structureCheck = await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('div.space-y-3'));
    const itemContainer = containers.find(el => /商品\s*\d+/.test(el.textContent));
    if (!itemContainer) return { found: false };
    const children = Array.from(itemContainer.children);
    const header = children[0];
    const whiteCards = children.slice(1, 3).filter(c => c.classList.contains('bg-white'));
    const moreSection = children[3];   // 独立折叠区
    const mainCard = whiteCards[1];    // 第二张白底卡 = 基础信息+日期信息
    // 第二张卡片字段顺序（在 mainCard 内递归扫描所有 label + 分组标题 div）：
    const card2Order = mainCard ? (() => {
      const order = [];
      const walk = (node) => {
        if (!node || order.length > 20) return;
        // 命中条件：text-sm font-semibold 的 div（标题）+ label.textContent 起始
        if (node.nodeType === 1) {
          const tag = node.tagName;
          if (tag === 'DIV' && node.classList.contains('text-sm') && node.classList.contains('font-semibold')) {
            const t = node.textContent.trim();
            if (t === '基础信息') order.push('基础信息标题');
            else if (t === '日期信息') order.push('日期信息标题');
          } else if (tag === 'LABEL') {
            const t = node.textContent.trim().replace(/[\s\u00A0]+$/, '');
            if (t === '商品名称') order.push('商品名称');
            else if (t === '分类') order.push('分类');
            else if (t === '储存位置') order.push('储存位置');
            else if (t === '初始数量') order.push('初始数量');
            else if (t === '总价') order.push('总价');
            else if (t.startsWith('净含量')) order.push('净含量');
            else if (t === '入库日期') order.push('入库日期');
            else if (t === '生产日期') order.push('生产日期');
            else if (t === '保质期') order.push('保质期');
            else if (t === '到期日期') order.push('到期日期');
          }
          Array.from(node.childNodes || []).forEach(walk);
        }
      };
      walk(mainCard);
      return order;
    })() : [];

    return {
      found: true,
      totalChildren: children.length,
      whiteCardCount: whiteCards.length,
      hasMoreSection: !!moreSection,
      headerIsNotWhiteCard: header && !header.classList.contains('bg-white'),
      headerHasItemTitle: !!header && /商品\s*\d+/.test(header.textContent),
      headerHasDeleteBtn: !!header && header.textContent.includes('删除'),
      card1OnlyBarcode: whiteCards[0] && whiteCards[0].textContent.includes('条形码') && !whiteCards[0].textContent.includes('基础信息'),
      card2HasBasic: mainCard && mainCard.textContent.includes('基础信息'),
      card2HasDate: mainCard && mainCard.textContent.includes('日期信息'),
      card2HasBorderT: mainCard && /pt-2 border-t/.test(mainCard.innerHTML),
      moreHasText: !!moreSection && moreSection.textContent.includes('更多信息'),
      moreIsCollapsible: !!moreSection && !!moreSection.querySelector('button') && moreSection.classList.contains('border-gray-200'),
      labelFontSize: mainCard ? Array.from(mainCard.querySelectorAll('label')).slice(0, 5).map(l => l.className.match(/text-[\w\-\[\]]+/g)?.[0] || '') : [],
      qtyLabelText: mainCard ? (Array.from(mainCard.querySelectorAll('label')).find(l => /初始数量|数量/.test(l.textContent))?.textContent.trim() || null) : null,
      card2Order
    };
  });
  assert('B0. 找到商品卡组容器', structureCheck.found, JSON.stringify(structureCheck));
  assert('B1. 容器 = 1 头部 + 2 白底卡 + 1 border 折叠区（共 4 子）', structureCheck.whiteCardCount === 2 && structureCheck.totalChildren === 4 && structureCheck.hasMoreSection, JSON.stringify(structureCheck));
  assert('B2. 第一张白底卡仅含「条形码」', structureCheck.card1OnlyBarcode, JSON.stringify(structureCheck));
  assert('B3. 第二张白底卡 = 基础信息 + 日期信息（合并 + border-t 分隔）', structureCheck.card2HasBasic && structureCheck.card2HasDate && structureCheck.card2HasBorderT, JSON.stringify(structureCheck));
  assert('B4. 第四子 = 独立「更多信息」折叠区（border 样式，与 scan 一致）', structureCheck.moreHasText && structureCheck.moreIsCollapsible, JSON.stringify(structureCheck));
  assert('B5. 头部 = 「商品 N + 删除」（非白底卡）', structureCheck.headerIsNotWhiteCard && structureCheck.headerHasItemTitle && structureCheck.headerHasDeleteBtn, JSON.stringify(structureCheck));
  assert('B6. 第二卡 label 字号 = text-xs（统一）', structureCheck.labelFontSize.length > 0 && structureCheck.labelFontSize.every(c => c === 'text-xs' || c === 'text-[11px]'), JSON.stringify(structureCheck.labelFontSize));
  assert('B7. 「数量」→「初始数量」', structureCheck.qtyLabelText === '初始数量', 'actual=' + structureCheck.qtyLabelText);
  assert('B8. 第二卡字段顺序正确（基础→商品名称→分类→储存位置→初始数量→总价+净含量→日期信息→入库/生产/保质/到期）',
    ['基础信息标题', '商品名称', '分类', '储存位置', '初始数量', '总价', '净含量', '日期信息标题', '入库日期', '生产日期', '保质期', '到期日期'].every((v, i) => structureCheck.card2Order[i] === v),
    JSON.stringify(structureCheck.card2Order));

  // ========== C. 入库日期已合并到「日期信息」组内（border-t 之后） ==========
  // v2.21.2 结构：「日期信息」标题 div 自身带 pt-2 border-t border-gray-100，随后是入库日期、生产日期、保质期+到期日期 三个子块（兄弟节点）
  const stockInDateCheck = await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('div.space-y-3'));
    const itemContainer = containers.find(el => /商品\s*\d+/.test(el.textContent));
    if (!itemContainer) return { found: false };
    const children = Array.from(itemContainer.children).slice(1);
    const mainCard = children[1];
    if (!mainCard) return { found: false };
    const dateTitleDiv = Array.from(mainCard.querySelectorAll('div.text-sm.font-semibold')).find(d => d.textContent.trim() === '日期信息');
    // 日期信息组 = 标题 div 自身及其后续所有兄弟节点，直到 mainCard 结束
    let stockInInDateSection = false;
    if (dateTitleDiv) {
      let cursor = dateTitleDiv;
      while (cursor && cursor !== mainCard) {
        const labels = Array.from(cursor.querySelectorAll('label')).filter(l => l.textContent.trim() === '入库日期');
        if (labels.length) { stockInInDateSection = true; break; }
        cursor = cursor.nextElementSibling;
      }
    }
    const moreCard = children[2];
    const moreHasStockIn = moreCard ? !!Array.from(moreCard.querySelectorAll('label')).find(l => l.textContent.trim() === '入库日期') : null;
    return {
      found: true,
      mainCardHasStockInLabel: !!Array.from(mainCard.querySelectorAll('label')).find(l => l.textContent.trim() === '入库日期'),
      stockInInDateSection,
      moreCardHasStockInLabel: moreHasStockIn
    };
  });
  assert('C1. 入库日期在「日期信息」组内', stockInDateCheck.stockInInDateSection, JSON.stringify(stockInDateCheck));
  assert('C2. 「更多信息」折叠区不再含「入库日期」', !stockInDateCheck.moreCardHasStockInLabel, JSON.stringify(stockInDateCheck));

  // ========== D. 净含量·单件商品 label 字号统一 ==========
  const netContentCheck = await page.evaluate(() => {
    // 同时检查扫码页与批量录入页的净含量 label
    // 当前在批量录入页——净含量在第二张卡内
    const batchNetLabel = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('净含量') && l.textContent.includes('单件商品'));
    const batchFont = batchNetLabel ? batchNetLabel.className.match(/text-[\w\-\[\]]+/g)?.find(c => c.startsWith('text-')) : null;
    return {
      batchHasNetLabel: !!batchNetLabel,
      batchFont: batchFont,
      batchLabelHTML: batchNetLabel ? batchNetLabel.innerHTML : null
    };
  });
  assert('D. 批量录入净含量·单件商品 label 字号 = text-[11px]（与单条录入统一）',
    netContentCheck.batchHasNetLabel && netContentCheck.batchFont === 'text-[11px]',
    JSON.stringify(netContentCheck));

  // ========== E. OCR 按钮去除 emoji ==========
  const ocrButtonCheck = await page.evaluate(() => {
    const ocrCard = Array.from(document.querySelectorAll('.bg-white.rounded-xl')).find(c => /上传小票图片/.test(c.textContent) || c.textContent.includes('自动识别商品名称'));
    if (!ocrCard) return { found: false };
    const buttons = Array.from(ocrCard.querySelectorAll('button'));
    const cameraBtn = buttons.find(b => b.textContent.includes('拍摄小票'));
    const albumBtn = buttons.find(b => b.textContent.includes('上传图片'));
    return {
      found: true,
      cameraText: cameraBtn ? cameraBtn.textContent.trim() : null,
      albumText: albumBtn ? albumBtn.textContent.trim() : null,
      hasEmoji: [cameraBtn, albumBtn].some(b => b && /[📷🖼]/.test(b.textContent))
    };
  });
  assert('E. OCR 双按钮纯文字「拍摄小票 / 上传图片」（无 emoji）',
    ocrButtonCheck.found && ocrButtonCheck.cameraText === '拍摄小票' && ocrButtonCheck.albumText === '上传图片' && !ocrButtonCheck.hasEmoji,
    JSON.stringify(ocrButtonCheck));

  // ========== F. 批量录入扫码相机按钮默认橙色高亮 ==========
  const scanIconCheck = await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('div.space-y-3'));
    const itemContainer = containers.find(el => /商品\s*\d+/.test(el.textContent));
    if (!itemContainer) return { found: false };
    const firstCard = itemContainer.children[1];   // 第一张白底卡 = 条形码
    const scanBtn = firstCard ? firstCard.querySelector('button[title="扫码录入"]') : null;
    if (!scanBtn) return { found: false };
    const svg = scanBtn.querySelector('svg');
    return {
      found: true,
      textColors: scanBtn.className.match(/text-\S+/g)?.filter(c => c.startsWith('text-')),
      hasBgOrange: /bg-orange-/.test(scanBtn.className),
      isFlexCenter: /flex items-center justify-center/.test(scanBtn.className),
      hasSvg: !!svg
    };
  });
  assert('F. 批量扫码图标默认橙色高亮（text-orange-500 + bg-orange-50 + flex 居中）',
    scanIconCheck.found && scanIconCheck.textColors?.includes('text-orange-500') && scanIconCheck.hasBgOrange && scanIconCheck.isFlexCenter,
    JSON.stringify(scanIconCheck));

  // ========== G. 问号路由修复 ==========
  await page.evaluate(() => {
    const qBtn = document.querySelector('button[title="使用指南"]');
    qBtn && qBtn.click();
  });
  await page.waitForTimeout(1000);   // scroll + flash
  const guideCheck = await page.evaluate(() => {
    const onGuidePage = !!Array.from(document.querySelectorAll('div')).find(d => d.textContent.includes('快速上手 · 5 分钟学会'));
    const anchor = document.getElementById('m-batch-recognition');
    return {
      onGuidePage,
      anchorExists: !!anchor,
      anchorHasFlash: anchor?.classList.contains('flash'),
      anchorInViewport: anchor ? (() => {
        const rect = anchor.getBoundingClientRect();
        return rect.top >= 0 && rect.top < window.innerHeight;
      })() : null,
      anchorText: anchor ? anchor.textContent.slice(0, 60) : null
    };
  });
  assert('G1. 批量录入页点「?」进入使用指南页', guideCheck.onGuidePage, JSON.stringify(guideCheck));
  assert('G2. m-batch-recognition 锚点已渲染', guideCheck.anchorExists && guideCheck.anchorText?.includes('小票批量录入'), JSON.stringify(guideCheck));
  assert('G3. m-batch-recognition 锚点在可视区内（scrollIntoView 生效）', guideCheck.anchorInViewport === true, JSON.stringify(guideCheck));

  // ========== H. 回归：重构后批量录入核心流程入库成功 ==========
  // 先回批量录入页
  await page.evaluate(() => {
    const exitGuideBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('返回设置'));
    exitGuideBtn && exitGuideBtn.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '扫码');
    if (nav.length) nav[nav.length - 1].click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('小票批量录入'));
    btn && btn.click();
  });
  await page.waitForTimeout(400);

  // 填表
  const fillResult = await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('div.space-y-3'));
    const itemContainer = containers.find(el => /商品\s*\d+/.test(el.textContent));
    if (!itemContainer) return { ok: false, reason: 'no itemContainer' };
    const cards = Array.from(itemContainer.children).slice(1);
    const mainCard = cards[1];   // 基础信息+日期信息
    const inputs = Array.from(mainCard.querySelectorAll('input'));
    const setVal = (input, val) => {
      if (!input) return false;
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const nameInput = inputs.find(i => i.placeholder === '请输入商品名称');
    const qtyInput = inputs.find(i => i.type === 'number' && i.placeholder === '1');
    // date inputs 在批量录入第二张白底卡内顺序：入库日期（不联动）、生产日期（@change 联动）、到期日期（@change 联动）
    const dateInputs = inputs.filter(i => i.type === 'date');
    const prodInput = dateInputs[1];   // 第二个 = 生产日期
    // 通过 label 找保质期
    const shelfInput = (() => {
      const labels = Array.from(mainCard.querySelectorAll('label'));
      const shelfLabel = labels.find(l => l.textContent.trim() === '保质期');
      if (!shelfLabel) return null;
      return shelfLabel.parentElement.querySelector('input[type="number"]');
    })();
    return {
      ok: !!nameInput && !!qtyInput && !!prodInput && !!shelfInput,
      dateInputCount: dateInputs.length,
      nameSet: setVal(nameInput, '测试纯牛奶'),
      qtySet: setVal(qtyInput, '2'),
      prodSet: setVal(prodInput, '2026-08-01'),
      shelfSet: setVal(shelfInput, '12')
    };
  });
  // 等三联动算出 expiryDate
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('保存全部'));
    btn && btn.click();
  });
  await page.waitForTimeout(1000);
  const saveResult = await page.evaluate(() => {
    const products = JSON.parse(localStorage.getItem('food_inventory_products') || '[]');
    const records = JSON.parse(localStorage.getItem('food_inventory_records') || '[]');
    const last = records[records.length - 1];
    return {
      productCount: products.length,
      lastProduct: products[products.length - 1]?.name || null,
      recordCount: records.length,
      lastRecDetail: last?.detail || null,
      onScanPage: document.querySelector('#app').textContent.includes('小票批量录入')
    };
  });
  assert('H. 重构后核心流程仍能成功入库（产品+记录+跳回扫码页）',
    saveResult.productCount === 1 && saveResult.lastProduct === '测试纯牛奶' &&
    saveResult.lastRecDetail?.includes('批量入库') && saveResult.onScanPage,
    JSON.stringify({ fill: fillResult, save: saveResult }));

  // ========== I. 无控制台错误 ==========
  assert('I. 无控制台错误', consoleErrors.length === 0, consoleErrors.join(' || ') || '');

  console.log('');
  console.log(`==== 总计 ${pass + fail} 个断言（PASS ${pass} / FAIL ${fail}） ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(err => { console.error('测试异常:', err); process.exit(2); });

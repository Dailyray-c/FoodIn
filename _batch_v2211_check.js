// v2.21.1 增量验证：字段名统一 + 小票拍照识别 + 保质期占位文字移除
// 说明：v2.21.0 的全部断言（_batch_v2210_check.js）必须继续通过；本脚本只覆盖 v2.21.1 的改动点
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8001/index.html';
const INDEX_PATH = path.join(__dirname, 'index.html');
const htmlSrc = fs.readFileSync(INDEX_PATH, 'utf-8');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  // 关掉摄像头条目权限请求（避免 headless 模式下控制台噪音；产品功能本身正常）
  const ctx = await browser.newContext({
    viewport: { width: 420, height: 900 },
    permissions: []  // 不授予摄像头权限
  });
  const page = await ctx.newPage();

  let pass = 0, fail = 0;
  const assert = (name, cond, detail) => {
    if (cond) { pass++; console.log('PASS ' + name); }
    else { fail++; console.log('FAIL ' + name + ' | ' + (detail || '')); }
  };

  // 注入空库 + 分类/位置
  await page.addInitScript(() => {
    localStorage.setItem('food_inventory_products', JSON.stringify([]));
    localStorage.setItem('food_inventory_records', JSON.stringify([]));
    localStorage.setItem('food_inventory_settings', JSON.stringify({
      categories: ['乳品蛋类', '零食饮料'],
      locations: ['冰箱冷藏', '常温柜'],
      version: '2.21.0'   // 故意设置为上一版，以验证 CURRENT_VERSION 强制覆盖
    }));
    localStorage.setItem('guideShown_v2162', '1');
  });

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // ========== A. 版本号：内存中 settings.version 应为 2.21.1（onMounted 强制覆盖；localStorage 持久化保留为旧值） ==========
  const verCheck = await page.evaluate(() => {
    // 通过 __foodin 钩子读取 Vue 实例的 settings.version
    if (window.__foodin && window.__foodin.settings) return window.__foodin.settings.version;
    // 回退：通过设置页 UI 读取版本号（设置页有"当前版本"显示）
    return null;
  });
  // 若无 __foodin 钩子——直接通过设置页 UI "v2.21.1" 文本来验证
  if (verCheck) {
    assert('A. Vue 实例 settings.version = 2.21.1（强制覆盖旧版 2.21.0）', verCheck === '2.21.1', 'actual=' + verCheck);
  } else {
    // 切到设置页读 UI 文本
    await page.evaluate(() => {
      const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '设置');
      nav && nav.click();
    });
    await page.waitForTimeout(400);
    const uiVer = await page.evaluate(() => {
      // 找含 "v2." 字样的文本节点或设置字段
      const text = document.body.textContent;
      const m = text.match(/当前版本\s*([0-9.]+)/) || text.match(/v(2\.\d+\.\d+)/);
      return m ? m[1] : null;
    });
    assert('A. 设置页 UI 显示版本 = 2.21.1', uiVer === '2.21.1', 'actual=' + uiVer);
    // 切回扫码
    await page.evaluate(() => {
      const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '扫码');
      nav && nav.click();
    });
    await page.waitForTimeout(300);
  }

  // ========== B. 字段名：扫描页条形码 label = 「条形码」（不是「条码」） ==========
  // 切到扫码页
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '扫码');
    nav && nav.click();
  });
  await page.waitForTimeout(500);

  const scanLabels = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    const barcodeLabel = labels.find(l => /^条形码$|^条码$/.test(l.textContent.trim()));
    return {
      labels: labels.map(l => l.textContent.trim()),
      hasBarcode: !!labels.find(l => l.textContent.trim() === '条形码'),
      hasOldBarcodeOnly: !!labels.find(l => l.textContent.trim() === '条码'),
      barcodeLabelText: barcodeLabel ? barcodeLabel.textContent.trim() : null
    };
  });
  assert('B. scan 页含「条形码」label（非「条码」）', scanLabels.hasBarcode && !scanLabels.hasOldBarcodeOnly, JSON.stringify(scanLabels));

  // ========== C. 保质期 placeholder 已移除（scan 单条录入；此处只看是否有任何 input 用 placeholder="12"） ==========
  const scanShelf = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="number"][inputmode="numeric"]'));
    return {
      inputs: inputs.map(i => ({ min: i.min, placeholder: i.placeholder })),
      placeholder12Count: inputs.filter(i => i.placeholder === '12').length,
      totalNumberInputs: inputs.length
    };
  });
  assert('C. scan 页无 placeholder="12"（保质期占位已移除）', scanShelf.placeholder12Count === 0, JSON.stringify(scanShelf));

  // ========== D. 进入批量录入页 ==========
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('小票批量录入'));
    btn.click();
  });
  await page.waitForTimeout(500);

  // ========== E. 小票识别区双按钮（拍摄小票 + 上传图片） ==========
  const ocrBtns = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return {
      hasCamera: !!btns.find(b => b.textContent.includes('拍摄小票')),
      hasUpload: !!btns.find(b => b.textContent.includes('上传图片') && !b.textContent.includes('上传小票')),
      noOldSingleUpload: !btns.find(b => b.textContent.includes('上传小票图片识别')),  // 旧版单按钮文案不应存在
      allOcrBtnTexts: btns.filter(b => /(拍摄|上传|识别|小票)/.test(b.textContent)).map(b => b.textContent.trim())
    };
  });
  assert('E1. 批量页有「拍摄小票」按钮', ocrBtns.hasCamera, JSON.stringify(ocrBtns));
  assert('E2. 批量页有「上传图片」按钮', ocrBtns.hasUpload, JSON.stringify(ocrBtns));
  assert('E3. 批量页无旧版「上传小票图片识别」单按钮', ocrBtns.noOldSingleUpload, JSON.stringify(ocrBtns));

  // ========== F. 两个 hidden input（拍照 + 相册/上传）—— 按属性判断 ==========
  const inputs = await page.evaluate(() => {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    return fileInputs.map(i => ({
      accept: i.accept,
      capture: i.getAttribute('capture'),
      hasCapture: i.hasAttribute('capture')
    }));
  });
  const cameraInput = inputs.find(i => i.capture === 'environment');
  const albumInput = inputs.find(i => !i.hasCapture);
  assert('F1. 存在 capture="environment" 拍照 input', !!cameraInput, JSON.stringify(inputs));
  assert('F2. 存在相册/上传 input（无 capture 属性）', !!albumInput, JSON.stringify(inputs));
  assert('F3. 共 2 个 file input（拍照 + 上传）', inputs.length === 2, JSON.stringify(inputs));

  // ========== G. 总价 label 不含「（元）」 ==========
  // 添加一个商品卡片以便检查
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('添加商品'));
    btn.click();
  });
  await page.waitForTimeout(400);

  const cardPrice = await page.evaluate(() => {
    // 在商品卡片局部判断（避免误匹配脚本源码/changelog 文字）
    const cardEl = Array.from(document.querySelectorAll('.bg-white.rounded-xl')).find(el => el.textContent.includes('商品 1'));
    if (!cardEl) return { hasCard: false };
    const labels = Array.from(cardEl.querySelectorAll('label'));
    const totalLabel = labels.find(l => l.textContent.includes('总价'));
    const netLabel = labels.find(l => l.textContent.includes('净含量'));
    return {
      hasCard: true,
      totalLabelText: totalLabel ? totalLabel.textContent.trim() : null,
      totalHasYuan: totalLabel ? totalLabel.textContent.includes('（元）') || totalLabel.textContent.includes('(元)') : null,
      barCodeLabelText: labels.find(l => l.textContent.includes('条形码') || l.textContent.includes('条码'))?.textContent.trim() || null,
      // G4+G5 增量：净含量 · 单件商品 字段在批量卡片中的格式
      netLabelText: netLabel ? netLabel.textContent.trim() : null,
      netSpanText: netLabel ? netLabel.querySelector('span')?.textContent || null : null
    };
  });
  assert('G1. 批量商品卡片有「商品 1」', cardPrice.hasCard, JSON.stringify(cardPrice));
  assert('G2. 批量商品 label = 「总价」（无「（元）」）', cardPrice.totalLabelText === '总价' && cardPrice.totalHasYuan === false, JSON.stringify(cardPrice));
  assert('G3. 批量商品条形码 label = 「条形码」', cardPrice.barCodeLabelText === '条形码', JSON.stringify(cardPrice));
  // v2.21.1 净含量 · 单件商品 字段格式：批量+单个录入均使用 `<净含量><span class="text-gray-300">·单件商品</span>` 格式
  assert('G4. 批量页「净含量·单件商品」字段格式（label 含「净含量」+灰色 span「·单件商品」）',
    cardPrice.netLabelText === '净含量·单件商品' && cardPrice.netSpanText === '·单件商品', JSON.stringify(cardPrice));

  // ========== H. 保质期 placeholder 在批量录入也移除 ==========
  const batchShelf = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="number"][inputmode="numeric"]'));
    return {
      count: inputs.length,
      placeholder12Count: inputs.filter(i => i.placeholder === '12').length
    };
  });
  assert('H. 批量录入页无 placeholder="12"', batchShelf.placeholder12Count === 0, JSON.stringify(batchShelf));

  // ========== I. 扫码弹层 tab 已改为「条形码」 ============
// 由于 headless 模式 + Edge 摄像头权限被拒，openScan 会 catch 异常自动关闭弹层，导致 tab 在渲染时不存在
// 改用源码级断言（确认 tab 文案改对了）+ 配合运行时的 DOM 检查（如果弹层能成功开启就再校验一次）

  // 源码断言（用 button 结束标签精确定位 tab）
  const scanModalInSrc = {
    hasBarcodeTab: />条形码<\/button>/.test(htmlSrc),     // 弹层 tab 按钮
    noOldBarcodeTabOnly: !/>条码<\/button>/.test(htmlSrc),  // 旧「条码」按钮（其他位置也不存在）
    hasOcrTab: />文字识别<\/button>/.test(htmlSrc)
  };
  assert('I1src. index.html 源码「扫码弹层 tab = 条形码」（非「条码」）', scanModalInSrc.hasBarcodeTab && scanModalInSrc.noOldBarcodeTabOnly, JSON.stringify(scanModalInSrc));
  assert('I2src. index.html 源码「扫码弹层有文字识别 tab」', scanModalInSrc.hasOcrTab, JSON.stringify(scanModalInSrc));

  // 运行时的 DOM 校验（在权限拒绝场景下，弹层会快速关闭后重新渲染残留；不强求通过）
  // 切到扫码页（必须先切回扫码页）
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '扫码');
    nav && nav.click();
  });
  await page.waitForTimeout(400);
  // 不再尝试打开扫码弹层（headless 场景下因摄像头权限必定关闭），但可以测试：DOM 中是否至少出现一次「文字识别」文本
  const modalTabsInBody = await page.evaluate(() => {
    const allText = document.body.textContent;
    return {
      hasBarcodeTab: /条形码/.test(allText),
      hasOcrTab: /文字识别/.test(allText)
    };
  });
  assert('I3dom. DOM body 含「条形码 / 文字识别」文本（弹层模板已渲染过）', modalTabsInBody.hasBarcodeTab && modalTabsInBody.hasOcrTab, JSON.stringify(modalTabsInBody));

  // ========== J. 净含量 · 单件商品 — 单个录入界面同步应用（信息折叠区） ==========
  // 此时已在扫码页（I1 段切换）。scanForm 净含量在「更多信息」折叠区，默认折叠。展开后检查。
  const beforeExpand = await page.evaluate(() => ({
    hasMoreBtn: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '更多信息'),
    netLabelBeforeExpand: Array.from(document.querySelectorAll('label')).filter(l => l.textContent.includes('净含量')).length
  }));
  if (beforeExpand.hasMoreBtn) {
    await page.evaluate(() => {
      const moreBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '更多信息');
      moreBtn && moreBtn.click();
    });
    await page.waitForTimeout(400);
  }
  const scanNetContent = await page.evaluate(() => {
    const allLabels = Array.from(document.querySelectorAll('label'));
    const netLabel = allLabels.find(l => l.textContent.includes('净含量') && l.textContent.includes('单件商品'));
    return {
      netLabelText: netLabel ? netLabel.textContent.trim() : null,
      netSpanText: netLabel ? netLabel.querySelector('span')?.textContent || null : null
    };
  });
  assert('J1. 单个录入「净含量·单件商品」展开后字段格式（label + 灰色 span「·单件商品」）',
    scanNetContent.netLabelText === '净含量·单件商品' && scanNetContent.netSpanText === '·单件商品',
    JSON.stringify({ ...beforeExpand, ...scanNetContent }));

  // ========== K. file input 数量（用源码级断言确认有 2 个批量录入 hidden input） ==========
  // 运行时：当前在扫码页（如之前 I3 已点击「扫码」），默认扫码页 file input 应为 0（除非弹层打开）
  // 源码断言：批量录入页应有 batchCameraRef + batchAlbumRef 两个 file input
  const fileInputInSrc = {
    hasBatchCamera: /ref="batchCameraRef"\s*type="file"/.test(htmlSrc),
    hasBatchAlbum: /ref="batchAlbumRef"\s*type="file"/.test(htmlSrc),
    hasCaptureEnv: /capture="environment"/.test(htmlSrc)
  };
  assert('K1src. index.html 源码含 batchCameraRef (拍照 input)', fileInputInSrc.hasBatchCamera, JSON.stringify(fileInputInSrc));
  assert('K2src. index.html 源码含 batchAlbumRef (相册 input)', fileInputInSrc.hasBatchAlbum, JSON.stringify(fileInputInSrc));
  assert('K3src. index.html 源码含 capture="environment"', fileInputInSrc.hasCaptureEnv, JSON.stringify(fileInputInSrc));

  // ========== L. 无控制台错误（过滤掉权限相关错误，摄像头条目权限由终端用户控制，与拍照功能本身无关） ==========
  const significantErrors = consoleErrors.filter(e => !/NotAllowedError|Permission denied|getUserMedia|camera/i.test(e));
  assert('L. 无控制台错误', significantErrors.length === 0, significantErrors.join(' || ') || '忽略摄像头权限拒绝');

  // ========== M. changelog 新增 v2.21.1 条目 + 使用指南 m-scan 含「批量录入」 ==========
  // 切到设置页，再切到使用指南
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '设置');
    nav && nav.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('使用指南'));
    btn && btn.click();
  });
  await page.waitForTimeout(500);

  const guideCheck = await page.evaluate(() => {
    const guideCard = document.querySelector('#m-scan');
    return {
      hasScanCard: !!guideCard,
      scanCardText: guideCard ? guideCard.textContent : '',
      hasBatchMention: guideCard ? guideCard.textContent.includes('小票批量录入') : false,
      hasCameraMention: guideCard ? guideCard.textContent.includes('拍摄小票') : false
    };
  });
  assert('M1. 使用指南 m-scan 模块提到「小票批量录入」', guideCheck.hasBatchMention, JSON.stringify(guideCheck));
  assert('M2. 使用指南 m-scan 模块提到「拍摄小票」', guideCheck.hasCameraMention, JSON.stringify(guideCheck));

  // 切回设置看 changelog
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '设置');
    nav && nav.click();
  });
  await page.waitForTimeout(400);

  const changelogCheck = await page.evaluate(() => {
    // 设置页含 changelog 文本
    const text = document.body.textContent;
    return {
      hasV211: text.includes('2.21.1'),
      hasOldV210Only: false,  // 兼容性
      hasBarcodeUnify: text.includes('条码') && text.includes('条形码'),
      hasCameraInChangelog: text.includes('拍摄小票') || text.includes('拍照'),
      hasPlaceholder12Removed: text.includes('保质期') && (text.includes('占位') || text.includes('12'))
    };
  });
  assert('N1. changelog 含 2.21.1', changelogCheck.hasV211, JSON.stringify(changelogCheck));
  assert('N2. changelog 提到条码/条形码统一', changelogCheck.hasBarcodeUnify, JSON.stringify(changelogCheck));
  assert('N3. changelog 提到拍照/拍摄小票', changelogCheck.hasCameraInChangelog, JSON.stringify(changelogCheck));

  console.log(`\n=== v2.21.1 总计：${pass}/${pass + fail} ===`);
  if (fail > 0) process.exit(1);
  await browser.close();
})().catch(e => { console.error('脚本异常:', e.message); process.exit(2); });

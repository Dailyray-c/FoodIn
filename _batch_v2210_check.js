// v2.21.0 批量录入 + OCR 条码识别优化验证脚本（修复版）
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://127.0.0.1:8001/index.html';
const today = new Date();
const p2 = n => String(n).padStart(2, '0');
const todayStr = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();

  let pass = 0, fail = 0;
  const assert = (name, cond, detail) => {
    if (cond) { pass++; console.log('PASS ' + name); }
    else { fail++; console.log('FAIL ' + name + ' | ' + (detail || '')); }
  };

  // 注入 localStorage 数据（空库 + 分类/位置 + 版本）
  await page.addInitScript((seed) => {
    localStorage.setItem('food_inventory_products', JSON.stringify([]));
    localStorage.setItem('food_inventory_records', JSON.stringify([]));
    localStorage.setItem('food_inventory_settings', JSON.stringify({
      categories: ['乳品蛋类', '零食饮料'],
      locations: ['冰箱冷藏', '常温柜'],
      version: '2.20.7'
    }));
    localStorage.setItem('guideShown_v2162', '1');
  }, {});

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // ============ 1. 扫码页有批量录入入口（layers 图标） ============
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '扫码');
    nav && nav.click();
  });
  await page.waitForTimeout(600);
  const entry = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('小票批量录入'));
    if (!btn) return null;
    return {
      has: true,
      text: btn.textContent.replace(/\s+/g, ' ').trim(),
      hasLayers: !!btn.querySelector('polygon')   // layers 图标含 polygon
    };
  });
  assert('1. 扫码页有批量录入入口', entry && entry.has && entry.hasLayers, JSON.stringify(entry));

  // ============ 2. 点击进入批量录入页 ============
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('小票批量录入'));
    btn.click();
  });
  await page.waitForTimeout(600);
  const batchPage = await page.evaluate(() => ({
    title: document.querySelector('.page-header h1, header h1, .px-4.py-3 h1')?.textContent || '',
    hasBack: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('返回扫码')),
    // v2.21.1：原「上传小票图片识别」拆分为「拍摄小票」+「上传图片」双按钮
    hasUpload: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('上传小票图片识别') || b.textContent.trim() === '上传图片' || b.textContent.includes('🖼')),
    hasAdd: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('添加商品')),
    hasEmpty: document.body.textContent.includes('还没有商品')
  }));
  assert('2. 批量录入页元素齐全', batchPage.hasBack && batchPage.hasUpload && batchPage.hasAdd && batchPage.hasEmpty, JSON.stringify(batchPage));

  // ============ 2b. OCR 小票识别区（需求 2 界面接入） ============
  const ocrUi = await page.evaluate(() => ({
    // v2.21.1：上传按钮文案改为「上传图片」
    hasUploadBtn: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('上传小票图片识别') || b.textContent.includes('上传图片')),
    hasHint: document.body.textContent.includes('自动识别商品名称 / 条码 / 金额'),
    hasBarcodeCandidateTitle: document.body.textContent.includes('识别到条码'),
    hasLineTitle: document.body.textContent.includes('识别到文字'),
    hasHiddenFileInput: !!document.querySelector('input[type="file"][accept="image/*"]')
  }));
  assert('2b. OCR 小票识别区（上传按钮/提示/候选区/隐藏文件框）', ocrUi.hasUploadBtn && ocrUi.hasHint && ocrUi.hasBarcodeCandidateTitle && ocrUi.hasLineTitle && ocrUi.hasHiddenFileInput, JSON.stringify(ocrUi));

  // ============ 3. 添加商品 → 卡片结构（需求 3 排版） ============
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('添加商品'));
    btn.click();
  });
  await page.waitForTimeout(400);
  const card = await page.evaluate(() => {
    // 仅在商品卡片局部 DOM 判断（排除 <script> 源码中的 changelog 文案干扰）
    const cardEl = Array.from(document.querySelectorAll('.bg-white.rounded-xl')).find(el => el.textContent.includes('商品 1'));
    const cardText = cardEl ? cardEl.textContent : '';
    const cardHtml = cardEl ? cardEl.innerHTML : '';
    // 分类 label 及其向上 3 层容器均不应含 border-t（日期信息区块的 border-t 不在此链上）
    const catLabel = cardEl ? Array.from(cardEl.querySelectorAll('label')).find(l => l.textContent.trim() === '分类') : null;
    let node = catLabel ? catLabel.parentElement : null;
    let catHasBorder = false;
    for (let i = 0; node && i < 3; i++) {
      if (node.className && String(node.className).includes('border-t')) { catHasBorder = true; break; }
      node = node.parentElement;
    }
    return {
      hasBasicTitle: cardText.includes('基础信息'),                       // 基础信息标题
      hasDateTitle: cardText.includes('日期信息'),                         // 日期信息标题
      hasQueryBtn: cardText.includes('查询') || cardText.includes('更新'), // 条码查询按钮
      // v2.21.1：批量录入「总价（元）」→「总价」（去掉单位标注）——直接判断含「总价」即可
      hasTotal: cardText.includes('总价'),
      hasSubtotal: cardText.includes('小计'),                              // 卡片内不应有小计（changelog 注释也不应传入）
      hasNetPerUnit: cardText.includes('净含量') && cardText.includes('单件商品'), // 净含量·单件商品
      hasQty: cardText.includes('数量'),                                   // 数量在位置下方
      noUnitPrice: !cardText.includes('单价'),                             // 更多信息无单价
      noSpec: !cardText.includes('规格'),                                  // 更多信息无规格
      hasMoreBtn: cardText.includes('更多信息'),
      noBorderOnCat: !catHasBorder,                                        // 分类上方无分割线（分类label链上无 border-t）
      hasBarcodeInput: !!cardEl.querySelector('input[type="text"][placeholder*="条码"]') ||
        !!cardEl.querySelector('input[inputmode="numeric"]')
    };
  });
  assert('3. 商品卡片排版（基础信息标题）', card.hasBasicTitle);
  assert('3. 商品卡片排版（条码查询按钮）', card.hasQueryBtn);
  assert('3. 商品卡片排版（总价/无小计）', card.hasTotal && !card.hasSubtotal);
  assert('3. 商品卡片排版（净含量·单件商品）', card.hasNetPerUnit);
  assert('3. 商品卡片排版（更多信息无单价/无规格）', card.noUnitPrice && card.noSpec);
  assert('3. 商品卡片排版（分类上方无分割线）', card.noBorderOnCat);
  assert('3. 商品卡片排版（条码输入框存在）', card.hasBarcodeInput);

  // ============ 4. 更多信息折叠内容 ============
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '更多信息');
    btn && btn.click();
  });
  await page.waitForTimeout(300);
  const moreInfo = await page.evaluate(() => {
    // 卡片局部 DOM 判断（排除 script 源码）
    const cardEl = Array.from(document.querySelectorAll('.bg-white.rounded-xl')).find(el => el.textContent.includes('商品 1'));
    const t = cardEl ? cardEl.textContent : '';
    return {
      hasBrand: t.includes('品牌'),
      hasManufacturer: t.includes('生产厂家'),
      hasStockIn: t.includes('入库日期'),
      hasImage: t.includes('商品图片'),
      hasNote: t.includes('备注'),
      noUnitPrice: !t.includes('单价'),
      noSpec: !t.includes('规格')
    };
  });
  assert('4. 更多信息（品牌/厂家/入库/图片/备注）', moreInfo.hasBrand && moreInfo.hasManufacturer && moreInfo.hasStockIn && moreInfo.hasImage && moreInfo.hasNote, JSON.stringify(moreInfo));
  assert('4. 更多信息（无单价/无规格）', moreInfo.noUnitPrice && moreInfo.noSpec, JSON.stringify(moreInfo));

  // ============ 5. 填写并保存全部 → 入库 ============
  // 注意：Vue3 v-model 监听 input 事件，须同时派发 input + change 才更新响应式
  const fillRes = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const set = (el, v) => {
      if (!el) return false;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    return {
      // v2.21.0 字段名 + v2.21.1 兼容（条形码 / 条码 都允许）
      name: set(inputs.find(i => i.placeholder === '请输入商品名称'), '测试纯牛奶'),
      qty: set(inputs.find(i => i.placeholder === '1'), '2'),
      prod: set(inputs.find(i => i.type === 'date'), '2026-08-01'),
      // v2.21.1：批量保质期 placeholder="12" 已移除——用「保质期」label 所在最小 div 内的 number input 定位
      shelf: (() => {
        const baoLabel = Array.from(document.querySelectorAll('label')).find(l => l.textContent.trim() === '保质期');
        if (!baoLabel) return false;
        // 保质期 label 在它父 div 里，父 div 内的第一个 number input 就是保质期输入框
        const container = baoLabel.parentElement;
        return set(container.querySelector('input[type="number"]'), '12');
      })()
    };
  });
  await page.waitForTimeout(400);

  const beforeCount = await page.evaluate(() => window.__foodin.products.value.length);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('保存全部'));
    btn && btn.click();
  });
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({
    count: window.__foodin.products.value.length,
    last: window.__foodin.products.value[window.__foodin.products.value.length - 1] || null,
    recDetail: window.__foodin.records.value[window.__foodin.records.value.length - 1]?.detail || '',
    onScanPage: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('小票批量录入'))
  }));
  assert('5. 保存全部后入库成功', fillRes.name && fillRes.qty && fillRes.prod && fillRes.shelf && after.count === beforeCount + 1 && after.last && after.last.name === '测试纯牛奶', JSON.stringify({ fillRes, after }));
  assert('5. 入库记录标记批量入库', after.recDetail.includes('批量入库'), after.recDetail);
  assert('5. 保存后回到扫码页', after.onScanPage, JSON.stringify(after));

  // ============ 6. 单个录入界面（scan 页）需求 3 应用 ============
  // 当前已在扫码页（保存后自动跳转）；若不在则导航过去
  const onScan = await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '扫码');
    return !!nav;
  });
  if (!onScan) {
    await page.evaluate(() => {
      const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '首页');
      nav && nav.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '扫码');
      nav && nav.click();
    });
  }
  await page.waitForTimeout(400);
  const scanMore = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '更多信息');
    btn && btn.click();
    return true;
  });
  await page.waitForTimeout(300);
  const scanMoreInfo = await page.evaluate(() => {
    // scan 表单「条码」与「商品名称」在两个独立卡片 → 用「更多信息」折叠区块（含净含量）局部判断
    const more = Array.from(document.querySelectorAll('.border.border-gray-200.rounded-xl'))
      .find(el => el.textContent.includes('更多信息') && el.textContent.includes('净含量'));
    const t = more ? more.textContent : '';
    return {
      hasNetPerUnit: t.includes('净含量') && t.includes('单件商品'),
      noSpec: !t.includes('规格'),
      hasPrice: t.includes('价格')
    };
  });
  assert('6. 单个录入更多信息（净含量·单件商品）', scanMoreInfo.hasNetPerUnit, JSON.stringify(scanMoreInfo));
  assert('6. 单个录入更多信息（无规格）', scanMoreInfo.noSpec, JSON.stringify(scanMoreInfo));

  // ============ 7. 版本号（v2.21.0 起统一了字段名与小票识别，v2.21.1 微调；脚本同时接受两版） ============
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '设置');
    nav && nav.click();
  });
  await page.waitForTimeout(400);
  const ver = await page.evaluate(() => {
    // 设置页 changelog 在 #app 内文本（含 script 源码，但版本号判断用 #app 内实际渲染文本更稳妥）
    const appText = document.querySelector('#app').textContent;
    return {
      // v2.21.0 与 v2.21.1 都接受（脚本兼容）
      hasVersion: /2\.21\.[01]/.test(appText),
      hasChangelog: appText.includes('小票批量录入') && appText.includes('OCR')
    };
  });
  assert('7. 版本号 2.21.0 / 2.21.1', ver.hasVersion, JSON.stringify(ver));

  // ============ 8. 无控制台错误 ============
  assert('8. 无控制台错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));

  console.log(`\n===== 结果: ${pass} 通过, ${fail} 失败 =====`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e.message); process.exit(2); });

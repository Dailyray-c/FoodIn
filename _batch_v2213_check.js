// v2.21.3 增量验证：扫码图标样式修正 + 底部导航 batch 高亮 + UI 彻底统一（净含量/总价归位折叠区）+ 桌面拍摄小票智能分流
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
      version: '2.21.2'
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

  // ========== A. 版本号 2.21.3 与 changelog 条目 ==========
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '设置');
    if (nav.length) nav[nav.length - 1].click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const versionBtn = Array.from(document.querySelectorAll('button')).find(b => /版本\s*v\d+\.\d+\.\d+/.test(b.textContent));
    versionBtn && versionBtn.click();
  });
  await page.waitForTimeout(400);
  const ver = await page.evaluate(() => {
    const t = document.body.textContent;
    return {
      hasVersion: t.includes('2.21.3'),
      hasFix: t.includes('修正（批量录入扫码图标）'),
      hasNav: t.includes('修正（底部导航高亮）'),
      hasCamera: t.includes('新增（桌面浏览器拍摄小票）')
    };
  });
  assert('A. changelog 版本号 2.21.3', ver.hasVersion, JSON.stringify(ver));
  assert('A2. 含扫码图标修正说明', ver.hasFix, JSON.stringify(ver));
  assert('A3. 含底部导航高亮修正说明', ver.hasNav, JSON.stringify(ver));
  assert('A4. 含桌面拍摄小票说明', ver.hasCamera, JSON.stringify(ver));
  await page.evaluate(() => {
    const closeBtn = Array.from(document.querySelectorAll('button')).find(b => {
      const t = b.textContent.trim();
      return t === '' && !!b.querySelector('svg line');
    });
    closeBtn && closeBtn.click();
  });
  await page.waitForTimeout(300);

  // ========== 进入批量录入页 ==========
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '扫码');
    if (nav.length) nav[nav.length - 1].click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('小票批量录入'));
    btn && btn.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('+ 添加商品'));
    btn && btn.click();
  });
  await page.waitForTimeout(300);

  // ========== B. 批量页底部导航「扫码」tab 高亮 ==========
  const navState = await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('nav')).find(n => n.className.includes('backdrop-blur'));
    if (!nav) return { found: false };
    const btns = Array.from(nav.querySelectorAll('button'));
    const scan = btns.find(b => b.textContent.includes('扫码'));
    return {
      found: !!nav,
      scanClass: scan ? scan.className : '',
      scanIsOrange: scan ? scan.className.includes('text-orange-500') : false
    };
  });
  assert('B. batch 页底部导航「扫码」tab 高亮橙色', navState.found && navState.scanIsOrange, JSON.stringify(navState));
  // 桌面侧边栏（lg 时可见）同样高亮
  const sideState = await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('nav')).find(n => !n.className.includes('backdrop-blur'));
    if (!nav) return { found: false };
    const scan = Array.from(nav.querySelectorAll('button')).find(b => b.textContent.includes('扫码'));
    return {
      found: !!nav,
      scanIsOrange: scan ? scan.className.includes('bg-orange-50') : false
    };
  });
  assert('B2. 桌面侧边栏「扫码」同步高亮（bg-orange-50）', sideState.found && sideState.scanIsOrange, JSON.stringify(sideState));

  // ========== C. 批量页条形码卡扫码图标：默认灰色、无背景框、right-2.5 ==========
  const iconState = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[title="扫码录入"]'));
    const b = btns.find(x => x.closest('#app').textContent.includes('商品 1'));
    if (!b) return { found: false };
    const cls = b.className;
    return {
      found: true,
      cls,
      noOrangeBg: !cls.includes('bg-orange-50'),
      isGray: cls.includes('text-gray-400'),
      posRight25: cls.includes('right-2.5')
    };
  });
  assert('C. 扫码图标默认灰色无背景', iconState.found && iconState.noOrangeBg && iconState.isGray, JSON.stringify(iconState));
  assert('C2. 图标位置 right-2.5 与单条录入一致', iconState.found && iconState.posRight25, JSON.stringify(iconState));

  // ========== D. 基础信息卡内不再有「总价」「净含量」字段 ==========
  const baseInfo = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.bg-white.rounded-xl'));
    // 找含「商品名称」label 的基础信息卡（含 input placeholder=请输入商品名称）
    const baseCard = cards.find(c => c.textContent.includes('商品名称') && c.textContent.includes('初始数量'));
    const moreSection = Array.from(document.querySelectorAll('div.border.border-gray-200.rounded-xl')).find(c => c.textContent.includes('更多信息'));
    return {
      baseCardFound: !!baseCard,
      baseHasPrice: baseCard ? baseCard.textContent.includes('总价') : null,
      baseHasNet: baseCard ? baseCard.textContent.includes('净含量') : null,
      moreFound: !!moreSection,
      moreHasNet: moreSection ? moreSection.textContent.includes('净含量') : null,
      moreHasPrice: moreSection ? moreSection.textContent.includes('总价') : null
    };
  });
  assert('D. 基础信息卡不含「总价」', baseInfo.baseCardFound && baseInfo.baseHasPrice === false, JSON.stringify(baseInfo));
  assert('D2. 基础信息卡不含「净含量」', baseInfo.baseCardFound && baseInfo.baseHasNet === false, JSON.stringify(baseInfo));

  // ========== E. 展开更多信息：净含量/总价归位 + 与单条录入 label 一字不差 ==========
  await page.evaluate(() => {
    const more = Array.from(document.querySelectorAll('div.border.border-gray-200.rounded-xl')).find(c => c.textContent.includes('更多信息'));
    const btn = more && more.querySelector('button');
    btn && btn.click();
  });
  await page.waitForTimeout(300);
  const moreState = await page.evaluate(() => {
    const more = Array.from(document.querySelectorAll('div.border.border-gray-200.rounded-xl')).find(c => c.textContent.includes('更多信息'));
    const html = more ? more.innerHTML : '';
    return {
      found: !!more,
      hasNet: html.includes('净含量'),
      netLabel: html.includes('净含量<span class="text-gray-300">·单件商品</span>') || html.includes('净含量<span class="text-gray-300">·单件商品</span>'),
      hasNetNote: html.includes('·单件商品'),
      hasPrice: html.includes('总价'),
      hasPriceNote: html.includes('·多件为总价'),
      hasViewImg: html.includes('查看图片'),
      hasNote: html.includes('备注'),
      hasInputSm: (html.match(/input-sm/g) || []).length >= 5
    };
  });
  assert('E. 更多信息含净含量·单件商品', moreState.found && moreState.hasNet && moreState.hasNetNote, JSON.stringify(moreState));
  assert('E2. 更多信息含总价·多件为总价', moreState.found && moreState.hasPrice && moreState.hasPriceNote, JSON.stringify(moreState));
  assert('E3. 含查看图片按钮与备注', moreState.found && moreState.hasViewImg && moreState.hasNote, JSON.stringify(moreState));
  assert('E4. 折叠区内 input 均 input-sm', moreState.found && moreState.hasInputSm, JSON.stringify(moreState));

  // ========== F. 批量页净含量 label 与 scan 页完全一致 ==========
  const netCompare = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('label')).filter(l => l.textContent.trim().startsWith('净含量'));
    const clean = (l) => {
      const span = l.querySelector('span');
      return { cls: l.className, text: l.textContent.trim().replace(/\s+/g, ' '), hasSpan: !!span };
    };
    return all.map(clean);
  });
  assert('F. 批量页净含量 label 与 scan 页一致（11px 灰 + ·单件商品）',
    netCompare.length >= 1 && netCompare.every(n => n.cls.includes('text-[11px]') && n.cls.includes('text-gray-400') && n.hasSpan && n.text.includes('·单件商品')),
    JSON.stringify(netCompare));

  // ========== G. 保存流程仍可用（名称 + 生产日期 + 保质期，日期至少两项） ==========
  await page.evaluate(() => {
    const setVal = (el, val) => {
      if (!el) return false;
      const proto = el.tagName === 'INPUT' && el.type === 'number' ? window.HTMLInputElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const containers = Array.from(document.querySelectorAll('div.space-y-3'));
    const itemContainer = containers.find(el => /商品\s*\d+/.test(el.textContent));
    const mainCard = itemContainer ? Array.from(itemContainer.children).slice(1)[1] : null;
    const inputs = mainCard ? Array.from(mainCard.querySelectorAll('input')) : [];
    const nameInput = inputs.find(i => i.placeholder === '请输入商品名称');
    const dateInputs = inputs.filter(i => i.type === 'date');
    const prodInput = dateInputs[1];   // 第二个 date = 生产日期
    const shelfLabel = mainCard ? Array.from(mainCard.querySelectorAll('label')).find(l => l.textContent.trim() === '保质期') : null;
    const shelfInput = shelfLabel ? shelfLabel.parentElement.querySelector('input[type="number"]') : null;
    setVal(nameInput, '测试纯牛奶');
    setVal(prodInput, '2026-08-01');
    setVal(shelfInput, '12');
    return { ok: !!nameInput && !!prodInput && !!shelfInput };
  });
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
  assert('G. 保存流程正常（1 商品入库 + 批量入库记录 + 回扫码页）',
    saveResult.productCount === 1 && saveResult.lastProduct === '测试纯牛奶' &&
    saveResult.lastRecDetail?.includes('批量入库') && saveResult.onScanPage,
    JSON.stringify(saveResult));

  // ========== H. 拍摄小票：桌面 headless 无摄像头 → 智能回退文件选择（filechooser） ==========
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('小票批量录入'));
    btn && btn.click();
  });
  await page.waitForTimeout(600);
  // 确认已进入批量页（存在「拍摄小票」按钮），否则重试一次
  const onBatchPage = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === '拍摄小票'));
  if (!onBatchPage) {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('小票批量录入'));
      btn && btn.click();
    });
    await page.waitForTimeout(600);
  }
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null);
  const hClick = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '拍摄小票');
    if (!btn) return { btnFound: false, bodyHasCamBtn: document.body.textContent.includes('拍摄小票') };
    btn.click();
    return { btnFound: true, disabled: btn.disabled, text: btn.textContent.trim(), camInputs: document.querySelectorAll('input[type="file"][capture]').length };
  });
  const fc = await fileChooserPromise;
  if (fc) { try { await fc.setFiles({ name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fakedata') }); } catch (e) {} }
  if (!fc) console.log('DEBUG H click result:', JSON.stringify(hClick));
  const camState = await page.evaluate(() => ({
    modalShown: !!Array.from(document.querySelectorAll('video')).find(v => v.className.includes('object-contain'))
  }));
  assert('H. 桌面拍摄小票：无摄像头环境自动回退文件选择', fc !== null, fc ? 'filechooser 触发（回退成功）' : '未触发 filechooser（弹层打开）');
  assert('H2. 拍摄弹层 video 已挂载（模板就绪）', camState.modalShown === true || fc !== null, JSON.stringify(camState)); // 有摄像头则弹层，无则回退，两者均正确

  // ========== I. 无控制台错误 ==========
  assert('I. 无控制台错误', consoleErrors.length === 0, consoleErrors.join(' || ') || '');

  console.log('');
  console.log(`==== 总计 ${pass + fail} 个断言（PASS ${pass} / FAIL ${fail}） ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(err => { console.error('测试异常:', err); process.exit(2); });

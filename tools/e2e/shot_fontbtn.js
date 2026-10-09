// 字号三档按钮 —— 改造后几何一致性校验 + 对照截图（与 OCR 引擎按钮同款描边）
const { chromium } = require('playwright');
const fs = require('fs');
const DIR = '_shots_fontbtn';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);
const URL = 'http://127.0.0.1:8777/index.html';

const results = [];
const check = (n, pass, d) => { results.push({ n, pass, d }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const killTour = async (p) => {
  await p.waitForTimeout(2600);
  for (let i = 0; i < 8; i++) {
    await p.evaluate(() => { try { window.__foodin.endTour && window.__foodin.endTour(); } catch (e) {} });
    const clicked = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '跳过');
      if (b) { b.click(); return true; }
      return false;
    });
    if (!clicked && i > 2) break;
    await p.waitForTimeout(200);
  }
  await p.evaluate(() => {
    document.querySelectorAll('[class*="fi-tour"]').forEach(el => el.remove());
    [...document.querySelectorAll('div')].forEach(el => {
      const c = el.className;
      if (typeof c === 'string' && c.includes('fixed') && el.textContent && el.textContent.includes('欢迎使用')) el.remove();
    });
  });
  await p.waitForTimeout(600);
};

const measure = (page) => page.evaluate(() => {
  const vis = el => !!(el && el.offsetParent !== null);
  const btns = [...document.querySelectorAll('button')].filter(b => vis(b) && ['标准', '大', '超大'].includes((b.textContent || '').trim()));
  return btns.map(b => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      label: b.textContent.trim(),
      w: +r.width.toFixed(2), h: +r.height.toFixed(2),
      x: +r.x.toFixed(2), y: +r.y.toFixed(2),
      borderTop: cs.borderTopWidth, borderColor: cs.borderTopColor,
      radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, color: cs.color,
      fontSize: cs.fontSize, fontWeight: cs.fontWeight, padding: cs.padding,
    };
  });
});

(async () => {
  const browser = await chromium.launch();

  // ===== 手机 =====
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
  await killTour(p);
  await p.evaluate(() => { window.__foodin.currentPage.value = 'settings'; });
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    const b = [...document.querySelectorAll('button')].filter(x => vis(x) && (x.textContent || '').trim() === '标准')[0];
    if (b) b.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(500);

  const m = await measure(p);
  console.log('=== 手机（选中=标准）===');
  m.forEach(b => console.log(JSON.stringify(b)));

  const wSame = m.every(b => b.w === m[0].w);
  const hSame = m.every(b => b.h === m[0].h);
  const ySame = m.every(b => b.y === m[0].y);
  const rSame = m.every(b => b.radius === m[0].radius);
  const fSame = m.every(b => b.fontSize === m[0].fontSize && b.fontWeight === m[0].fontWeight);
  const pSame = m.every(b => b.padding === m[0].padding);
  const bSame = m.every(b => b.borderTop === m[0].borderTop);

  check('三档宽度一致', wSame, m.map(b => b.w).join(' / '));
  check('三档高度一致', hSame, m.map(b => b.h).join(' / '));
  check('三档垂直位置一致', ySame, m.map(b => b.y).join(' / '));
  check('三档圆角一致', rSame, m.map(b => b.radius).join(' / '));
  check('三档字号字重一致', fSame, m.map(b => b.fontSize + '/' + b.fontWeight).join(' / '));
  check('三档内边距一致', pSame, m.map(b => b.padding).join(' / '));
  check('三档边框宽度一致（盒模型相同）', bSame, m.map(b => b.borderTop).join(' / '));

  // 未选中态配色应与 OCR 引擎未选中同系（彩描边 + 彩字），不再是灰系
  const unsel = m.find(b => b.label !== '标准');
  check('未选中态为 indigo 淡描边', unsel.borderColor === 'rgb(165, 180, 252)', unsel.borderColor);
  check('未选中态为 indigo 彩字', unsel.color === 'rgb(79, 70, 229)', unsel.color);
  check('选中态仍为 indigo 实心', m[0].bg === 'rgb(99, 102, 241)' && m[0].color === 'rgb(255, 255, 255)', m[0].bg + ' / ' + m[0].color);

  await p.screenshot({ path: `${DIR}/after_mobile.png` });

  // 选中态换一档，验证三档都一致（切换到「超大」）
  await p.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    const b = [...document.querySelectorAll('button')].filter(x => vis(x) && (x.textContent || '').trim() === '超大')[0];
    if (b) b.click();
  });
  await p.waitForTimeout(500);
  const m2 = await measure(p);
  const stillSame = m2.every(b => b.w === m2[0].w && b.h === m2[0].h && b.radius === m2[0].radius && b.borderTop === m2[0].borderTop);
  check('选中态改为「超大」后尺寸仍一致', stillSame, JSON.stringify(m2.map(b => b.w + '×' + b.h)));
  const selW = m2.find(b => b.label === '超大');
  check('「超大」为实心', selW.bg === 'rgb(99, 102, 241)', selW.bg);
  await p.screenshot({ path: `${DIR}/after_mobile_xlarge.png` });
  // 还原到「大」（点击真实按钮，setFontScale 不在 __foodin 白名单里）
  await p.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    const b = [...document.querySelectorAll('button')].filter(x => vis(x) && (x.textContent || '').trim() === '大')[0];
    if (b) b.click();
  });
  await p.waitForTimeout(400);

  // 与 OCR 引擎按钮并排对照截图（同一屏）
  await p.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    const ocr = [...document.querySelectorAll('div')].filter(vis).find(e => (e.textContent || '').trim() === 'Paddle 本地');
    if (ocr) ocr.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(500);

  // ===== 桌面 =====
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const d = await dctx.newPage();
  await d.goto(URL, { waitUntil: 'load' });
  await d.waitForFunction(() => window.__foodin && window.__foodin.products, null, { timeout: 20000 });
  await killTour(d);
  await d.evaluate(() => { window.__foodin.currentPage.value = 'settings'; });
  await d.waitForTimeout(800);
  const dm = await measure(d);
  console.log('=== 桌面（选中=大）===');
  dm.forEach(b => console.log(JSON.stringify(b)));
  check('桌面：三档尺寸一致', dm.every(b => b.w === dm[0].w && b.h === dm[0].h), dm.map(b => b.w + '×' + b.h).join(' / '));
  check('桌面：仍为紧凑型（未拉伸）', dm[0].w < 80, '宽=' + dm[0].w);
  await d.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    const b = [...document.querySelectorAll('button')].filter(x => vis(x) && (x.textContent || '').trim() === '标准')[0];
    if (b) b.scrollIntoView({ block: 'center' });
  });
  await d.waitForTimeout(400);
  const clip = await d.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    const btns = [...document.querySelectorAll('button')].filter(b => vis(b) && ['标准', '大', '超大'].includes((b.textContent || '').trim()));
    const a = btns[0].getBoundingClientRect();
    return { x: a.x - 14, y: a.y - 14, width: a.width * 3 + 12 * 2 + 28, height: a.height + 28 };
  });
  await d.screenshot({ path: `${DIR}/after_desktop_zoom.png`, clip });

  const realErrs = errs.filter(e => !/favicon|net::ERR_|service-worker|Failed to load resource|points:/i.test(e));
  check('无 JS 运行时错误', realErrs.length === 0, realErrs.slice(0, 2).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log('\n===== 汇总 =====');
  console.log(`总计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  failed.forEach(f => console.log('  - ' + f.n + (f.d ? '  (' + f.d + ')' : '')));
  fs.writeFileSync(`${DIR}/result.txt`, results.map(r => `${r.pass ? 'PASS' : 'FAIL'}\t${r.n}\t${r.d || ''}`).join('\n'));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

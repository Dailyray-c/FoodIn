// v2.21.3 摄像头弹层真实流程验证（fake media stream 模拟有摄像头环境）
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8001/index.html';

(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('food_inventory_products', JSON.stringify([]));
    localStorage.setItem('food_inventory_records', JSON.stringify([]));
    localStorage.setItem('food_inventory_settings', JSON.stringify({ categories: [], locations: [], version: '2.21.2' }));
    localStorage.setItem('guideShown_v2162', '1');
  });
  let pass = 0, fail = 0;
  const assert = (n, c, d) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + (d || ''))); };

  await page.goto(BASE);
  await page.waitForTimeout(800);
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

  // 点击拍摄小票 → 弹层应打开
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '拍摄小票');
    btn && btn.click();
  });
  await page.waitForTimeout(1500);

  const modal = await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video')).filter(v => v.className.includes('object-contain'));
    const v = videos[0];
    return {
      modalOpen: videos.length > 0,
      videoWidth: v ? v.videoWidth : 0,
      videoHeight: v ? v.videoHeight : 0,
      streamActive: v ? !!v.srcObject : false
    };
  });
  assert('CAM1. 有摄像头时点击「拍摄小票」打开预览弹层', modal.modalOpen, JSON.stringify(modal));
  await page.waitForTimeout(1000);
  const modal2 = await page.evaluate(() => {
    const v = Array.from(document.querySelectorAll('video')).find(x => x.className.includes('object-contain'));
    return v ? { w: v.videoWidth, h: v.videoHeight } : null;
  });
  assert('CAM2. 假摄像头视频流已就绪（videoWidth>0）', modal2 && modal2.w > 0, JSON.stringify(modal2));

  // 点击「切换摄像头」→ 弹层应保持打开
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('切换摄像头'));
    btn && btn.click();
  });
  await page.waitForTimeout(1200);
  const switched = await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video')).filter(v => v.className.includes('object-contain'));
    return videos.length > 0;
  });
  assert('CAM3. 切换摄像头后弹层保持打开', switched);

  // 点击「拍照」→ 弹层关闭 + OCR 开始处理（processing=true 或进度出现）
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === '拍照');
    btn && btn.click();
  });
  await page.waitForTimeout(800);
  const shot = await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video')).filter(v => v.className.includes('object-contain'));
    return {
      modalClosed: videos.length === 0,
      processing: document.body.textContent.includes('正在识别小票') || document.body.textContent.includes('识别中'),
      hasProgress: document.body.textContent.includes('%')
    };
  });
  assert('CAM4. 拍照后弹层关闭并进入 OCR 识别', shot.modalClosed && (shot.processing || shot.hasProgress), JSON.stringify(shot));

  console.log(`==== 总计 ${pass + fail}（PASS ${pass} / FAIL ${fail}） ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('异常:', e); process.exit(2); });

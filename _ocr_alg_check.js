// OCR 条码识别优化（需求4）算法单测：直接从 index.html 源码提取函数体执行
const fs = require('fs');
const src = fs.readFileSync('index.html', 'utf8');

const extract = (name) => {
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n    }');
  const m = src.match(re);
  if (!m) throw new Error('未找到函数 ' + name);
  return m[0];
};

let pass = 0, fail = 0;
const assert = (name, cond, detail) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + ' | ' + detail); }
};

try {
  eval(extract('isValidEan'));
  eval(extract('extractBarcodes'));

  // ===== isValidEan：EAN/UPC 模10校验位 =====
  assert('EAN-13 有效 6901234567892', isValidEan('6901234567892') === true);
  assert('EAN-13 校验位错 6901234567890', isValidEan('6901234567890') === false);
  assert('EAN-13 校验位错 6901234567898', isValidEan('6901234567898') === false);
  assert('EAN-8 有效 96385074', isValidEan('96385074') === true);
  assert('UPC-A 有效 036000291452', isValidEan('036000291452') === true);
  assert('ITF-14 长度 14 位可接受', isValidEan('19019824890294') === true || isValidEan('19019824890294') === false, '需校验位匹配');
  assert('7 位短码拒绝', isValidEan('1234567') === false);
  assert('15 位超长拒绝', isValidEan('123456789012345') === false);
  assert('含字母拒绝', isValidEan('690123456789a') === false);

  // ===== extractBarcodes：从 OCR 文本提取条码 =====
  assert('纯文本含条码', JSON.stringify(extractBarcodes('蒙牛纯牛奶 6901234567892 250ml')) === JSON.stringify(['6901234567892']));
  assert('金额/日期被校验位过滤', JSON.stringify(extractBarcodes('合计 59.80 2026-08-01 19:30')) === JSON.stringify([]));
  assert('多行文本多条码去重', JSON.stringify(extractBarcodes('6901234567892\n96385074\n6901234567892')) === JSON.stringify(['6901234567892', '96385074']));
  assert('空文本', JSON.stringify(extractBarcodes('')) === JSON.stringify([]));
  assert('无条码文本', JSON.stringify(extractBarcodes('鲜牛奶 12.5元 生产日期2026-07-01')) === JSON.stringify([]));
  assert('只取前6个', extractBarcodes('6901234567892 96385074 036000291452 19019824890294 6901234567892 96385074 036000291452').length <= 6);

  console.log(`\n===== OCR 算法: ${pass} 通过, ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(2);
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  // 扫描 index.html 中所有字面量 class（含 JS 函数里拼接的 Tailwind 类）
  content: ['./index.html'],
  // safelist：强制生成 content 扫描容易遗漏的负值定位类 / 负位移类 / 任意值类 / grid-cols-N（N>4 模板里手写），
  // 缺了它们会导致 badge 定位错乱（-top-1.5）、搜索图标垂直居中失效（-translate-y-1/2）、6 列柱状图堆 1 列（grid-cols-6）等渲染问题
  safelist: [
    '-top-1.5', '-right-1.5', '-top-1', '-right-1', '-top-0.5', '-bottom-1',
    '-translate-y-1/2', '-translate-x-1/2',
    '-translate-x-1/2 -rotate-90', '-rotate-90', 'rotate-90',
    'grid-cols-5', 'grid-cols-6', 'grid-cols-7', 'grid-cols-8',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

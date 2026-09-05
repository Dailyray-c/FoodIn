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
    // v2.22.4：<toggle-setting> 组件 template 里的 peer-checked 变体类（颜色参数驱动）
    'peer-checked:bg-green-500',
    'peer-checked:bg-violet-500',
    'peer-checked:bg-indigo-500',
    'peer-checked:bg-orange-500',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

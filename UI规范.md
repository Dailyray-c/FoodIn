# FoodIn UI 规范化标准（当前生效版 v2.33.0）

> **适用范围**：`index.html`（模板 + 内联 `<style>`）与后续所有界面改动。
> **真源（Single Source of Truth）**：`index.html` 内联 `<style>` 顶部的 **UI 规范层**（`:root` 令牌 + `.fi-*` 组件类）。
> **本文档地位**：新增/修改界面时的唯一依据。规范与技术实现冲突时，以本文档为准并回改代码。
> 制定日期：2026-09-11 · 基线 v2.26.1 → 规范化 v2.27.0 → **遗留项收口 v2.28.0**
> 变更记录见 §8。

---

## 一、为什么要做（审计基线数据）

对模板区（3011 行、1654 个带 `class` 的元素）做全量量化审计，结论：

| 指标 | 数值 | 说明 |
|---|---|---|
| 唯一 class 串 | **782** | 1654 个元素写出 782 种组合 |
| 最高频单串 | `text-gray-800` 47×、`text-[11px] text-gray-400` 37×、`text-xs text-gray-500 mb-1.5 block` 30× | 语义相同的写法散落各处 |
| `<button>` | 186 个 / **105 种** class 串 | 次按钮存在 `gray-600/gray-700` × `text-xs/text-sm` × `py-2/py-2.5` 三套并存 |
| 卡片容器 | 87 个 / **51 种** 写法 | 内边距 `p-4 / p-3 / p-2.5` 三套 |
| 弹窗遮罩 | 18 个 / 7 种 写法 | z 轴四档：`z-40 / z-50 / z-[60] / z-[70]` |
| 胶囊 chip | 46 个 / 18 种 写法 | 同一视觉出现「类序不同」的孪生写法（17× 与 11×） |
| `showToast` 文案 | **110 条** | 「已…」30 / 「请…」6 / 「无法·失败」18，风格未成文 |
| `text-[11px]` 颜色 | gray-400(111) · 无显式色(31) · gray-500(11) · gray-300(10) · gray-700(8) … | 小字层级失序 |

**本轮已收敛**：207 处调用点 → 9 个组件类，吸收 **807 个 utility token**。

---

## 二、设计令牌（Design Tokens）

一律使用 `index.html` 内联 `<style>` 顶部的 `:root` 变量，**不得在模板里手写等价色值/圆角**。

### 2.1 色彩

| 令牌 | 值 | 语义 | 对应 Tailwind |
|---|---|---|---|
| `--fi-brand` | `#f97316` | 主操作 / FAB / 激活态 | orange-500 |
| `--fi-brand-dark` | `#ea580c` | 主操作按压态 | orange-600 |
| `--fi-brand-weak` | `#fff1e6` | 品牌淡底 | 自定义（与指南页一致） |
| `--fi-brand-ink` | `#b45309` | 品牌淡底上的文字 | amber-700 |
| `--fi-ink-900` | `#1f2937` | 主文本 / 数值 | gray-800 |
| `--fi-ink-700` | `#374151` | 次文本 / 卡片标题 | gray-700 |
| `--fi-ink-600` | `#4b5563` | 按钮文字 | gray-600 |
| `--fi-ink-500` | `#6b7280` | 字段标签 | gray-500 |
| `--fi-ink-400` | `#9ca3af` | 提示 / 占位 / 失效 | gray-400 |
| `--fi-ink-300` | `#d1d5db` | 极弱 / 禁用 | gray-300 |
| `--fi-line` | `#e5e7eb` | 控件描边 | gray-200 |
| `--fi-line-weak` | `#f3f4f6` | 卡片描边 / 弱分隔 | gray-100 |
| `--fi-surface` | `#ffffff` | 卡片 / 弹窗底 | white |
| `--fi-canvas` | `#f9fafb` | 页面底 / 按压底 | gray-50 |
| `--fi-fill` / `--fi-fill-hover` | `#f3f4f6` / `#e5e7eb` | 次按钮底 / 按压 | gray-100 / gray-200 |
| `--fi-ok` / `--fi-ok-weak` | `#16a34a` / `#ecfdf5` | 正常 · 入库 · 吃掉 | green-600 / green-50 |
| `--fi-warn` / `--fi-warn-weak` | `#f59e0b` / `#fffbeb` | 临期 | amber-500 / amber-50 |
| `--fi-danger` / `--fi-danger-weak` | `#ef4444` / `#fef2f2` | 过期 · 浪费 | red-500 / red-50 |
| `--fi-info` / `--fi-info-weak` | `#2563eb` / `#eff6ff` | 编辑 · 中性操作 | blue-600 / blue-50 |

> ❗**状态四色固定搭配**：临期 = 橙色系、过期/浪费 = 红色系、正常/入库 = 绿色系、编辑 = 蓝色系。
> 同一语义**不得**混用两个色阶。v2.28.0 已把记录页四格筛选、统计页金额大字、首页卡按钮共 9 处 `-700` 收敛到 `-600`。
> 规则：`-100` 浅底徽章的深字配对（`bg-*-100 text-*-700`）**保留**（浅底需要更深字保证对比度）；其余「文本」与 `-50` 浅底一律 `-600`。

### 2.2 文本层级（只有 6 级）

| 层级 | 规范写法 | 用途 |
|---|---|---|
| 页面/区块大标题 | `.fi-title`（16px / 600 / gray-800） | 页面顶部、区块头 |
| 卡片标题 | `.fi-card-title`（14px / gray-700） | 卡片主标题 |
| 正文 / 数值 | `text-sm text-gray-800` | 商品名、金额、数量 |
| 字段标签 | `.fi-label`（12px / gray-500 / block / mb-1.5） | 表单字段标题 —— **唯一写法** |
| 区块分组标题 | `.fi-group-title`（12px / 500 / gray-500 / block / mb-2） | 筛选弹窗、统计页的区块小标题 —— **唯一写法** |
| 辅助说明 | `.fi-hint`（11px / gray-400） | 说明、副标题、占位提示 |
| 极弱 / 禁用 | `.fi-hint` + `text-gray-300` 或 `.text-gray-300` | 失效态 |

> 现存写法 `text-[11px] text-gray-400` **已全部**收敛为 `.fi-hint`（109 处，v2.27.0）。
> 当字段标签用的 `fi-hint block mb-1.5`（11px / gray-400）**已于 v2.28.0 全部**收敛为 `.fi-label`（26 处 + 2 处 `fi-hint block`）；
> 当区块小标题用的 `fi-hint mb-1.5` / `text-xs font-medium text-gray-500 mb-2 block` 收敛为 `.fi-group-title`（9 处）。
> 大字号场景由 `body.fs-large / .fs-xlarge` 统一放大，见 §6。

### 2.3 圆角（3 档，不得混用）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--fi-r-card` | `0.75rem` | 卡片、主按钮 |
| `--fi-r-ctl` | `0.5rem` | 小控件、次按钮、输入框（小） |
| `--fi-r-modal` | `1rem` | 弹窗 |
| （`rounded-full`） | `9999px` | 胶囊、开关、圆形图标按钮 |

### 2.4 阴影（2 档）

| 令牌 | 用途 |
|---|---|
| `--fi-sh-card` | 卡片静置。**必须保持「三层等值形式」**——Tailwind `shadow-sm` 会额外输出两层 `rgba(0,0,0,0) 0 0 0 0` 占位，单层写法会导致计算样式串不同（视觉一致但自动化比对误报），且将来叠加 `shadow-*` 会少一层合成 |
| `--fi-sh-lift` | 悬浮 / 抬起 |

### 2.5 布局基准

| 令牌 | 值 | 说明 |
|---|---|---|
| `--fi-gutter` | `1rem` | 页面左右留白（`px-4`） |
| `--fi-gap` | `0.75rem` | 栅格间距（`gap-3`）；紧凑场景用 `gap-2` |

---

## 三、组件规范（唯一写法）

> **分工原则**：组件类管**默认态**，调用处管**语义态**（如选中色、禁用透明度）。
> 组件类位于 `styles.css` **之前**，故调用处附加的 Tailwind 工具类天然覆盖它 —— 这是刻意设计。

### 3.1 卡片

```html
<!-- 标准卡片（白底 + 弱描边 + 浅阴影 + 裁剪） -->
<div class="fi-card">
  <div class="fi-card-pad space-y-3">…</div>
</div>

<!-- 设置页分区卡（标题行 + 内容），8 处共用 -->
<div class="fi-card">
  <div class="px-4 py-3.5 flex items-center justify-between">…标题行…</div>
  <div class="px-4 pb-3.5 space-y-2 border-t border-gray-50 pt-3">…内容…</div>
</div>
```
- ✅ `.fi-card` = `bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100`
- ✅ 内边距**只用三档组件类**（场景固定，v2.28.0 已收 43 处）：
  | 类 | 值 | 场景 |
  |---|---|---|
  | `.fi-card-pad` | `1rem` | 主卡（表单卡、列表卡、页面一级卡片） |
  | `.fi-card-pad-sm` | `0.75rem` | 栅格内并排的统计 / 摘要卡 |
  | `.fi-card-pad-xs` | `0.625rem` | 数据小格 / 迷你指标块 |
  | `px-4 py-3.5` + `px-4 pb-3.5 pt-3` | — | 带标题行的分区卡（`.fi-card` 内部两段式） |
- ❌ 禁止再手写 `p-4 / p-3 / p-2.5` 到卡片上，也禁止新造第四档

**栅格内卡片「底部按钮对齐」（v2.32.0，仅电脑版）**

- **问题**：商品栅格里的卡片高度由内容撑开（剩菜卡比普通卡多一行「已加热 N 次」），按钮行跟着内容浮动 → 同一排卡片按钮**高高低低**，视觉上很乱。实测旧版按钮行 top 值 `[311, 311, 343]`。
- ✅ **修法**：卡片在 `lg` 断点转为纵向 flex，按钮行用 `mt-auto` 顶到底部。
  ```
  卡片容器：lg:flex lg:flex-col
  按钮行  ：grid grid-cols-3 gap-2 lg:mt-auto lg:pt-2
  按钮    ：py-1.5 lg:py-2  （电脑版点击区略增）
  悬停    ：lg:hover:bg-{色}-600（比底色深一档，仅 lg 生效）
  ```
- ❗**必须全部带 `lg:` 前缀** —— 手机版是单列/双列自适应，按钮跟着内容走才是对的，**手机版零改动**。
- ❗**必须同步重编译 Tailwind**：`lg:flex` / `lg:flex-col` / `lg:mt-auto` / `lg:pt-2` / `lg:py-2` 若从未出现过，不重编译样式直接失效（现象：JS 正常但按钮区高度塌陷，见 §6.2）。
- 自检：桌面视口（≥1024px）下同一排卡片的 `[data-act="inc"]` 按钮行 `getBoundingClientRect().top` **必须全部相等**。

### 3.2 胶囊 chip（筛选 / 标签）

```html
<!-- 默认态（白底灰边灰字） -->
<button class="fi-chip">全部</button>

<!-- 选中态：在调用处叠加语义色（组件类自动让位） -->
<button class="fi-chip" :class="active ? 'bg-orange-500 border-orange-500 text-white' : 'text-gray-600'">临期</button>
```
- ✅ `.fi-chip` = `px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-medium transition`
- ❌ 禁止写 `px-3 py-1.5 rounded-full border text-xs font-medium transition-colors`（等价 20+ token 的手写版）
- ❌ 禁止在 chip 上用 `peer-checked` 做选中态（历史踩坑，须显式 `:class`）
- ❗**「储存位置」chips 顺序固定为：待设置 → 有分区的地点 → 无分区的地点**（v2.30.0）。录入页 / 批量录入 / 主页编辑弹窗三处**都必须遍历 `placesOrderedView`，禁止直接遍历 `settings.places`** —— 设置页按「分区 / 不分区」两段渲染，拖拽只在各自段内生效，底层数组两段会交错，直接遍历会让「冰箱（有分区）」掉到无分区地点后面，与设置页看到的不一致。各自段内保持 `settings.places` 的相对顺序。

**chip 顺序的权威来源（v2.32.0 固化，适用于所有「设置里的列表 + 当前已选」型 chip 组）**

顺序**只能由设置里的列表决定**，`选中 / 取消选中` **绝不允许改变顺序**。

- ❗**禁止把「当前已选」先塞进结果数组**。v2.32.0 前的 `unionTags()` 是 `Set` 先收 `current` 再用设置列表补齐 —— `Set` 保插入序，于是每点一次标签，被点的那个就被顶到最前，顺序每次点击都在变（用户报「选中或取消选中不同标签后顺序错误更改」的真因）。
- ✅ **唯一正确写法**：**先按设置列表铺满**（权威顺序），再把设置里没有的（历史遗留标签）**追加到末尾**。
  ```js
  function unionTags(list, current) {
    const out = [], seen = new Set();
    (list || []).forEach(t => { if (t && !seen.has(t)) { seen.add(t); out.push(t); } });      // ① 权威顺序
    splitTagStr(current).forEach(t => { if (t && !seen.has(t)) { seen.add(t); out.push(t); } }); // ② 遗留标签追加
    return out;
  }
  ```
- 自检：**连续切换同一个 chip 两次，整行顺序必须字节级不变**（`_verify_2320.js` A 段已断言）。

**chip 悬停不得改变外观（v2.32.0）**

- ❗**禁用 `hover:border-*` / `hover:bg-*` 等一切悬停态颜色变化**。全项目已清除 6 处 `hover:border-teal-300 / hover:border-teal-400`（扫码页、批量录入、编辑弹窗、筛选弹窗等）。
- 理由：芯片的**视觉语言只有「选中 / 未选中」两态**，悬停改色会让用户误以为已经选中；也与既定配色原则（默认白底彩字、只有过滤态/激活态才填充）冲突。
- ✅ 悬停只能做**不改变颜色语义**的反馈（如 `active:opacity-70`），或者干脆零反馈 —— 芯片本身够小，鼠标划过不需要提示。
- 自检：**真实鼠标悬停**（`page.mouse.move`，合成 `mouseover` 事件**不会**触发 CSS `:hover`），比对 `getComputedStyle(el).borderTopColor` 悬停前后是否一致；`_v2320_new_hover_on.png` 与静默态截图**应 md5 完全相同**。

### 3.3 按钮（4 个变体，不得新增）

| 变体 | 写法 | 用途 |
|---|---|---|
| 主操作 | `.fi-btn-primary` | 保存、提交（品牌填充、白字、整宽） |
| 次操作 | `.fi-btn-2nd` | 取消、关闭、等宽并排的次级动作（灰填充） |
| 危险 | `.fi-btn-danger` + 尺寸类 | 删除、清空（浅红底 + 红字 + 红边） |
| 幽灵 | `text-gray-400 active:opacity-70` + 尺寸类 | 图标按钮、文字链接 |

**次按钮唯一写法 `.fi-btn-2nd`**（v2.28.0 由三套并为一套，16 处）：
`py-2 + rounded-lg + bg-gray-100 + text-gray-600 + text-xs + font-medium + active:bg-gray-200`。
**宽度与水平内边距一律由调用处给**：整宽 `w-full`、等宽并排 `flex-1`（需左右留白再加 `px-3`）。
原 `.fi-btn-fill`（py-2.5 / text-sm）已并入本类，调用点补 `flex-1`；按钮变体由 4 个减为 **3 个**（主 / 次 / 危险，幽灵为无形状的文字按钮）。

**用户既定原则**：默认**白底彩字**，仅**过滤态/激活态**才填充颜色。
项目现存的「白底彩字」按钮写法（如 `px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 bg-white`）属于此原则的自然结果，**保留**；但同类按钮的字号/色阶必须一致。

### 3.4 表单控件

```html
<div>
  <label class="fi-label">商品名称</label>
  <input class="input" v-model="scanForm.name">          <!-- 标准尺寸 -->
  <input class="input input-sm" v-model="editForm.qty">  <!-- 紧凑尺寸 -->
  <p class="fi-hint mt-1.5">保质期支持「2年 / 6个月 / 90天」</p>
</div>
```
- ✅ 输入框**只**用 `.input` / `.input input-sm`（聚焦橙色环、禁用灰底已内置）
- ✅ 字段标签**只**用 `.fi-label`；说明**只**用 `.fi-hint`
- ❌ 禁止手写 `w-full px-3 py-2 border rounded-xl …` 自建输入框
- 现存偏差：67 个 `<input>` 中 51 个已用 `.input`，其余为 `sr-only / hidden` 或搜索框特例（见 §7）

### 3.5 弹窗

```html
<div class="fi-modal">            <!-- 遮罩：fixed inset-0 z-40 半透明 + 居中 -->
  <div class="fi-modal-box">      <!-- 面板：白底 rounded-2xl max-w-sm p-5 -->
    …
  </div>
</div>
```
- ✅ 弹层层级只有两档：`z-40`（`.fi-modal` 确认类遮罩）、`z-50`（全屏流程：扫码 / 拍照 / 图片预览 / toast）
- ❌ 禁止再出现 `z-[60] / z-[70]` 等自定义档位（v2.28.0 已把原有的两处归入 `z-50`）
- 长内容弹窗需滚动时：在 `.fi-modal-box` 后追加 `max-h-[80vh] overflow-y-auto`（遮罩改为 `items-start` 亦可）

### 3.6 空态

```html
<div class="fi-empty">
  <svg …>…</svg>
  <p class="text-sm mt-3">还没有商品</p>
</div>
```
- ✅ `.fi-empty` = `flex flex-col flex-1 items-center justify-center py-16 text-gray-400`

### 3.7 可点整行（设置页 / 列表）

```html
<button class="fi-row border-b border-gray-100">
  <span>…</span><svg …>
</button>
```
- ✅ `.fi-row` = `w-full flex items-center justify-between px-4 py-3.5 active:bg-gray-50 transition`
- 无分隔线场景直接去掉 `border-b`，不另写 padding

### 3.8 开关

- **一律** `<toggle-setting>` 组件（全局已注册），**绝不手写 switch**
- 组件内部：`.toggle-switch` > `.toggle-track`（**必须带 `bg-gray-200` 关闭态底色**）+ `.toggle-knob`
- 语义色通过 `color` prop：`green / violet / indigo / orange`
- ❌ 禁止 `peer-checked:bg-*` 之外自建轨道（历史上漏编译导致高度塌陷为 0）

### 3.9 使用指南页「示意图层」（独立色阶，禁止外溢）

使用指南页的手机示意图是真实界面的 **262px 等比缩略复刻**（`.p-*` / `.qs-*` / `.fig-*` 等约 80 个类）。
缩略后需要独立的明度标定，因此它有一套自己的令牌：

- ✅ 与真实 UI **同值**的色，直接引用 `--fi-*`（如 `#f3f4f6 → var(--fi-fill)`、`#f97316 → var(--fi-brand)`）
- ✅ 示意图**专属**的 14 个色登记为 `--fi-mk-*`（`--fi-mk-ink #1f2430` 主字、`--fi-mk-ink-2 #8a93a6` 次字、`--fi-mk-line #eef0f3` 描边、`--fi-mk-red-bar #e24b4a` 等）
- ❌ **禁止在真实界面使用 `--fi-mk-*` 或 `.p-*` / `.qs-*`**；反之示意图也只用上两类令牌，**不得再手写 hex**
- v2.28.0 已把该层 132 处硬编码色值令牌化；v2.29.4 又清掉了残余的 inline hex（`#16a34a` / `#f59e0b` / `#b91c1c` / `#EEF2FF` / `#FFF1E6` / `#F3F4F6` / `#FFF7E6`），改为 `.p-tx-*`（文字） / `.p-edge-*`（左边条） / `.p-ic-*`（行图标底）三类工具类

#### 3.9.1 结构类清单（v2.29.4 补齐：**示意图必须画出真实界面的「骨架」**）

v2.29.3 前 `.p-*` 只画了「页面中部内容」，**页头 / 底部导航 / 选中态 / 输入框**这些真实界面最醒目的结构全部缺失，看着不像真机截图。现统一补齐：

| 类 | 对应真实结构 | 要点 |
|---|---|---|
| `.p-hd`（+ `.ics` / `.ics i` / `.ics i.dot`） | 页头（标题 + 右侧图标组） | 取代旧 `.phone-bar`；`.dot` 为铃铛未读红点（`::after` 画数据气泡） |
| `.p-nav`（+ `span` / `span.on`） | 底部导航 `.app-nav` | 五项含内联 SVG 图标，当前页 `color: var(--fi-brand)`；**5 张示意图都要画**，用来标明「这是哪一页」 |
| `.p-stat`（+ `.on` / `.blue` / `.amber` / `.green` / `.red` / `.v .u`） | 首页三卡 / 记录页四筛选卡 | 居中；命中态整卡实心白字（首页「在库」= `--fi-ink-900`，记录页「在库」= `--fi-info`）；`.u` 为「件」小字 |
| `.p-chip`（+ `.loc` / `.cat` / `.sel` / `.opt`） | 位置 / 分类 / 待设置 chip | `.loc` 青、`.cat` 紫（商品卡用，带内联图标）；`.sel` 灰底白字（「待设置」选中的真实态）；`.opt` 白底灰边（录入页候选项） |
| `.p-inp`（+ `.ph` / `.ico`） / `.p-qbtn` | 真实 `.input` + 按钮 | `.p-inp` 可含右侧图标（相机）；`.p-qbtn` 为输入框右侧实心小按钮（查询 / 新增地点 / 添加，底色可覆盖） |
| `.p-entry`（+ `.ic` / `.tt` / `.ss` / `.go`） | 扫码页「小票批量录入」入口卡 | 橙底 + 橙方块图标 + 标题/副标题 + 右箭头 |
| `.p-grid`（+ `.two` / `.four`，`> .c`） | 统计页各「N 格指标」白格 | 默认 3 列；`.two` / `.four` 变列数。**这是唯一的指标格写法**（旧 `.p-2x2` / `.p-4stat` / `.p-ledger` / `.p-redbox .cell` 已删） |
| `.p-group-card` / `.p-card-pad-b` | 设置页「分组白卡 + 行分隔」 | `.p-group-card` 内是若干 `.p-row-item`；行下方的整宽控件（字号分段 / 新增地点 / 识别引擎）用 `.p-card-pad-b` 包 |
| `.p-amber` / `.p-detail` | 统计页「🔥 剩菜统计」/「浪费复盘」卡 | 橙底卡 + `.hint` 脚注；白卡 + `.h` 标题 + `.line` 明细行 |
| `.p-donut`（+ `i` / `small`） / `.p-legend` | 统计页「库存状态」甜甜圈 + 图例 | 甜甜圈的 `conic-gradient` 角度**必须与图例占比一致** |
| `.p-trend` / `.p-xaxis` | 趋势图上方的数值图例 / 下方月份轴 | 趋势数字是**一行文字图例**，不是四宫格 |
| `.p-seg`（+ `.tight` / `.eq` / `.indigo` / `.green`，`span.on`） | 时间范围胶囊 / 字号大小 / 识别引擎 | `.eq` 等宽（字号、引擎）、默认按内容宽（时间范围）；`.indigo` / `.green` 为命中色 |
| `.p-toggle`（+ `.off` / `.green` / `.brand`） | 真实 `<toggle-setting>` | 开态默认 `--fi-mk-indigo`；`.off` = 灰轨道 + 旋钮靠左；`.green` 为 OCR 开态 |
| `.p-card-pad-b` / `.p-sec` | 卡内底部控件区 / 行内小标题 | `.p-sec` 自带 `border-top`（真实 `border-t` 分段线） |

#### 3.9.2 三条硬规则（v2.29.4 踩坑固化）

- ❗**`.fig-btn` 必须显式 `text-align: left`**：它是 `<button>`，浏览器 UA 默认样式是 `text-align:center`，会让整个示意图的正文（商品名 / 到期 / 记录明细…）**全部居中**，与真实页面左对齐不符。此坑长期存在，只是旧示意图的正文大多在 flex 容器里没暴露。
- ❗**`.p-bars .pair` 必须是 `flex-direction: row`**：真实趋势图是「每月三根**并排**柱」（采购 / 消耗 / 浪费）。写成 `column` 会把三根叠成一棵「堆叠柱」，与真实图表完全不同。
- ❗**`.p-row-item` 里的文字块必须 `flex: 1; min-width: 0`**，且 `.tt` / `.ss` 一律 `white-space: nowrap` + 省略号：缩略图宽度只有 236px，长副标题一旦折行就会把右侧控件（开关 / 输入框）挤走、行高翻倍。完整长句放折叠详情，示意图只留短句。

### 3.10 使用指南页「正文层」（v2.28.3 新增）

指南页里除手机示意图外的一切文字与容器，都属**真实界面**，只用 `--fi-*` 令牌；❌ 不得使用 `--fi-mk-*` / `.p-*`。

v2.28.3 起指南页每个模块改为 **「关键要点 → 示意图 → 可展开详细说明」** 三层，新增 5 个正文层组件类：

| 类 | 用途 | 要点 |
|---|---|---|
| `.qs-step` + `.qs-go` | 「快速开始」五张可点跳转卡 | **v2.29.2 起取代已删的 `.gd-nav` / `.gd-nav-btn` 顶部胶囊条**：整卡 `role=button` + `tabindex=0` + 回车触发，hover 橙边 / active 缩放 / `:focus-visible` 描边，右下 `.qs-go`「查看 ›」为跳转提示；五卡分别 `jumpTo` 到 m-home / m-scan / m-records / m-settings / m-stats |
| `.gd-points` | 「关键要点」短句列表 | 3–5 条、每条 ≤14 字；圆点用 `--fi-brand`；字号交调用处 `text-[13px]` |
| `.gd-more-btn` | 「查看 / 收起详细说明」开关 | 文案随 `guideOpen[key]` 切换；内部 `.cv` 展开时 `rotate(180deg)` |
| `.gd-detail`（+ `-clip` / `-body`） | 详情折叠容器 | **`grid-template-rows: 0fr → 1fr`**（高度自适应，替代旧 `.more` 的 max-height 写法）；`.gd-detail-clip` 负责 `overflow:hidden` |

- 折叠态由 setup 的 `guideOpen`（reactive，5 个键 home/scan/records/stats/settings）驱动，`toggleGuideDetail(key)` 取反
- `jumpTo(id)` 会**先展开**目标模块详情再滚动（在 `nextTick` 内），避免展开后位置漂移；`m-batch-recognition` 子锚点映射到 `scan`
- 旧 `.more` / `.more-inner` / `.gd-panel` / `.minipoints` 均已删除
- ⚠️ `.gd-nav-btn` / `.gd-more-btn` **不写死 font-size**，由调用处给 `text-xs`，从而随 `fs-large` / `fs-xlarge` 放大（实测 12 → 16 → 18px）
- ❌ **已删除 `.fig-hint`（橙色胶囊「▸ 点击查看「XX」模块说明」）**：它与模块底部的「查看详细说明」是**同一功能的两套入口**，同屏堆叠是模块内最大的视觉噪音。示意图的点击跳转保留（`jumpTo`），不再用文字胶囊提示。
- ✅ 图注 `.fig-cap` 统一为 **`「页面名」：A · B · C`** 短句（用 `·` 分隔、≤ 20 字），不再写长括号举例
- ✅ 模块内文字层级固定为三层可见顺序：**要点 →（示意图 + 图注）→ 分隔线 + 「查看详细说明」**。`.gd-more-btn` 自带 `border-top: 1px solid var(--fi-line-weak)` 作分层线，**不得再叠加其它提示文字**
- ✅ **展开的「详细说明」内部只允许一份 `<ul class="space-y-1.5 text-[13px] text-gray-600 leading-relaxed">`**：每条统一为 `「加粗词」：说明`（`<b class="text-gray-800">`）。❌ 不得再出现橙色「提示」块（`bg-orange-50`）或虚线小条目面板——同一折叠区内**三种字号 / 底色堆叠**是最难看的形态；提示类内容一律降级为该列表里的一条

### 3.11 新手实景导览层（v2.28.4 新增，v2.28.5 扩展，v2.29.0 两阶段重构，v2.29.1 交互定型，v2.29.2 视觉与导航修正，v2.29.3 真正挖洞）

导览是**浮在真实界面之上的一层**，只用 `--fi-*` 令牌；**本层一律不写 `font-size`**（气泡文字全部用 Tailwind 类，才能随 `fs-large` / `fs-xlarge` 放大）。

| 类 | 用途 | 要点 |
|---|---|---|
| `.fi-tour-mask` | 全屏蒙层容器 | `position:fixed; inset:0; z-index:50`（**低于 toast**，toast 仍可覆盖其上）；❗自身 `pointer-events:none`，由子层分别决定是否可点 |
| `.fi-tour-blocker` | 阶段一整屏透明点击拦截 | `position:absolute; inset:0; z-index:49; pointer-events:auto`。**阶段一任何位置（含高亮区）都点不动**。v2.29.3 新增，从 `.fi-tour-dim` 拆出专职拦截 |
| `.fi-tour-dim` | 阶段一整屏压暗 | `rgba(17,24,39,.72)`；`pointer-events:none`；用动态 `clip-path` **真正挖掉高亮洞区域** → 洞内露出 100% 原色界面，洞外压暗。❌ **不再用透明洞 + box-shadow 假挖空**（v2.29.0~v2.29.2 洞内实际显示的是 dim 层的灰色） |
| `.fi-tour-hole` | 高亮「洞」的呼吸描边容器 | 位置/尺寸随 `tourRect` 过渡；`pointer-events:none`；z-index:51。**只承载 `.fi-tour-ring`**，不再负责压暗 |
| `.fi-tour-ring` | 洞的呼吸描边 | v2.29.2：**3px 亮橙实线 + 内侧 1px 白描边**（只勾边界，不污染洞内颜色）+ 橙色外发光；`fiTourPulse` 动画；`pointer-events:none` |
| `.fi-tour-free` / `.fi-tour-free-side` | 阶段二「只拦导航」层 | 固定贴在底部（`bottom`，高度 = `.app-nav` 实测高度 + 12）／左侧（宽度 = `.app-sidebar` 实测宽度 + 8），`z-index:52`。**只压住导航，其余整页放开可点**；但某一步可声明 `releaseNav:true`（如「底部导航」步），此时阶段二**完全放开**导航让用户自己点击 |
| `.fi-tour-card`（+ `.is-free`） | 说明气泡 | `--fi-surface` + `--fi-r-modal` + `--fi-sh-lift`，`z-index:60`（**高于所有压暗层**）；`.is-free` 变**贴屏幕上/下的横向悬浮条**（`position:fixed`、`left:50%` + `translateX(-50%)`、内边距 10/14、`--fi-line` 描边），进场方向随 `.at-top` 翻转（`fiTourBarIn` / `fiTourBarInTop`） |
| `.fi-tour-dots` / `.fi-tour-dot` | 步点指示 | 当前步 `.on` 由 6px 圆点拉长为 16px 并转 `--fi-brand`（**仅阶段一显示**；阶段二收成条后不显示） |
| `.fi-tour-btn`（+ `.primary`） | 跳过 / 上一步 / 主按钮 | `.primary` 用 `--fi-brand` 实心 |
| `.fi-tour-btn-inline` | 阶段二悬浮条内的按钮 | `flex:none; padding:.5em .85em; white-space:nowrap` —— 不撑满、文案不折行，避免把整条拉宽 |

**行为规范（v2.29.3 定型）**：
- ❗**两阶段交互**（`tourFree`）：
  - **阶段一「蒙版态」**：`.fi-tour-blocker` 全屏拦截 + `.fi-tour-dim` 压暗并 `clip-path` 挖洞 + `.fi-tour-ring` 描边；**整屏不允许点击任何位置（含高亮区）** —— 高亮只表示「等下要操作这里」，主按钮文案 **`试一下`**（`advance:'act'` 步）或 `下一步`/自定义 `nextLabel`（`observe` 步）。
  - **阶段二「自由体验态」**：点「试一下」后**压暗层、拦截层、洞、ring 整体消失**，气泡改成**贴屏幕上/下的横向条**（不压在当前页操作区上），内容 = 本步要点回顾（`freeHint`）+ 操作提示；用户可自由点当前页的任何控件看效果；**主按钮变「下一步」**，只有用户自己点才恢复蒙版并前进。
  - ❌ **不自动恢复蒙版、不自动进下一步**（v2.28.x 的「点完自动跳步」已彻底废除）。
- ❗**高亮「点亮」只允许一种做法**：**洞内完全不加色**，对比度完全靠洞外压暗拉开。白/灰衬底会让高亮区发灰发白（v2.29.1 截图实测）；透明洞下方仍是 dim 层也会让洞里发灰（v2.29.2 截图实测）。**必须用 clip-path 真正切掉 dim 层**，洞内才是原始界面 100% 原色。描边用亮橙 + 内侧 1px 白描边勾边界，外发光加大；白描边是「边框」不是「内衬底」。
- ❗**阶段一禁 `pointer-events` 穿透**（v2.29.3 最终方案）：删掉 `.fi-tour-hit` 后，拦截职责**由 `.fi-tour-blocker` 独立承担**（透明全屏 `pointer-events:auto`），`.fi-tour-dim` 只做视觉压暗（`pointer-events:none`）。回归验证必须真实 `mouse.click` 至少 4 个坐标（含高亮区中心），断言 `quantity` / `searchQuery` / `tourStep` / `tourFree` **全部不变**。
- ❗**阶段二悬浮条必须放在「离目标更远的一侧」**（`tourBarTop`）：`enterTourFree` 里 `tourBarTop = r.top + r.height/2 >= innerHeight/2`（目标在**下半屏** → 条贴**顶部**；目标在**上半屏** → 条贴**底部**），随后 `scrollIntoView({block: tourBarTop ? 'end':'start'})`。v2.29.0 的判断写反了，导致「顶部三卡」步的条正好压在三卡上（实测 `covered:3/3`）。
  ⚠️ 条高必须压到一行半以内（靠 `.fi-tour-btn-inline` + 单行要点文案），实测高 89px，否则贴边也会吃掉可操作区域。
- ❗**阶段二不许串页，除非该步明确 `releaseNav:true`**：压暗撤掉后用 `.fi-tour-free` / `.fi-tour-free-side` 只压住底部导航 / 侧栏导航（尺寸由 `measureTourNav()` 实测），用户走不到别的页面。只有「底部导航」这类教学步骤才放开，并配合 `watch(currentPage)` —— 用户一旦离开首页（如点了「扫码」）就自动前进到下一步，让导览无缝接续。
- ❗**`actSel` 必须精确定位到一个控件**：禁止写 `[data-tour="x"] button` 这类「取第一个匹配」的模糊选择器——v2.28.x 正因为此，三卡 / 商品卡三按钮 / 记录四筛选 / 统计四档**点哪个都是同一个**。商品卡三按钮已加 `data-act="inc|dec|edit"` 锚点分别定位。
- ❗**阶段二气泡位置只能靠「贴边 + 让页面向反方向滚」解决**，不再用 `layoutTourCard` 的估算高度（阶段一仍用该估算，阶段二一律 `position:fixed`）。
- ❗**第 5 步「底部导航」必须是 `advance:'act'` 且 `releaseNav:true`**：v2.29.2 前是 `observe`、阶段二仍拦住导航，与「让用户自己点导航」的教学目的矛盾。改为点「试一下」后**放开导航拦截**，用户亲自点「扫码」去下一页；离开后由 `watch(currentPage)` 自动推进到「扫条码录入」步。`page` 保持 `'home'`（用户不点导航时仍停在首页）。
  ⚠️ 若该步 `page` 指向目标页，`startTourFromModule` 会因 `module` 匹配抢先把「扫码」模块入口带到首页 → 需用 `MODULE_ENTRY_KEY` 按 step key 精确定位。
- ❗**示例数据的分类/地点必须与气泡推荐的搜索词一致**：气泡说「试试 `#生鲜果蔬` / `@冰箱冷藏`」，示例数据就必须真能用这两个词筛出结果（旧版示例是「乳品蛋类」，照着搜必然空手）。`seedDemoData` 现用 4 件「生鲜果蔬」+ 1 件「粮油米面」，并同步建好 `settings.categories` / `settings.places` 对应条目，导览结束时连同示例商品一并收回（只删没有真实商品在用的）。
- **示例数据**：库空时导览开始注入示例数据（`DEMO_MARK='__demo__'`），导览结束**一律收回**（走完 / 跳过 / 中途关闭都还原）。注入时**阶段一**气泡额外显示一行 `.fi-hint`「示例数据仅用于本次体验，结束后自动收回」（阶段二收起长文案，此行随之隐藏）。
- ❌ 不得用 `text-[11px]` 写这行提示（arbitrary value 不响应 fontScale，且违反「小字统一 `text-xs`/`.fi-hint`」规则）。

### 3.12 保质期 / 撤销（v2.31.0 新增，数据展示与撤销语义）

**A. 保质期显示（存储是文本，显示必须拆两控）**

- 存储层保持单条文本（`"12个月"` / `"2年"` / `"90天"` / 历史纯数字 `"364"`），**不为它改数据结构**。
- ❗**任何输入控件都不得把整条文本直接塞进 `type=number`** —— v2.31.0 前就是这么干的，结果数字被吃光、单位硬编码 `month`、保存时拼出 `"4年个月"` 污染数据。
- 三个唯一入口，不得另写第 4 份解析：
  - `splitShelfLifeValue(v)` → `{num, unit}`（`unit` 为空表示文本无单位）
  - `composeShelfLifeText(item)` → 文本（**先解析再拼**，杜绝 `"4年"` + `"月"` 双重拼接）
  - `setShelfLifeFromText(text, target, fallbackUnit='day')` → 文本回填表单；解析失败返回 `false`
- ❗**无单位纯数字默认「日」**（`fallbackUnit='day'`）。若用户在编辑页主动改过单位，按用户选择回写。
- `backfillShelfLifeByDays` 只在 `shelfLife` **为空**时用天数推算，已有值一律保留用户单位（旧版强制改写成 `'day'`，是错的）。

**B. 「未改动」不得触发回写**

- 生产日期 / 到期日期 / 保质期 是**双向推导链**，保存时若无条件重算，会把 `"364"` 改写成 `"364天"` 并凭空产生一条调整记录。
- 统一用「用户是否真的动过」开关挡住：`editForm._slTouched`，四个入口（`onEditDateChange` / `onEditExpiryChange` / `onEditShelfLifeChange` / `setEditShelfLifeUnit`）各置 `true`；`saveEdit` 里 `_slTouched ? composeShelfLifeText(...) : (product.shelfLife || '')`。

**C. 撤销语义（`revokePreview` + `executeRevoke`）**

| 记录 | 预览应显示 | 执行 |
|---|---|---|
| `in` 入库 | 数量 | **保持原逻辑不变**（按 delta 扣回） |
| `eat` 吃完 / `waste` 浪费 | 数量 | 在库 → delta 补量 + `undoFillEmpty` 回填空字段；已出库 → 按快照整条重建 |
| `adjust` 调整 | **只列本条记录改过的字段** + 逐行差异明细 | **只回填本条记录改过的字段**（不再整条覆盖） |
| `reheat` 加热 | **加热次数 N→M**（不是数量！） | `reheatCount - 1` **增量回退**，不做绝对值覆盖 |

- ❗**预览文字必须与真实执行一致**：旧版加热记录的预览指向「数量」，用户看到的信息与点下去的结果不是一回事。
- ❗**快照只落本机**：`localStorage['food_inventory_undo_cache']`（上限 300 条 / TTL 60 天）。**不进** `SETTINGS_SYNC_SCHEMA`、**不挂在** record 对象上 → 云同步 delta 事件里不含快照字段。
  - 产品语义由此天然成立：「只能恢复自己操作的」，其他设备没有快照 → 走降级分支，各自数据保持原状。
  - 无快照时**必须优雅降级**（回到旧的补量/空壳重建），不得报错、不得静默失败。

**C-1. 撤销范围必须收窄到「本条记录」（v2.32.0 核心修正）**

- **问题**：v2.31.0 的 `adjust` 撤销是 `Object.keys(snap).forEach(k => p[k] = snap[k])` —— **整条快照覆盖**。若某条流水只改了分类，撤销却把数量也还原了（那是**别条流水**干的事），用户报「这里只应该撤销分类更改而不应该撤销数量修改」。
- ✅ **快照新增 `changed` 字段**：记录**本条流水实际改过哪些字段**。
  ```js
  saveUndoSnapshot(recordId, snapshot, changedKeys)   // ③ changedKeys = 本条的改动字段名数组
  getUndoChanged(recordId)                            // 读回该数组，无则 null
  ```
  - 写入点：`saveEdit` 里 `changes.map(c => c.key)`（每个 `changes.push` 必须带 `key`）；名称清洗流水传 `['name']`。
- ✅ **撤销时按 `changedKeys` 过滤**：
  ```js
  const changedKeys = getUndoChanged(r.id) || undoChangedFromDetail(r.detail);
  (changedKeys || Object.keys(snap)).forEach(k => { if (k in snap) p[k] = snap[k]; });  // 无 changed → 退回全字段
  ```
- ✅ **老流水兜底 `undoChangedFromDetail(detail)`**：v2.32.0 之前的流水没有 `changed` 字段，从流水 `detail` 文案（`字段：前 → 后 · ...`）反推改了哪些字段（注意 `名称清洗` → `名称` 的映射）。反推不出来 → 退回全字段还原（旧行为）。
- 自检：造一条「只改分类、未改数量」的调整流水 + 之后再有入库流水把数量从 1 加到 3 → 撤销该调整后**数量必须仍是 3**，只有分类回滚。

**C-2. 差异明细的展示格式（v2.32.0 定稿）**

- ✅ **每字段一行**：`字段：当前值 → 撤销后值`
  ```html
  <div v-for="it in revokePreview.items">
    {{ it.label }}：<b>{{ it.from }}</b> → <b class="text-teal-700">{{ it.to }}</b>
  </div>
  ```
- ✅ **方向永远是「当前值 → 撤销后值」**（`from` = 商品现在的值，`to` = 快照里的值）。用户已确认按此方向，与「库存：1件→2件」的既有格式一致。
- ❌ **禁止再写成一行用 `·` 拼接**（旧版 `分类：零食饮料 → 调味品 · 数量：3 → 1`），字段一多就糊成一团。
- ❌ **禁止出现「本机快照：可完整还原操作前的数据」这类内部实现提示**（v2.32.0 已整段删除）。弹窗只讲**用户看得见的业务结果**，不暴露缓存机制。

### 3.13 顶栏与应用内品牌（v2.33.0 新增）

**唯一真源：桌面版左侧栏**。品牌由「图标 + FoodIn 词标」组成，桌面版放在左侧栏顶部：

```html
<div class="px-5 py-5 flex items-center gap-3">
  <img src="./icon-180.png" alt="FoodIn" class="w-10 h-10 rounded-xl object-cover shadow-sm">
  <span class="text-lg font-bold text-gray-800">FoodIn</span>
</div>
```

**手机版顶栏（v2.33.0）**——左侧常驻品牌，当前页名降为下方小字：

```html
<header class="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0 z-10 safe-top lg:px-6">
  <div class="flex items-center gap-2.5 min-w-0">
    <img src="./icon-180.png" alt="FoodIn" class="lg:hidden w-8 h-8 rounded-lg object-cover shadow-sm shrink-0">
    <div class="min-w-0">
      <div class="lg:hidden text-lg font-bold text-gray-800 leading-tight">FoodIn</div>
      <div class="lg:hidden fi-hint leading-tight truncate mt-0.5">{{ pageTitleMobile }}</div>
      <h1 class="hidden lg:block text-lg font-bold text-gray-800">{{ pageTitle }}</h1>
    </div>
  </div>
  <!-- 右侧功能按钮区不变 -->
</header>
```

三条硬规则：

1. ❗**品牌块必须整体 `lg:hidden`**，桌面版另用 `hidden lg:block` 的原 `<h1>` 页名。
   桌面版左侧栏已经有同款品牌，若顶栏再显示一次，同一屏会并排出现两个「FoodIn」。
2. ❗**首页的副标题要用 `pageTitleMobile`，不能直接用 `pageTitle`**。
   `pageTitle` 在首页的值是应用中文名「食品库存」（本来就是品牌名），直接复用会与上方 `FoodIn` 词标重复；`pageTitleMobile` 把首页映射为「首页」。
   **桌面版顶栏仍沿用 `pageTitle`**（首页保持「食品库存」），不影响桌面观感。
3. ❗**图标尺寸/圆角跟层级走**：桌面侧栏用 `w-10 h-10 rounded-xl`，手机顶栏用 `w-8 h-8 rounded-lg` —— 不要两边同一档，小尺寸顶栏放 `rounded-xl` 会显得过圆。
   词标字号两处统一 `text-lg font-bold text-gray-800`，保证手机/桌面品牌观感一致。

**副标题的文本层级**：用 `.fi-hint`（11px / gray-400），规范中「辅助说明 / 副标题」的既定层级；**不要**新造字号档。
**代价参考**：手机顶栏高度 73px → 75px（+2px）；`leading-tight` + `truncate` 保证页名过长时省略而不撑高。

> ⚠️ 新增 `lg:hidden` / `lg:block` / `gap-2.5` / `mt-0.5` 这类**从未出现过的 utility class 必须重编译 Tailwind**（§6.2），否则样式静默失效（现象：JS 正常但品牌块高度塌陷 / 两侧品牌同时出现）。

---


## 四、文案规范（提示与 toast）

### 4.1 句式（5 个构造函数，不得自创）

v2.28.0 起统一由 5 个 helper 生成，**禁止再新增裸 `showToast(<字面量>)`**：

| 场景 | helper | 句式 | 示例 |
|---|---|---|---|
| 操作成功 | `toastDone(动作, 对象?)` | `已<动作>「<对象>」` | `toastDone('删除','鲜牛奶')` → 已删除「鲜牛奶」<br>`toastDone('填入条码')` → 已填入条码 |
| 操作失败 / 阻止 | `toastFail(对象, 动作, 下一步)` | `<对象>无法<动作>，请<下一步>` | `toastFail('摄像头','访问','手动输入')` → 摄像头无法访问，请手动输入 |
| 引导 | `toastGuide(动作)` | `请<动作>` | `toastGuide('先添加商品')` → 请先添加商品 |
| 失败（含原因） | `toastErr(对象, 原因)` | `<对象>失败：<原因>` | `toastErr('云同步','API Key 无效或已过期')` |
| 重复校验 | `toastDup(对象)` | `该<对象>已存在` | `toastDup('地点')` → 该地点已存在 |

**高频长提示抽常量**：同一句话出现 ≥2 次即抽为模块级常量（如 `OCR_OFF_HINT` + `toastOcrOff()`，此前有 5 份逐字副本）。
**尚未迁移**：仍为裸字面量的调用（原因型长句、动态拼接）在 §7.3 登记，改动到附近时顺手迁移。

### 4.2 硬性规则

- 对象名统一用**直角引号 `「」`**（全站 18 处已统一），不用 `""''`
- 补充说明用**全角冒号 `：`**，逗号用全角 `，`
- 时长/天数：`剩余 3 天`、`已过期 2 天`；「今天到期」单独措辞，**不得**出现「已过期 0 天」
- 禁止在 toast 里放技术细节（如 `TypeError`、字段名）
- 同一操作的成功/失败文案成对出现，措辞对称（`已开启 X` ↔ `已关闭 X`）

---

## 五、禁止清单（Anti-patterns）

| 禁止 | 原因 |
|---|---|
| 手写 `.fi-*` 已有的等价 utility 组合 | 会重新制造第 N 份写法 |
| 新增色值 / 圆角 / 阴影的「中间档」 | 令牌只有 3 圆角、2 阴影、7 文本级 |
| 新增裸 `showToast(<字面量>)` | 文案句式有 5 个构造函数（§4.1） |
| 同一语义用两个色阶（600 / 700 混用） | 视觉抖动、无法统一改色（例外：`-100` 浅底配 `-700` 深字） |
| 在真实界面使用 `--fi-mk-*` / `.p-*` 示意图令牌与类 | 那是使用指南页缩略图的专属色阶（§3.9） |
| `space-y-0` + 子元素 `mb-X` | 塌陷；统一 `space-y-2` |
| 用 `peer-checked` 做选中高亮 | 渲染不稳定；用显式 `:class` |
| 在模板里 `_ctx` 取用未 `return` 的标识符 | 静默失效（见 §6.3） |
| 宽泛 CSS 选择器放大半个组件（`.px-3` / `.w-4.h-4`） | 历史「按钮变形」根因 |

---

## 六、强制配套机制（改 UI 时必须同步做）

### 6.1 ❗ 把 utility 收敛为组件类 → 必须补 fontScale 规则
`body.fs-large / .fs-xlarge` 是**按 utility 类名**放大的（如 `.fs-large .text-xs{font-size:16px}`）。
元素上的 `text-xs` / `py-1.5` 一旦被组件类吸收，放大就**不再命中** → 必须在大字号 `<style>` 块内补等值规则：

```css
body.fs-large .fi-chip { font-size: 16px !important; padding-top: .5rem !important; padding-bottom: .5rem !important; }
```
**已有配套**：`.fi-hint / .fi-card-sub / .fi-hint-warn / .fi-hint-danger / .fi-label / .fi-group-title / .fi-chip / .fi-btn-2nd / .fi-btn-primary`
**新增组件类时必须同步登记**，否则「换类即丢放大」。

### 6.2 新增 utility class → 必须重编译 Tailwind
```bash
./node_modules/.bin/tailwindcss -i ./src/tailwind.css -o ./styles.css --minify
```
未编译 = 样式静默失效（功能正常）。本轮全部为手写 CSS 组件类，**未新增 utility，无需重编译**。

### 6.3 模板引用 ↔ `return{}` 导出（发布卡点）
```bash
python _chk_exports.py      # 退出码非 0 即拦截
```
覆盖「定义集 ∩ 模板引用集 − return 导出集 − v-for 别名」。历史上已两次踩坑（`saveOcrSettings`、`saveData/showToast`）。

### 6.4 UI 改动的验证姿势（本项目已验证有效）
```bash
node _ui_stylecmp.js <url> <out.json>     # 抓全页逐元素计算样式快照
python _ui_diff.py before.json after.json # 逐元素比对，0 差异 = 零像素变更
```
覆盖 7 个页面 + 2 档字号的 ~2546 个元素 × 23 项计算属性。**任何 UI 收敛都应先跑这个**，
把「我以为没变」换成可证明的「确实没变」。

### 6.5 ❗首屏关键路径：重资源一律按需加载（v2.33.0）

**判定标准**：一个资源只要**不是首屏渲染必需**，就**不允许**写成 `<head>` 里的同步 `<script>` ——
同步脚本会阻塞浏览器开始渲染，用户为此白等下载+解析+执行的全部时间。

- ✅ **首屏必需**（保持同步）：Vue 运行时、`styles.css`、应用图标。
- ❌ **必须按需加载**：扫码库（`html5-qrcode` 375KB）、二维码生成库（`qrcodejs` 20KB）、
  OCR 相关库（Tesseract / Paddle）、以及任何只在某个页面/某个弹层用到的库。

**按需加载的标准写法** —— 单例 Promise + 多源回退 + 失败可重试：

```js
let scanLibPromise = null;
function ensureScanLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (scanLibPromise) return scanLibPromise;              // 并发调用共用一份 Promise，避免重复注入
  scanLibPromise = loadScriptOnce('./vendor/html5-qrcode.min.js')
    .catch(() => pickCdnHost('/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'))
    .then(() => { if (!window.Html5Qrcode) throw new Error('lib missing'); })
    .catch((e) => { scanLibPromise = null; throw e; });   // 失败清空，允许用户重试
  return scanLibPromise;
}
```

三条配套要求：

1. **入口必须 `await` 且失败要能恢复**。打开扫码前 `await ensureScanLib()`；失败时**关掉弹层 + 明确提示**，
   绝不能留一个黑屏取景框让用户以为卡死。
2. **首屏后必须补预取**，否则「首次点开扫码」会多等一次 375KB 下载：
   ```js
   const warmScanLibs = () => { ensureScanLib().catch(() => {}); ensureQrLib().catch(() => {}); };
   setTimeout(() => {                                       // ❗先留让位期
     if (typeof requestIdleCallback === 'function') requestIdleCallback(warmScanLibs, { timeout: 2000 });
     else warmScanLibs();
   }, 2500);
   ```
   ❗**让位期不能省**：`requestIdleCallback` 在挂载后往往「立刻」就空闲，于是预取的 395KB 会在首屏刚画完时
   就开跑、跟云同步拉取抢带宽。加 2.5s 让位期后，「首屏 217KB」这个结果才**稳定可复现**。
3. **验证姿势**：在 `#app` 首次可见（`v-cloak` 被移除）**那一刻**快照
   `performance.getEntriesByType('resource')` —— 否则空闲预取已经跑完，你会测到优化前的假象。
   同时断言首屏时 `typeof window.Html5Qrcode === 'undefined'`。
   参考 `_perf_cmp.js` / `_verify_2330.js` A 段。

**实测收益（v2.33.0）**：首屏关键路径 **604 KB → 217 KB（−64%）**，手机版与电脑版一致。

### 6.6 ❗Service Worker 预缓存与失败兜底（v2.33.0）

- ❌ **禁用 `cache.addAll(...).catch(() => {})`**。两个坑：
  1. `addAll` 是**全有或全无** —— 任一资源 404（新增图标忘上传 / 部署白名单漏一项）会让**整批**预缓存作废，
     应用退化为完全无缓存；
  2. 失败被**静默吞掉**，控制台毫无线索。
  → ✅ 改为逐资源 `Promise.allSettled`，并把失败项**点名打日志**：
  ```js
  const results = await Promise.allSettled(PRECACHE_ASSETS.map((url) => cache.add(url)));
  const failed = PRECACHE_ASSETS.filter((_, i) => results[i].status === 'rejected');
  if (failed.length) console.warn('[SW] 预缓存部分失败：' + failed.join(', '));
  ```
- ❌ **禁止给失败的静态资源返回首页 HTML**（`return caches.match('./')`）。
  `<script src="./x.js">` 拿到一份 HTML 会报 `Unexpected token '<'` —— 看着像代码语法错误、实际是缓存喂错内容，
  极难排查。→ ✅ 导航请求单独走「网络优先 + 回退缓存」，其余失败一律返回 **504**，让浏览器按资源加载失败处理。
- ❗**预缓存名单只放「首屏必需」的资源**。已改为按需加载的库要**同时移出预缓存**，
  否则安装期仍会白下它（本项目是 395KB），与首屏抢带宽；它改由应用的空闲预取经运行时 cache-first 写入，离线可用性不变。
- ❗后台 `cache.put` 一律接住 rejection：SW 换版 `activate` 删旧缓存时，在飞的 `cache.put` 会 reject，
  不接住会在控制台刷未处理拒绝，干扰真实错误排查。

---


## 七、本轮范围与覆盖情况

### 7.1 ✅ 已完成

| 项 | 内容 |
|---|---|
| 令牌层 | `:root` 26 个 `--fi-*` 变量（色彩 / 圆角 / 阴影 / 布局） |
| 组件层 | `.fi-title` `.fi-card-title` `.fi-card-sub` `.fi-label` `.fi-group-title` `.fi-hint(-warn/-danger)` `.fi-card` `.fi-card-pad(-sm/-xs)` `.fi-row` `.fi-empty` `.fi-chip` `.fi-btn-2nd` `.fi-btn-primary` `.fi-btn-danger` `.fi-modal` `.fi-modal-box` |
| 迁移 | 207 处调用点 → 9 个组件类，吸收 807 个 utility token |
| fontScale 配套 | 8 条等值规则（大 / 超大两档） |
| 文案 | toast 110 条的句式归纳为 3 类并成文（§4），未改文案内容 |
| 验证 | 2546 元素 × 23 属性 **零差异**；0 pageerror；`_chk_exports.py` 通过 |
| 工具 | `_chk_exports.py`（导出卡点）、`_ui_stylecmp.js` + `_ui_diff.py`（计算样式比对）、`_ui_migrate.py`（可重跑的迁移脚本）、`_ui_audit.py`（模式量化审计） |

### 7.2 ✅ 遗留 7 项已收口（v2.28.0）

| # | 项目 | 规模 | 结果 | 视觉 |
|---|---|---|---|---|
| 1 | 字段标签第二写法 | 26 + 2 处 | → `.fi-label`；另新增 `.fi-group-title` 收掉 9 处区块标题 | 有变化（11px/gray-400 → 12px/gray-500） |
| 2 | 次按钮三套 | 16 处 | → 唯一类 `.fi-btn-2nd`；`.fi-btn-fill` 并入，变体 4 → 3 | 有变化（py-2.5/text-sm → py-2/text-xs） |
| 3 | 状态色阶混用 | 9 处 | → 统一 `-600`（`-100` 徽章配对保留 `-700`） | 有变化（记录页、统计页、首页卡按钮） |
| 4 | 卡片内边距三套 | 43 处 | → `.fi-card-pad / -sm / -xs`，场景固定入规范 | 零变化 |
| 5 | 弹窗 z 轴四档 | 2 处 | → 归入 `z-50`，全站只剩 `z-40 / z-50` | 零变化 |
| 6 | 使用指南页硬编码色值 | 132 处 | → `--fi-*` + 新增 15 个 `--fi-mk-*`（§3.9） | 零变化 |
| 7 | toast 未收敛 | 36 处调用 | → 5 个句式构造函数 + `OCR_OFF_HINT` 常量 | 零变化（8 条文案措辞统一） |

> 第 4–7 项为等值重构，前后截图 md5 相同；第 1–3 项的对照见 `UI改动对照_v2.28.0.html`。
> 验证：`_chk_exports.py` 通过、0 pageerror、类定义与 fontScale 三档实测符合预期。

### 7.3 ⏳ 仍未覆盖（登记在案）

| # | 项 | 规模 | 说明 |
|---|---|---|---|
| 1 | `.input` 覆盖不全 | 67 个 input 中 16 个未用 | 搜索框等特例，显式豁免 |
| 2 | toast 仍有裸字面量 | 约 70 处 | 原因型长句 / 动态拼接；改动到附近时顺手迁移到 §4.1 的 helper |
| 3 | 指南页 `.qs-* / .fig-*` 的圆角与字号 | ~15 处 | 目前只统一了色值，圆角/字号仍是示意图专属值 |
| 4 | P2 项（与 UI 无关） | 6 项 | 见《Bug审计报告_v2.26.0.md》 |

### 7.4 后续新增界面必须遵守的要点（速查）

1. 先查本文档有没有现成组件类；有则**只用类**，没有则先登记再落地。
2. 颜色 / 圆角 / 阴影 / 文本层级**只从令牌取**，不新增中间档。
3. 卡片 `.fi-card`、胶囊 `.fi-chip`、次按钮 `.fi-btn-2nd`、主按钮 `.fi-btn-primary`、弹窗 `.fi-modal`、空态 `.fi-empty`、开关 `<toggle-setting>`。
4. 表单：`.fi-label` + `.input/.input-sm` + `.fi-hint`。
5. 提示文案按 §4 三种句式，对象名用 `「」`。
6. 若把 utility 收敛成新组件类 → **同步补 fontScale 规则**（§6.1）。
7. 若新增了从未出现过的 utility class → **重编译 styles.css**（§6.2）。
8. 改完先跑 `_ui_stylecmp.js` + `_ui_diff.py` 证明零变化，再跑 `_chk_exports.py`，最后**截图交用户确认**，才 push / 部署。
9. **保质期一律「拆成 数字 + 单位」两控显示**（§3.12）：存储层仍是单条文本，但任何输入控件都不得直接把整条文本塞进 `type=number`；解析走 `splitShelfLifeValue(v)`，回写走 `composeShelfLifeText()`，文本→控件走 `setShelfLifeFromText(text, form, 'day')`。**无单位纯数字默认「日」。**
10. **表单「未改动」不得触发回写**：日期 → 保质期是双向推导链，保存时必须用「用户是否真的动过」开关（如 `editForm._slTouched`）挡住无操作重算，否则会把 `"364"` 改写成 `"364天"` 并凭空产生一条调整记录。
11. **chip 组顺序由设置列表权威决定**，「选中 / 取消选中」**绝不允许改变顺序**：先按设置列表铺满，再把遗留标签追加到末尾，**禁止把「当前已选」先塞进去**（`Set` 保插入序 → 每点一次就重排）。
12. **chip 禁止悬停变色**：不用 `hover:border-*` / `hover:bg-*`；芯片只有「选中 / 未选中」两态。验证必须用**真实鼠标移动**（合成事件不触发 CSS `:hover`）。
13. **栅格卡片在电脑版按钮要齐平**：卡片 `lg:flex lg:flex-col` + 按钮行 `lg:mt-auto lg:pt-2`，类名**一律带 `lg:` 前缀**（手机版零改动），并**记得重编译 Tailwind**。
14. **撤销范围收窄到本条流水**：`adjust` 只回填本条改过的字段（`changedKeys`；老流水靠 `undoChangedFromDetail` 反推，失败退回全字段）；差异明细**每字段一行** `字段：当前值 → 撤销后值`；**禁止暴露「本机快照」等内部实现文案**。
15. **手机版顶栏品牌**（§3.13）：左侧常驻「图标 + FoodIn」，页名降为 `.fi-hint` 小字；品牌块整体 `lg:hidden`（桌面侧栏已有同款，避免同屏两个品牌）；首页副标题用 `pageTitleMobile`（映射为「首页」）而非 `pageTitle`（其值是应用名「食品库存」）。
16. **首屏关键路径**（§6.5）：非首屏必需的库**不许**放 `<head>` 同步加载；一律「单例 Promise + 多源回退 + 失败可重试」按需注入，并在首屏后**留让位期**再空闲预取（`setTimeout(..., 2500)` 之后才 `requestIdleCallback`）。验证要在 `#app` 首次可见**那一刻**快照资源。
17. **Service Worker**（§6.6）：预缓存用逐资源 `allSettled` + 点名日志（禁 `addAll().catch(()=>{})`）；失败静态资源返回 **504** 而非首页 HTML；按需加载的库要同时移出预缓存名单。
18. **toast 只走 5 个构造函数**（§4.1）：`toastDone / toastFail / toastGuide / toastErr / toastDup`。批量收敛时按「行号 + 括号配平」定位，避免相同文案被误替换（历史上同一句「生产日期不能晚于今天，无法保存」出现过 2 次）。

---

## 八、变更记录

### v2.33.0 — 首屏加载提速 64% / 手机版应用名展示 / 导览示例数据不再上云（2026-09-15）
- **① 首屏关键路径 604 KB → 217 KB（−64%）**：`vendor/html5-qrcode.min.js`（367 KB）原是 `<head>` 同步阻塞脚本，
  占首屏资源 61%，却只在打开扫码时用；`vendor/qrcode.min.js`（20 KB）是冗余（代码已有 `ensureQrLib` 懒加载）。
  - 两个 head 标签移除；新增 `ensureScanLib()`（单例 Promise + 本地 vendor → unpkg → jsdelivr 多源回退 + 失败可重试）；
    `openScan` / `startConfigScan` 入口 `await` 且失败关弹层 + 提示；首屏后 **2.5s 让位期 + 空闲预取**。
  - 详见新增 §6.5。验证：`_perf_cmp.js`（在 `#app` 首次可见那一刻快照资源）。
- **② 手机版顶栏应用名展示**：左侧常驻「图标 + FoodIn」（`icon-180.png` + `text-lg` 词标），页名降为 `.fi-hint` 小字；
  品牌块 `lg:hidden`（桌面侧栏已有同款，避免同屏两个品牌）；首页副标题用新增 `pageTitleMobile`（首页 → 「首页」，
  因 `pageTitle` 首页值就是应用名「食品库存」，复用会与词标重复；桌面版仍用 `pageTitle` 不受影响）。
  顶栏高度 73 → 75px。详见新增 §3.13。
- **③ 【P1 修复】导览示例数据会被同步到云端且残留清不掉**：`captureState()` 把演示数据（`DEMO_MARK`）一起纳入差分 →
  导览途中操作一下就会把演示商品 `upsert` 推上云；中途关页面则 `endTour` 不跑，而下次启动的本地清理发生在
  `initSyncEngine()` **之前**，`baseState` 不含这些 id → **永远生成不出 delete 事件**，云端残留无法收敛，
  其他设备会同步出「土鸡蛋 / 全脂牛奶」等演示商品。
  - 修法三处：`captureState()` 过滤 `DEMO_MARK`（覆盖 `initSyncEngine` / `replayState` 两处 baseState 赋值）；
    `applyStockDelta()` 对演示商品直接返回不发 delta（delta 是绕过差分的独立通道）；启动扫到残留后等同步引擎就绪再落盘
    （❗不能在 `initSyncEngine` 之前落盘 —— 那时 `baseState` 为空，会把全量商品误判成新增整包推上云）。
  - 验证断言：演示数据事件 0 条、演示商品 delta 0 条、本机数量仍生效、**同时新增真实商品照常产生事件**（证明同步未被弄坏）。
- **④ 导览启动时机**：`setTimeout(() => startTour(), 700)` → 改为「`document.fonts.ready` → 两帧渲染 → 240ms 稳定期」。
  原固定值快机白等、慢机可能因布局未定而量错高亮框位置（且之后不重测）。
- **⑤ Service Worker 两个隐患**（详见新增 §6.6）：预缓存 `addAll().catch(()=>{})` → 逐资源 `allSettled` + 点名日志；
  失败静态资源兜底返回**首页 HTML** → 改返回 **504**（原行为会让 JS 拿到 HTML 报 `Unexpected token '<'`）；
  两个扫码库移出预缓存（避免安装期白下 395KB 抢首屏带宽）；后台 `cache.put` 补 `.catch()`。`CACHE_NAME` v113 → v114。
- **⑥ toast 文案收敛 63 处**至 5 个构造函数（余 3 处为构造函数自身定义）。迁移脚本按「行号 + 括号配平」定位，
  规避两处完全相同的文案被误替换。文案层面调整，无功能变更。
- **更正**：此前登记的「4 处死类 `.fi-btn-fill`」为**误判** —— 该 4 处全在 changelog 历史文案里，非模板死类，**实际无死类**。
- **版本联动**：`CURRENT_VERSION` 2.32.0 → 2.33.0；SW `CACHE_NAME` v113 → v114；归档 `versions/v2.33.0/`
- **验证**：`_verify_2330.js` **23/23 PASS**；`_chk_exports.py` 305 键无 P0；Tailwind 已重编译
  （新增 `lg:hidden / lg:block / gap-2.5 / mt-0.5`，v2.32.0 的 `lg:*` 类全部保留）；前后对照截图 `_cmp2330/old/`（= v2.32.0），看板 `_review_2330.html`

### v2.32.0 — 撤销范围收窄 / 芯片顺序与悬停 / 电脑版卡片按钮对齐（2026-09-15）
- **背景**：用户交付 5 条 UI 反馈（含截图），并要求「以上有关 UI 修改写进规范文档」。
- **① 调整撤销只撤销本条记录改过的字段**（对应反馈「只应该撤销分类更改而不应该撤销数量修改」）：
  - 根因：v2.31.0 `adjust` 撤销是 `Object.keys(snap).forEach(k => p[k] = snap[k])` **整条快照覆盖**，会把别条流水的改动一起回滚。
  - 修法：`saveUndoSnapshot(recordId, snapshot, changedKeys)` 第三参记录**本条改过的字段名**；`saveEdit` 的每个 `changes.push` 补 `key`；名称清洗传 `['name']`。
  - 执行改为 `(changedKeys || Object.keys(snap)).forEach(...)`，只回填范围内字段；新增 `getUndoChanged(recordId)` 读取。
  - **老流水兜底**：`undoChangedFromDetail(detail)` 从流水文案（`字段：前 → 后`）反推改动字段（`名称清洗`→`名称` 映射），反推失败退回全字段（旧行为）。
- **② 撤销弹窗文案格式**：改为**每字段一行** `字段：当前值 → 撤销后值`（方向 = 当前值指向撤销后值，用户已确认）；模板由单行 `diffText` 改为 `v-for="it in revokePreview.items"`。
- **③ 删除「本机快照：可完整还原操作前的数据」提示**：内部实现不该出现在用户面前，整段移除。
- **④ 储存位置 chip 去掉悬停绿边**：全局清除 6 处 `hover:border-teal-300 / hover:border-teal-400`。实测旧版悬停边 `rgb(229,231,235)` → `rgb(94,234,212)`（teal-300）；新版悬停前后一致，**悬停截图与静默态 md5 完全相同**。
- **⑤ 编辑页标签顺序错乱修复**：`unionTags()` 原用 `Set` 先收「当前已选」再补设置列表 → 每点一次标签就重排。改为**先按设置列表铺满、遗留标签追加末尾**，顺序与设置页一致且点击不再变化。（用户澄清这是「顺序错误更改」，非面板动画问题。）
- **⑥ 电脑版商品卡按钮对齐**：卡片 `lg:flex lg:flex-col`、按钮行 `lg:mt-auto lg:pt-2`、按钮 `py-1.5 lg:py-2`、`lg:hover:bg-*-600`。实测按钮行 top 由 `[311, 311, 343]` → `[343, 343, 343]`。**手机版零改动**（全部 `lg:` 前缀）。
- **版本联动**：`CURRENT_VERSION` 2.31.0 → 2.32.0；SW `CACHE_NAME` v112 → v113；归档 `versions/v2.32.0/`
- **验证**：`_verify_2320.js` **33/33 PASS**（A 芯片顺序稳定 / B 调整撤销只动分类且数量保持 3 + 提示文案消失 + 方向正确 / C 无 `hover:border-teal` 且真实悬停边框色不变 / D in-eat-reheat-waste 撤销回归 / E 桌面 1440×900 两卡等高按钮齐平）；`_chk_exports.py` 304 键无 P0；前后对照截图 12 张（`_cmp2320/old/` = v2.31.0），看板 `_review_2320.html`
- **登记未修（P2）**：`index.html` 残留 4 处 `.fi-btn-fill`（该 CSS 规则已并入 `.fi-btn-2nd`、`styles.css` 中已无对应规则 → 死类，视觉无影响）

### v2.31.0 — 撤销升级为「真撤销」（本机快照）+ 保质期显示链路修复（2026-09-14）
- **背景**：审查现版撤销链后发现「入库」撤销是有效的，但其余三类都只是**看起来**撤销了：吃完 / 浪费在商品已出库时只重建出一具空壳（只有名字 + 条码），调整只回退数量不动字段，加热记录的预览指向错误的语义（数量），且加热根本没有撤销入口。
- **① 入库（in）撤销逻辑完全不变**（按要求保留）。
- **② 吃完 / 浪费 → 完整恢复全量数据**：
  - *在库*（商品还在）：按 delta 补回数量 → `undoFillEmpty()` 把快照里**有值的空字段**回填（跳过 `quantity` / `reheatCount`，避免污染计数器）。
  - *已出库*（只剩空壳）：按快照**整条重建** `{...snap, id, quantity: Math.max(1, snap.quantity), updatedAt}`。
  - *无快照*（非本机操作）：优雅降级到旧行为，不报错。
- **③ 调整（adjust）→ 有效撤销**：`Object.keys(snapshot).forEach(k => p[k] = snapshot[k])` 真还原；确认框列出将还原的字段与「旧值 → 新值」差异明细。
- **④ 加热（reheat）→ 新增真撤销**：确认框语义由「数量」改为「加热次数 N→M」；执行按 `reheatCount - 1` **增量回退**（不做绝对值覆盖，避免并发写回旧值）。
- **⑤ 快照本机化（关键设计）**：`localStorage['food_inventory_undo_cache']`，上限 300 条 / TTL 60 天 / 超出按时间裁剪。
  - **不进** `SETTINGS_SYNC_SCHEMA`、**不挂在** record 对象上 → 云同步 delta 事件里**不含任何快照字段**（`_verify_2310.js` 已断言）。
  - 由此天然满足产品要求「只恢复自己的操作，别人数据保持原状」：其他设备没有这份快照，走降级分支。
  - **未修改任何云同步代码**：协议、事件结构、schema 一行未动，快照是纯本地附加层。
- **⑥ 保质期显示链路修复**（对应两张反馈截图）：
  - **根因**：`openEditModal` 把存好的文本（如 `"4年"`）硬塞进 `type=number` 输入框 + 单位硬编码 `shelfLifeUnit:'month'` → 数字被吃、单位错档、直接保存拼成 `"4年个月"` 污染数据。
  - **修法**：新增 `splitShelfLifeValue(v)` 拆 `{num, unit}`；`initEditShelfLife(product)` 负责回填 + 兜底按日期反算；`composeShelfLifeText(item)` 先解析再拼（杜绝双重拼接）；`setShelfLifeFromText(text, target, fallbackUnit='day')` 解析失败返回 false。
  - **默认单位 = 日**：无单位纯数字一律落 `日`（用户反馈「录入 1 个月，编辑页应展示实际日数」的诉求方向）；用户在编辑页主动改过单位则尊重用户选择（如回写 `"1年"`）。
  - **`backfillShelfLifeByDays` 不再强制 `'day'`**：已有 `shelfLife` 时保留用户单位，仅在为空时才用天数推算。
  - **`_slTouched` 挡无操作重写**：`saveEdit` 里 `const editShelfLifeText = editForm._slTouched ? composeShelfLifeText(editForm) : (product.shelfLife || '')`；四个 `@change`（生产日期 / 到期日期 / 保质期 / 切单位）都会置 `true`。
- **版本联动**：`CURRENT_VERSION` 2.30.0 → 2.31.0；SW `CACHE_NAME` v111 → v112；归档 `versions/v2.31.0/`
- **验证**：`_verify_2310.js` **80/80 PASS**（保质期 6 种形态回环 + 用户改单位回写；撤销 4 分支 + 无快照降级；快照不落云三断言）；`_chk_exports.py` 305 键通过；与 v2.30.0 全量前后对照截图 12 张（`_cmp2310/old/`），看板 `_review_2310.html`


### v2.30.0 — 三个 Bug 修复：幽灵商品 / 储存位置排序 / 日期反算保质期（2026-09-14）
- **① 云同步偶发「数量 0 的幽灵商品」**：多设备并发 delta 增量重放收敛后偶尔留下数量 0（或负）却仍在库里的商品（正常流程归零一定走 `removeProduct` 移出库存，故数量 ≤ 0 必是脏数据）。
  - **按「不改云同步算法」处理**：`replayState` / `diffToEvents` 一行未动，新增本地兜底 `purgeGhostProducts()`（数量 ≤ 0 直接删除）
  - **两个触发时机**：启动加载后（`initSyncEngine()` 之后，此时 `baseState` 已有值 → `delete` 事件能正确生成）；以及 `watch(products)` 捕获「`products` 整体被替换」（= 云同步重放应用结果）
  - **落盘策略**：`syncState.baseState` 已就绪 → 走 `saveData()` 顺带生成 delete 事件让云端收敛；未就绪 → 只写 localStorage，避免 baseState 为空时把全量商品误判成「新增」推上云
- **② 储存位置里「有分区的地点」没排在最前面**：设置页按「分区 / 不分区」两段渲染、拖拽只在段内生效 → 底层 `settings.places` 两段会交错；录入页 / 批量录入 / 主页编辑弹窗三处直接遍历原始数组，导致「冰箱（有分区）」掉到无分区地点后面。
  - 新增 `placesOrderedView`（有分区在前、无分区在后，各自保持原相对顺序），三处统一改用；顺序固定 **待设置 → 有分区 → 无分区**（规范已写入 §3.2）
- **③ 录入页填了生产日期 + 到期日期却不反算保质期**：录入页「到期日期」「保质期」两个 `@change` 写成了**无参形式**，Vue 把 DOM Event 当第一个实参传入 → 函数默认值 `scanForm` 失效 → 事件对象上取不到 productionDate / expiryDate，反算静默不执行。**因为「生产日期」那处模板显式传了 `scanForm`，所以只有「先填生产日期、再填到期日期」这条路径必挂**（反序反而正常），批量录入与编辑弹窗因全程显式传参也一直正常。
  - 两处补显式实参 **+** 函数内加 `dateForm()` 归一化护栏（传入的不是带 `productionDate` 的表单对象就回落 `scanForm`）
- **版本联动**：`CURRENT_VERSION` 2.29.4 → 2.30.0；SW `CACHE_NAME` v110 → v111；归档 `versions/v2.30.0/`
- **验证**：三项 12 个断言全部 PASS（`_verify_2300.js`）；② ③ 与 v2.29.4 旧版做了真实前后对照截图（`_cmp2300/old/`）；无 JS 报错

### v2.29.4 — 使用指南 5 张手机示意图按真实页面重画（2026-09-14）
- **问题**：示意图只画了「页面中部内容」，**页头 / 底部导航 / 选中态 / 输入框**这些真实界面最醒目的骨架全部缺失，看着不像真机截图；另有 3 个长期存在的渲染 Bug 一并暴露
- **逐张重画**：
  - **①首页**：补页头（食品库存 + 铃铛红点 + 位置 + 帮助）、三卡带「件」且命中态深底白字、搜索框含相机 + 筛选漏斗、商品卡 chip 带定位/标签图标且位置写 `冰箱>冷藏`、数量圆圈下带「件」、到期状态右对齐配色、底部导航（首页高亮）
  - **②扫码**：补「小票批量录入」入口卡；条形码改「输入框含相机 + 查询按钮」；分类 / 位置改为「待设置（选中）+ 真实候选项」；补初始数量与日期信息三字段（生产日期 / 保质期 / 到期日期）
  - **③记录**：四筛选由纯文字 tab 改为**带件数的卡片**且命中态整卡变色（在库 = 蓝色实心）；记录卡改「徽章 + 商品名 / 右侧 `+N 件` / 分类 + 时间 / 明细 / 撤销」；补「共 N 条记录」
  - **④统计**：时间范围从页头移到**独立一行**并补「自定义起止日期」；「浪费 · 临期」扩为 2×2 四格；补「🔥 剩菜统计」「浪费复盘 · 9月」「库存状态」甜甜圈；趋势图补数值图例（采购/消耗/浪费/净增）与月份轴
  - **⑤设置**：改为「分组白卡 + 行分隔」结构；补简洁模式开关、字号大小分段（标准 = 靛蓝实心）、剩菜默认保质期、商品分类列表、文字识别（小票 OCR）与识别引擎（Paddle 本地 = 绿色实心）
- **修的 3 个 Bug**：
  - `.fig-btn` 是 `<button>`，UA 默认 `text-align:center` 让整个示意图正文居中（与真实左对齐不符）→ 显式 `text-align:left`
  - `.p-bars .pair` 为 `column` 把三根柱叠成「堆叠柱」→ 改 `row`，还原真实「每月三根并排柱」
  - `.p-row-item` 文字块未 `flex:1; min-width:0`，长副标题折行把右侧开关/输入框挤走 → 修 + `nowrap` + 省略号
- **层内治理**：示意图层自此**零手写 hex**（残余 `#16a34a` / `#f59e0b` / `#b91c1c` / `#EEF2FF` / `#FFF1E6` / `#F3F4F6` / `#FFF7E6` 全部收成 `.p-tx-*` / `.p-edge-*` / `.p-ic-*`）；删除 12 个死类（`.phone-bar*`、`.p-search*`、`.p-field`、`.p-tabs`/`.p-tab`、`.p-4stat`、`.p-ledger`、`.p-2x2`、`.p-redbox .cell*`、`.p-seg.tight`、`.p-ic-gray`、`.p-tx-info`、`.p-edge-info`）与未用令牌 `--fi-mk-panel`（15 → 14 个）
- **指南正文同步**：5 张图注改写为与新插图一致（≤20 字）；设置模块详情补「剩菜默认保质期」「文字识别（小票 OCR）+ 识别引擎」
- 版本联动：`CURRENT_VERSION` 2.29.3 → 2.29.4；SW `CACHE_NAME` v109 → v110；归档 `versions/v2.29.4/`

### v2.29.3 — 高亮区真正挖洞：洞内 100% 原色可见（2026-09-13）
- **问题**：v2.29.2 想靠「透明 `.fi-tour-hole` + 洞外 `.fi-tour-dim` 压暗」让高亮区保持原色，但透明洞下方仍是 dim 层的 `rgba(17,24,39,.72)`，洞里三张卡实际被灰色 wash 过，截图中明显发灰
- **修复**：
  - 新增 `.fi-tour-blocker`：全屏透明层，`pointer-events:auto`，专职阶段一拦截点击（任何位置都点不动）
  - `.fi-tour-dim` 改为 `pointer-events:none`，并用动态 `clip-path` **真正切掉高亮洞区域** —— 洞内完全露出原始界面，洞外保持 `.72` 压暗
  - `.fi-tour-hole` 只承载 `.fi-tour-ring` 呼吸描边，不再负责压暗；删除 `::after` 的 `9999px` box-shadow 假挖空与白色内衬底
  - `tourDimClip` computed 根据 `tourRect` 生成 `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, left top, left bottom, right bottom, right top, left top)`（outer 顺时针、inner 逆时针，evenodd 挖洞）
  - `window.__foodin` 白名单新增 `tourRect: () => tourRect.value`，便于自动化读取洞坐标
- 回归验证 `_verify_2293.js`：`clipPath` 包含洞坐标 ✅；`dimPointerEvents:none`、`blockerPointerEvents:auto` ✅；阶段一连点高亮区中心与洞外 4 处，`q/step/free` 全不变 ✅；阶段二 blocker/dim/hole 全消失、点「临期」卡后 `q="&临期"` ✅；`pageerror` 空 ✅
- 版本联动：`CURRENT_VERSION` 2.29.2 → 2.29.3；SW `CACHE_NAME` v108 → v109；归档 `versions/v2.29.3/`

### v2.29.2 — 高亮去灰雾 / 底部导航让用户自己点 / 指南页删胶囊导航（2026-09-13）
- **高亮去灰雾**：v2.29.1 的 `.fi-tour-hole::after` 加了 `inset rgba(255,255,255,.34)` 白衬底，实测把洞内内容整体 wash 成灰蒙蒙的半透明白雾（截图可见文字发灰、色块失色）。改为**洞内完全不加色**——只留 `0 0 0 9999px rgba(17,24,39,.72)` 在洞外压暗，洞内就是原始界面 100% 原色，对比度全靠四周压暗拉开；同时压暗色由 `.62` 略提到 `.72`、描边加内侧 1px 白描边勾边界、外发光加大
- **底部导航让用户自己点**：第 5 步「底部导航」由 `advance:'observe'` 改为 **`advance:'act'` + `releaseNav:true`**。阶段一蒙版高亮底部导航，点「试一下」后**完全放开 `.fi-tour-free` / `.fi-tour-free-side` 导航拦截**，用户亲自点底部「扫码」去扫码页；`watch(currentPage)` 检测到离开首页后自动前进到「扫条码录入」步，导览无缝接续。阶段二文案为「要点：点底部「扫码」切换到扫码页，五个页面都在这里切换」
- **指南页删胶囊导航**：移除顶部 6 颗胶囊跳转条（`.gd-nav` + `.gd-nav-btn` 样式一并删除），改为「快速开始」五张 `.qs-step` 卡片各自可点击跳转：看库存→m-home、录商品→m-scan、日常记账→m-records、看临期→m-settings、看趋势→m-stats。卡片加 `cursor:pointer`、hover 橙边、active 缩放、`focus-visible` 轮廓、`role=button` + `tabindex=0` + 回车触发，并加 `.qs-go`「查看 ›」提示
- 回归验证 `_verify_2292.js`：指南页 `navBar:0 navBtns:0 qsCards:5 hasGo:5`，点卡跳转产生 `flash` ✅；高亮 `afterHasWhite:false`、`dimBg:rgba(17,24,39,0.72)`、`ringBorder:3px` ✅；nav-scan 阶段二 `freeLayer:0 freeSideLayer:0`，点「扫码」后 `page:scan step:5 key:scan-barcode` ✅；`pageerror` 空 ✅
- 版本联动：`CURRENT_VERSION` 2.29.1 → 2.29.2；SW `CACHE_NAME` v107 → v108；归档 `versions/v2.29.2/`

### v2.29.1 — 导览交互定稿：加深蒙版 / 强化高亮 / 阶段一整屏锁死 / 气泡让位（2026-09-13）
- **①蒙版加深 + 高亮强化**：`.fi-tour-dim` 由 `rgba(17,24,39,.34)` 回到 **`.62`**（`.34` 太浅、高亮不突出）；`.fi-tour-hole` 改用 `::after` 的 `0 0 0 9999px .62` **反向挖空**（洞外才暗）+ `inset … rgba(255,255,255,.34)` 白衬底做出「被灯照亮」；`.fi-tour-ring` 描边 **2px → 3px** 并加橙色外发光（`0 0 0 4px rgba(249,115,22,.22), 0 0 22px 6px rgba(249,115,22,.5)`）
- **②阶段一整屏锁死（核心修复）**：删除 `.fi-tour-hit` 转发层后，`.fi-tour-mask` 是 `pointer-events:none`，而 `.fi-tour-dim` 当时**没有** `pointer-events` → 点击**穿透到真实页面**（实测：阶段一点高亮区真的触发了 `searchQuery="&临期"`）。修复 = `.fi-tour-dim{pointer-events:auto}` + `.fi-tour-hole{pointer-events:none}`，拦截职责全落在 dim 层
- **③阶段二气泡让位 + 保留要点**：气泡 `.is-free` 改为**贴屏幕上/下的横向悬浮条**（`position:fixed`、`left:50%` + `translateX(-50%)`、单行要点 + 右侧 `跳过`/`下一步` 用新增 `.fi-tour-btn-inline`：`flex:none` 不撑满、`white-space:nowrap` 不折行；实测条高 171px → 89px）
  - **修正 `tourBarTop` 判断反了**：改为 `r.top + r.height/2 >= innerHeight/2`（目标在**下半屏** → 条贴**顶部**），并配 `scrollIntoView({block: tourBarTop ? 'end':'start'})` 把目标滚到另一侧。v2.29.0 时「顶部三卡」步的条正好压在三卡上（实测 `covered:3/3` → 修复后 `0/3`）
  - 阶段二条文案由新增的 `freeHint` 字段驱动（`tourFreeHint` computed = `freeHint || desc`），逐条改写成**一行内的本步要点回顾**（如「要点：三张卡分别按「在库 / 临期 / 过期」筛选，点哪张就筛哪个」）
  - 阶段二隐藏 `.fi-tour-dots`（收成条后空间不够）
- 新增组件类 `.fi-tour-btn-inline` —— 纯 CSS 在内联 `<style>`，**无需 Tailwind 重编译**
- 回归验证 `_verify_2291.js`：阶段一连点 4 处（含高亮区中心）零副作用 ✅；`ringWidth:3px` + 橙色光晕 ✅；阶段二 `covered:0/3`、`covered:0/4`（记录）、`covered:0/4`（统计）✅；商品卡 `5 →(+1)→ 6 →(-1)→ 5` ✅；`pageerror` 空 ✅
- 版本联动：`CURRENT_VERSION` 2.29.0 → 2.29.1；SW `CACHE_NAME` v106 → v107；归档 `versions/v2.29.1/`

### v2.29.0 — 导览「两阶段」重构 + 精准命中 + 示例数据对齐（2026-09-13）
- **蒙版改「部分界面蒙版」**：废除洞外 `9999px` 近黑投影（会把整页内容全挡上、看不到操作效果），改为 `.fi-tour-dim`（`rgba(17,24,39,.34)` 浅色压暗）+ `.fi-tour-ring` 描边，新增 `.fi-tour-block` 作阶段一拦截层
- **两阶段交互**（新增状态 `tourFree`）：阶段一主按钮 **`试一下`** → 压暗层整体消失（气泡保留并收成 `.is-free` 紧凑条），用户可自由点当前页控件；主按钮变 **`下一步`**，只有用户自己点才恢复蒙版并前进（**不自动恢复、不自动跳步**）
- **阶段二不许串页**：新增 `.fi-tour-free` / `.fi-tour-free-side`（+ `measureTourNav()` 实测导航尺寸、`tourNavRects` 状态），只压住底部 / 侧栏导航
- **修复「点哪个都是同一个」**：各步 `actSel` 由模糊选择器改为**精确定位单个控件**；商品卡三按钮新增 `data-act="inc|dec|edit"` 锚点；顶部三卡/记录四筛选/统计四档分别定位
- **修复示例数据与推荐搜索词不符**：`seedDemoData` 改用「生鲜果蔬」×4 + 「粮油米面」×1，并同步建好 `settings.categories` / `settings.places`，导览结束一并收回
- **修复 `@冰箱冷藏` 搜不到**：`matchesProduct` 新增「地点名 + 分区名连写」复合识别（此前只认 `@冰箱` 或 `@冷藏`）
- **气泡让位**：`layoutTourCard` 阶段二优先放目标**上方**、估高 132（阶段一 190），避免遮挡用户要看的变化
- 第 5 步「底部导航」改 `advance:'observe'`（只讲不点，因阶段二会拦住导航，与「点导航过去」冲突）
- 新增组件类 `.fi-tour-dim` / `.fi-tour-block` / `.fi-tour-free` / `.fi-tour-free-side` / `.fi-tour-card.is-free` —— **需重编译** `styles.css`（本层纯 CSS 在 `<style>` 内联，无需 Tailwind 重编译）
- 版本联动：`CURRENT_VERSION` 2.28.6 → 2.29.0；SW `CACHE_NAME` v105 → v106；归档 `versions/v2.29.0/`

### v2.28.6 — 导览取消自动跳步 / 跳页（2026-09-13）
- 第 5 步「底部导航」`page` 由 `scan` 改回 **`home`**：停在首页只高亮底部「扫码」按钮，由用户自己点过去（不再自动切页）
- **取消全部「点完自动进下一步」**：`tourHitClick` 删除自动跳步分支，`autoNext` 字段从 `TOUR_STEPS` 移除（已无读取点）；气泡提示统一为「点击高亮的控件随便体验，想好了再点「下一步」继续」
- 连带修正：`startTourFromModule` 加 `MODULE_ENTRY_KEY`，按 step key 精确定位（否则第 5 步 `module:'scan'` 会抢先把扫码模块入口带到首页）
- 未新增 utility class，**无需重编译** `styles.css`
- 版本联动：`CURRENT_VERSION` 2.28.5 → 2.28.6；SW `CACHE_NAME` v104 → v105；归档 `versions/v2.28.6/`

### v2.28.5 — 导览示例数据 + 全步骤可点（2026-09-13）
- 导览（§3.11）行为升级：**全部步骤改为可真实点击**，点完默认自动进下一步；唯一例外第 5 步「底部导航」`autoNext:false`（只切页 + 高亮，用户自己点、手动继续）
- 新增示例数据机制：`DEMO_MARK='__demo__'`；库空时导览开始注入 3 商品（覆盖过期红 / 临期橙 / 正常绿三态）+ 5 条流水（入库 / 吃完 / 浪费），导览结束**一律收回**
- 气泡新增一行 `.fi-hint`「示例数据仅用于本次体验，结束后自动收回」（`v-if="tourDemoOwned"`）；提示文案随 `autoNext` 切换两种措辞
- ❗未用 `text-[11px]`（arbitrary value 不响应 fontScale 且违反规范），改用 `.fi-hint`
- 未新增 utility class，**无需重编译** `styles.css`
- 版本联动：`CURRENT_VERSION` 2.28.4 → 2.28.5；SW `CACHE_NAME` v103 → v104；归档 `versions/v2.28.5/`

### v2.28.4 — 新手实景导览（2026-09-13）
- 新增导览组件类（§3.11）：`.fi-tour-mask` / `.fi-tour-hole` / `.fi-tour-hit` / `.fi-tour-ring` / `.fi-tour-card` / `.fi-tour-dots` / `.fi-tour-dot` / `.fi-tour-btn`
- 聚光用「洞」的 `box-shadow: 0 0 0 9999px rgba(17,24,39,.62)`；洞内 `.fi-tour-hit` 转发点击给真实控件
- 全部只用 `--fi-*` 令牌；**本层一律不写 `font-size`**，气泡文字交 Tailwind 类以随 fontScale 放大
- 版本联动：`CURRENT_VERSION` 2.28.3 → 2.28.4；SW `CACHE_NAME` v102 → v103；归档 `versions/v2.28.4/`

### v2.28.3 — 使用指南改版（2026-09-13）
- 新增组件类（正文层，§3.10）：`.gd-nav` / `.gd-nav-btn` / `.gd-points` / `.gd-more-btn` / `.gd-detail(-clip/-body)`
- 删除旧类：`.more` / `.more-inner`（折叠改由 `.gd-detail` 的 `grid-template-rows 0fr→1fr` 实现，高度自适应）
- 指南页每模块改为「关键要点（3–5 条短句）→ 示意图 → 可展开详细说明」三层；原详细说明文字**一字未删**，仅默认收起
- 新增顶部模块导航条；`jumpTo(id)` 改为先展开目标模块详情再滚动
- 新增 fontScale 配套：`.gd-nav-btn` / `.gd-more-btn` 由调用处 `text-xs` 放大（实测 12 → 16 → 18px）
- 去噪：删除 `.fig-hint` 橙色胶囊（与「查看详细说明」重复的第二个入口）；`.fig-cap` 统一为「页面名：A · B · C」短句；`.gd-more-btn` 加 `border-top` 分层线 —— 模块内从「三行小字堆叠」收敛为「图注 + 分隔线 + 详情入口」两层
- 二次收敛（详情区内部）：五个模块展开后的橙色「提示」块 + 虚线「更多细节」面板全部并入上方同一个 `<ul>`，删除 `.gd-panel` / `.minipoints` 两个类；同一折叠区由三种字号 / 底色收敛为一份列表（每条 `加粗词：说明`）
- 内容对齐最新版：设置模块补「简洁模式 / 字号大小」；统计模块「未填价格 / 未填净含量」→「价格待设置 / 净含量待设置」；合并重复条目（首页铃铛红点并入「过期提醒」、记录页撤销三条合一条、设置页拖动排序并入「存储位置列表」、备份建议合并原提示与小条目）
- 未新增 utility class，**无需重编译** `styles.css`
- 版本联动：`CURRENT_VERSION` 2.28.2 → 2.28.3；SW `CACHE_NAME` v101 → v102；归档 `versions/v2.28.3/`

### v2.28.1 – v2.28.2 — 文案清理与字号修复（2026-09-13）
- v2.28.1：设置页多余小字清理 + 普通/简洁模式 `desc()` 文字双轨 + 字号三档改 indigo-500 实心
- v2.28.2：搜索框与筛选按钮等高对齐；商品卡片文字改用标准 `text-*` 类以响应字号三档；多处文案统一（价格待设置 / 净含量待设置 / 到期前 N 天）

### v2.28.0 — 遗留 7 项收口（2026-09-11）
- 新增组件类：`.fi-group-title`、`.fi-btn-2nd`（替代 `.fi-btn-fill`）、`.fi-card-pad-sm`、`.fi-card-pad-xs`
- 新增令牌：`--fi-mk-*`（15 个，示意图层专属，禁止在真实界面使用）
- 新增 helper：`toastDone / toastFail / toastGuide / toastErr / toastDup / toastOcrOff` + `OCR_OFF_HINT`
- 新增 fontScale 配套：`.fi-group-title`、`.fi-btn-2nd`（大 / 超大两档）
- 工具：`_ui7_migrate.py`（第 1–6 项迁移，可重跑）、`_ui7_toast.py`（第 7 项）、`_ui7_board.py`（对照看板）、`_ui7_verify.js`（类定义 + fontScale 实测）
- 版本联动：`CURRENT_VERSION` 2.27.0 → 2.28.0；SW `CACHE_NAME` v98 → v99；归档 `versions/v2.28.0/`

### v2.27.0 — 全系统 UI 规范化（2026-09-11）
- 首次建立令牌层（`:root` 26 个 `--fi-*`）与 15 个组件类，207 处写法收敛，逐元素计算样式零差异
- 工具：`_ui_audit.py`、`_ui_migrate.py`、`_ui_stylecmp.js` + `_ui_diff.py`

# FoodIn UI 规范化标准（当前生效版 v2.28.0）

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

使用指南页的手机示意图是真实界面的 **262px 等比缩略复刻**（`.p-*` / `.qs-*` / `.fig-*` 等约 60 个类）。
缩略后需要独立的明度标定，因此它有一套自己的令牌：

- ✅ 与真实 UI **同值**的色，直接引用 `--fi-*`（如 `#f3f4f6 → var(--fi-fill)`、`#f97316 → var(--fi-brand)`）
- ✅ 示意图**专属**的 15 个色登记为 `--fi-mk-*`（`--fi-mk-ink #1f2430` 主字、`--fi-mk-ink-2 #8a93a6` 次字、`--fi-mk-line #eef0f3` 描边、`--fi-mk-red-bar #e24b4a` 等）
- ❌ **禁止在真实界面使用 `--fi-mk-*` 或 `.p-*` / `.qs-*`**；反之示意图也只用上两类令牌，不得再手写 hex
- v2.28.0 已把该层 132 处硬编码色值全部令牌化（零像素变更）

### 3.10 使用指南页「正文层」（v2.28.3 新增）

指南页里除手机示意图外的一切文字与容器，都属**真实界面**，只用 `--fi-*` 令牌；❌ 不得使用 `--fi-mk-*` / `.p-*`。

v2.28.3 起指南页每个模块改为 **「关键要点 → 示意图 → 可展开详细说明」** 三层，新增 5 个正文层组件类：

| 类 | 用途 | 要点 |
|---|---|---|
| `.gd-nav` + `.gd-nav-btn` | 顶部模块跳转胶囊条 | 横向可滑（`overflow-x:auto` + 隐藏滚动条）；点击调 `jumpTo(id)` |
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
3. 卡片 `.fi-card`、胶囊 `.fi-chip`、次按钮 `.fi-btn-fill`、主按钮 `.fi-btn-primary`、弹窗 `.fi-modal`、空态 `.fi-empty`、开关 `<toggle-setting>`。
4. 表单：`.fi-label` + `.input/.input-sm` + `.fi-hint`。
5. 提示文案按 §4 三种句式，对象名用 `「」`。
6. 若把 utility 收敛成新组件类 → **同步补 fontScale 规则**（§6.1）。
7. 若新增了从未出现过的 utility class → **重编译 styles.css**（§6.2）。
8. 改完先跑 `_ui_stylecmp.js` + `_ui_diff.py` 证明零变化，再跑 `_chk_exports.py`，最后**截图交用户确认**，才 push / 部署。

---

## 八、变更记录

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

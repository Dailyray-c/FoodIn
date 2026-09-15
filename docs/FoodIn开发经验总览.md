# FoodIn 开发经验总览（v2.24 → v2.33 沉淀）

> 本文档是「踩坑 / 工作流 / 验证套路」的总索引，面向后续会话。
> **UI 硬规则的唯一依据是根目录《UI规范.md》**，本文不重复其细则，只沉淀工程经验。
> `.workbuddy/memory/MEMORY.md` 是精简条目（每次会话自动注入），本文是其展开版，便于一次性通读。两处如有冲突，以《UI规范.md》与 MEMORY.md 最新条目为准。

---

## 0. 一页速览（TL;DR）

| 主题 | 一句话铁律 |
|---|---|
| 工作流 | 改代码 → 起服务+截图 → **用户确认可见性** → 才跑测试/push/部署 |
| 发布前 Gate | 必跑 `_chk_exports.py`（模板↔return 配对），再 `_ui_diff_aligned.py` 证零变化 |
| Tailwind | 任何新 utility class 必须重编译 `styles.css`；漏编译=样式失效但功能正常 |
| Vue 最隐蔽 Bug | 函数忘了进 `return{}` → UI 正常但**不落盘**；无参 `@change` 会把 DOM Event 当实参 |
| 同步 | `DEMO_MARK` 演示数据对同步引擎必须完全不可见；撤销快照不进 `SETTINGS_SYNC_SCHEMA` |
| 回归 | Playwright 用 PowerShell 调**托管 node**，脚本 `try/catch+flush`，测前 `endTour()` 解遮罩 |
| 部署 | `./push-safe.sh "说明"`；**禁 `git add .`/`-A`**；proxy 假成功要用 `git ls-remote` 比对 OID 判活 |
| Git 安全 | 绝不用 `git stash`+`rebase` 组合（曾丢 `.git`）；用 `fetch→reset --mixed→add 明确文件→commit→push` |
| 清理 | 调试产物一律 `_` 前缀（已被 `.gitignore` 屏蔽）；清理=移到 `%TEMP%`，**不删除** |

---

## 1. 项目快照（One Source of Truth）

- **仓库**：`dailyray-c/FoodIn`（`master` 分支）；GitHub Pages：`https://dailyray-c.github.io/FoodIn/`
- ⚠️ **本地常落后远程 HEAD**——判断"是否最新"永远以 `git ls-remote origin master` 的 OID 为准，不要凭本地文件判断。
- **单文件结构**：
  - `index.html`：Vue3 应用（内联模板 + `setup()`），通过本地 `./vendor/vue.global.prod.js` 加载（**不是 CDN**）
  - `src/tailwind.css`：Tailwind 源；`styles.css`：预编译产物（**提交到仓库**，是确定性构建锁定色值的产物）
  - `service-worker.js`：同源静态资源缓存（白名单模式）
  - `vendor/`：`vue.global.prod.js` / `html5-qrcode.min.js` / `qrcode.min.js`（扫码/生成库，v2.33.0 起**改为按需懒加载**）
  - `manifest.json` + `icon-180/192/512.png`：PWA 元信息
- **数据层**：`localStorage` + `jsonbin.io` **事件溯源**云同步（免费额度约 1 万次一次性 API 请求，省着用）
- **当前版本**：`CURRENT_VERSION = '2.33.0'`；SW `CACHE_NAME = 'food-inventory-v114'`
- **版本号迭代规律（单一事实源见《UI规范.md》§八）**：`X.Y.Z` 语义化——X 仅破坏性变更（同步引擎/存储模型重写）才 bump；Y 每次可发布功能/重要优化 +1；Z 仅 Bug 修复/小调整 +1。每次发版无论 X/Y/Z 都必须让 SW `CACHE_NAME` 数值 +1。
- **版本四处联动**（bump 时务必同步，详见《UI规范.md》§8.4）：① `CURRENT_VERSION` ② `CACHE_NAME` ③ `index.html` 内 changelog 条目 ④ `versions/v{X.Y.Z}/` 三件套副本

---

## 2. 日常开发标准工作流（铁律）

```
改代码 → 起本地服务 + 截图/预览 → 交用户确认【可见性优先】 → 用户点头 → 跑回归 → push/部署
```

- **Review Before Testing（用户明确要求，跨项目铁律）**：改动完成后，**先交付可视化结果给用户看，用户确认 OK 之后才跑测试/回归脚本**。历史上多次出现 IDE 注入 `data-page-node-id` 导致页面根本渲染不出来、本地化资源没入库，却先跑了测试白忙一场。所以**可见性验证永远优先于测试通过**。
- 用户确认前：不要主动执行测试脚本、不要 push、不要部署。
- 发布前必跑 `_chk_exports.py`（见 §3）。

---

## 3. 发布前必跑自查清单（Gate）

| 工具 | 作用 | 关键点 |
|---|---|---|
| `_chk_exports.py` | 模板引用集 ∩ 定义集 − `return` 导出集 | return 块用**花括号配平**扫描；定义集限 **4 空格缩进顶层**；引用集**减 v-for/v-slot/`#default` 别名**；退出码非 0 即拦截 |
| `_ui_diff_aligned.py` | 改版前后 DOM 计算样式零变化验证 | 按 `(tag, class)` 签名分组配对，**不能按索引比**（DOM 增删会全体平移→假差异，曾误报 2673 条，实际 0）|
| `_chk_toast_equiv.py` | 裸 `showToast(字面量)` → 5 个构造函数的语义等价验证 | 把两侧调用展开成拼接表达式 token 序列做多重集比对，能抓「多/少一个字」；静态字符串替换查不出 |
| 计算样式快照 | `getComputedStyle(el)` 比对 | 改 Bug 后先证「零变化」再交付 |

**验收姿势**：改完 → `_ui_stylecmp.js`+`_ui_diff_aligned.py` 证零变化 → `_chk_exports.py` → **截图交用户确认** → 才 push/部署。

---

## 4. Tailwind 编译与「漏编译」陷阱

- **新增任何从未出现过的 utility class → 立即重编译**：
  ```bash
  ./node_modules/.bin/tailwindcss -i ./src/tailwind.css -o ./styles.css --minify
  ```
- **未编译 = 样式失效但功能正常**。诊断顺序：`getComputedStyle(el).backgroundColor` → 再量 `getBoundingClientRect().height`/`offsetParent`。
- ❗**JS 事件正常但用户点不到 → 先量 `height` 是否塌陷为 0**，别查 JS。漏编译会让 `lg:mt-auto` 等新类失效 → 高度塌陷 0 → 按钮看不见/点不到。
- `translate-x-0.5` 编译为 `translate-x-0\.5`；`peer-checked:bg-*-500` 须加入 safelist。
- **bash 环境丢 coreutils**（Git Bash 下 `ls`/`head` 等找不到）：先 `export PATH="/c/Users/Administrator/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:/c/Windows/System32:$PATH"`。

---

## 5. Vue 单文件隐藏 Bug 模式（最高频致命）

1. ❗**「漏进 `return{}`」是最隐蔽的 Bug**：模板里 `settings.x = v; saveData(); showToast(...)` —— 赋值在抛错前，UI 看着正常，真实后果只有「不落盘 / 刷新回滚 / 无 toast」。新增函数/状态**必须**进 `return{}`。
2. ❗**无参事件处理器把 DOM Event 当实参**：`@change="fn"` → Vue 以监听器方式调用，第一个实参 = Event，**带默认值的形参失效** → 取不到字段 → 联动静默不执行。只有「某种操作顺序」必挂（别处显式传参则正常）。
   - 定位：把同一功能的**全部调用点**列出来逐个看模板；修复 = 补实参 **+** 处理器内加 `dateForm()` 形态护栏（如 `'productionDate' in item`）。
   - 模板里 `@change` 一律**显式传 `scanForm`/`item`**，禁无参 `@change="fn"`。
3. ❗**同文件多 Edit 必须串行**——同一消息并发多个 `Edit` 只有 1 个生效，其余静默丢失；**一个 Edit 一条消息**。
4. `window.__foodin` 是**手写枚举**（≠ `return{}`）；ref 要 `.value`。**不在**白名单的：`guideOpen`、`recordTypeFilter`、`setFontScale`、`enterGuide`/`exitGuide` → 自动化看 DOM / 真实点击，或直接 `currentPage.value='guide'`。
5. 新模板元素必须 `app.component()` 注册；每个 `createApp({` 配 `});`。

---

## 6. 数据 / 同步陷阱

- ❗**`DEMO_MARK` 演示数据必须对同步引擎完全不可见**（v2.33.0 P1 修复）：
  - `captureState()` 过滤 demo（覆盖 `initSyncEngine` + `replayState` 两处 `baseState` 赋值）；
  - `applyStockDelta()` 对 demo 商品直接 `return`（delta 是绕过差分直接入队的独立通道，必须**单独拦**）。
  - 老根因：demo 纳入差分 → 导览中途操作即推上云；中途关页面则 `endTour` 不跑，下次启动本地清理在 `initSyncEngine()` **之前** → baseState 无这些 id → **永远生成不出 delete 事件** → 云端永久残留（家人手机看到演示商品）。
  - ❗启动扫掉 demo 后落盘**必须在 `initSyncEngine()` 之后**（之前 baseState 为空 → 全量被误判为新增推上云）。
- **幽灵商品**：数量 ≤ 0 必是脏数据（正常归零必走 `removeProduct`）。本地兜底 `purgeGhostProducts()`（**云同步算法一行未改**），触发 = 启动 `initSyncEngine()` 后 + `watch(products)` 捕获整体替换。落盘：`syncState.baseState` 就绪则 `saveData()`（顺带 delete 事件让云端收敛），否则只写 localStorage（防全量被当「新增」推上云）。
- **位置 chips 顺序**：录入页/批量录入/主页编辑弹窗**一律遍历 `placesOrderedView`**（设置页两段拖拽会让底层数组交错）。固定 **待设置 → 有分区 → 无分区**。
- ❗**chip 组顺序 = 设置列表权威**：`unionTags()` 必须**先按设置列表铺满、遗留标签追加末尾**；**禁把「当前已选」先塞进去**（`Set` 保插入序 → 每点一次标签就重排，这是历史 bug）。自检：连续切换同一 chip 两次，整行顺序字节级不变。
- ❗**chip 禁悬停变色**：全局清掉 `hover:border-teal-300/-400`。芯片只有「选中/未选中」两态。验证必须**真实 `page.mouse.move`**（合成 `mouseover` 不触发 CSS `:hover`）。
- **撤销（v2.31.0 真撤销，本机快照；v2.32.0 收窄到「本条」）**：快照存 `localStorage['food_inventory_undo_cache']`（上限 300 条 / TTL 60 天），**不进 `SETTINGS_SYNC_SCHEMA`、不挂 record 对象** → 云事件无快照字段，天然满足「只恢复自己操作的」。`adjust` = 只回填本条改过的字段（`changedKeys`）；`reheat`=`reheatCount-1` **增量**回退（非绝对值，避免多次加热互相吞）。数量一律走反向 delta 不是快照绝对值（同一商品可有多条同类流水）。
- **保质期数据模型**：存储是**文本**（`"12个月"`/`"2年"`/`"90天"`/历史纯数字 `"364"`）。三个唯一入口：`splitShelfLifeValue(v)`→`{num,unit}`、`composeShelfLifeText(item)`（**先解析再拼**）、`setShelfLifeFromText(text,target,'day')`。**无单位纯数字默认「日」**；用户主动改过单位则尊重。❗**禁把整条文本塞 `type=number`**（旧 bug：数字被吃+单位硬编码 `month`→拼出 `"4年个月"`）。
- **`_slTouched` 挡无操作重写**：日期↔保质期双向推导，保存时无条件重算会把 `"364"`→`"364天"` 并凭空产生调整记录。`editForm._slTouched` 由 4 个 `@change` 置 true，`saveEdit` 只在 true 时 `composeShelfLifeText`。
- **`settings.locations` 已废弃**，唯一真源 `settings.places`(place→zones)；`migrateLooseLocationsToPlaces()` 仅兼容旧数据。
- **`SETTINGS_SYNC_SCHEMA` 驱动云同步设置** → 新增云同步设置只需加一行（`type`/`default`，可选 `mode:'union'|'localFirst'`/`values`/`allowEmpty`）；`localFirst`（fontScale 等本机偏好）**本机合法就保留+回推**，绝不无条件采纳云端。
- **本机专属不进 schema**：`simpleMode`、`tourDone`、撤销快照缓存。**判断「未登记」前先回查 changelog，刻意不对称要假设是有意的**。

---

## 7. 回归测试 Playwright 套路

- 跑前起服务：`python -m http.server 8088 --bind 127.0.0.1`（后台用 Bash `run_in_background`，**别用 `nohup &`**——会随命令结束被杀）；**别设 `PLAYWRIGHT_BROWSERS_PATH`**。
- ❗**playwright 必须用 PowerShell 调 node**（bash 里退出码 23 且无输出）；用**托管 node 绝对路径**（如 `C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe`）；playwright 装在**项目 `node_modules`**，脚本里 `require('playwright')`（别写 workspace 绝对路径）。
- ❗**脚本必须 `try/catch + flush`**，否则抛错时已收集的 `OUT` 全丢。
- ❗读页面状态用 `window.__foodin.currentPage.value`；`#app.__vnode` 可能 undefined。
- ❗预置 localStorage 键：`food_inventory_products`/`food_inventory_records`/`food_inventory_settings`（**无 `_v1`**）；写错→空库→意外触发首次导览。
- ❗**导览遮罩会拦点击**：探针开头须 `endTour()` + 置 `settings.tourDone=true` + 移除 `.fi-tour-mask/.fi-tour-blocker`；且**必须先等 ~1450ms 让导览自动起来再 `endTour`**，否则遮罩会在之后才弹出。
- ❗`_paddle_models` 未就绪会让单线程 `http.server` 卡住 → `page.route('**/_paddle_models/**', abort)` + `waitUntil:'domcontentloaded'`。
- 定位用 `label:has-text("商品名称") ~ input[type="text"]`，别用 placeholder/文案；❗`fill()` 对 `input[type=number]` **只派发 input 不派发 change**（假阴性，加 `.blur()`）。
- ❗element screenshot 前**不要**隐藏 `position:fixed`；比元素高的图用 `page.screenshot({clip, fullPage:true})`。
- 抓真实页做对照：`_cap_real.js`/`_cap_full.js`（5 页）/`_cap_guide.js`（单截 `.fig`）/`_shot_guide_full.js`（整页）；**做 before/after 时旧版三件套必须连同 `vendor/` + `manifest.json` 一起复制**，否则 Vue 未加载、`window.__foodin` undefined 会被误判成代码 bug。

---

## 8. 性能 / 首屏（v2.33.0）

- **首屏 604 KB → 217 KB**：`html5-qrcode.min.js`(367KB) 与 `qrcode.min.js`(20KB) 已从 `<head>` 移除。
  - 扫码库走 `ensureScanLib()`（单例 Promise + vendor→unpkg→jsdelivr 多源回退 + 失败清空可重试）；入口 `openScan`/`startConfigScan` **必须 `await` 且失败关弹层 + `toastErr`**（不留黑屏取景框）。
  - 生成库走原有 `ensureQrLib()`（head 那份本就是冗余）。
- ❗**`requestIdleCallback` 挂载后往往「立刻」空闲** → 预取 395KB 会在首屏刚画完就开跑、与云同步抢带宽。**必须先 `setTimeout(..., 2500)` 留让位期**，再 `requestIdleCallback(fn,{timeout:2000})`。否则「首屏 217KB」不可复现。
- ❗**验证必须在 `#app` 首次可见那一刻快照** `performance.getEntriesByType('resource')`，晚一点空闲预取已跑完 → 测出优化前的假象。同时断言首屏 `typeof window.Html5Qrcode === 'undefined'`。
- **手机版顶栏品牌**：左侧常驻「`icon-180.png` + FoodIn(`text-lg`)」，页名降为 `.fi-hint` 小字；品牌块整体 `lg:hidden`（桌面侧栏已有同款，避免同屏两个品牌）。⚠️ `pageTitle` **首页值就是应用名「食品库存」** → 副标题用新增 `pageTitleMobile`（首页→「首页」），桌面版仍用 `pageTitle`。`pageTitleMobile` 必须进 `return{}`。
- **导览启动**：`setTimeout(startTour, 700)` → 改「`document.fonts.ready` → 两帧 rAF → 240ms 稳定期」（原固定值慢机会量错高亮框）。

---

## 9. SW / OCR

- SW 白名单模式（只拦同域静态+CDN，其余 API `return`）；改 SW 后 **bump `CACHE_NAME`**。
- ❗SW 预缓存用 `Promise.allSettled` 逐资源预缓存 + 失败点名日志 + 失败返 **504**（替代 `addAll().catch(()=>{})` 全有全无 + 兜底把首页 HTML 返给失败静态资源——后者会让坏资源被当首页渲染）。
- paddlejs `recognize()` 只收 `HTMLImageElement`（传 canvas→恒 0 行不抛错）；返回逐 box，先 `clusterBoxesToLines`；行清洁阈值 `>=1`；Tesseract 单例 chi_sim；det 上限 960。

---

## 10. 部署（push-safe.sh + 陷阱）

- **发布命令**：`./push-safe.sh "说明"`；**严禁 `git add .`/`-A`**（工作区常有 `_` 前缀调试脚本，误 add 污染仓库）。
- `push-safe.sh` 现已 `git add versions/` **全量**（旧版只 add 最新一个 → v2.24.4~v2.32.0 共 19 个副本从未进远程，回退档案缺档）。发布白名单 `PUBLISH_FILES`：`index.html` / `service-worker.js` / `styles.css` / `UI规范.md` / `push-safe.sh` / `.gitignore` / `scripts/daily_expiry_check.py`。
- **版本四处联动 + bump 前备份三件套**（版本号如何迭代、SW 何时 +1 见《UI规范.md》§八）：
  ```bash
  mkdir -p versions/vX.Y.Z && cp index.html service-worker.js styles.css versions/vX.Y.Z/
  ```
  `versions/` 是历史档案，**绝不删**。
- ❗**push 假成功**：`env -u` 不够，git config 级 `http.proxy` 仍生效 → 502 被假 200 吞。修复 `GIT_HTTP_PROXY= GIT_HTTPS_PROXY= git -c http.proxy= -c https.proxy=`，**删掉代理回退分支**；判活 `git ls-remote origin master` 比对 OID。
- ❗`git fetch origin master` **只写 FETCH_HEAD 不建远程跟踪引用** → `reset --mixed origin/master` 报 ambiguous；改用 `git rev-parse -q --verify FETCH_HEAD` 取 OID。
- deploy.yml 白名单 cp；新增顶层目录须加 `cp -r <dir> _site/`；IDE 注入 `data-page-node-id` 致 `Unexpected identifier` → 写入后 strip 再验 pageerror。
- Actions 丢 webhook/延迟 → 手动 **Run workflow** 兜底。
- 可选 `git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`。

---

## 11. Git 安全铁律（跨项目）

- ❌ **绝对不要在可能被中断的环境里跑 `git stash` + `git rebase` 组合**（2026-09-07 实测：被 SIGTERM 打断后 `.git` 的 `refs/heads/master` 与 pack 数据文件同时丢失，本地历史对象全部不可读，最终只能删库重建）。
- ✅ **安全流程**：`git fetch origin <branch>` → `git reset --mixed origin/<branch>`（**不碰工作树**）→ `git add <明确文件>` → `commit` → `push`。不用 stash、不用 rebase、不用 `reset --hard`。
- ✅ **禁止 `git add .` / `git add -A`**；调试产物统一以 `_` 开头命名（`.gitignore` 已屏蔽）。
- ✅ **网络不通时**：先试 `no_proxy=github.com` 直连，再回退系统代理。若两条路在沙箱都失败，**直接在用户自己的终端里 push**（用户终端网络通常与沙箱隔离且可达）。
- ✅ **`.git` 损坏的标准修复**（工作树文件不会丢）：
  ```
  Remove-Item -Recurse -Force .git        # 或 rm -rf .git
  git init -b master
  git remote add origin <url>
  git fetch origin master
  git reset --mixed origin/master         # 工作树内容保持原样
  git add <发布文件> && git commit -m "..." && git push -u origin master
  ```
- ⚠️ 由 CI 自动提交的目录（如每日备份 `backups/`）本地常落后。出现 `M/D` 时用 `git checkout -- <dir>/` 追平远程，**切勿把本地旧版 commit 上去**。

---

## 12. 清理约定

- 调试产物一律 `_` 前缀，已被 `.gitignore` 屏蔽（`_*.js`/`_*.py`/`_*.png`/`_*.txt`/`_*.log`/`_*.json`/`_*.html`/`_*/`）。**约定：调试用的临时文件统一以 `_` 开头命名，与正式文件区分。**
- **清理 = 移动到 `%TEMP%/<项目>-cleanup-<日期>/`，不删除**（删除前先备份到 TEMP 再确认，是跨项目铁律）。例：`%LOCALAPPDATA%/Temp/FoodIn-cleanup-20260915/`。
- `versions/` 是历史档案，**永不删**；`backups/` 由 CI 管理，**勿手动动**。
- 非 `_` 的参考文件（审计报告、设计 demo、部署笔记）统一收进 `docs/`；已废弃的旧版脚本（如 `push-v2.25.1.sh`、`start test.bat`）移入 TEMP 清理区。

---

## 13. 已知遗留 / 待决（避免重复踩坑）

**v2.26.0 `Bug审计报告` P2 未修项**（v2.33.0 已修 SW + toast，未修以下）：
- `homeFilter`/`homeCategory`/`homeLocation` + `toggleFilter`/`clearFilter` 死链仍导出
- `splitTags`/`splitTagStr`/`splitLocTags` 别名未清
- `manifest.json` 漏 `icon-512`
- CI `lastPushDate` 写在压缩信封外层
- `package.json version` 仍 `2.16.2`（与 `CURRENT_VERSION` 脱节）

**待决**：删了 legacy 默认种子 → 新用户初始 0 地点（需决定补种子或引导）。

**已纠正登记**：~~4 处死类 `.fi-btn-fill`~~ —— **误判**，那 4 处全在 changelog 历史文案里，不是模板死类，实际无死类；勿再据此删类。

---

## 14. 排错速查表（Symptom → Check）

| 现象 | 优先检查 |
|---|---|
| 按钮看不见/点不到，但 JS 正常 | Tailwind **漏编译** → 量 `getBoundingClientRect().height` 是否 0 |
| 改了设置刷新就回滚 / 无 toast | 函数/状态**漏进 `return{}`** |
| 某种操作顺序下联动不执行 | 模板 `@change` **无参**把 Event 当实参 → 补实参 + `dateForm()` 护栏 |
| 选中/取消标签后整行顺序乱跳 | `unionTags()` 把「当前已选」先塞进去了（应为先铺设置列表） |
| 家人手机看到演示商品 | `DEMO_MARK` 被纳入云同步 → `captureState()`/`applyStockDelta()` 漏拦 |
| 首屏优化「测不出来」 | 空闲预取已跑完 → 验证时机太晚；检查是否漏 2.5s 让位期 |
| push 显示成功但线上没更新 | proxy 假 200 → 用 `git ls-remote` 比对 OID 判活 |
| 回归脚本无输出/退出码 23 | 用 **PowerShell** 调**托管 node**；脚本缺 `try/catch+flush` |
| 导览遮罩拦住所有点击 | 探针未 `endTour()` + 未等 1450ms + 未移除 mask/blocker |
| before/after 对照 `window.__foodin` undefined | 旧版三件套没连同 `vendor/`+`manifest.json` 一起复制 |
| bash 下 `ls`/`head` 找不到 | `export PATH=".../PortableGit/versions/1.2.0/usr/bin:/c/Windows/System32:$PATH"` |

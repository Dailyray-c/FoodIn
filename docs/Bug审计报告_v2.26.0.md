# FoodIn v2.26.0 — 结构性梳理 + Bug / 语义一致性审计报告

- **审计对象**：`dailyray-c/FoodIn` 工作区本地副本
- **审计基线**：`index.html` 9425 行 · `service-worker.js` 89 行 · `styles.css` 37137 B（压缩单行）
- **版本对照**：`CURRENT_VERSION = '2.26.0'`（index.html:3381）↔ `CACHE_NAME = 'food-inventory-v96'`（service-worker.js:1）— 一致
- **Git 基线**：本地 HEAD `39b8311`（release v2.25.2）；工作区含 **v2.26.0 未提交改动**（`index.html` / `service-worker.js` / `push-safe.sh`）
- **验证手段**：静态代码审计 + 自建静态分析脚本（3 个）+ **Playwright 真机浏览器实证**（1 项 P0 已复现）

---

## 一、项目整体结构

### 1.1 目录组织

| 路径 | 角色 | 是否入库 |
|---|---|---|
| `index.html` | **全部业务逻辑 + 全部模板**（单文件 Vue3，~9.4k 行） | ✅ |
| `service-worker.js` | PWA 离线缓存（白名单模式） | ✅ |
| `styles.css` | Tailwind 编译产物（deterministic build 锁定色值） | ✅ |
| `manifest.json` | PWA 清单 | ✅ |
| `src/tailwind.css` | Tailwind 入口（59 B，仅 `@tailwind` 指令） | ✅ |
| `vendor/` | 本地化三方库：`vue.global.prod.js` / `html5-qrcode.min.js` / `qrcode.min.js` | ✅ |
| `scripts/` | CI Python：`daily_expiry_check.py` / `daily_backup.py` / `migrate_data.py` / `gen_icons.py` | ✅ |
| `.github/workflows/` | `deploy.yml`（Pages 部署）· `daily-expiry-check.yml` · `daily-backup.yml` | ✅ |
| `backups/` | CI 每日提交的库存快照 | ✅（CI 写入） |
| `versions/v{X.Y.Z}/` | **每版三件套历史副本**（回退用） | ✅ |
| `docs/` | 说明文档 | ✅ |
| `_paddle_models/` · `_test_imgs/` · `_*.js/_*.py/_*.png/_*.txt` | 本地模型 / 测试图 / 一次性调试产物 | ❌（`.gitignore`） |

### 1.2 运行时架构

```
浏览器
 └─ index.html（单文件 Vue3 应用）
     ├─ 模板层：<div id="app"> … 约 2790 行模板（首页 / 扫码 / 记录 / 统计 / 设置 / 指南）
     ├─ 应用层：createApp({ setup() { …220 个导出键… } })   index.html:3361-9408
     ├─ 全局组件：ToggleSetting（render 函数，规避 x-template 被浏览器误解析）:3335, 9411
     └─ 持久化层
         ├─ localStorage：products / records / settings / barcode_cache / sync_v2
         └─ 云同步：jsonbin.io，v3 gzip 信封 {schemaVersion:3, compressed, algo, data}
                    事件溯源（append-only 事件日志 + 收敛快照）＋ 15s 防抖
 ├─ service-worker.js（install 预缓存同域静态 / fetch 白名单：同域 + CDN 白名单，其余放行）
 └─ GitHub Actions
     ├─ cron-job.org → workflow_dispatch → daily_expiry_check.py → ServerChan → 微信
     └─ push master → deploy.yml → actions/upload-pages-artifact → GitHub Pages
```

### 1.3 核心依赖

| 依赖 | 引入方式 | 用途 |
|---|---|---|
| Vue 3（global prod build） | `./vendor/vue.global.prod.js`（本地化） | 全部 UI |
| html5-qrcode | `./vendor/html5-qrcode.min.js`（本地化） | 条码扫码 |
| qrcodejs | `./vendor/qrcode.min.js`（本地化） | 配置二维码生成（`openConfigQr`） |
| Tesseract.js v5 | **jsDelivr CDN**（运行时缓存） | OCR 兜底引擎 |
| PaddleOCR（det/rec） | 默认 CDN / 私网自动探测 `_paddle_models/` | OCR 主引擎 |
| Tailwind CSS 3.4 | 构建期（`npm run build:css`） | 样式编译 |
| Playwright | 开发期 | E2E / 截图 |
| jsonbin.io v3 / v1.apizero.cn / Open Food Facts | 网络 API | 云同步 / 条码查询 |
| ServerChan（sctapi.ftqq.com） | CI Python 侧 | 微信临期推送 |

### 1.4 关键调用关系

**① 录入主链路**
```
扫码/OCR → lookupBarcode() → scanForm → submitProduct()
  → location/category 数组经 tagsToStr() 转字符串 → products.push
  → addRecord({type:'stock'}) → saveData()
      ├─ localStorage 全量落盘（4 个键）
      └─ diffToEvents() → 事件入待推队列 → 15s 防抖 → cloudSync(false)
```

**② 云同步（事件溯源）**
```
saveData() → diffToEvents() → syncState.pendingEvents（落盘 food_inventory_sync_v2）
cloudSync() → 拉取云端 → 事件并集 → (ts,id) 全序重放 → replayState() 应用
            → 推送 → 回读验证（syncedAt 全等 / 事件 id 部分确认 / lastSentIds 兜底）
设置项：SETTINGS_SYNC_SCHEMA 注册表驱动 6 个触点（captureState / diffToEvents /
        replayState / 重放应用 / guarded 补推 / applyLegacyUnion）
```

**③ 位置模型（v2.26.0 唯一真源）**
```
settings.places: [{ name, zones[], partitioned, layout }]     ← 唯一真源
settings.locations（旧平铺池）→ 仅由 migrateLooseLocationsToPlaces() 一次性迁入 places
商品 p.location 恒为「逗号分隔字符串」（提交时 tagsToStr 归一）
筛选：searchQuery token（#分类 / @位置 / &状态 / ?空值）→ parseSearchQuery → matchesProduct
```

**④ 部署链路**
```
push master → deploy.yml（白名单 cp → _site/）→ upload-pages-artifact@v3 → deploy-pages@v4
注意：deploy.yml 白名单 **不含** `_paddle_models/`（.gitignore + 非部署目标，属预期）
```

---

## 二、问题清单（按严重程度）

> 严重度定义：**P0** = 功能实际失效/数据不落盘；**P1** = 跨模块判定不一致或确定性缺陷；**P2** = 代码质量、健壮性、卫生问题。

---

### 🔴 P0-01 设置页 5 个开关调用未暴露的函数 → 设置不落盘 + 控制台异常

| 项 | 内容 |
|---|---|
| **位置** | 模板：`index.html:1872`（文字识别总开关）、`1899`（识别前图像增强）、`1909`（批量 OCR 智能分组）、`1939`（名称清洗规则）、`1949`（删除营销/包装词）<br>函数定义：`showToast()` @ `index.html:5744`、`saveData()` @ `index.html:5816`<br>**问题根因**：`setup()` 的 `return {}` 块 `index.html:9360-9407` **未包含 `saveData` 与 `showToast`** |
| **具体现象** | 点击上述任一开关：<br>✔ 内存中 `settings.xxx` 已改变（开关视觉上正常切换）<br>✘ **`localStorage.food_inventory_settings` 完全未写入** → 刷新/重开页面后设置**全部回滚**<br>✘ 无 toast 反馈<br>✘ 控制台抛 `TypeError: saveData is not a function` |
| **可能原因** | Vue3 `setup()` 仅把 `return` 对象的 key 暴露到渲染上下文；模板编译为 `_ctx.saveData()`，未知 key 取到 `undefined` → 调用即抛错。而 `settings.xxx = v` 这条赋值排在 `saveData()` **之前**，错误抛出时赋值已完成，因此**掩盖了"看不出坏"的假象**——UI 反馈正常，只有落盘静默失败。 |
| **影响面** | ① 5 个开关的修改**永不持久化**（`ocrEnabled` / `ocrImageEnhance` / `ocrGroupMode` / `nameCleanEnabled` / `nameCleanMarketing`）<br>② `nameCleanEnabled` / `nameCleanMarketing` 已注册进 `SETTINGS_SYNC_SCHEMA`，但因 `saveData()` 未执行 → `diffToEvents()` 不触发 → **也不上云、跨设备不同步**<br>③ 每次点击产生一条未捕获异常<br>④ 用户感知为"开关失灵 / 改完又变回去" |
| **实证** | Playwright 真机点击 OCR 总开关，捕获：<br>`[error] TypeError: saveData is not a function at onUpdate:modelValue`<br>`内存: true → false ✔ 已切换` / `localStorage: undefined → undefined ✘ 未落盘`  |
| **历史** | 该缺陷在 v2.26.0 重构前备份（`_backup_pre_refactor_20260911/index.html:9420` 的 return 块同样不含这两个键）中**已存在** → **非本次重构引入，而是长期潜藏** |
| **建议修复** | 在 `index.html:9392` 附近（`exportData, importData, clearAllData, saveExpiringDays,` 之后）补入：<br>`saveData, showToast,`<br>并顺带全量核对 return 块与模板引用的键集（本项目已多次因"漏进 return"踩坑，建议加一条构建期自检） |

---

### 🟠 P1-02 到期判定：App 与推送脚本对「今天到期」定义**相反**

| 项 | 内容 |
|---|---|
| **位置** | App：`index.html:5605` — `if (diff === 0) return { status: 'expired', days: 0, label: '今天到期', color: 'red' }`<br>脚本：`scripts/daily_expiry_check.py:108-111` — `if diff < 0: return ('expired', diff)` / `elif diff <= expiring_days: return ('expiring', diff)` |
| **具体现象** | 同一商品、同一天：<br>· App 首页/统计页判定为 **已过期**（红色）<br>· 微信推送归入 **「即将过期」**，显示「剩 0 天 · 优先食用」 |
| **可能原因** | 两侧各自实现状态机，边界（`diff == 0`）取舍不同：App 用 `< 0` 判过期、`== 0` 显式归过期；脚本用 `< 0` 判过期、把 `0` 落入 `<= expiring_days` 的临期分支。无共享语义、无交叉测试。 |
| **影响面** | ① 推送标题「过期 N 件 · 临期 M 件」与 App 统计页计数**必然不等**，用户对"到底过期没有"产生直接冲突认知<br>② 推送正文把已过期商品劝成"优先食用"，存在食品安全误导风险<br>③ 后续任何按状态聚合的功能（CSV 导出、浪费复盘）都会继承该分歧 |
| **建议修复** | 统一为「**今天到期即过期**」（与 App 一致）：脚本改为 `if diff <= 0: return ('expired', diff)`。若产品上想保留"今天到期算临期"，则须同步改 App 的 5605 行，但需注意 App 的红色 UI 语义已按"过期"设计。 |

---

### 🟠 P1-03 `runOcr` 缺少重入保护，与注释宣称的「串行锁」不符

| 项 | 内容 |
|---|---|
| **位置** | 注释：`index.html:7113` — *"OCR 流程串行——`ocr.processing` 锁 + 顺序 await，无并发串扰"*<br>实现：`runOcr(canvas)` @ `index.html:7197-7225` |
| **具体现象** | `ocr.processing` 实际只用于两处：模板按钮的 `:disabled`（749/753/3277/3279）与进度面板显隐（758/3241-3243）。`runOcr` **入口没有任何 `if (ocr.processing) return;` 守卫**，`resetOcrState()` 直接清场。 |
| **可能原因** | 把"UI 禁用"误当作"并发锁"。实际上存在多条绕过 `:disabled` 的入口：<br>· `batchOcrFromFile(ev)` @ 7255 — 由隐藏 `<input type="file">` 的 `change` 事件驱动，程序化触发不受按钮禁用约束<br>· `window.__foodin.runOcr` 直接暴露给外部（9358）<br>并发时：后一次 `resetOcrState()` 抹掉前一次状态；**先结束的流程在 `finally`（7223）把 `ocr.processing` 置 false**，而另一次仍在跑 → 进度条/结果区提前卸载。 |
| **影响面** | 识别结果串台、进度百分比跳变/提前消失、`ocr.lines` 被覆盖为中间态；批量录入页可能出现半截结果入 batch。属"难以复现但会产生脏数据"的一类缺陷。 |
| **建议修复** | `runOcr` 首行加 `if (ocr.processing) { showToast('识别进行中，请稍候'); return; }`；或引入 `let ocrRunToken = 0; const my = ++ocrRunToken;` 并在 `finally` 中 `if (my !== ocrRunToken) return;` 再释放锁（防"旧流程释放新锁"）。 |

---

### ~~🟠 P1-04 云同步设置项覆盖不完整：`simpleMode` 未注册进 `SETTINGS_SYNC_SCHEMA`~~ → ❌ **复核后撤回：属有意设计，非 Bug**

> **复核结论（2026-09-11，修复阶段回溯）**：本条为**误判**。v2.25.1 的 changelog（`index.html:3913`）明确记载：
> 「修复：某些操作（云同步）会自动把简洁模式改回关闭 —— 根因为云同步会把远端 simpleMode 快照覆盖本机偏好。**现把 simpleMode 移出云同步（仅本机生效）**，字号档位仍跨设备同步。」
>
> 即 `simpleMode` **刻意不注册**进 `SETTINGS_SYNC_SCHEMA`，原因是简洁模式属于"本机形态偏好"，跨设备覆盖会造成"云同步把本机简洁模式改回关闭"的实测 Bug（v2.25.1 已修）。审计时只看了 schema 与字段对照表、未回查 changelog，故误判。
> **`fontScale` 与本项的不对称是有意的**（字号同步、模式不同步），并非遗漏。**不修复。**

| 项 | 内容 |
|---|---|
| **位置** | Schema：`index.html:3399-3411`（11 个字段，**刻意不含** `simpleMode`）<br>`settings` 默认值：`index.html:3382` |
| **实际状况** | ✅ 有意设计。`simpleMode` 不同步是为了避免云端旧快照覆盖本机模式偏好（v2.25.1 修复项） |
| **遗留建议（非 Bug，仅可读性）** | 可在 schema 上方补一行注释：「本机形态偏好（simpleMode / ocrEnabled / ocrEngine / ocrGroupMode / ocrImageEnhance / barcodeLookupEnabled）刻意不同步，仅 fontScale 跨设备」，避免后续维护者重复误判 |

---

### 🟠 P1-05 `migrateLooseLocationsToPlaces` 迁移不彻底，与 v2.26.0「彻底废弃」声明不符

| 项 | 内容 |
|---|---|
| **位置** | `index.html:8400-8416`（`delete settings.locations` 在 `8414`） |
| **具体现象** | ```js<br>if (changed) delete settings.locations;   // v2.26.0：彻底废弃 locations 池（迁移后不再残留）```<br>仅当**本次真的新增了 place**（`changed === true`）才删除。若 `settings.locations` 中的标签**全部已存在于 `places`**（`changed === false`），残留的 `locations` 数组**永不被清理**。<br>由于 `saveData()`（5821）对 `settings` 整体 `JSON.stringify` 落盘，该脏字段会长期留在 localStorage，并随 `importData`（7805）与云端 pull（8962）**反复被重新写入**。 |
| **可能原因** | "迁移成功"与"已无需迁移"两种情形未区分：作者只考虑了前者。 |
| **附带缺陷** | `8407` 的 `if (existing.has(tag)) return;` 与 `8408` 的 `if (!settings.places.find(p => p.name === tag))` 是**同一判断的重复**，第二处因第一处已 return 而**不可达**（死条件）。 |
| **影响面** | ① 与变更日志/v2.26.0 注释"迁移后不再残留"直接矛盾（语义不一致）<br>② 脏字段长期存在，未来若有人按 `settings.locations` 编写逻辑会被误导<br>③ 每次导入/拉取都会把一个"已废弃"字段重新灌进本地 settings |
| **建议修复** | 将 `delete settings.locations;` 移出 `if (changed)`，直接无条件清理；删除 `8408` 的冗余判断。 |

---

### 🟡 P2-06 筛选状态数组整条链路已是死代码，但仍被导出与写入

| 项 | 内容 |
|---|---|
| **位置** | 声明：`index.html:3430-3437`（`homeFilter` / `homeCategory` / `homeLocation`）<br>辅助：`3446-3454`（`getFilterArr` / `toggleFilter` / `clearFilter`）<br>消费/写入：`5194-5208`（`hasActiveFilter` / `resetHomeFilters`）、`8529-8532`、`8563-8565`、`8585-8586`<br>导出：`9362` |
| **具体现象** | 真正的筛选只走 `searchQuery` token：`filteredProducts`（5176-5190）**只读** `searchQuery` + `homeDateStart/End`；`hasActiveFilter`（5194）也只解析 token。<br>· `homeFilter` 自带注释已承认"实际不再参与筛选"<br>· `homeCategory` / `homeLocation` 被 3 处赋值，但**从未被任何过滤逻辑读取**（write-only）<br>· `toggleFilter` / `clearFilter` 全仓库**零调用**（含模板），却仍从 `return` 导出 |
| **可能原因** | v2.20.6 / v2.23.4 把状态、分类、位置筛选先后迁移到 token 机制，只做了"新路径上线"，未做"旧路径下线"（典型的渐进式重构尾巴）。 |
| **影响面** | ① 死函数 `toggleFilter` / `clearFilter` 挂在 `$foodin` 上下文，误导维护者以为分类/位置筛选是数组驱动<br>② `removeCategory` 里"删掉选中分类后自动补 `#待设置`"的分支（`8531`）**永远不生效**——若将来真的复用该数组，行为不可预期<br>③ `resetHomeFilters`（5202-5208）清了两处永远为 `[]` 的数组，掩盖"重置是否真的重置了全部筛选条件"的判断 |
| **建议修复** | 整链删除（`homeFilter` / `getFilterArr` / `toggleFilter` / `clearFilter`），并清理 `8529-8532`、`8563-8565`、`8585-8586` 三处无效写入与 `9362` 的导出。 |

---

### 🟡 P2-07 `tagsFromStr` 收敛不彻底，遗留 3 个同义别名 + 1 处 TDZ 隐患

| 项 | 内容 |
|---|---|
| **位置** | `index.html:5531` `const splitTags = (s) => tagsFromStr(s);`<br>`index.html:6177` `const splitTagStr = s => tagsFromStr(s);`<br>`index.html:8336` `const splitLocTags = s => tagsFromStr(s);`<br>使用点：`6162` 使用 `splitTagStr`，但**定义在 6177** |
| **具体现象** | v2.26.0 变更日志（`3884`）称：*"location / category 的「逗号字符串 ↔ 数组」转换收敛为唯二 helper（tagsFromStr / tagsToStr），替换原先散落在 5 处以上的 split / join"*，但实际**又留下 3 个指向同一函数的别名包装**，调用方各用各的别名。 |
| **可能原因** | 重构时以"改名 + 保留旧名"方式降风险，收尾阶段未清理别名。 |
| **影响面** | ① 实现与变更日志不符（语义不一致），后人无法判断"唯二 helper"是否还有效<br>② `const` 的 TDZ：`6162` 早于 `6177` 引用，当前因 `openEditModal` 属延后调用才不报错；一旦有人把这段逻辑提到 setup 顶层执行即抛 `ReferenceError`<br>③ 三个别名让"第 N 份 split 实现"的旧问题以新形式复现 |
| **建议修复** | 调用点直接改用 `tagsFromStr`，删除 `5531` / `6177` / `8336` 三个别名。 |

---

### 🟡 P2-08 `startRename` 缺少边界与类型守卫

| 项 | 内容 |
|---|---|
| **位置** | `index.html:8539-8544` |
| **具体现象** | ```js<br>function startRename(type, index) {<br>  renaming.type = type; renaming.index = index;<br>  renaming.value = type === 'place' ? settings.places[index].name<br>                : settings.categories[index];<br>}```<br>`index` 未校验、未用可选链。对比同类函数：`confirmRename`（`8553` 有 `index < 0` 守卫）、`removePlace`（`8427` `if (!pl) return`）、`addZoneToPlace`（`8444`）、`removeZoneFromPlace`（`8454`）**都有 guard**——风格不一致。 |
| **可能原因** | 当前唯一调用方是模板中 `v-for` 内的 `settings.places.indexOf(pl)` 与 `startRename('cat', i)`（`1658/1710/1790`），下标必然合法，因此长期未暴露。 |
| **影响面** | 健壮性隐患：非法下标 → `TypeError: Cannot read properties of undefined (reading 'name')`；由于 `startRename` 属重命名统一机制入口，后续若被按钮/快捷键/自动化调用即触发。 |
| **建议修复** | 首行加：`const pl = type === 'place' ? settings.places[index] : null; if (type === 'place' && !pl) return;`，并给 `settings.categories[index]` 加 `?? ''`。 |

---

### 🟡 P2-09 Service Worker 预缓存失败被静默吞掉

| 项 | 内容 |
|---|---|
| **位置** | `service-worker.js:25` — `caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).catch(() => {})` |
| **具体现象** | `PRECACHE_ASSETS` 中**任一**文件 404 / 网络失败 → `addAll()` 整体 reject（**原子操作**，一个失败则全部不入缓存）→ 被空 `catch` 吞掉 → `install` 仍然成功、SW 仍激活并 `skipWaiting()`。<br>最终状态：**SW 已接管，但缓存里可能一个文件都没有**，离线能力静默失效，且无任何日志。 |
| **现状核验** | 已逐一核验 10 个预缓存资源**当前全部存在**（`index.html` / `styles.css` / `manifest.json` / `icon-180,192,512.png` / `vendor/` 三个 JS）→ 属**潜在风险**而非现网故障。 |
| **可能原因** | 为避免"某个非关键资源缺失导致 SW 安装失败"而加的兜底 catch，粒度失当：应为"单个资源失败不致命"，而不是"整体失败无声"。 |
| **影响面** | 未来任何一次资源改名/漏提交（本项目历史上已发生过 `vendor/` 漏拷导致 Pages 404，见 `deploy.yml:36-39` 注释）都会**重复触发同类问题且更难定位**——因为 SW 看起来是好的。 |
| **建议修复** | 改为逐个 `cache.add(url)` 并 `console.warn` 失败项；或保留 `addAll` 但在 catch 中 `console.error('[SW] precache failed', e)`。 |

---

### 🟡 P2-10 SW 兜底把 `index.html` 返回给所有失败的静态资源请求

| 项 | 内容 |
|---|---|
| **位置** | `service-worker.js:86` — `.catch(() => caches.match('./'))`；同类问题见 `62` |
| **具体现象** | 白名单内（同域静态资源 / 白名单 CDN）的**任何** GET 失败都回退到 `'./'`，即返回 `index.html`。请求一张图片、一个字体时，浏览器会拿到 HTML 内容（`Content-Type` 为 HTML）。 |
| **可能原因** | fallback 未按 `request.destination` / `Accept` 分流。 |
| **影响面** | 表现为"图片裂图、但控制台无 404"→ 排查成本高；`<img>` 拿到 HTML 会触发 `onerror`，本项目 `previewImage` / `onPreviewError` 链路（5760 附近）会显示"图片加载失败"，误导用户以为是外链图失效。 |
| **建议修复** | 仅对 `event.request.destination === 'document'` 或 `mode === 'navigate'` 回退首页；其余直接 `return fetch(...)` 让浏览器报真实错误。 |

---

### 🟡 P2-11 `manifest.json` 图标声明与产物不一致

| 项 | 内容 |
|---|---|
| **位置** | `manifest.json:11-24` |
| **具体现象** | `icons` 仅声明 `180x180` 与 `192x192`；而 `icon-512.png` **实际存在**、被 SW 预缓存（`service-worker.js:11`）、也被 `<link rel="icon">` 引用（`index.html:16`），但**未出现在 manifest 中**。另外缺少 `purpose: "maskable"` 与 `id` 字段。 |
| **可能原因** | 图标生成脚本（`scripts/gen_icons.py`）产出 3 个尺寸，manifest 只填了前两个。 |
| **影响面** | ① 桌面端/Android 安装横幅与启动图可能使用低分辨率图标或出现白边裁切<br>② PWA 可安装性与 Lighthouse 评分不完整<br>③ 一个已产出、已预缓存的资源成为"半悬空"资产 |
| **建议修复** | 补 `{ "src": "./icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }`，并按需追加 `maskable` 条目。 |

---

### 🟡 P2-12 CI 与前端功能面脱节 + 推送链路脆弱

| 项 | 内容 |
|---|---|
| **位置** | `.github/workflows/daily-expiry-check.yml:17`、`scripts/daily_expiry_check.py:172-239`、`.github/workflows/daily-backup.yml:31` |
| **现象 1：密钥强依赖导致"全无输出"** | `daily_expiry_check.py:187-190` — `if not all([api_key, bin_id, sendkey]): sys.exit(1)`。前端 v2.26.0 已"清理 ServerChan 死代码"（`3888`），说明该通道的产品入口早已下线；一旦 `SERVERCHAN_SENDKEY` 未配置/失效，脚本**直接失败退出**，连 `build_message` 里的"心跳通知"都发不出，**也不会写 `lastPushDate`** → 次日重跑仍失败，且 Actions 里只看到一次普通失败。 |
| **现象 2：`lastPushDate` 写在信封外层，可能被 App 覆盖** | `update_last_push_date()`（`69-91`）把字段写到 `outer`——v3 结构下 `outer = {schemaVersion:3, compressed:true, data:<base64>}`，`lastPushDate` 与压缩体**同级**。而 App 端每次推送会用**新构造的 envelope** 覆盖整包（`index.html:8898-8904`）→ 该字段被抹除 → 当日去重失效、可能重复推送（与变更日志 `4407` 反复修"当日去重"的历史吻合）。 |
| **现象 3：去重逻辑跨结构双读、无测试** | `204` 行 `inner.get("lastPushDate", "") or outer.get("lastPushDate", "")` —— 同时从解压内层与压缩外层取，依赖"外层未被覆盖"这一脆弱前提。 |
| **现象 4：备份 push 无非快进保护** | `daily-backup.yml:31` 直接 `git push`，checkout 后若期间有他人/CI 提交 → 非快进失败；且该 workflow **无 `concurrency`**（`deploy.yml` 有），与 expiry-check 的并发触发配合可能造成重复写入。 |
| **现象 5：触发链单点** | `daily-expiry-check.yml` 已移除 `schedule:`，仅剩 `workflow_dispatch`，唯一触发方是外部免费服务 cron-job.org（历史观测到**约 4h47min 延迟**）。 |
| **建议修复** | ① 密钥缺失时降级为 `sys.exit(0)` + 明确日志（区分"配置缺失"与"运行失败"）<br>② 把 `lastPushDate` 写进 **inner / snapshot 内**，随业务数据一起走压缩与云同步，天然不会被 App 覆盖<br>③ 备份 workflow 加 `git pull --rebase` 后再 push，并补 `concurrency`<br>④ 给去重逻辑补一个最小单测（v3 信封 / v2 平铺 两种结构） |

---

### ⚪ P2-13 仓库卫生（非缺陷，但会直接引发事故）

| 项 | 现象 | 建议 |
|---|---|---|
| `backups/` 落后远程 | `git status` 显示 3 个 `D`（`inventory-2026-09-09/10/11.json`）+ `M latest.json` | 按项目约定用 `git checkout -- backups/` **追平远程**，切勿把本地旧版提交上去 |
| 临时文件未加 `_` 前缀 | 未跟踪：`location-entry-demo.html`、`location-panel-demo.html`、`push-v2.25.1.sh`、`start test.bat` | 与"调试产物统一 `_` 开头"的约定不符；虽然已禁止 `git add -A`，但风险仍在。建议改名加 `_` 或删除 |
| `package.json` 版本脱节 | `version: "2.16.2"` vs `CURRENT_VERSION = '2.26.0'` | 长期脱节约 10 个次版本；任何按 `package.json` 判版本的脚本/CI 都会读错。建议在发布脚本中同步 |
| 调试脚本堆积 | 根目录 60+ 个 `_*.js/_*.py/_*.txt/_*.png` | 已被 `.gitignore` 覆盖，但影响主目录可读性；可按 `_audit/` 归档 |

---

## 三、修复优先级建议

| 顺序 | 问题 | 理由 | 改动量 |
|---|---|---|---|
| 1 | **P0-01** return 块补 `saveData, showToast` | 一行修复、影响 5 个用户可见开关、且当前**会造成设置静默丢失** | 1 行 |
| 2 | **P1-02** 统一"今天到期"语义 | 涉及食品安全提示与用户信任；改 Python 1 行 | 1 行（+ 建议加注释说明"与 App 对齐"） |
| ~~3~~ | ~~**P1-04** `simpleMode` 进 schema~~ | ❌ **已撤回（误判）**，见上方复核结论 | — |
| 3 | **P1-05** `delete settings.locations` 无条件执行 | 消除与 v2.26.0 声明的矛盾、阻止脏字段回流 | 2 行 |
| 4 | **P1-03** `runOcr` 加锁 | 防脏数据；改动集中在单函数 | ~5 行 |
| 5 | **P2-06 / 07 / 08** 死代码清理 | 降低后续维护误判概率 | 中 |
| 6 | **P2-09 → 12** SW 与 CI 加固 | 防未来同类事故复发 | 中 |
| 7 | **P2-11 / 13** manifest 与仓库卫生 | 收尾 | 小 |

> **横切建议**：本项目"漏进 `return {}` 导致模板静默失效"已至少出现两次（v2.21.5 的 `saveOcrSettings`、本次的 `saveData`/`showToast`）。建议在发布脚本（`push-safe.sh`）里加一步静态自检：解析 `setup()` 内 `function/const` 定义集与 `return {}` 键集，报告"模板引用但未导出"的标识符，作为发布前卡点。
> **本次已落地**：新增 `_chk_exports.py`（配平花括号精确抽取 `return {}`，剔除 `v-for` 别名与函数内局部变量），退出码非 0 即拦截；可接入 `push-safe.sh`。

---

## 三·补、修复记录（v2.26.1，2026-09-11）

| 编号 | 标题 | 落点 | 改动摘要 |
|---|---|---|---|
| **P0-01** | 设置页 5 开关不落盘 | `index.html` 的 `return {`（原 9360） | 补 `saveData, showToast` 两个导出键。修复前实测：点击 OCR 总开关 → 内存 `true→false`、`localStorage` 不变、控制台 `TypeError: saveData is not a function` |
| **P1-02** | 到期判定两边相反 | `scripts/daily_expiry_check.py` `get_expiry_status` / `build_message` | 分界 `diff < 0` → `diff <= 0`（「今天到期」归过期，与 App `getExpiryStatus` 对齐）；推送文案对 0 天单独措辞为「今天到期 · 建议今日处理」，消除「已过期 0 天」 |
| **P1-03** | `runOcr` 无重入守卫 | `index.html` `runOcr()` 入口 | 首行加 `if (ocr.processing) { showToast('正在识别，请稍候…'); return; }`；同时订正 `tessLogger` 上方「ocr.processing 锁保证串行」的失实注释 |
| **P1-05** | 迁移脏字段残留 | `index.html` `migrateLooseLocationsToPlaces()` | `delete settings.locations` 移出 `if (changed)`，恒清理并恒返回 `true` 让调用方落盘；删除同一判断的重复实现（原 8408 行 `places.find`，与 `existing` 集合重复且不可达） |
| ~~P1-04~~ | ~~`simpleMode` 未进 schema~~ | — | 复核撤回：v2.25.1 有意移出云同步 |

**版本同步**：`CURRENT_VERSION` 2.26.0 → **2.26.1**；`service-worker.js` `CACHE_NAME` v96 → **v97**；changelog 新增 2.26.1 条目。

**渲染验证（可见性确认，未做断言）**：本地 `http://127.0.0.1:8088/index.html` 实测，桌面 1180×900 与手机 390×844 两档 —— `pageerror` 与 console error 均为 **0**；设置页可见开关 8 个、轨道高度均 20px（无塌陷）；`window.__foodin.saveData` 已为 function；注入的遗留 `locations: ['冰箱冷藏','阳台储物']` 迁移后 `places` 两项就位且 **`settings.locations` 已被删除**。

---

## 四、已核验**无问题**的事项（避免重复排查）

- 商品 `location` / `category` 类型一致性：所有写入路径均经 `tagsToStr()` 归一为字符串（`6351/6352/6399/6400/6248/6249`），`matchesProduct`（`3506/3504`）按字符串处理，无"数组调 `.toLowerCase()`"风险
- `SW CACHE_NAME (v96)` ↔ `CURRENT_VERSION (2.26.0)` 同步递增，`skipWaiting + clients.claim` 齐全，旧缓存按名清理
- `PRECACHE_ASSETS` 10 个资源**全部存在**
- `deploy.yml` 白名单已覆盖 `index.html / styles.css / service-worker.js / manifest.json / icon-180,192,512 / vendor/`（`vendor/` 有 `if [ -d ]` 保护）
- `autoSaveInterval` 变更后确实会重建定时器（`saveCloudSettings` → `setupAutoSave`，`7849-7853`）
- `runOcr` 的 `finally`（`7215-7224`）保证异常路径下 `ocr.processing` 复位，无锁泄漏
- `executeWasteDeleteWithReason` / `removeProduct` 的 `keepRecords` 语义与注释一致（`6098-6106`）
- `saveData` 内 `diffToEvents` 与 `jsonbin` 推送失败均有 try/catch，不阻断本地落盘

---

*报告生成时间：2026-09-11 · 审计基线：本地 v2.26.0（未提交）*

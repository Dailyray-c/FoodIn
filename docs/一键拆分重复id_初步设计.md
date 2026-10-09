# 「一键拆分重复 id」初步设计

> **范围**：功能与数据设计（含同步语义、可撤销、边界与验收）。**不含 UI 视觉设计**。
> **依据**：全部结论来自当前工作树代码（v2.36.2）实读；标注「已验证」的均给出函数/行号。
> **背景**：v2.36.0 的应用内 changelog 曾宣称「设置页可一键拆分重复 id」，但该按钮**从未实现**（只有自动自愈）。本文为补齐这一承诺的设计。

---

## 实现状态（2026-10-09 更新）

> **P0 与 P1 已实现并通过全量回归（v2.36.3，184/184）。**
> 按用户决定 **不做 P2** —— 即**不做任何 UI**：一键拆分入口、预览弹窗、撤销按钮全部取消。
> 本功能最终以「**数据层加固**」形态落地：自愈引擎确定性化、修掉同名流水误迁移、自愈结果可上云、备份导入不再静默丢商品。
> 下文 §5 / §6 / §9 / §10 中涉及交互与撤销的部分**未实施**，保留作为将来若要做 UI 时的设计参考。

---

## 0. 结论速览

| 决策点 | 建议 |
|---|---|
| 入口 | 设置 → **数据整理** 第 6 行（现有 5 行：3 CSV + 导出备份 + 导入备份） |
| 检测 | 新增 `scanDuplicateIds()`，返回「重复组 + 无法判定清单」 |
| 归属判定 | 沿用现有 `productName` 精确匹配；**同名重复一律不迁移**（保守），计入 `ambiguous` 并提示用户先改名 |
| 新 id | **确定性 id**（内容哈希）而非随机 —— 让「拆分」成为**幂等操作**，多设备自然收敛 |
| 同步 | **必须走 `saveData()`**，不能沿用自动自愈的「只写 localStorage」直写 |
| 撤销 | 独立快照键（不与 `undoCache` 混用），支持一键还原 |
| 顺带修根因 | `applyLegacyUnion` 的 seen-map bug（**已验证**，2 行可修）+ 统一 id 生成 |

---

## 1. 问题定义

### 1.1 数据模型

- `product.id` 是主键；`record.productId` 指向它（流水另有 `productName` 快照）。
- 同步引擎**全程按 id 键控**（已验证）：
  - `captureState()` 产出数组（10459）
  - `diffToEvents()` 里 `const baseP = new Map(base.products.map(p => [p.id, p]))`、`const livePIds = new Set(...)`（10533-10534）
  - `replayState()` 把事件应用进「以 id 为键的 Map」

### 1.2 为什么同 id 两条 = 必然出错

以 `products = [A(id=X), B(id=X)]` 为例：

| 环节 | 行为 |
|---|---|
| `captureState` | 数组里**两条都在** |
| `diffToEvents` | 遍历 live 数组时 A、B 都命中 `baseP.get(X)` → 生成**两条 key 同为 X 的 upsert**，patch 不同 |
| `replayState` | 按 id 收敛进 Map → **后一条覆盖前一条** |
| 结果 | 其中一条的改动**永久丢失** → 用户看到「改名/删除/改数量怎么都没反应」 |

**结论**：在同步语义里，同 id 的两条商品**最多只能存在一条**。所以「拆分」不是可选优化，而是让数据可被正确表达的前提。

### 1.3 产品侧表现

- 改名只作用在第一条
- 删除只作用在第一条（v2.36.0 已改为按对象引用定位，但**前提是 UI 传的是对象引用**；按 id 定位的路径仍会错）
- 记录页看不到另一条的流水

---

## 2. 现状：已有什么

| 机制 | 位置 | 说明 |
|---|---|---|
| **自动自愈** `dedupeProductIds()` | 7030-7072 | 启动（`onMounted`）+ `watch(products)` 触发；给「缺失 id」或「已出现过 id」的商品分配新 id；按 `productName` 迁移流水 |
| 重入锁 `_selfHealBusy` | 11228-11233 | 先 `dedupeProductIds` 再 `purgeGhostProducts`，顺序不可反 |
| 脏数据清理 `purgeGhostProducts()` | 11202 | `quantity ≤ 0` 或 `name` 为空 → 按对象身份清除 |
| 定位/删除 | `findProduct`(6987) / `removeProduct`(6998) | 对象引用优先；删流水按「归属」判定 |
| 测试 | `tools/e2e/shot_dup.js` | **10 条断言**已覆盖「重复 id / 幽灵商品 / 只删对的那条」——是本功能的现成扩展载体 |

---

## 3. 现有实现的三个缺陷（本次设计要解决）

### D1 · 新 id 随机 → 拆分**非幂等**，多设备不收敛

```js
p.id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);   // 7038
```

同一对重复商品，设备甲与设备乙各自自愈会得到**不同**的新 id → 双方各推一条 upsert → 云端与两台设备最终**多出商品**。

### D2 · 同名重复时，流水会被**错误地全量迁移**

```js
const hit = r.productName ? cands.find(m => m.name && m.name === r.productName) : null;   // 7054
```

`cands` 只含「被改了 id 的那条」。若 A、B **同名**，则所有该名称的流水都会命中 B 的新 id —— **包括本属 A 的**。A 因此丢掉历史。
> 「同名」时归属本质不可判定，设计上必须**放弃迁移**而不是猜。

### D3 · 只写 localStorage、不进事件流

```js
// ❗只写 localStorage，不调 saveData()：……避免在 baseState 未就绪时把全量当新增推上云
localStorage.setItem('food_inventory_products', JSON.stringify(products.value));   // 7068
```

自动自愈这么做是为**避免启动期全量事件洪水**，可以理解；但用户**显式**点击的「一键拆分」需要结果上云（否则换设备/清缓存后重复 id 又回来）。

> 另：`if (!p.id || seen.has(p.id))` 把「缺失 id」与「重复 id」混在同一分支，二者用户语义不同（一个无法归属、一个可归属），应分开统计。

---

## 4. 目标 / 非目标

**目标**

1. 能**看见**：有重复时给出组数、涉及商品、将迁移的流水数、无法判定的条数
2. 能**一键拆分**：每条重复商品拿到唯一 id，流水按归属正确迁移
3. **幂等**：同一份数据在任何设备上拆出的结果一致；重复执行不产生新商品
4. **可撤销**：一键还原到拆分前
5. **能上云**：结果进入事件流

**非目标**

- 不做 UI 视觉设计（只定数据契约与交互流程）
- **不做「同名同条码商品合并」**（把两条并成一条、数量相加）——那是另一个功能，语义与风险都不同，本文只在 §12 提一句
- 不改同步引擎骨架（改造方案文档的既定原则）

---

## 5. 检测层

```js
// 纯函数，无副作用，可被 computed / E2E 直接调用
function scanDuplicateIds() {
  const byId = new Map();          // id -> [product, ...]（保持数组顺序）
  for (const p of products.value) {
    if (!p || p[DEMO_MARK]) continue;              // ❗示例数据不参与（见 §8.4）
    const k = (p.id == null || p.id === '') ? '__missing__' : p.id;
    if (!byId.has(k)) byId.set(k, []);
    byId.get(k).push(p);
  }
  const groups = [];
  for (const [id, items] of byId) {
    if (id === '__missing__' || items.length > 1) groups.push(buildGroup(id, items));
  }
  return groups;
}
```

`buildGroup` 的产出（**这是给未来 UI 的完整数据契约**）：

```js
{
  id: 'X',                       // 原 id（'__missing__' 表示缺失 id）
  total: 2,                      // 该 id 下的商品条数
  keep: { index: 0, name: '甲', reason: 'createdAt 最早' },   // 保留原 id 的那条
  split: [                        // 需要新 id 的条目（N-1 条）
    { index: 1, name: '乙', newId: 'p1a2b3c4d5e', deterministic: true,
      movableRecords: 7,          // 名称能对上的流水数
      ambiguousRecords: 0 },
  ],
  movableRecords: 7,             // 本组将迁移的流水总数
  ambiguousRecords: 0,           // 本组无法判定归属的流水数（同名等）
  ghost: [ { index: 2, name: '' } ],  // 命中「脏商品」判定、建议直接清除的条目
  indistinguishable: false,      // true = 两条在所有判据上都相同 → 无法拆分
}
```

---

## 6. 归属判定规则（核心）

### 6.1 谁保留原 id

优先级（**必须确定性**，否则多设备结果不一致）：

1. `createdAt` 最早的那条（业务上「先来的」）
2. 并列时按 `barcode` 字典序
3. 再并列时按**数组下标**（最后兜底）

> 不直接用「数组下标」当第一判据：数组顺序在多设备间可能不同（同步到达顺序不同），会让结果分叉。`createdAt` 是商品自带且同步的字段，更稳。

### 6.2 流水归属

沿用 `removeProduct` 已经确立的**保守**原则：

| 情形 | 处理 |
|---|---|
| 流水的 `productId` 不指向本组 id | 不动 |
| 流水 `productName` 与**被拆分那条**的 `name` 精确相同 | ✅ 迁到新 id |
| 流水 `productName` 与**保留条**的 `name` 相同 | 留在原 id（本来就对） |
| 流水 `productName` 为空 / 与本组任何商品都不同 | ⚠️ 留在原 id，计入 `ambiguous` |
| **本组存在同名商品**（含「保留条」与「被拆条」同名） | ⚠️ **整组不迁移**，全部计入 `ambiguous`，并在回执里说明原因 |

> 最后一行是 D2 的修复：同名时无法判定，**宁可让流水留在原商品下**，也不要把别人的历史搬走。
>
> ⚠️ **更正（2026-10-09 复核）**：本设计初稿此处曾写「可人工再分配」—— **不成立**。全仓复核 `productId` 的赋值点只有一处（`dedupeProductIds` 7057），**应用当前没有「改流水归属」的任何入口**。因此同名重复的唯一补救是**先改其中一条的名称、再点拆分**（与 §7.3「双胞胎」的建议一致）。若希望给用户更强的补救能力，需另立「流水改挂」功能。

---

## 7. 新 id 生成：确定性 vs 随机

### 7.1 方案对比

| | 方案 A：随机（沿用现状） | 方案 B：确定性（**推荐**） |
|---|---|---|
| 生成 | `generateId()` 或 `'p'+base36(now)+rand` | `'p' + base36(内容哈希)` |
| 同数据在两台设备拆分 | 得到**不同** id → 各推一条 → 商品变多 | 得到**相同** id → upsert 按 id 幂等去重 → **收敛** |
| 重复执行 | 每次再拆一次 → 又新增商品 | 无变化（幂等） |
| 与同步引擎契合度 | 差（拆分 = 非幂等操作） | **好**（引擎本身按 id 幂等） |
| 风险 | — | 内容完全相同的「双胞胎」无法区分（§7.3） |

**推荐 B**。理由：本应用的同步引擎本来就是「按事件 id 幂等去重」的，把拆分也做成幂等操作，能让「每台设备各自自愈」得到**同一个结果**，这是解决 D1 的最省事方式。

### 7.2 确定性算法

```js
function deterministicProductId(p) {
  const key = [p.barcode || '', String(p.name || '').trim(), p.createdAt || ''].join('\u0000');
  // 两个不同种子的 FNV-1a 32 位 → 拼成 64 位 → base36（约 13 字符）
  const a = fnv1a(key, 0x811c9dc5), b = fnv1a(key, 0x01000193);
  let id = 'p' + ((BigInt(a) << 32n) | BigInt(b)).toString(36);
  // 碰撞兜底：若已被别的商品占用，附加短随机后缀（并记日志）
  const taken = new Set(products.value.filter(x => x && x !== p).map(x => x.id));
  if (taken.has(id)) id = id + Math.random().toString(36).slice(2, 5);
  return id;
}
```

- 参与哈希的字段都**随商品同步**，因此各设备算出的结果一致。
- **不含数组下标**（下标不跨设备稳定）。
- 只用 `createdAt` 而不用 `updatedAt` —— 后者会被编辑改写，导致同一商品在不同设备上算出不同 id。

### 7.3 「双胞胎」不可区分

若两条的 `barcode + name + createdAt` **完全相同**，方案 B 会算出同一个 id → 无法拆分。
这不是缺陷，而是「这两条在数据上就是同一条」的事实。
处理：标记 `indistinguishable: true`，**跳过该组**，并提示：

> 「这两条商品的名称、条码、入库时间完全相同，无法判定流水归属。请先改一下其中一条的名称，再点拆分。」

（这也是为什么**不做自动合并**：合并会直接丢弃一条，属破坏性操作，必须用户明确同意。）

---

## 8. 同步语义（关键章节）

### 8.1 为什么必须走 `saveData()`

拆分后的正确事件推导（`A(id=X)` 保留、`B` 改为 `Y`）：

| 步骤 | `diffToEvents` 行为 |
|---|---|
| `live.products` | `[A(X), B(Y)]` |
| A | `baseP.get(X)` 命中 → 若有字段变化则发 `upsert X`（通常为空） |
| B | `baseP.get(Y)` **未命中** → 发 `upsert Y`（**全量 patch**）✅ |
| delete 循环 | X、Y 都在 `livePIds` → **不发 delete** ✅ |

→ 结果正确且最小。**因此用户点击的拆分必须调用 `saveData()`**（它会 `normalizeProductList` → `diffToEvents` → 15 秒防抖推送）。
自动自愈那条「只写 localStorage」的直写路径**不要**照抄到用户操作上。

### 8.2 多设备收敛论证

配合 §7 的确定性 id：

1. 设备甲、乙各自持有 `[A(X), B(X)]`
2. 两侧独立运行同一确定性算法 → **都得到 `B → Y`**
3. 甲推 `upsert Y`；乙收到后 `replayState` 应用 → 乙本地已是 `A(X)`、`B(Y)` → **无变化**（幂等）
4. 乙若也自愈过，算出的同样是 `Y`，事件按 id 去重

→ 无需协调即可收敛。**这正是把自动自愈与一键拆分统一到同一个确定性引擎上的收益**：一键入口只是「可预览、可确认、可撤销」的外壳。

### 8.3 与 `knownIds` 的关系

**不需要墓碑**：拆分不消灭任何 id（原 id 仍被保留条持有），所以不产生 `delete`，也不涉及 `knownIds`。

### 8.4 示例数据必须排除

`DEMO_MARK`（`__demo__`）商品对同步引擎**完全不可见**（`captureState` 10470 过滤、`applyStockDelta` 10559 提前 return）。
若把示例商品纳入拆分 → 会产生**真实的 upsert 事件**，把导览演示商品推上云（v2.33.0 修过的 P1）。
**硬性要求**：`scanDuplicateIds` 与拆分引擎都必须先排除 `p[DEMO_MARK]`。

---

## 9. 可撤销设计

拆分是「改写主键 + 改写流水外键」，一旦出错影响面大，必须可回退。

```js
const DEDUPE_BACKUP_KEY = 'food_inventory_dedupe_backup';   // 仅本机，不进云
// {
//   at: ISO,
//   products: [ 拆分前受影响商品的深拷贝 ],      // 只存受影响的，不存全量
//   records:  [ 拆分前受影响流水的深拷贝 ],      // 只存 productId 被改过的
//   mapping:  [ { oldId, newId, productName } ]  // 便于「撤销」精确反查
// }
```

- **上限 1 份**（每次拆分覆盖上一份）+ TTL 7 天 —— 与 `undoCache`（300 条 / 60 天）分开，不污染流水撤销。
- 撤销 = 按快照还原受影响对象（同样走 `saveData()`，让还原也上云）。
- 入口回执里给「撤销」按钮（`showTip` 的 `action`；`runTipAction` 顺序固定「先关窗再执行」）。

---

## 10. 交互契约（不含视觉设计）

### 10.1 入口

设置页 → **数据整理**卡片 → 第 6 行（现有 5 行见模板 2296-2340）。

- **推荐：始终可见 + 计数徽标**；计数为 0 时用 `:aria-disabled`（**不能用原生 `:disabled`** —— 会吞掉 click，导致引导提示永远弹不出来，这是 UI规范 的既定规则），点击时 `toastGuide('暂无重复 id 商品')`。
- 备选：`v-if="duplicateGroups.length"` 仅在有重复时出现（更干净但不可发现）。
- 计数来源：`const duplicateGroups = computed(() => scanDuplicateIds())`，需登记进 `return{}`。

### 10.2 预览（点击后）

数据全部来自 §5 的 `buildGroup` 产出，弹窗需要能展示：

- 组数、涉及商品数
- 将迁移的流水条数
- **无法判定归属**的流水条数（若有，必须显著提示并说明「名称相同的重复商品」原因）
- 「双胞胎」跳过组数（若有，给出「先改名再拆分」的建议）

按 UI规范 §4：这是**长说明 + 引导类**，应走 `showTip({title, body, points, tone, primary, action})`；**不要**用 toast（>22 汉字装不下）。

### 10.3 确认与执行

真正改写主键，按规则用**居中确认弹窗** `<div class="fi-modal" @click.self="…">`（`z-40`），按钮文案「拆分」/「取消」。
执行期间置提交中标志防连点（复用 v2.36.0「减少库存二次确认」的 `submitting` + `nextTick` 模式，见 `confirmLastEat` 6928）。

### 10.4 回执

成功 → `toastDone('拆分', N + ' 组重复商品')`（≤22 字）；有无法判定项 → 用 `showTip` 追加说明并给「撤销」action。

### 10.5 需要新登记的导出

| 名称 | `return{}` | `window.__foodin` |
|---|---|---|
| `scanDuplicateIds` / `duplicateGroups` | ✅（模板要读计数） | ✅（E2E 要用） |
| `openDedupePreview` / `cancelDedupe` / `confirmDedupe` | ✅ | ✅ |
| `undoDedupe` | ✅ | ✅ |
| 纯函数 `buildGroup` / `deterministicProductId` / `fnv1a` | 不必 | ✅（便于单测） |

> ❗漏进 `return{}` = **UI 正常但不落盘**；漏进 `__foodin` = 测不到。改完必跑 `tools/chk_exports.py`。

---

## 11. 边界与异常清单

| # | 场景 | 处理 |
|---|---|---|
| 1 | 组内一条是**脏商品**（`quantity ≤ 0` 或 `name` 为空） | 不走拆分，直接按 `purgeGhostProducts` 语义清除；回执注明「已清除 1 条脏数据」 |
| 2 | `id` **缺失/空串** | 单独归入 `__missing__` 组；按 §7.2 生成确定性 id；`productId` 为空的流水不动（本就无法归属） |
| 3 | 组内 **同名** | 整组不迁移流水，计入 `ambiguous`（§6.2）。⚠️ 因**无手动改归属入口**，用户只能「先改名再拆」 |
| 4 | 组内 **三胞胎及以上** | 保留 1 条，其余 N-1 条各拿新 id（算法天然支持） |
| 5 | **双胞胎不可区分** | 跳过该组 + 建议先改名（§7.3） |
| 6 | 商品带 `DEMO_MARK` | 完全排除（§8.4） |
| 7 | 拆分时云同步已开启 | 照常走 `saveData()`；15 秒防抖合并，不额外触发同步 |
| 8 | localStorage 配额不足 | `saveData()` 已有 `toastErr('本地保存', …)` 兜底；拆分本身不吞异常 |
| 9 | 撤销时商品已被用户删除 | 按标识找不到就跳过该条，只还原还能还原的，并如实报告条数 |
| 10 | 拆分后立即刷新 | 结果已落盘（`saveData`），无需额外处理 |
| 11 | 重复 id 出现在**流水**上（`record.id` 重复） | **不在本功能范围**（本文只处理 `product.id`）；若存在，`diffToEvents` 同样会按 id 折叠 —— 建议单列为后续项 |

---

## 12. 顺带预防（根因，比事后拆更值得做）

### 12.1 ⚠️ 更正：`applyLegacyUnion` 的 seen-map **不是 bug**（初稿误判）

初稿曾写「`pmap` 建好后再没更新 → 同 id 被重复 push → 本地产生重复 id」，并称「2 行可修」。**复核后确认这是误判**：

```js
const pmap = new Map(products.value.map(p => [p.id, p]));              // 10797
for (const p of cloudP) if (!pmap.has(p.id)) products.value.push(p);   // 10799
```

- 该循环的语义是「**本地已有该 id → 跳过来件**；云端数组内部的同 id 条目照收」。
- 若按初稿去「修」成 `pmap.set(p.id, p)`，效果是**云端第二条被静默丢弃** —— 用数据丢失换掉「重复」，更糟。
- 而重复的产生根源在于**云端旧扁平负载自身就含两条同 id**（可复现），本循环只是忠实搬运。

**结论**：这里不需要改。重复一旦出现，正确做法就是 §7 的**确定性引擎**把它们拆成两条合法商品 —— 这本来也就是现有自动自愈在做的事。真正的改进点是**拆完立刻 reconcile**（不等下一次自愈），属于 P1 的引擎统一，而不是这个小循环。

> 另外复核确认：`replayState` 用 `new Map(...)` 以 id 为键收敛（10618），**事件重放不可能造出重复 id**。所以重复 id 的来源只有两个：**旧扁平云端负载**（本节）与**备份导入**（§12.2）。

### 12.2 `importData` 会**静默丢掉**备份里的重复项 —— 已验证

```js
const byId = new Map(normalizeProductList(products.value).map(p => [p.id, p]));   // 9249
incoming.forEach(p => { … if (!oldTs || newTs >= oldTs) byId.set(p.id, p); });     // 9250-9255
products.value = [...byId.values()];                                              // 9257
```

按 id 收敛 → 备份里同 id 的两条**只留一条**，另一条连同它的流水归属一起消失。

→ 产品建议：**导出备份前先提示「检测到 N 组重复 id，建议先拆分再导出」**；或导入时对同 id 冲突的来件分配新 id（而不是丢弃）。

### 12.3 统一 id 生成

当前有两套：`generateId()`（`crypto.randomUUID`，新建商品用）与 `'p'+base36(now)+rand`（自愈用）。
建议收敛为单一入口，并在新建商品时也做**碰撞检查**（`randomUUID` 实际不会撞，但 fallback 分支 `Date.now().toString(36)+Math.random()` 在毫秒级并发生成时理论可撞）。

---

## 13. 工程影响面清单

| 文件 / 位置 | 改动 |
|---|---|
| `index.html` setup 内 | 新增 `scanDuplicateIds` / `buildGroup` / `deterministicProductId` / `fnv1a` / `splitDuplicateIds` / `undoDedupe` + 3 个入口函数 + `duplicateGroups` computed |
| `dedupeProductIds`(7030) | 改造为调用同一引擎（保留自动触发），按 §7 确定性化、按 §6.2 修同名迁移缺陷 |
| `applyLegacyUnion`(10799-10800) | seen-map 修复（§12.1） |
| `importData`(9247-9258) | 重复 id 冲突处理 + 导出前提示（§12.2） |
| `return{}` / `window.__foodin` | 登记新导出（§10.5） |
| 模板 2296-2340 | 数据整理区新增第 6 行（**按你要求本次不做视觉设计**） |
| `tools/e2e/shot_dup.js` | 从 10 条断言扩到覆盖 §15 用例 |
| 版本联动 | 属**功能增量** → bump **Y**（2.36.x → 2.37.0）+ SW `CACHE_NAME` +1 + 应用内 changelog + `docs/CHANGELOG.md` + `versions/v2.37.0/` |
| 应用内 changelog | **改写** v2.36.0 里那句不实的「设置页可一键拆分重复 id」，替换为本功能的真实条目 |

---

## 14. 分期与工作量

| 期 | 内容 | 价值 | 风险 | 量级 | 状态 |
|---|---|---|---|---|---|
| **P0** | 导入不再静默丢商品（原 §12.1 seen-map 项**已更正为误判**，见 §12.1） | 止住导入造成的丢失 | 低 | 小 | ✅ 已实现 |
| **P1** | 引擎确定性化（§7）+ 修同名迁移缺陷（D2）+ 自愈改走事件流 | 多设备收敛、不再静默搬错流水 | 中（触及自愈与同步路径） | 中 | ✅ 已实现 |
| **P2** | 一键入口 + 预览 + 确认 + 撤销（§5/6/9/10） | 兑现 changelog 承诺、用户可自助修复 | 中（新交互，需可见性确认） | 中 | ❌ **按用户决定取消（不做 UI）** |

**主要风险**：P1 改动自愈路径后，若确定性 id 与既有数据发生碰撞，可能短时间内产生较多 upsert 事件。
缓解：先做**干跑**（`splitDuplicateIds({ dryRun: true })` 只返回 §5 结构、不写任何东西），在真实数据上确认组数与影响面后再启用。

---

## 15. 建议的验收用例（扩展现有 `shot_dup.js`）

1. **不同名重复**：A「甲」/ B「乙」同 id → 拆分后 id 互异；「乙」的流水迁到新 id、「甲」的流水不动
2. **同名重复**：A / B 同名 → 拆分后 id 互异，但**没有任何流水被迁移**，且回执报告 `ambiguous > 0`
3. **三胞胎**：3 条同 id → 保留 1 条（`createdAt` 最早）+ 2 条新 id，流水归属正确
4. **幂等**：连续点两次拆分 → 第二次报告「无重复」，商品总数不变
5. **确定性**：用同一份种子在**两个独立 context** 里各跑一次 → 产出的新 id **完全相同**
6. **脏商品共存**：同 id 中一条 `quantity=0` → 该条被清除而非拆分，另一条保留
7. **缺失 id**：一条 `id: ''` → 拿到新 id，且 `productId: ''` 的流水保持不动
8. **示例数据**：`DEMO_MARK` 商品存在时 → 不参与检测/拆分，且**不产生任何同步事件**（检查 `localStorage[food_inventory_sync_v2].pendingEvents` 不含其 id）
9. **撤销**：拆分后点撤销 → 商品与流水的 `id`/`productId` 完全还原（逐字段比对）
10. **上云**：拆分后 `pendingEvents` 中出现新 id 的 `upsert`，且**不含**原 id 的 `delete`
11. **回归**：原 10 条断言全绿（`shot_dup`、`shot_2360`）

---

## 16. 落地形态（实际交付）

**没有用户可见的新界面**，只改了数据层：

| 已实现 | 效果 |
|---|---|
| 确定性 id（`fnv1a32` + `deterministicProductId`） | 拆分变成**幂等操作**：同一份数据在任何设备上自愈出同一个新 id → 多设备自然收敛 |
| 同名不再迁移流水 | 不再「把别人的历史搬走」；无法判定时保持原归属并在控制台如实报告 |
| 自愈移到 `initSyncEngine()` 之后 + 条件走 `saveData()` | 拆分结果**能上云**（旧实现永远上不了，换设备后重复 id 又回来） |
| 导入区分「同一商品」与「id 撞车」 | 撞车时**两条都保留**、流水正确改挂（旧实现静默覆盖本地那条） |

验证：回归 5 套 **184/184**，其中 `tools/e2e/shot_dup.js` 从 10 条断言扩到 **25** 条。

---

## 17. 一句话总结

**把「拆分重复 id」做成一个确定性、幂等的引擎，自动自愈与一键入口共用它**：
检测（`scanDuplicateIds`）→ 预览（干跑）→ 确认 → 内容哈希分配新 id → 按名称保守迁移流水 → 走 `saveData()` 上云 → 留一份本机快照可撤销。
这样既解决了「同 id 必然互相覆盖」的根因，又让多设备无需协调即可收敛；而 §12 的两处根因修复能从源头减少重复的产生。

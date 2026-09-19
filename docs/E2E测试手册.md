# FoodIn E2E 测试手册

> 本文件收纳「跑截图/验收脚本」的完整操作细节。`.workbuddy/memory/MEMORY.md` 只保留结论级提醒，细则看这里。
> 最后更新：2026-09-19（v2.34.12）

---

## 1. 起服务与跑脚本

### ❗ 必须写在同一条命令里
后台 shell 起的服务在两次工具调用之间会死。用 PowerShell：

```powershell
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Administrator\WorkBuddy\2026-08-08-19-09-36'
$py   = 'C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe'
$node = 'C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
Set-Location $root
$srv = Start-Process -FilePath $py -ArgumentList '-m','http.server','8777','--bind','127.0.0.1' `
       -WorkingDirectory $root -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Seconds 2
  & $node "_shot_xxx.js" 2>&1 | Out-File "_shot_xxx.log" -Encoding utf8
  "NODE_EXIT=$LASTEXITCODE"
} finally {
  Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
}
```

### ❗ 地址必须用 localhost
Playwright 访问 `http://127.0.0.1:8777` 会 **refused**，必须 `http://localhost:8777`。

### ❗ 用 PowerShell 调 node，不用 bash
bash 里跑 node 会以退出码 23 结束且**无任何输出**。长输出一律 `Out-File` 重定向到文件再读。

### ❗ 日志编码
PowerShell `Out-File -Encoding utf8` 在 Windows PowerShell 5.1 下常写成 **UTF-16**。读的时候按顺序试：

```python
b = open('_shot_xxx.log','rb').read()
for enc in ('utf-16','utf-8-sig','utf-8'):
    try:
        print(b.decode(enc)); break
    except Exception: pass
```

### bash 丢 coreutils
Git Bash 里 `ls`/`cat`/`dirname` 报 `command not found` 时：
```bash
export PATH="/c/Users/Administrator/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:/c/Windows/System32:$PATH"
```

---

## 2. 种子注入的七个坑

> **不生效先查这些，别怀疑产品。**

1. **`addInitScript(fn)` 会丢闭包** —— Playwright 只序列化函数源码，外层变量在页面里不存在。
   → 种子必须**拼字符串注入**：`await ctx.addInitScript({ content: SEED })`，SEED 是模板字符串。
2. **`settings.locations` 必须显式 `[]`** —— 否则 `migrateLooseLocationsToPlaces()` 会灌进默认地点。
3. **空库 + `tourDone !== true` → 自动触发新手导览**，`seedDemoData()` 注入 `DEMO_PLACES`。
   → 种子必须 `tourDone: true`。注意 localStorage 的 key 是 **`food_inventory_settings`**。
4. **`places[].zones` 是字符串数组**（`['冷藏','冷冻']`），**不是** `[{name:'冷藏'}]` —— 写错会静默不命中。
5. **商品 `expiryDate` 别设太近**（否则首页「过期提醒」弹出挡住截图），并设 `settings.expiringDays = 0`。
6. **每个截图场景独立 `newContext()`** —— 复用同一 page 时残留弹窗会挡住后续所有弹窗/探测
   （表现为「探测到的是别的弹窗」）。
7. **按钮有前置条件**：
   - 「扫码接入」包在 `v-if="settings.cloudSyncEnabled"` 里 → 不先开云同步，按钮**根本不渲染**
   - 「高级设置」入口在**设置页** → 不先 `navigateTo('settings')` 就点不到

### 定位技巧
`page.getByText('...').first()` + `scrollIntoViewIfNeeded()` 比 `locator('button:has-text()')` 稳。

### localStorage key 速查
| key | 内容 |
|---|---|
| `food_inventory_settings` | 设置（含 `tourDone`） |
| `food_inventory_products` | 商品 |
| `food_inventory_records` | 流水 |
| `food_inventory_barcode_cache` | 条码记忆库 |

---

## 3. `window.__foodin` 白名单

**手写白名单，≠ `return{}`**。漏进 `return{}` 最隐蔽（UI 正常，后果是不落盘）→ **每次改完必跑**：

```bash
"C:/Users/Administrator/.workbuddy/binaries/python/versions/3.13.12/python.exe" _chk_exports.py
```

判断某标识符是否在白名单里，**必须用正则**（粗用 `in` 会被 `foo,` 尾逗号骗过）：
```python
re.search(r'(?<![\w$])' + name + r'(?=\s*[,}])', wl)
```

### ❗ 有些是 getter 不是 ref
`scanMode` / `showScanModal` / `apiMessage` 等导出的是 `() => xxx.value`。
→ 写 `.value = v` 是往布尔量上挂属性、**静默无效**；要用 `setScanMode(v)` / `setShowScanModal(v)`，读用 `scanMode()`。

---

## 4. 断言与截图纪律

- **❗颜色/透明度过渡会造出中间态**：截图可能刚好抓在渐变中途。加**稳态复采样**：
  ```js
  const settle = async () => { await page.waitForTimeout(500); return probe(); };
  ```
  过渡结束后再采一次，两者都一致才判定通过。
- **❗测试断言写错 ≠ 产品有 Bug** —— 先分辨是谁的错，再决定改脚本还是改产品。
- 每个场景落 `_results.json`，同时打 `== 场景名 | 说明` + `JSON.stringify(info)`，便于机器核对。

### 拦截外部 API
不要打真实 jsonbin / 真实网络。用 `ctx.route` + 全局开关模拟：
```js
await ctx.route('**/api.jsonbin.io/**', async route => {
  const mode = global.__syncMode || 'ok';
  if (mode === 'fail401') return route.fulfill({ status: 401, contentType: 'application/json',
    body: JSON.stringify({ message: 'invalid key' }) });
  return route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ record: { syncedAt: 'demo', events: [], snapshot: {}, knownIds: [] },
                           metadata: { id: 'demo-bin' } }) });
});
```

---

## 5. 回归套件清单

| 脚本 | 断言数 | 覆盖 |
|---|---|---|
| `_shot_2360.js` | 92 | v2.36.0 全量 UI |
| `_shot_dup.js` | 10 | 重复 id / 幽灵商品 |
| `_shot_2351.js` | 22 | v2.35.1 |
| `_shot_fontbtn.js` | 15 | 字号三档按钮 |
| `_shot_tip_all.js` | 30 | 10 类说明弹窗 |

单轮验收脚本命名：`_shot_v<版本>.js` → 产物 `_shots_v<版本>/`。

---

## 6. 调试产物与清理

- 调试产物统一 **`_` 开头**（`.gitignore` 已屏蔽 `_*`），**禁 `git add .` / `-A`**。
- 清理时**先移到 `%LOCALAPPDATA%/Temp/FoodIn-cleanup-<日期>/` 再确认**，不直接删（`rm` 被 shim）。
- PowerShell `Add-Type`（回收站 API）常被安全策略拦截，别指望它。

# FoodIn · 家庭食品库存与临期管理 PWA

> 一个**单文件、可安装、可离线**的家庭食品库存管理应用：扫码录入、分区存放、保质期/临期提醒、吃/浪费/加热流水、统计看板，数据本地保存并通过 jsonbin.io 做事件溯源云同步。

- 线上地址（GitHub Pages）：<https://dailyray-c.github.io/FoodIn/>
- 当前版本：**v2.33.0**（见 `index.html` 内 `CURRENT_VERSION`）；Service Worker 缓存版本 **v114**

---

## 一、功能特性

| 模块 | 说明 |
|---|---|
| 库存录入 | 手动 / `html5-qrcode` 扫码录入商品，支持名称、数量、分区位置、保质期、生产日期 |
| 位置管理 | 「地点 → 分区」两级结构（`settings.places`），录入页/主页按固定顺序展示 |
| 临期提醒 | 按保质期推算临期/过期状态，统计页与首页高亮提示 |
| 流水操作 | 吃 / 浪费 / 加热（复热计数）三类流水，支持**撤销**（本机快照，只还原自己操作过的字段） |
| 统计看板 | 库存分布、临期、浪费、各位置用量等可视化统计 |
| 云同步 | `localStorage` + `jsonbin.io` **事件溯源**同步，设置项由 `SETTINGS_SYNC_SCHEMA` 驱动 |
| PWA | 可「添加到主屏幕」安装，离线可用（Service Worker 同源静态缓存） |

---

## 二、技术栈与架构

- **单 HTML 文件**：`index.html` 内联 Vue3 模板与 `setup()`，Vue 走本地 `./vendor/vue.global.prod.js`（非 CDN）。
- **样式**：TailwindCSS **预编译**产物 `styles.css`（源文件 `src/tailwind.css`）。采用确定性构建以锁定精确色值。
- **离线**：`service-worker.js` 白名单模式缓存同源静态资源；改动后须同步 bump `CACHE_NAME`。
- **数据**：`localStorage`（`food_inventory_products` / `food_inventory_records` / `food_inventory_settings`）+ jsonbin.io 云同步。
- **扫码/生成库**：`vendor/html5-qrcode.min.js`、`vendor/qrcode.min.js` 在 v2.33.0 起改为**按需懒加载**（首屏不再阻塞）。

---

## 三、目录结构

```
FoodIn/
├─ index.html              # 应用本体（Vue3 单文件）
├─ src/tailwind.css        # Tailwind 源
├─ styles.css              # 预编译样式（提交到仓库）
├─ service-worker.js       # PWA 离线缓存（CACHE_NAME 随改动 bump）
├─ manifest.json           # PWA 元信息
├─ vendor/                 # vue / html5-qrcode / qrcode 本地库
├─ icon-180/192/512.png    # PWA 图标
├─ push-safe.sh            # 安全发布脚本
├─ versions/               # 各版本三件套副本（历史档案，回退用，不删）
├─ docs/                   # 参考文档（审计报告 / 设计 demo / 经验总览）
├─ scripts/                # CI 用：daily_backup / daily_expiry_check
├─ .github/workflows/      # deploy.yml（Pages 部署）+ 定时任务
└─ UI规范.md               # ⭐ UI 硬规则唯一依据
```

---

## 四、本地运行与开发

```bash
# 本地起静态服务（不要用 nohup &，后台用工具后台模式）
python -m http.server 8088 --bind 127.0.0.1
# 浏览器打开 http://127.0.0.1:8088/
```

**修改样式后必须重编译 Tailwind**（否则新 class 不生效、表现为「样式失效但功能正常」）：

```bash
# 方式一：npm 脚本
npm run build:css

# 方式二：直接调用本地 tailwind
./node_modules/.bin/tailwindcss -i ./src/tailwind.css -o ./styles.css --minify
```

> ⚠️ **调试产物约定**：临时验证脚本/截图/日志一律以 `_` 开头命名（如 `_verify_2330.js`、`_v2330_*.png`），已被 `.gitignore` 屏蔽，不会进仓库。清理时**只移到 `%TEMP%` 不删除**。

---

## 五、部署（部署脚本）

部署使用仓库根目录的 **`push-safe.sh`**，它负责安全提交并触发 GitHub Pages 构建：

```bash
cd "项目根目录"
./push-safe.sh "release(v2.33.0): 一句话说明本次改动"
```

脚本做了哪些安全保障（详见脚本内注释）：

1. **绝不 `git add .` / `git add -A`** —— 只提交白名单文件（发布文件 + `versions/` 全量），避免 `_` 调试产物误入库。
2. **不用 `git stash`+`rebase`**（曾因中断写坏 `.git`），全程 `fetch → reset --mixed → add → commit → push`。
3. **绕过代理直连 GitHub** 并检测「代理返回空 502 假成功」，失败即明确报错。

部署完成后：

- 自动触发 `.github/workflows/deploy.yml` 构建 `_site/` 并发布到 GitHub Pages，**约 1 分钟后生效**：<https://dailyray-c.github.io/FoodIn/>
- 可选打版本标签：`git tag -a v2.33.0 -m "长期版本 v2.33.0" && git push origin v2.33.0`
- 若沙箱/代理环境推送失败，请在**能直连 GitHub 的终端**执行（脚本已内置 `GIT_HTTP_PROXY=` 等绕过，但仍依赖网络可达）。
- SW 缓存版本变化后，**线上需刷新两次**才能拿到新资源。
- 线上版本号可在「我的」页查看，应显示 `2.33.0`。

> 注：README 本身已加入 `push-safe.sh` 的发布白名单，会随下一次部署提交进仓库；它不参与 Pages 运行时部署（Pages 只构建应用静态文件）。

---

## 六、版本与回退

- 每次版本 bump 前，`index.html` + `service-worker.js` + `styles.css` 三件套会备份到 `versions/v{X.Y.Z}/`。
- 回退：`cp versions/vX.Y.Z/* .`，必要时重新编译 `styles.css`。
- `versions/` 是历史档案，**不要删除**。

---

## 七、相关文档

| 文档 | 用途 |
|---|---|
| [`UI规范.md`](./UI规范.md) | **UI 硬规则唯一依据**（配色、组件类、开关、导览等），改动 UI 前必读 |
| [`docs/FoodIn开发经验总览.md`](./docs/FoodIn开发经验总览.md) | 工程经验总览：踩坑 / 标准工作流 / 发布前自检 / 部署与 Git 陷阱 / 排错速查表 |
| [`docs/Bug审计报告_v2.26.0.md`](./docs/Bug审计报告_v2.26.0.md) | 历史 Bug 审计与修复记录 |

---

## 八、隐私与数据

- 库存数据默认仅存于本机 `localStorage`；开启云同步后通过 jsonbin.io 同步，**请勿在商品名中存放敏感信息**。
- 云同步采用事件溯源，撤销快照仅存于本机，不会上传。

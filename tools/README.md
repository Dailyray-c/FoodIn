# tools/ — 项目工具（受版本控制）

> 这些工具原先以 `_` 前缀命名，因此被 `.gitignore` 的 `_*.py` / `_*.js` 规则屏蔽，
> **从未进入仓库** —— 干净克隆或 CI runner 上根本拿不到它们，
> 而文档却要求「发布前必跑 `tools/chk_exports.py`」。2026-10-08 迁移到此并纳入版本控制。

## 发布卡点

```bash
# 在项目根目录执行（脚本用 CWD 相对路径读 index.html）
python tools/chk_exports.py
# Windows / GBK 控制台必须先设编码，否则会崩在 print('✅')：
#   PowerShell:  $env:PYTHONIOENCODING='utf-8'; python tools/chk_exports.py
```

校验「模板引用 ∩ setup 内定义 − `return{}` 导出」的差集，**退出码非 0 即拦截**。
漏登记的后果极隐蔽：**UI 完全正常，但不落盘**（赋值先于抛错执行）。

## 回归套件（Playwright）

```powershell
# ❗起服务 + 跑脚本 + 关服务必须写在同一条命令里（后台服务跨调用会死）
$srv = Start-Process python -ArgumentList '-m','http.server','8777','--bind','127.0.0.1' -PassThru -WindowStyle Hidden
try { Start-Sleep 2; node tools/e2e/shot_2360.js 2>&1 | Out-File _shot_2360.log -Encoding utf8 }
finally { Stop-Process -Id $srv.Id -Force }
```

| 脚本 | 断言数 | 覆盖 |
|---|---|---|
| `e2e/shot_2360.js` | 92 | 全量 UI |
| `e2e/shot_dup.js` | 25 | 重复 id / 幽灵商品 / 确定性 id / 同名不迁移 / 幂等 / 导入撞车 / 事件流 |
| `e2e/shot_2351.js` | 22 | v2.35.1 功能批 |
| `e2e/shot_fontbtn.js` | 15 | 字号三档按钮 |
| `e2e/shot_tip_all.js` | 30 | 10 类说明弹窗 |

- 脚本用 **CWD 相对路径**：请在项目根目录运行；截图输出到根目录的 `_shots_*/`（仍被 `.gitignore` 忽略）。
- 地址必须用 `localhost:8777`（Playwright 访问 `127.0.0.1` 会被 refused）。
- 单轮验收脚本命名：`e2e/shot_v<版本>.js` → 产物 `_shots_v<版本>/`。
- 细节见 `docs/E2E测试手册.md`。

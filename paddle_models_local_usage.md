# FoodIn Paddle 模型本地托管说明

## 背景
百度 bcebos 的模型 URL **不带 CORS 响应头**，所以浏览器（包括 file:// 协议和 https 网页）跨域 fetch 会被 CORS 策略拦截，paddlejs 的 `ocr.init()` 永远拿不到数据。这就是「批量识别卡 45% 后自动切 Tesseract」的真凶——不是下载慢，是**根本没下载成功**。

## 解决思路
把模型下载到本地，用支持 HTTP 的本地服务器托管，再用同源方式加载（无 CORS 问题）。已实测：13.2s 完成 init，`paddleOcrReady=true`。

## 一键操作（Windows / PowerShell）

### 1. 启动本地 HTTP 服务（双击）
项目根目录下双击 `start_paddle_host.bat`，会启动 Python 自带的 HTTP 服务，监听 `127.0.0.1:8765`。窗口保持打开（关闭即停止）。

### 2. 用 HTTP 协议打开应用
**不要**直接双击 `index.html`（file:// 协议仍会跨域），用浏览器访问：
```
http://127.0.0.1:8765/index.html
```

### 3. 控制台注入本地模型地址（F12 → Console）
```js
__foodin.setPaddleModelUrls(
  'http://127.0.0.1:8765/_paddle_models/det/model.json',
  'http://127.0.0.1:8765/_paddle_models/rec/model.json'
)
await __foodin.preloadPaddleModel()
```
约 10-30 秒后控制台会输出 `✅ init 成功，耗时 Ns`，以后批量识别秒开。

## 模型文件
- `_paddle_models/det/model.json` (~0.27 MB)
- `_paddle_models/det/chunk_1.dat` (~2.2 MB)
- `_paddle_models/rec/model.json` (~1.0 MB)
- `_paddle_models/rec/chunk_1.dat` (~4.0 MB)
- `_paddle_models/rec/chunk_2.dat` (~3.9 MB)
- 合计约 11.4 MB

如果模型文件丢失，重新跑 `python paddle_models_dl.py` 即可恢复。

## 注意事项
1. **端口冲突**：8000 端口容易被 C-Lodop 等服务占用，所以选 8765。如果要换端口，同时改 `.bat` 和 `setPaddleModelUrls` 调用里的端口号。
2. **跨设备访问**：本服务的 `--bind 127.0.0.1` 只允许本机访问。要让手机访问，把 `--bind 127.0.0.1` 改成 `--bind 0.0.0.0` 并允许防火墙。
3. **真机环境**：手机想用 Paddle 也得在同一局域网内起服务；或者把模型上传到 jsdelivr/GitHub Pages 这类带 CORS 的静态托管，用 https URL。
4. **不想折腾**：直接在设置页切到 Tesseract（识别小票文字不如 Paddle 准但可用），或保留 Paddle 默认走云端识别（在浏览器加载速度可能仍受 bcebos 限制）。

## 验证脚本
- `_v2217_smoke_check.js`：mock 验证 init 失败日志不再静默（4/4 通过）
- `_v2217_local_model_check.js`：验证本地模型同源 fetch 无 CORS 拦截 + URL 注入生效（5/5 通过）
- `_v2217_real_init_check.js`：端到端真实 init（13.2s ✅ paddleOcrReady=true）
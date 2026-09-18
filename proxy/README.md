# 百度云 OCR 代理（FoodIn）

## 这个目录是干什么的

FoodIn 的百度云文字识别需要一个中转服务。原因有两条，都不是可以绕过的：

1. **百度接口不返回 CORS 响应头** —— 浏览器直连会被拦（预检直接 400）。实测确认过。
2. **AK/SK 不能放前端** —— 网页里的任何字符串都是公开的。SK 泄漏后别人可以盗刷你的识别额度。

所以密钥只存在于这台代理服务的环境变量里，前端只填一个代理地址。

## 部署（3 步）

### 1. 拿到百度的 AK / SK

浏览器打开 <https://console.bce.baidu.com/ai-engine/ocr/overview/index> →

1. 左侧「文字识别」→「创建应用」
2. 应用类型选「文字识别」，随便起个名字
3. 创建后在「应用列表」里能看到两个值：
   - **API Key** → 等下填进 `BAIDU_AK`
   - **Secret Key** → 等下填进 `BAIDU_SK`

> 免费额度：「通用文字识别（高精度版）」每月 1000 次，够家用。这个服务用的是 `accurate_basic`，
> 中文小票识别率明显好于免费的 `general_basic`。

### 2. 启动代理

只需要 Node（建议 18+，用到了内置 `fetch`）。**没有第三方依赖，不用 npm install。**

```bash
BAIDU_AK=你的APIKey \
BAIDU_SK=你的SecretKey \
PORT=8080 \
node proxy/server.js
```

Windows PowerShell：

```powershell
$env:BAIDU_AK="你的APIKey"
$env:BAIDU_SK="你的SecretKey"
$env:PORT="8080"
node proxy/server.js
```

看到这行就成功了：

```
[FoodIn proxy] listening on :8080  | AK/SK 已配置
```

### 3. 在 FoodIn 里填地址

设置 → 文字识别 → 识别引擎选「百度云」→ 代理地址填上一步服务对外的地址
（本地测试就是 `http://127.0.0.1:8080`）→ 点「保存设置」。

会立刻探测一次：通了提示「已启用百度云识别（代理已就绪）」，不通会明确告诉你原因。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `BAIDU_AK` | 是 | 百度智能云 API Key |
| `BAIDU_SK` | 是 | 百度智能云 Secret Key |
| `PORT` | 否 | 监听端口，默认 `8080`。多数部署平台会自动注入 |
| `ALLOW_ORIGIN` | 否 | 允许的前端来源，默认 `*`。**公网部署建议收敛** |

公网部署时建议设上 `ALLOW_ORIGIN`，只允许你自己的 FoodIn 域名：

```bash
ALLOW_ORIGIN=https://dailyray-c.github.io node proxy/server.js
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/health` | 返回 `{ ok, configured }`。`configured=false` 表示服务起来了但没配 AK/SK。前端「保存设置」就是探这个，不消耗百度额度 |
| `POST` | `/baidu-ocr` | 请求体 `{ "image": "<base64>" }` → 返回 `{ words: [...], count }` |

## 排查

| 现象 | 原因 |
|---|---|
| 提示「代理未配置百度凭证」 | `BAIDU_AK` / `BAIDU_SK` 没设或设错了，检查后重启 |
| 提示「百度 token 获取失败：unknown client id」 | AK 不对，或应用类型没选「文字识别」 |
| 提示「百度 OCR 失败 [17]」 | 当天额度用完了 |
| 提示「百度 OCR 失败 [6]」 | 图片有问题（太小 / 格式不支持） |
| 前端提示「连接代理失败」 | 地址填错、服务没起、或端口被防火墙挡了 |

## 安全说明

- 本服务**只做转发**，不落盘任何图片。图片经内存直接转给百度，识别完即释放。
- 前端页面、仓库、云同步里**都不包含** AK/SK。`settings.baiduApiKey` / `baiduSecretKey`
  是早期版本的遗留字段，现在只做兼容读取，没有任何 UI 入口，也不进云同步。
- 请求体上限 10MB（百度接口本身的限制），超出直接 413。
- `access_token` 在内存里缓存，有效期 30 天，到期前 5 分钟自动续。

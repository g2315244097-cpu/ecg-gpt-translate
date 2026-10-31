# ECG-GPT 心电图中文分析（DeepSeek Harness 插件）

在 DeepSeek Harness 的消息输入框下方加一张卡片，用来把 **ECG-GPT**（<https://ecg-gpt.cards-lab.org/>）
对 12 导联心电图的分析结果读出来，并整理成**按临床严重度排序的中文清单**。

## 功能

- **粘贴翻译（推荐）**：在 ECG-GPT 网站上传图片、拿到 `AI REPORT` 后，复制那段英文；
  回到插件点「从剪贴板读取」→「翻译成中文」。
- **右侧浏览器**：一键在 Harness 右侧内建浏览器里打开 ECG-GPT 网站（桌面版支持；
  其他环境退回系统浏览器）。
- **自动抓取**：在卡片里直接上传图片并完成 Turnstile 验证，插件代为提交并解析结果。
  ⚠️ 受站点 Turnstile 域名白名单限制，多数情况下不可用，见下文「已知限制」。

翻译结果会拆成一条条独立发现、逐条编号，并按
「急性/危重 → 主要异常 → 次要异常 → 正常/阴性」排序。

## 安装

### 最快的方式（GitHub）

在 Harness 对话里让 agent 执行：

> `plugin_manager` → `install_bundle` → `target` = **`github:g2315244097-cpu/ecg-gpt-translate`**

也可以直接给完整地址：

```
git+https://github.com/g2315244097-cpu/ecg-gpt-translate.git
```

安装后插件默认启用。**宿主代码更新后需要完全退出并重开 Harness**
（未开启 `pnpm run dev:web` 时插件 JS 不会热加载）。

### 其他安装形式

插件遵循 DSH 的 bundle 规范（`package.json` 的 `dsh.bundle.patch` + `dsh.client`）。
也可以从 Web 侧边栏 **Plugins** 页面安装，`target` 支持：

| 形式 | 示例 |
|---|---|
| GitHub 仓库 | `github:g2315244097-cpu/ecg-gpt-translate` |
| Git 地址 | `git+https://github.com/g2315244097-cpu/ecg-gpt-translate.git` |
| 本地目录 | `D:\path\to\ecg-gpt-translate` |
| tarball | `ecg-gpt-translate-1.0.0.tgz` 的路径或 URL |

## 已知限制：Turnstile 域名白名单

ECG-GPT 用 Cloudflare Turnstile 保护提交表单，且 sitekey 在 Cloudflare 后台配置了
**Hostname Management**，只授权 `ecg-gpt.cards-lab.org`。插件页面运行在
`http://127.0.0.1:<port>`，不在白名单内，Cloudflare 会返回：

```
错误码 110200 —— Domain not authorized（域名未授权）
```

这既不是网络问题，也不是插件 bug：Turnstile 的域名校验在 Cloudflare 服务端完成，
客户端无法绕过。**因此自动上传这条路在该站点当前配置下不可用**，
请使用「粘贴翻译」。

（若站点未来开放 `Any Hostname` 或把插件域名加入白名单，自动抓取会自动恢复可用。）

## 实现

- **Host 半**（`index.js`）：注册两个同源 HTTP 路由
  - `POST /ecg-gpt/analyze`：接收图片 + Turnstile token，以 `multipart/form-data`
    提交到 ECG-GPT，解析返回页面的 `.prediction`，翻译后返回 JSON。
  - `POST /ecg-gpt/translate`：翻译任意文本，供「粘贴翻译」使用。
  - 翻译优先用当前默认模型（`ctx.llm`），失败时回退到公共翻译接口。
- **Client 半**（`client.js`）：把卡片注册进 `conversation.composer.dock`，
  负责上传 UI、Turnstile 组件、剪贴板读取与结果展示。

## 免责声明

ECG-GPT 是研究工具，其结果不用于临床诊断。本插件只做整理与翻译，不产生医学结论。

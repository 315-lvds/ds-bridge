# Security Policy

## 支持的版本 / Supported versions

只维护最新发布版本：浏览器扩展 `0.3.x`，DSH 插件 `0.2.x`。

## 报告安全问题 / Reporting a vulnerability

请使用 GitHub 仓库的 **Security → Report a vulnerability**（私有安全公告）报告问题。
不要在公开 issue 中粘贴登录令牌、Cookie、完整聊天记录或可识别个人的导出文件。

请尽量提供：

- 受影响版本与浏览器/DSH 版本；
- 复现步骤与预期结果；
- 最小化、脱敏后的错误信息。

## 数据边界 / Data boundary

- 浏览器扩展只在 `chat.deepseek.com` 页面内读取登录令牌，令牌只存在于扩展运行内存，不写入 `chrome.storage`，不落盘，不进入导出包。
- 扩展只访问 `https://chat.deepseek.com/*`，无远程脚本、字体、统计或遥测。
- DSH 插件在浏览器内存中解析用户选择的文件，只把选中会话的 v3 zip POST 到本机 DSH 的同源导入路由；不访问外部网络。
- 导出的 Markdown / JSON / zip 包含聊天记录，属于敏感数据。请只在可信设备保存，不要上传到公开位置或第三方服务。

更完整的威胁模型见 [docs/SECURITY.md](docs/SECURITY.md)。

## 不属于安全问题的范围

- chat.deepseek.com 私有接口变更导致的导出失败；
- DeepSeek 官方导出格式或 DSH 官方导入器变化导致的兼容性问题；
- 用户主动把导出包上传到第三方造成的数据泄露。

本项目不是 DeepSeek 官方产品。

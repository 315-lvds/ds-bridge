# 数据安全与隐私边界

本文件说明深桥触碰哪些数据、数据流向哪里，以及如何避免流向不受信任的第三方。

信任边界（按项目确认）：**本机 + 家庭局域网**，以及 **DeepSeek 官方（chat.deepseek.com / DeepSeek API）**。除此之外的第三方一律视为不可信。

## 1. 登录令牌

- 来源：只在 `chat.deepseek.com` 页面内由 `content.js` 读取 `localStorage.userToken`。
- 流向：content script → background（service worker 内存）→ workbench 页面（内存）→ 请求 `chat.deepseek.com` 时作为 `Authorization` 头。
- 不落盘：不写 `chrome.storage`、不写文件、不 `console.log`、不进入 zip / manifest / Markdown / JSON。
- 不外发：除 `chat.deepseek.com` 外没有任何主机收到该令牌。
- 生命周期：只在导出操作期间驻留内存；关闭工作台页面即释放。

## 2. 聊天记录

### 2.1 浏览器扩展

- 抓取：工作台用令牌直接 GET `chat.deepseek.com/api/v0`，响应只在扩展页面内存中处理。
- 打包：zip 在内存中构建（`shared/zip.mjs`），经 `chrome.downloads` 写入本机下载目录。
- 不上传：没有上传接口、遥测、崩溃上报或统计脚本。
- 导出包含隐私（聊天正文、标题、附件元数据），README 已提示自行保管。

### 2.2 DSH 插件

- 用户在 DSH 页面中选择/拖入 `.json` / `.zip`；文件通过浏览器 `File` API 读取，不经过第三方。
- 官方 zip 使用 `Blob.slice` 按需读取中央目录与会话条目；不会整包发送到网络。
- 选中会话在浏览器内存中组装成 v3 zip，POST 到当前 DSH 页面的同源路由 `api/deepseek-chat-import/archive`；该路由由本机 DSH Host 处理。
- 不访问外部网络；不写临时文件；导入结束即释放内存中的文件内容。
- DSH 官方导入器负责写入 v4 会话；它可能把会话写到当前工作区。

## 3. 网络出口清单

| 组件 | 允许的出口 | 说明 |
| --- | --- | --- |
| 浏览器扩展 | `https://chat.deepseek.com/*` | `manifest.host_permissions` 唯一主机 |
| DSH 插件 | 当前 DSH 页面的同源本机路由 | 由 DSH Host 接收，不经过公网 |
| 构建/测试脚本 | 无 | 纯本地文件处理 |

扩展页面无外部字体、无 CDN、无内联远程脚本；CSS/JS 全部随包分发。

## 4. 权限最小化

扩展：

- `permissions: ["storage", "downloads"]`；
- `host_permissions: ["https://chat.deepseek.com/*"]`；
- 没有 `tabs` / `webRequest` / `cookies` / `scripting` 权限；不读取其他站点。

DSH 插件：

- 不新增 Host 路由、不申请网络权限；
- 只调用 DSH 官方导入器已经存在的 owner-only 路由；
- 工作区选择由 DSH 的 `workspace.picker` 提供。

## 5. 威胁模型与已知风险

### 5.1 受信任

- 本机浏览器与 DSH 进程；
- 家庭局域网内的 DSH 服务（若用户自行暴露）；
- `chat.deepseek.com` 与 DeepSeek 官方 API。

### 5.2 不受信任

- 任何第三方网站、图床、统计服务；
- 公开的 issue/PR 附件、网盘、聊天软件；
- 来源不明的 `deepseek_data-*.zip` 或 dsbridge JSON。

### 5.3 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 令牌泄漏 | 只在内存；不写 storage/日志/导出包；退出登录可作废旧令牌 |
| 导出包泄漏 | 默认只下载到本机；文档反复提示；不自动上传 |
| 恶意 zip 造成资源耗尽 | 只支持 store/deflate，拒绝 ZIP64；按需读取；仍建议只打开可信文件 |
| 恶意 JSON 造成解析崩溃 | 逐项 try/catch，坏会话隐藏并计数；不执行文件内容 |
| 路径穿越 | 插件不把 zip 条目解压到文件系统；v3 只写 `chat_sessions/<id>.json` 这类固定名称；附件 `export_path` 置 null |
| 官方路由变更 | 404 时提示启用官方导入器；失败批次保留并报告 |
| 重复导入 | 结果页提示；当前不做跨批次 source id 去重 |

## 6. 已执行的审计

- 全仓库检索 `userToken` / `Authorization`：只存在于文档、`content.js` 的读取逻辑、`shared/api.mjs` 的请求头拼接；无令牌字面量。
- 全仓库检索远程资源：扩展只访问 `chat.deepseek.com`；DSH 插件只调用同源路由。
- 扩展 HTML 无外链脚本/字体/图片（图标为本地 PNG/SVG）。
- 未引入第三方运行时依赖。

## 7. 使用建议

- 导出包默认落在系统下载目录；分享前先确认内容。
- 不要把完整官方导出包或含真实聊天记录的 JSON 上传到 issue、网盘或第三方服务。
- 如需彻底作废旧令牌：在 `chat.deepseek.com` 退出登录再登录。
- 本工具不修改 DeepSeek 服务器上的任何数据（扩展全部为 GET 只读接口）。
- 若把 DSH Web 暴露到局域网，请使用 DSH 自身的认证与可信网络；导入路由是 owner-only，但仍应避免公开暴露。

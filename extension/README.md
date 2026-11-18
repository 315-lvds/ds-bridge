# 深桥导出 / DeepSeek Bridge Export

把 chat.deepseek.com 的会话导出为可读 Markdown，以及可供「深桥导入」DSH 插件读取的线性 JSON。

## 版本与适配

- 当前扩展版本：`0.3.1`（`manifest.json`）。
- 导出格式：`dsbridge.export/v2`，配套「深桥导入」DSH 插件 `0.2.2`。
- 浏览器扩展与 DSH 插件独立：扩展不依赖 DSH 运行，只负责生成 Markdown/JSON；DSH 插件读取 JSON 后转换成原生会话。
- 版本与适配信息也显示在 popup 底部和工作台顶部。

## 安装（Edge / Chrome）

1. 打开扩展管理页：Edge 用 edge://extensions，Chrome 用 chrome://extensions。
2. 打开「开发人员模式」。
3. 点「加载解压缩的扩展」，选择本目录（包含 manifest.json 的那一层）。
4. 打开并登录 https://chat.deepseek.com，再点工具栏里的「深桥导出」。

## 使用

1. 在弹出窗口点「打开导出工作台」。
2. 左侧会话按最近更新时间分组：置顶 / 今天 / 昨天 / 7 天内 / 30 天内 / 30 天外；可按全部 / 置顶 / 未导出 / 有更新筛选，也可搜索标题或 ID。已导出和有更新的会话会带标签，组头可全选该组。
3. 勾选要导出的会话，选择 Markdown 选项与分支模式：
   - 仅当前链：每个会话一条当前对话链。
   - 全部分支：Markdown 导出完整消息树；勾选 JSON 时每条根→叶链一个 json/*.json 文件。总链数超过 30 会弹确认。
   - 自定义链：开始导出时打开拓扑选择器，为每个有分叉的会话选一条链。
4. 点「开始导出」，浏览器会下载 dsbridge-YYYYMMDD-HHmm.zip。

## 产物

- conversations/*.md：按选项渲染的可读 Markdown。
- export.json：当前链/自定义链模式的线性 JSON。
- json/*.json：全部分支模式每条链一个线性 JSON。
- manifest.json：选项、统计、JSON 清单、失败清单。
- README.md / index.md：说明与索引。

## 导入 DSH

把 zip 或解压出的 export.json / json/*.json 交给「深桥导入」DSH 插件，筛选并勾选后即可转换为 DSH 原生会话继续对话。

## 隐私

登录令牌只在扩展运行内存中使用，不写入 chrome.storage、不落盘、不打印、不进入导出包。扩展只访问 https://chat.deepseek.com/*，不加载远程脚本、字体或统计。导出包包含聊天记录，请自行保管。

## 图标

图标沿用「深桥导入」的蓝底三横线标记，并做左右镜像；源文件见 icons/icon.svg。

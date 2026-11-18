# 架构与数据流

本文说明两个组件的边界、输入输出、关键实现取舍，以及为什么 DSH 插件不直接写 `session.v4`。

## 1. 两个独立组件

```
chat.deepseek.com
        │  Bearer token（仅页面/扩展内存）
        ▼
浏览器扩展「深桥导出」
        │  Markdown + dsbridge JSON + zip
        ▼
本地文件系统
        │  用户选择文件
        ▼
DSH 插件「深桥导入」
        │  选中会话 → 官方 v3 zip（分批）
        ▼
本机 DSH 官方导入路由
        │  /api/deepseek-chat-import/archive
        ▼
DSH 原生会话（可继续对话）
```

- 两个组件**不直接通信**，唯一契约是导出文件。
- 浏览器扩展负责“从 DeepSeek 网页取数、渲染、打包”。
- DSH 插件负责“选择、筛选、转换、调用本机官方导入器”。
- 不提供 CLI；`cli/`、`bin/` 是早期实验，不进入发布范围。

## 2. 浏览器扩展

### 2.1 运行位置与权限

| 文件/层 | 作用 |
| --- | --- |
| `content.js` | 在 `chat.deepseek.com` 页面内读取 `localStorage.userToken`，响应扩展消息 |
| `background.js` | 内存中转发令牌；打开工作台；保存上次导出统计 |
| `popup.html/js` | 登录状态、打开工作台、快捷导出 |
| `workbench.html/js` | 会话列表、筛选、分支选择、导出选项、进度 |
| `shared/api.mjs` | 分页拉会话、拉整棵消息树、回溯 active 链 |
| `shared/markdown.mjs` | 可配置 Markdown 渲染 |
| `shared/json.mjs` | 线性 JSON v2、分支链枚举、校验 |
| `shared/zip.mjs` | 零依赖 store ZIP + CRC32 |

`manifest.json` 只申请：

- `permissions: ["storage", "downloads"]`；
- `host_permissions: ["https://chat.deepseek.com/*"]`；
- content script 只匹配 `https://chat.deepseek.com/*`。

没有 `tabs`、`webRequest`、`cookies`、`scripting` 权限，也没有远程脚本、字体、CDN 或统计。

### 2.2 导出流程

1. 工作台通过 `background.js` 向已登录的 DeepSeek 标签页取令牌，只保存在内存。
2. `fetchAllSessions()` 按 `updated_at` 游标翻页，每页 100 条，按 id 去重。
3. 用户勾选会话后，`fetchHistory()` 拉取该会话的整棵消息树。
4. 按分支模式生成 Markdown 与/或 JSON。
5. 在内存中构建 zip，通过 `chrome.downloads` 下载到本机。

单会话失败不会中断整体；manifest 记录失败清单。

### 2.3 分支模式

DeepSeek 的 `history_messages` 一次性返回整棵树；`current_message_id` 沿 `parent_id` 回溯得到当前采用链。

| 模式 | Markdown | JSON |
| --- | --- | --- |
| 仅当前链 `active` | 当前链 | 一个 `export.json`，每个源会话一条线性 conversation |
| 全部分支 `all` | 完整消息树，未采用变体折叠并标注 | 每条根→叶链一个 `json/*.json`，每个文件恰好一条 conversation |
| 自定义链 `custom` | 用户为每个分叉会话选择的链 | 一个 `export.json`，每条选中链一条 conversation |

全部分支模式下链数可能很大，工作台在超过 30 条链时要求二次确认，并提示可只导出 Markdown 或当前链。

### 2.4 Markdown 选项

预设：`readable`（可读，默认）、`clean`（纯净）、`faithful`（保真）。可单独控制：

- 思考过程：折叠 / 展开 / 关闭；
- 时间戳：front matter / 每条消息 / 关闭；
- HTML 注释：`<!-- ds:message id=… parent=… role=… ts=… -->`；
- YAML front matter；
- 附件占位（文件名与大小，不含字节）；
- 搜索/引用提示行。

Markdown 是给人读的；需要机器读取时使用 JSON。

### 2.5 dsbridge JSON v2

```json
{
  "schema": "dsbridge.export/v2",
  "exported_at": "2026-11-18T05:00:00.000Z",
  "generator": "dsbridge-extension/0.3.1",
  "source": { "site": "https://chat.deepseek.com" },
  "branch_mode": "active",
  "options": { "include_reasoning": true, "include_attachments": true, "preset": "readable" },
  "conversations": [
    {
      "id": "source-session-id",
      "source_id": "source-session-id",
      "source_title": "原始标题",
      "title": "导出标题",
      "model_type": "deepseek-reasoner",
      "created_at": "2026-11-01T02:03:04.000Z",
      "updated_at": "2026-11-18T03:02:01.000Z",
      "branch": { "index": 2, "total": 7, "turns": 168, "leaf_message_id": 485, "is_current": true, "path": [1, 2, 1] },
      "chain": { "leaf_message_id": 485, "message_ids": [1, 2, 3, 485] },
      "messages": [
        { "id": 1, "role": "user", "text": "问题", "created_at": "2026-11-01T02:03:04.000Z" },
        { "id": 2, "role": "assistant", "text": "回答", "reasoning": [{ "text": "思考", "elapsed_secs": 3.2 }] }
      ]
    }
  ]
}
```

约束：

- 线性消息，不允许 `parent_id` / `parent`；
- `branch_mode=all` 的每个文档 `conversations` 必须恰好 1 条；
- `active` 模式不允许 `branch` 字段；`all` / `custom` 模式必须带 `branch`；
- 消息 `role` 只允许 `user` / `assistant`；
- 附件只保留 `{name, size, is_image}` 元数据。

## 3. DSH 插件

### 3.1 为什么是客户端 bundle

DSH 的浏览器 UI 没有直接文件系统权限；官方导入器通过 owner-only 的 HTTP 路由接收 zip，由 Host 写入会话。

本插件的 `lib/index.js` 的 Host `apply()` 是空实现；真正的 UI 和解析在 `lib/client.js`，通过 `window.__ModuleLoader__` 注册：

- 侧栏动作：`sidebar.session.action`；
- 弹窗：`Modal`、`Button`、`Input`、`Checkbox`、`SegmentedControl`（DSH ui-primitives）；
- 工作区：`renderFactorySlot("workspace.picker", …)`；
- 依赖 DSH 官方实验性插件 **DeepSeek 会话导入** 的上传路由。

### 3.2 输入

支持：

- 深桥 `export.json` / 单链 `json/*.json`（v1/v2）；
- 深桥导出的 zip（扫描其中的 JSON）；
- 官方 `deepseek_data-*.zip`；
- 官方单会话 `chat_sessions/<id>.json`。

一个文件可以含多个会话；列表中的一行通常对应一条链（深桥）或一个会话的当前链（官方）。

### 3.3 官方 zip 的懒加载

官方包可能数百 MiB，不能整包读入内存。实现：

1. 用 `Blob.slice` 读文件尾部，定位 EOCD；
2. 只读中央目录，建立条目名 → 偏移/压缩方式/大小的索引；
3. 读 `chat_session_index.json` 得到全部会话元数据；
4. 以 4 并发读取每个 `chat_sessions/<id>.json`，按 `current_message_id` 回溯当前链，记录精确的 `user_turns` / `has_reasoning`；
5. 只保留元数据，不保留正文；导入时重新读取选中的会话文件。

支持 store 与 deflate（`DecompressionStream("deflate-raw")`），不支持 ZIP64。

### 3.4 转换为官方 v3 zip

选中项被转换为官方 v3 结构：

```
manifest.json                  {"export_format_version":3,...}
chat_session_index.json        [{id,inserted_at,updated_at}]
chat_sessions/<id>.json        {id,title,current_message_id,inserted_at,messages}
```

消息被重编号为连续整数，`parent_id` 指向前一条，`current_message_id` 指向最后一条；

- 深桥消息：`reasoning` → `THINK`，`text` → `REQUEST` / `RESPONSE`，附件 → `FILE`（`export_path: null`）；
- 官方消息：保留 `fragments` 的类型与内容，`FILE.export_path` 置 null（避免引用不存在的文件）；
- 标题按 UTF-8 截断到 80 字节，满足官方限制；
- 生成器标识 `dsbridge-dsh-plugin/0.2.2`。

### 3.5 分批上传

官方导入器单次最多 1000 个会话（`maxSessions=1000`），且请求体、条目有大小限制。插件：

- 每批最多 **1000 个会话**；
- 每批源数据估算不超过 **320 MiB**（低于服务端 512 MiB 请求体上限）；
- 顺序构建并 POST 到 `api/deepseek-chat-import/archive?workspaceId=…`；
- 解析 NDJSON 的 `progress` / `outcome`；
- 首批失败直接报错；后续批次失败保留已完成批次并在结果中提示；
- 单会话构建失败记录到失败列表，不静默跳过。

导入成功后刷新 DSH 会话列表。

### 3.6 选择与确认

- 默认不勾选任何会话；
- 搜索标题/ID/文件名、最少用户轮次、更新时间范围、是否含思考、排序；
- 选择超过 50 个时，用 DSH 原生 Modal 二次确认；
- 列表每次渲染 250 行，可“显示更多”；
- 结果面板显示成功数、跳过数、失败数、分批数。

## 4. 为什么不自研 v4 写入

DSH `session.v4.jsonl.zstd` 是 DSH 内部持久化格式，包含：

- 多帧 zstd 连接；
- 严格的 `seq` / `time` 单调与 turn/step 生命周期校验；
- surface 事件、request/context、tool 事件等；
- 会话索引与项目缓存的额外登记。

官方导入器已经实现“v3 zip → v4 会话”的完整写入、校验、续聊支持。重写它需要跟随 DSH 内部 schema 演进，风险远大于收益。

因此本插件只负责“选择 + v3 组装 + 分批调用官方路由”，代价是：

- 必须启用官方实验性导入器；
- 官方路由变更时插件需要跟进；
- 不支持跨批次去重（重复导入会生成新会话）。

## 5. 安全边界

- 登录令牌只在 `chat.deepseek.com` 页面与扩展内存之间流转；不写 `chrome.storage`、不落盘、不打印、不进导出包。
- 浏览器扩展只访问 `https://chat.deepseek.com/*`。
- DSH 插件只把选中会话的 v3 zip POST 到当前 DSH 页面的同源本机路由；不访问外部网络。
- 解析在浏览器内存完成；官方 zip 不整包驻留；选中会话才重新读取。
- 导出文件包含聊天隐私，默认下载到本机；用户需自行保管。

详见 [SECURITY.md](SECURITY.md)。

## 6. 已知限制

- 非官方 Web API，可能随 DeepSeek 前端发版变化；
- 附件字节不导出：扩展只保留附件占位/元数据，官方导出中的非图片附件也只有元数据；
- 官方 zip 只导入 `current_message_id` 当前链，历史分支不会进入 DSH；需要分支时用扩展的全部分支 JSON；
- 超过 1000 个会话依赖多次上传；中间批次失败会保留已完成部分；
- 不支持 ZIP64、加密 zip、除 store/deflate 外的压缩方式；
- DSH 插件依赖官方导入器，禁用时返回 404 并提示启用；
- 重复导入同一文件会产生重复会话（当前不做跨批次 source id 去重）。

## 7. 验证方式

```bash
node --test tests/session-groups.test.mjs tests/zip.test.mjs
node --check extension/workbench.js
node --check dsh-plugin/lib/client.js
python tools/package-extension.py --out dist
```

DSH 插件的官方 zip 解析与 v3 构建另有本地烟测（合成 zip + 真实官方包），不在公开测试中携带任何真实聊天数据。

# chat.deepseek.com Web 接口笔记

> 实测时间：2026-11-18。这里只记录已经验证的行为；接口是 Web 内部 API，随时可能变化。

## 1. 认证

- 登录态来自页面 `localStorage.userToken`，其值为 JSON 字符串 `{"value":"<token>"}`。
- 请求头：`Authorization: Bearer <token>`。
- 令牌只在页面/扩展内存中使用；不写磁盘、不写日志、不进入导出物。
- `GET /api/v0/users/current` 可验证登录态，返回用户信息；本项目不保存该响应的个人字段。

## 2. 会话列表

```http
GET /api/v0/chat_session/fetch_page?lte_cursor.pinned=false
GET /api/v0/chat_session/fetch_page?lte_cursor.pinned=false&lte_cursor.updated_at=<float-seconds>
```

- 只接受 GET；POST 返回 405。
- 每页 100 条；`lte_cursor.updated_at` 取上一页最后一条的 `updated_at`（Unix 秒，浮点）。
- 游标是 `lte`，页边界会重复最后一条 → 客户端必须按 `id` 去重。
- 响应：`data.biz_data = { chat_sessions: [...], has_more: bool }`。
- 会话字段：`id, title, title_type, model_type, pinned, updated_at`。没有创建时间、消息数或轮次。

工作台按 `updated_at` 在本地分组：置顶 / 今天 / 昨天 / 7 天内 / 30 天内 / 30 天外。

## 3. 单会话消息树

```http
GET /api/v0/chat/history_messages?chat_session_id=<session-id>
```

- 一次返回整棵消息树，没有分页。
- 响应：`data.biz_data = { chat_session, chat_messages, cache_control, cache_reset_at }`。
- `chat_session` 关键字段：`id, title, model_type, pinned, updated_at, current_message_id, inserted_at`。
- `chat_message` 关键字段：`message_id, parent_id, model, role, thinking_enabled, status, incomplete_message, inserted_at, search_enabled, fragments[]`。

### 3.1 树与分支

- 同一 `parent_id` 可以有多个子消息，对应“重新生成”的兄弟分支。
- 当前链 = 从 `current_message_id` 沿 `parent_id` 回溯到根，再反转。
- `message_id` 可能有缺口；`parent_id` 可能悬空。解析时把悬空 parent 当作根，不能假设 id 连续或树完整。

### 3.2 fragment 类型

| type | 含义 | 关键字段 |
| --- | --- | --- |
| `REQUEST` | 用户输入 | `content` |
| `RESPONSE` | 助手正文 | `content, references[], stage_id` |
| `THINK` | 思考过程 | `content, elapsed_secs, references[], stage_id` |
| `TIP` | 平台提示 | `content, style, hide_on_wip` |
| `FILE` | 附件 | `files[]: {id,status,file_name,file_size,is_image,signed_path,...}` |
| `TOOL_SEARCH` | 联网搜索 | `status, content, queries[], results[]` |
| `TOOL_OPEN` | 打开网页 | 同上，字段随版本变化 |

Markdown 渲染默认忽略 `TIP`；保真预设可保留。

## 4. 附件

- `FILE.files[].signed_path` 形如 `/file?file_id=…&state=…`；在页面上下文 fetch 往往返回 SPA 的 HTML 外壳，拿不到文件字节。
- 本项目不追附件字节：Markdown 写占位，JSON 保留文件名/大小/是否图片。
- DeepSeek 官方导出会包含图片原文件；非图片附件仍只有元数据。

## 5. 限流与容错

- 未探测到明确的限流响应头；仍按保守策略：并发 ≤ 3，失败退避，单会话失败不中断整体。
- 导出大量会话时，扩展只请求用户勾选的会话；官方全量导出由 DeepSeek 服务端生成，不走这些请求。
- 建议在会话列表导出前先按更新时间/轮次筛选，避免无意义的大量请求。

## 6. 风险

- 私有接口可能随前端发版变更；字段缺失时应降级而不是崩溃。
- `signed_path` 可能过期；不要把它写进长期存档。
- 消息树可能不完整；线性化时要把悬空 parent 当作根。
- 不要把令牌、Cookie 或完整响应写进 issue。

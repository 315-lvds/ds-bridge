# DeepSeek 官方导出 zip（v3）

> 格式来自 chat.deepseek.com 的官方数据导出；DeepSeek 可能随时调整。本文只描述本项目兼容的部分。

## 1. 目录结构

```
deepseek_data-YYYY-MM-DD.zip
├─ manifest.json
├─ user.json
├─ chat_session_index.json
└─ chat_sessions/
   ├─ <session-id>.json
   └─ <session-id>_files/
      └─ <image files>
```

zip 可能使用 store 或 deflate；本项目支持这两种方式，不支持 ZIP64、加密 zip 或其他压缩方式。

## 2. manifest.json

至少包含：

```json
{ "export_format_version": 3 }
```

官方导入器要求它是 zip 的首个条目；本项目的 v3 构建会把它放在第一位。

## 3. chat_session_index.json

数组，每项至少包含：

```json
{
  "id": "<session-id>",
  "title": "会话标题",
  "pinned": false,
  "message_count": 42,
  "inserted_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-11-18T00:00:00Z"
}
```

官方导入器只依赖 `id, inserted_at, updated_at`；本项目还用 `title` / `message_count` 做列表展示。

精确的用户轮次和“是否含思考”需要解析 `chat_sessions/<id>.json`；插件会在扫描阶段以 4 并发解析全部会话，只保留统计元数据。

## 4. chat_sessions/<id>.json

```json
{
  "id": "<session-id>",
  "title": "会话标题",
  "current_message_id": 485,
  "inserted_at": "2026-01-01T00:00:00Z",
  "messages": [
    {
      "id": 1,
      "parent_id": null,
      "role": "USER",
      "status": "FINISHED",
      "inserted_at": "2026-01-01T00:00:01Z",
      "fragments": [{ "type": "REQUEST", "content": "..." }]
    }
  ]
}
```

- 消息 `id` 是数字（可能有历史缺口）。
- `parent_id` 可空；可能指向已不存在的消息。
- `role` 为 `USER` / `ASSISTANT`。
- `status` 常见 `FINISHED`；非 FINISHED 在导入时以 error 结束。
- `fragments` 的类型与 Web 接口类似：`REQUEST`、`RESPONSE`、`THINK`、`CONTENT_RISK`、`TOOL_SEARCH`、`TOOL_OPEN`、`READ_LINK`、`FILE` 等。

## 5. 分支

官方导出保留整棵消息树（同一 parent 可有多个子消息），但 DSH 官方导入器只取“当前链”：

1. 若 `current_message_id` 存在，从它开始；
2. 否则取最大数字 id；
3. 沿 `parent_id` 回溯，反转。

非当前分支不会进入 DSH。需要保留分支时，使用「深桥导出」的全部分支模式，每条根→叶链一个 JSON，再分别导入。

## 6. 附件

- 图片：位于 `chat_sessions/<id>_files/`，`FILE.files[].export_path` 指向 zip 内路径。
- 非图片附件：通常只有 `file_name`、`file_size`，`export_path` 为 null，没有字节。
- 本项目的 v3 构建不引用原 zip 内的图片：把所有 `export_path` 置 null，避免 DSH 写入时找不到文件；附件以无字节的文件卡片形式保留。

## 7. 限制

| 限制 | 值 |
| --- | --- |
| 单次导入会话数 | 1000 |
| 请求体 | 512 MiB |
| 单个 zip 条目 | 256 MiB |
| 标题 | 80 UTF-8 字节 |

官方 zip 是导出时点的快照；生成期间的新消息不会包含。导出包包含隐私，请仅在可信设备保存。

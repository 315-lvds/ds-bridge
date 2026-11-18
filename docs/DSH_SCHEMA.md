# DSH `session.v4` 结构（背景）

> 本文是 DSH 会话持久化的参考笔记，**不是公开稳定 API**。本项目的 DSH 插件不直接写 v4，而是把选中会话组装成官方 v3 zip，交给 DSH 自带的 DeepSeek 会话导入器写入。

## 1. 文件形态

典型路径：

```
%USERPROFILE%/.dsh/sessions/--<normalized-cwd>--/<session-id>/session.v4.jsonl.zstd
```

- 一个会话目录通常只有 `session.v4.jsonl.zstd`。
- 文件是**多帧 zstd 连接**，不是单个 zstd 流。
- Node 的 `zlib.zstdDecompressSync` 默认只解第一帧，会静默截断；必须按 RFC 8878 逐帧切分后再解压。
- 仓库内的 `tools/decode-session.mjs` 提供了 `decodeAll()` 与命令行示例，需要 Node 22+。

## 2. 记录外壳

每行一个 JSON：

```json
{ "type": "user/message", "seq": 12, "time": 1792065534245, "data": { }, "surfaceOp": "append" }
```

- `seq`：会话内单调递增的事件序号。
- `time`：Unix 毫秒。
- `surfaceOp`：对可见对话面的操作（如 `append`）；不是所有记录都有。

## 3. 常见记录类型

| type | 作用 |
| --- | --- |
| `session` | 头部：`id, version=4, createdAt, cwd, parentSession, origin, delegationDepth, agentPreset, isSeeded` |
| `subagent/descriptor` | 子代理元信息 |
| `sandbox/mode`, `approval/policy`, `permission/preset` | 会话级设置 |
| `system/message` | 系统提示 |
| `user/message` | 用户消息 |
| `assistant/message` | 助手消息，可含 reasoning / text / tool-call |
| `tool/call`, `tool/result` | 工具调用与结果 |
| `tool/ptc-dispatch-start`, `tool/ptc-dispatch` | PTC 内部派发日志 |
| `step/start`, `step/end`, `turn/start`, `turn/end` | 轮次结构 |
| `request/header`, `request/context` | 请求侧上下文快照 |
| `session/title` | 会话标题 |
| `session-log-deepseek/delivery-accepted` | 模型投递确认 |

## 4. 关键 payload

### 4.1 user/message

```json
{
  "type": "user/message",
  "surfaceOp": "append",
  "data": {
    "role": "user",
    "id": "<uuid>",
    "content": [{ "type": "text", "text": "..." }],
    "source": { "kind": "user" }
  }
}
```

### 4.2 assistant/message

```json
{
  "type": "assistant/message",
  "surfaceOp": "append",
  "data": {
    "turn": 1,
    "step": 1,
    "message": {
      "role": "assistant",
      "content": [
        { "type": "reasoning", "text": "..." },
        { "type": "text", "text": "..." },
        { "type": "tool-call", "id": "call_...", "name": "run_code", "arguments": "<json string>" }
      ],
      "source": { "kind": "model" }
    }
  }
}
```

## 5. 校验点

DSH 加载会话时至少会检查：

- `session` 头部的 `version`、`id`、`createdAt`、`isSeeded`、`delegationDepth`；
- `seq` 连续/唯一，`time` 合理；
- surface 事件带 `surfaceOp`；
- assistant/message 不带 `sourceEventSeqs`；
- turn/step 生命周期完整（`turn/start` 与 `turn/end`、`step/start` 与 `step/end`）；
- 工具调用/结果配对。

这些约束会随 DSH 版本演进。直接手写 v4 很容易在升级后损坏会话。

## 6. 官方导入器的转换规则

DSH 官方实验性插件（`deepseek-chat-import`）接收 v3 zip，并执行：

- 从 `current_message_id` 沿 `parent_id` 回溯当前链；缺失时取最大数字 id；
- `USER` / `ASSISTANT` 转成 turn/step；
- `THINK` → reasoning；
- `RESPONSE` → text；
- `TOOL_SEARCH` / `TOOL_OPEN` → 工具事件；
- 非 `FINISHED` 状态以 error 结束；
- provider/model 使用 `deepseek-chat-export`；
- 第一个 turn 写入受保护的空 system/message。

本插件复用这套写入逻辑，只负责构造 v3 输入。

## 7. 官方导入器的限制

| 限制 | 值 |
| --- | --- |
| 单次会话数 | 1000 |
| 请求体 | 512 MiB |
| 单个 zip 条目 | 256 MiB |
| 标题 | 80 UTF-8 字节 |

因此插件按最多 50 个会话/批、约 64 MiB/批上传；单批失败会保留已完成批次。

## 8. 工具

```bash
node tools/decode-session.mjs "<path-to-session.v4.jsonl.zstd>"
```

输出帧数、解压字节数、记录类型分布与前两条样本。样本可能包含聊天内容，请勿把输出贴到公开 issue。

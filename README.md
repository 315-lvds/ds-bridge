<p align="center">
  <img src="extension/icons/icon128.png" width="80" height="80" alt="DeepSeek Bridge icon">
</p>

<h1 align="center">深桥 · DeepSeek Bridge</h1>

<p align="center">把 DeepSeek 网页会话导出为可读 Markdown / 线性 JSON，并把选中的会话导入 DSH 继续对话。</p>

<p align="center">
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white" alt="powered by dsh" width="121" height="20" /></a>
</p>

<p align="center">
  <code>Browser Extension 0.3.1</code> · <code>DSH Plugin 0.2.2</code> · <code>MIT</code>
</p>

> 本项目不是 DeepSeek 官方产品。它使用 chat.deepseek.com 的 Web 内部接口和 DSH 的实验性导入器，接口变化可能导致功能失效。

## 为什么做这个

DeepSeek 官方已经支持导出全部数据，DSH 也自带实验性导入器。但在实际使用中还有三个缺口：

1. **官方导出是全量包**：不能只导出几个会话，JSON 也不适合直接阅读；
2. **官方导入器只能选一个 zip，且单次最多 1000 个会话**：不能按标题/轮次筛选，也不能逐条勾选；
3. **分支处理不透明**：官方导入器只取当前链，网页里的重新生成分支会被丢弃。

深桥把流程拆成两个独立插件：

| 组件 | 作用 |
| --- | --- |
| **深桥导出**（Chromium 扩展） | 按会话勾选，导出可读 Markdown、线性 JSON 或 zip；支持当前链/全部分支/自定义链 |
| **深桥导入**（DSH 插件） | 读取深桥 JSON/zip 或官方 `deepseek_data-*.zip`，筛选、勾选、选工作区，分批写入 DSH |

两者不直接通信；导出文件就是契约。

## 功能

### 深桥导出

- 会话列表按 **置顶 / 今天 / 昨天 / 7 天内 / 30 天内 / 30 天外** 分组，和 DeepSeek 侧边栏的习惯一致。
- 筛选：全部 / 置顶 / 未导出 / 有更新；支持标题、ID 搜索。
- 组头全选；已导出、有更新标签；显示已选和当前筛选数量。
- Markdown 预设：可读 / 纯净 / 保真；可单独控制思考过程、时间戳、HTML 注释、front matter、附件占位、提示行。
- 分支模式：
  - 仅当前链：每个会话一条当前对话；
  - 全部分支：Markdown 导出完整消息树；JSON 每条根→叶链一个文件；
  - 自定义链：为每个有分叉的会话选择一条链。
- 超过 30 条链时二次确认，避免一次生成过多 JSON。
- 产物：`conversations/*.md`、`export.json` 或 `json/*.json`、`manifest.json`、`README.md`、`index.md`。
- 登录令牌只在扩展运行内存中使用；不写 `chrome.storage`、不落盘、不打印、不进入导出包。

### 深桥导入

- 支持深桥 v1/v2 JSON、深桥导出的 zip、官方 `deepseek_data-*.zip`、官方单会话 JSON。
- 官方 zip 不整包读入：只读中央目录和 index，按需读取选中会话；支持数百 MiB 的包。
- 筛选：标题/ID/文件名搜索、最少用户轮次、更新时间（不限/3/7/14/30 天/自定义）、是否含思考、排序。
- 默认不勾选；超过 50 个会话用 DSH 原生 Modal 二次确认。
- 工作区使用 DSH 的 workspace picker，不再用原生下拉框。
- 每 1000 个会话/约 320 MiB 一批，顺序上传；超过官方单次 1000 上限时自动分批。
- 单会话构建失败、批次中途失败、服务端跳过都会在结果里显示；不会静默少导。

## 快速开始

### 1. 安装浏览器扩展

要求：Chrome / Edge 等 Chromium 浏览器，支持 Manifest V3。

1. 克隆或下载本仓库；
2. 打开 `edge://extensions` 或 `chrome://extensions`；
3. 打开「开发人员模式」；
4. 点「加载解压缩的扩展」，选择仓库里的 **`extension/`** 目录（包含 `manifest.json` 的那一层）；
5. 打开并登录 <https://chat.deepseek.com>，点工具栏里的「深桥导出」。

扩展没有构建步骤，改完源码后在扩展管理页点「重新加载」即可。

### 2. 安装 DSH 插件

要求：DSH 桌面端 0.2.2-rc.5 或更高版本，且包含实验性插件 **DeepSeek 会话导入** 与 client bundle 支持。

1. 克隆本仓库：

   ```bash
   git clone https://github.com/315-lvds/ds-bridge.git
   ```

2. 在 DSH 的 **Plugins → Add plugin** 中选择 `ds-bridge/dsh-plugin` 目录；

   或在 DSH CLI 中（按你的 DSH 版本，profile 名称可能不同）：

   ```bash
   dsh plugin --profile desktop add /absolute/path/to/ds-bridge/dsh-plugin
   ```

3. 重启 DSH 桌面端，或在插件页刷新；
4. 在 DSH 的实验性插件中启用 **DeepSeek 会话导入**（本插件复用它的本机上传路由）；
5. 侧栏「新建会话」旁会出现「导入 DeepSeek 会话」按钮。

> **重要依赖**：深桥导入不直接写 DSH 的 `session.v4`。它把选中会话组装成官方 v3 zip，再 POST 到本机 DSH 已有的 `/api/deepseek-chat-import/archive` 路由。若官方导入器未启用，会返回 404，并在插件里提示启用。

### 3. 使用

**导出：** 打开工作台 → 按分组/筛选找到会话 → 勾选 → 选 Markdown 选项和分支模式 → 开始导出。下载的 zip 里包含 Markdown 与/或 JSON。

**导入：** 点侧栏「导入 DeepSeek 会话」→ 拖入深桥 zip/JSON 或官方 `deepseek_data-*.zip` → 按轮次/时间/思考筛选 → 勾选 → 选择工作区 → 开始导入。导入完成后，DSH 会话列表会出现对应会话，可直接继续对话。

## 分支与格式

DeepSeek 的 `history_messages` 一次返回整棵消息树；当前链由 `current_message_id` 沿 `parent_id` 回溯得到。

| 场景 | 行为 |
| --- | --- |
| 扩展：仅当前链 | 每个会话一条线性 JSON；Markdown 只含当前链 |
| 扩展：全部分支 | Markdown 含完整树；JSON 每条根→叶链一个文件，单文件恰好一条 conversation |
| 扩展：自定义链 | 每个分叉会话选一条链，写入一个 `export.json` |
| 官方 zip → DSH | 只取 `current_message_id` 当前链；其他分支不进入 DSH |
| 深桥 JSON → DSH | 按 JSON 里的线性顺序导入；每条链成为独立 DSH 会话 |

dsbridge JSON 顶层：

```json
{
  "schema": "dsbridge.export/v2",
  "branch_mode": "active",
  "conversations": [
    { "id": "…", "title": "…", "messages": [ { "role": "user", "text": "…" } ] }
  ]
}
```

线性消息不带 `parent_id`；`branch_mode=all` 时每个文件必须恰好一条 conversation，并带 `branch` 元数据。完整字段见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 数据流

```
chat.deepseek.com
      │  Bearer token（页面/扩展内存）
      ▼
深桥导出扩展  ──→  本地 zip（Markdown / JSON）
                        │
                        ▼
深桥导入 DSH 插件  ──→  官方 v3 zip（每批 ≤1000 会话）
                        │  同源 POST
                        ▼
本机 DSH 官方导入器  ──→  DSH 原生会话（可续聊）
```

- 扩展只访问 `https://chat.deepseek.com/*`，没有远程脚本、字体、统计或遥测。
- DSH 插件只访问当前 DSH 页面的同源本机路由，不访问外部网络。
- 令牌不写 `chrome.storage`、不落盘、不进入导出文件。
- 导出包包含完整聊天记录；请只在可信设备保存。

详见 [SECURITY.md](SECURITY.md) 与 [docs/SECURITY.md](docs/SECURITY.md)。

## 兼容性与已知限制

- **非官方 Web API**：DeepSeek 前端发版可能改变字段、分页或分支语义。
- **附件字节不导出**：Markdown/JSON 只保留文件名、大小、是否图片；官方导出中的非图片附件也只有元数据。
- **官方 zip 只导入当前链**：需要保留历史分支时，先用扩展的「全部分支」导出为多个 JSON，再分别导入。
- **超过 1000 个会话**：按 1000 个/批上传；中途失败会保留已完成批次。
- **重复导入**：当前不做跨批次 source id 去重，同一文件导入两次会产生两个 DSH 会话。
- **依赖官方导入器**：禁用实验性 DeepSeek 会话导入时，本插件无法写入。
- **不支持 ZIP64 / 加密 zip**；只支持 store 与 deflate。
- **浏览器范围**：Chromium 系（Chrome/Edge）；未适配 Firefox。
- **DSH 版本**：需要支持 client bundle 与 `workspace.picker` 的桌面端；旧版可能无法加载 UI。

## 开发与测试

无构建步骤，无运行时第三方依赖。

```bash
# 单元测试（分组 + ZIP 写入）
node --test tests/session-groups.test.mjs tests/zip.test.mjs

# 语法检查
node --check extension/workbench.js
node --check dsh-plugin/lib/client.js

# 打包浏览器扩展（输出到 dist/，也可 --out 指定目录）
python tools/package-extension.py --out dist

# 解码 DSH 多帧 zstd 会话（Node 22+，仅用于调试，输出可能含聊天内容）
node tools/decode-session.mjs "<path-to-session.v4.jsonl.zstd>"
```

DSH 插件的官方 zip 解析、分支回溯与 v3 构建使用合成样本 + 真实官方包做过本地烟测；公开仓库不包含任何真实聊天数据。

## 目录结构

```
ds-bridge/
├─ extension/                 Chromium MV3 扩展
│  ├─ manifest.json
│  ├─ content.js / background.js
│  ├─ popup.* / workbench.*
│  ├─ shared/                 api / markdown / json / zip / session-groups
│  └─ icons/
├─ dsh-plugin/                DSH 客户端插件
│  ├─ package.json
│  ├─ cordis.patch.yml
│  ├─ lib/index.js             Host 空实现
│  ├─ lib/client.js            UI、zip 解析、v3 构建、分批上传
│  └─ locale/
├─ docs/                      架构、接口、格式、安全
├─ tests/                     Node 单元测试
├─ tools/                     打包与解码工具
├─ README.md
├─ SECURITY.md
├─ CONTRIBUTING.md
└─ LICENSE
```

## 文档

- [架构与数据流](docs/ARCHITECTURE.md)
- [DeepSeek Web 接口笔记](docs/API_NOTES.md)
- [DSH session.v4 背景](docs/DSH_SCHEMA.md)
- [官方导出 v3 格式](docs/OFFICIAL_EXPORT_FORMAT.md)
- [安全与隐私](docs/SECURITY.md)

## 开发说明

本项目在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中开发，并使用 **DeepSeek V4 Flash** 辅助编写代码、测试和文档。需求、交互设计、安全边界、验收与发布由维护者负责。二者是开发工具，不是本项目的运行时依赖：浏览器扩展只与 chat.deepseek.com 通信，DSH 插件只与本机 DSH 路由通信；扩展和插件本身不调用第三方 AI 服务。

AI 参与生成，但不替代验收：导出/导入逻辑都有单元测试或本地烟测，已知限制与未验证范围如实列在上文，欢迎按 [CONTRIBUTING.md](CONTRIBUTING.md) 提交可复现的 issue。

**English:** This project is developed in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with **DeepSeek V4 Flash** assisting code, tests, and documentation. The maintainer owns requirements, design, security boundaries, review, and releases. These are development tools, not runtime dependencies; the extension talks only to chat.deepseek.com, and the DSH plugin only to the local DSH route.

## English summary

DeepSeek Bridge is two independent tools:

- **DeepSeek Bridge Export** (Chromium MV3 extension): pick DeepSeek chats, export readable Markdown and linear JSON. Supports current chain, all branches, or a custom branch per chat. Tokens stay in memory; no telemetry.
- **DeepSeek Bridge Import** (DSH plugin): read dsbridge JSON/ZIP or an official `deepseek_data-*.zip`, filter and select chats, choose a DSH workspace, and import them as native DSH sessions. Batches more than 1000 sessions through the official local importer route.

It is unofficial and not affiliated with DeepSeek. The Web API, official export format, and DSH importer may change. Exported files contain private chat data; keep them on trusted devices.

## License

MIT © 2026 DsBridge contributors. See [LICENSE](LICENSE).

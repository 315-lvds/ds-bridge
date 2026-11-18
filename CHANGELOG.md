# Changelog

版本号分别对应两个独立组件：浏览器扩展从 `0.3.0` 开始（当前 `0.3.1`），DSH 插件从 `0.2.2` 开始。

## License — 2026-11-18

- 项目许可证从 MIT 切换为 Apache License 2.0；根目录、扩展和 DSH 插件目录均补充 `LICENSE` 与 `NOTICE`，贡献条款同步更新。

## Docs — 2026-11-18

- README 标题下加入官方 `powered by dsh` 徽章；在英文简介前补充 DeepSeek Harness + DeepSeek V4 Flash 的 AI 辅助开发说明。
- 扩展与 DSH 插件 README 同步补充开发说明。

## DSH plugin 0.2.2 — 2026-11-18

- 修复 DSH 0.2.2-rc.5 插件详情页的「插件声明的详细介绍文件无效」：不再把长描述放在 `meta.detail`，改用 README 回退。
- 补充版本、适配、依赖、导入规则和隐私说明；`meta.description` 同步更新。
- `package.json` 增加 `engines.dsh` 与 `./icon` export。
- 生成器标识升级为 `dsbridge-dsh-plugin/0.2.2`。

## Browser extension 0.3.1 — 2026-11-18

- popup 底部和工作台顶部显示扩展版本、导出格式 `dsbridge.export/v2` 与配套 DSH 插件 `0.2.2`。
- 扩展版本号与 JSON 生成器标识升级为 `0.3.1`。

## Browser extension 0.3.0 — 2026-11-18

- 会话列表按「置顶 / 今天 / 昨天 / 7 天内 / 30 天内 / 30 天外」分组。
- 新增「全部 / 置顶 / 未导出 / 有更新」筛选、搜索、组头全选、已导出/有更新标签。
- 新图标：蓝底三横线，中条右对齐，与「深桥导入」图标互为镜像。
- 工作台底部固定「隐私与安全」提示，明确登录令牌只在本扩展运行内存中使用。
- popup 重做；修复上次导出统计的 storage key 不一致。
- 发布脚本改为读取 manifest 版本并输出 SHA-256。

## DSH plugin 0.2.1 — 2026-11-18

- 超大批量选择与导入改用 DSH 原生 Modal 二次确认，不再弹 Windows 原生对话框。
- 更新时间筛选改为「不限 / 3 / 7 / 14 / 30 天 / 自定义」。
- 单会话构建失败会在结果中报告，不再静默少导。

## DSH plugin 0.2.0 — 2026-11-18

- 支持 DeepSeek 官方 `deepseek_data-*.zip`：读取 index，按 `current_message_id` 取当前链。
- 官方 zip 按需懒加载单个会话，避免整包驻留内存。
- 支持 dsbridge v1/v2 JSON、深桥 zip、官方单会话 JSON。
- 按 1000 会话/320 MiB 分批上传，绕过官方导入器单次 1000 会话限制。
- 工作区选择改用 DSH 的 workspace picker；整体 UI 统一为 DSH primitives。
- 新增最少用户轮次、更新时间范围、含思考、标题搜索等筛选。

## Initial 0.1.0 — 2026-11-18

- 浏览器扩展：会话选择、Markdown 六项选项、三种分支模式、zip 下载、线性 JSON。
- DSH 插件：读取 dsbridge JSON，筛选后转换为 DSH 原生会话。

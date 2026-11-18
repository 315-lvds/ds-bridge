# Contributing

感谢你愿意改进深桥。请先阅读 [README.md](README.md) 与 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 提交 issue

- 说明浏览器版本、DSH 版本、扩展/插件版本；
- 给出可复现步骤、预期结果与实际结果；
- 控制台报错请先脱敏；**不要粘贴登录令牌、Cookie 或真实聊天内容**；
- 涉及导入问题时，尽量用合成/脱敏样本，不要上传完整官方导出包。

## 提交 PR

- 保持改动聚焦，一个 PR 解决一个问题；
- 不新增遥测、远程资源、权限或第三方运行时依赖；
- 不把登录令牌写入 `chrome.storage`、日志或导出文件；
- 改动导出格式时同步更新 `docs/ARCHITECTURE.md` 与 README；
- 提交前运行：

  ```bash
  node --test tests/session-groups.test.mjs tests/zip.test.mjs
  node --check extension/workbench.js
  node --check dsh-plugin/lib/client.js
  ```

## 代码风格

- 扩展与 DSH 插件都是无构建步骤的 ESM/原生浏览器代码；不要引入打包器；
- 注释解释“为什么”，不要只复述代码；
- 用户可见文案同时更新 `dsh-plugin/locale/zh.json` 与 `en.json`（如涉及）。

## License

提交贡献即表示同意以 MIT License 发布。

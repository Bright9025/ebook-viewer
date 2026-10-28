# 贡献指南 / Contributing to Ebook Viewer

感谢你愿意改进 Ebook Viewer。无论是 Bug 报告、文档修订、截图更新还是代码提交，都欢迎。

> English speakers: the commands and PR checklist below apply to everyone. Feel free to open an issue in English.

## 开始之前

1. 先阅读 [README.md](./README.md) 和 [English README](./README.en.md)，确认当前功能和已知边界。
2. 搜索现有 [Issues](https://github.com/Bright9025/ebook-viewer/issues)，避免重复报告。
3. 较大的功能改动请先开 Issue 讨论方向，不要直接提交一个无法合并的大 PR。
4. 不要提交任何受版权保护的 EPUB、书籍封面或个人阅读数据。

## 开发环境

- Windows 10 / 11
- Node.js ≥ 22.12
- npm ≥ 10
- 项目固定使用 Electron 33.4.11（原因见 README）

```powershell
git clone git@github.com:Bright9025/ebook-viewer.git
cd ebook-viewer
npm install
npm run dev
```

受限 Windows 会话使用 `npm run dev`（带 `--noSandbox`）；如果你的 Chromium 沙箱正常，可使用 `npm run dev:secure`。

## 分支与提交

- 从 `main` 拉出功能分支：

```bash
git switch -c feat/your-feature
# 或
git switch -c fix/your-bug
```

- 一个提交只做一件事，提交信息建议使用 Conventional Commits：

```text
feat: 增加目录搜索
fix: 修复摸鱼窗按钮点击
docs: 更新构建说明
chore: 整理 XX 目录
```

- 不要把 `out/`、`release/`、`node_modules/`、`.data/`、`.testdata/` 或 `*.log` 提交进仓库。
- 提交前先同步 `main`，解决冲突后再发起 PR。

## 代码约定

- 使用 TypeScript，保持严格模式通过；不要用 `any` 绕过类型检查，确实需要时加注释说明。
- 主进程代码放在 `src/main/`，渲染进程代码放在 `src/renderer/src/`，跨进程共享类型放在 `src/shared/`。
- 渲染进程通过 `window.api`（preload + contextBridge）访问主进程能力，不要在 Vue 里直接使用 Node API。
- 样式优先使用现有 token（`src/renderer/src/styles/tokens.css`），避免散落硬编码颜色。
- EPUB 内容在禁用脚本的 iframe 中渲染；不要为了一时方便打开脚本执行。
- 用户数据写入 `data/`（开发期为 `.data/`），不要改写到仓库目录之外。

## 检查与测试

提交 PR 前至少运行：

```bash
npm run typecheck
npm run test:e2e
```

`npm run test:e2e` 会启动生产构建、导入样书、翻页、连续改变窗口尺寸，并检查摸鱼窗的透明背景、逐字取色和左右键翻页。

如果改动涉及打包配置，再运行：

```bash
npm run pack
```

并在 `release/win-unpacked` 中双击 `Ebook Viewer.exe` 做一次启动冒烟测试。

## 文档与截图

- README 与英文 README 位于仓库根目录：
  - [README.md](./README.md)
  - [README.en.md](./README.en.md)
- 界面截图放在 `docs/screenshots/`，README 通过 `./docs/screenshots/...` 引用。
- 更新截图时请同时更新中英文 README 中的图片路径和说明；不要留下失效链接。
- 构建、版本号、数据目录等行为变化时，请同步更新两份 README 和本指南。

## 版本与发布

- 版本号以 `package.json` 的 `version` 为准；发布前更新 `package-lock.json`。
- 发布包由 `npm run pack`（便携目录）或 `npm run dist`（NSIS 安装包）生成，不提交到 Git。
- GitHub Release 的资产应上传整个 `win-unpacked` 的 zip 包；不要只上传 `Ebook Viewer.exe` 或只上传 `EbookViewerCore.exe`。
- 发布前确认 `npm run typecheck`、`npm run test:e2e` 和启动器冒烟测试均通过。

## Pull Request 检查清单

- [ ] 已关联对应 Issue（如有）
- [ ] `npm run typecheck` 通过
- [ ] `npm run test:e2e` 通过
- [ ] 更新了相关文档 / 截图路径
- [ ] 没有提交构建产物、阅读数据或临时文件
- [ ] 没有引入不必要的大型依赖
- [ ] 改动聚焦，提交信息清晰

## 许可证

提交代码即表示你同意以本项目的 [MIT License](./LICENSE) 授权你的贡献。

## 联系方式

- Bug / 功能建议：GitHub Issues
- 安全问题：请通过 GitHub 私下联系维护者，不要在公开 Issue 中贴出利用细节

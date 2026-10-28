# Ebook Viewer

一个专注阅读本身的本地 EPUB 阅读器：书库、目录、书签、明亮 / 暗黑主题，以及一个可以随时呼出、随桌面颜色隐身的「摸鱼模式」。

[完整中文文档](./docs/README.md) · [English](./docs/README.en.md) · [MIT License](./docs/LICENSE)

参考了 [xudong7/tauri-rbook](https://github.com/xudong7/tauri-rbook) 的产品结构（Vue 3 + epub.js + 书库/目录/书签），但把窗口层换成了 Electron，并重写了分页锚定与摸鱼窗。

## 功能

- **本地书库**：导入 / 拖拽 EPUB，提取封面、书名、作者，记录最近阅读与进度
- **阅读器**：横向分页、目录跳转、书签、字号 / 行高 / 页边距 / 字体 / 两端对齐
- **明亮 / 暗黑**：界面与正文同步换肤，可跟随系统；启动时读取上次主题，避免白屏闪烁
- **自由缩放 + 首句锚定**：改变窗口大小、字号或页边距后重新分页，尽量把原锚点句留在当前页，不整书重载、不跨页漂移
- **摸鱼模式**：小透明置顶窗，逐字跟随下方桌面颜色；可拖动、可自由调整大小、可一键隐藏 / 退出
- **全局快捷键**：一键隐藏 / 恢复；Esc 隐藏摸鱼窗；左右键翻页
- **托盘常驻**：关闭主窗口不退出，可从托盘恢复

## 界面

| 书库 | 阅读 · 明亮 |
| --- | --- |
| ![书库](docs/screenshots/library.png) | ![阅读](docs/screenshots/reader-light.png) |

| 阅读 · 暗黑 | 排版设置 |
| --- | --- |
| ![暗黑](docs/screenshots/reader-dark.png) | ![排版](docs/screenshots/reader-settings.png) |

![摸鱼模式](docs/screenshots/stealth-preview.png)

> 摸鱼窗是透明置顶的小窗，上图为透明页面叠在浅色背景上的预览；文字颜色会随窗口下方的桌面颜色变化。

## 环境

- Windows 10 / 11
- Node.js ≥ 22.12（开发）
- npm ≥ 10

当前项目固定使用 **Electron 33.4.11**。在这台 Windows 10 19045 + 中文路径的机器上，Electron 37 / 38 / 44 / 45 都会在默认用户目录初始化阶段崩溃（0xC0000005）；33 配合本地 `data/` 目录可以稳定启动，并已通过端到端测试。

## 开发

```bash
npm install
npm run dev
```

开发命令默认带 `--noSandbox`，并清掉环境里的 `ELECTRON_RUN_AS_NODE`：本机受限会话无法初始化 Chromium 沙箱，不加这个参数会出现「进程立刻退出、没有窗口」。如果你的机器沙箱正常、想用默认安全配置，运行：

```bash
npm run dev:secure
```

生产构建同理：`npm run start` 带 `--noSandbox`，`npm run start:secure` 不带。

应用数据默认写在程序旁边的 `data/`（见下文）。如果仍然启动即退出，先删除 `data/` 再试；事件日志里的 `0xC0000005` 在这台机器上主要来自 Chromium 初始化 `%APPDATA%` 用户目录，改用本地目录后已消失。

## 构建

```bash
npm run build        # 编译 main / preload / renderer 到 out/
npm run start        # 预览生产构建（带 --noSandbox）
npm run pack         # 生成 release/win-unpacked
npm run dist         # 生成 NSIS 安装包（需要额外的打包组件）
```

`release/win-unpacked` 里的双击入口是 **`Ebook Viewer.exe`**，它是一个小启动器，会带 `--no-sandbox` 拉起同目录的 **`EbookViewerCore.exe`**（Electron 主体）。不要只复制 `Ebook Viewer.exe` 或只复制 `EbookViewerCore.exe`，整个目录一起用。

`启动 Ebook Viewer.cmd` 是等价的命令行入口。

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `←` / `→` / `PgUp` / `PgDn` / `空格` | 上一页 / 下一页 |
| `Esc` | 关闭目录、设置面板；在摸鱼窗中隐藏 |
| `F11` | 全屏 |
| `Ctrl+Shift+H` | 全局老板键：隐藏 / 恢复全部窗口 |
| `Ctrl+Shift+M` | 全局开关摸鱼模式 |
| 双击摸鱼窗 | 退出摸鱼模式并回到主窗口 |
| 拖动摸鱼窗顶部 26px | 移动；右下角可拖动改大小 |

热键注册失败（被其他程序占用）时，设置里会收到提示；可在 `data.json` 的 `settings.hotkeys` 中修改。

## 数据位置

默认放在程序旁边的 `data/` 目录，便携、不写用户配置：

- 开发时：`ebook-viewer/.data/`
- 打包后：`release/win-unpacked/data/`

里面是：

- `data.json`：书库、设置、书签、阅读进度
- `books/`：导入时复制的 EPUB 文件

可用环境变量 `EBOOK_USER_DATA` 覆盖。若程序目录不可写（例如装进 Program Files），会自动退回系统默认的 `%APPDATA%\ebook-viewer\`。

> 之所以不用 `%APPDATA%` 作为默认：部分 Windows 会话 / 安全软件下 Chromium 初始化用户配置目录时会直接崩溃（0xC0000005），改用可写的本地目录后启动稳定。

原始 EPUB 不会被修改。

## 首句锚定是怎么做的

1. 每次翻页 / 跳转后，从当前 iframe 的可见区域找到第一个可见字符，向前扩展到可显示的句首，生成 CFI + 句子 + 章节 + 百分比。
2. 窗口 resize 时用固定像素尺寸重新分页，并把锚点 CFI 直接传给 `rendition.resize(width, height, cfi)`，避免 epub.js 自己的 resize 处理把位置带回旧页。
3. 重排后校验锚点是否还在当前页；不在则再 `display(anchor.cfi)` 一次。
4. 缩放过程中不重新采集锚点，所以连续缩放不会累计漂移。字号、行高、页边距变化走同一套逻辑。

参考项目在缩放时会销毁 `rendition`、重新加载整本书，再按页首 CFI 恢复；那既慢，也容易在重排后串页。这里保留渲染器，只重排 + 锚定。

## 摸鱼模式的取色与操作

阅读器把当前页的文字交给一个独立文本层逐字渲染，主进程用 `desktopCapturer` 截取窗口矩形：

- 每个字按自己的 x 坐标，在所在行上下的留白处采样局部背景（避开自身文字，避免颜色反馈）；
- 亮背景给深色字，暗背景给浅色字，保留背景色相，对比度约 2.6–3.6:1，透明度 0.72；
- 显示 / 移动时立即重采，静止时每 2 秒刷新；同一行字可以是不同深浅。

操作：

- 按住顶部 26px 拖动条移动；右下角斜纹拖动改大小；
- 右上角常显工具条：隐藏、退出；
- `←/→` 翻页，`Esc` 隐藏，`Ctrl+Shift+H` 全局隐藏 / 恢复，双击窗口退出。

## 目录

```
docs/           中文 / 英文文档、MIT License、界面截图
resources/
  icons/        应用、托盘、安装包图标
  launcher/     Windows 启动器源码、二进制与命令行入口
scripts/
  dev/          开发 / 预览启动包装
  setup/        Electron 二进制补全
  test/         端到端冒烟测试
samples/        测试用 EPUB（公版英文样书 + 自造中文样书）
src/main/       Electron 主进程：窗口、托盘、快捷键、截屏取色、存储、IPC
src/preload/    contextBridge API
src/shared/     主进程与渲染进程共享类型 / 默认值
src/renderer/   Vue 3 界面（书库 / 阅读器 / 摸鱼窗）
```

## 端到端冒烟

```bash
npm run test:e2e
```

脚本会启动生产构建，导入中文样书，翻 4 页，再连续改 5 种窗口尺寸，断言锚点 CFI / 进度不变且仍在页内；随后切暗黑、开摸鱼窗，断言透明背景、取色对比度与左右键翻页。

## 已知边界

- 只支持 EPUB（不支持 PDF / MOBI / AZW3）
- 分页锚定保证「锚点句仍在当前页」，但不同窗口尺寸下页边界会变化，锚点句不一定总是页面第一行；不会跨页或丢位置
- 摸鱼窗只显示文字，图片默认隐藏；可在 `settings.stealth.hideImages` 关闭
- 热键是全局的，可能与其它软件冲突
- 本机受限会话需要 `--no-sandbox`，因此默认开发命令与附带启动脚本都关闭了 Chromium 沙箱；EPUB 内容仍在禁用脚本的 iframe 中渲染

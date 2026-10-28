# 第三方软件声明 / Third-Party Notices

Ebook Viewer 本身以 [MIT License](./LICENSE) 发布。项目使用或打包了以下第三方软件；它们的许可证适用于各自的部分。

Ebook Viewer itself is released under the [MIT License](./LICENSE). The following third-party software is used or bundled; its license applies to the respective portion.

## 运行时依赖 / Runtime dependencies

| 组件 / Component | 版本 / Version | 许可证 / License |
| --- | --- | --- |
| [epub.js](https://github.com/futurepress/epub.js) | 0.3.93 | BSD-2-Clause |
| [Electron](https://www.electronjs.org) | 33.4.11 | MIT |
| [Vue](https://vuejs.org) | 3.5.44 | MIT |
| [Pinia](https://pinia.vuejs.org) | 3.0.4 | MIT |
| [Vue Router](https://router.vuejs.org) | 4.6.4 | MIT |

`epub.js` 会被打包进渲染进程，其 BSD-2-Clause 许可证全文如下：

```text
Copyright (c) 2013, FuturePress

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

The views and conclusions contained in the software and documentation are those
of the authors and should not be interpreted as representing official policies,
either expressed or implied, of the FreeBSD Project.
```

Electron、Vue、Pinia 和 Vue Router 使用 MIT License。每个 npm 包都在其发布包中附带完整许可证文本；Electron 的发行包还会包含 Chromium / Node.js 的许可证文件。

Electron, Vue, Pinia and Vue Router are distributed under the MIT License. Each npm package includes its full license text; Electron distributions also include the Chromium / Node.js license files.

## 构建与测试依赖 / Build and test dependencies

以下依赖只用于开发、类型检查或测试，不会作为 Ebook Viewer 的业务代码打包：

| 组件 / Component | 许可证 / License |
| --- | --- |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 |
| [Playwright](https://playwright.dev) | Apache-2.0 |
| [Vite](https://vite.dev) | MIT |
| [electron-vite](https://electron-vite.org) | MIT |
| [electron-builder](https://www.electron.build) | MIT |

## 上游参考 / Upstream reference

本项目在产品结构上参考了 [xudong7/tauri-rbook](https://github.com/xudong7/tauri-rbook)（MIT License，Copyright (c) 2025 Dunjia），但窗口层、分页锚定、摸鱼窗和本地存储等实现均为本项目重写；当前仓库没有复制其源文件。

The product structure was inspired by [xudong7/tauri-rbook](https://github.com/xudong7/tauri-rbook) (MIT License, Copyright (c) 2025 Dunjia). The window layer, pagination anchoring, stealth window and local storage are implemented in this project; no source files from that project are copied in this repository.

If future contributions copy code from another project, keep that project's license notice and add it to this file before merging.

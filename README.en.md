<div align="center">

# 📖 Ebook Viewer

[English](./README.en.md) | [简体中文](./README.md)

A focused local EPUB reader with a library, table of contents, bookmarks, light/dark themes, and a transparent always-on-top “stealth” reading window that adapts to the desktop behind it.

> Current version: **v1.0.1** · [GitHub Releases](https://github.com/Bright9025/ebook-viewer/releases)

</div>

## ✨ Features

- 📚 **Local library** – Import EPUB files by button or drag-and-drop; extract covers, titles and authors; remember recently read books and progress.
- 📖 **Focused reader** – Horizontal pagination, table of contents, bookmarks, font size / line height / margins / font family / justification.
- 🌗 **Light & dark** – Switch the UI and book typography together, or follow the system theme; restore the previous theme on launch without a white flash.
- 🪟 **Resizable window** – Re-paginate when the window, font size or margins change, keeping the previous anchor sentence on the current page without reloading the book.
- 🫥 **Stealth mode** – A small transparent, topmost window whose text color follows the pixels underneath, character by character. Drag it, resize it, hide it or exit it at any time.
- ⌨️ **Global shortcuts** – Show/hide everything or toggle stealth mode from anywhere; arrow keys turn pages in the stealth window.
- 🧰 **Tray resident** – Closing the main window keeps the app in the tray. EPUB files are never modified.

## 🖼️ Screenshots

| Library | Reader · light |
| --- | --- |
| ![Library](./docs/screenshots/library.png) | ![Reader · light](./docs/screenshots/reader-light.png) |

| Reader · dark | Typography settings |
| --- | --- |
| ![Reader · dark](./docs/screenshots/reader-dark.png) | ![Typography settings](./docs/screenshots/reader-settings.png) |

![Stealth mode](./docs/screenshots/stealth-preview.png)

> The stealth window is transparent and always on top. The preview above shows the transparent page over a light background; the actual text color changes with the desktop underneath.

## 📁 Project Structure

```text
ebook-viewer/
├── docs/
│   └── screenshots/              # UI screenshots referenced by the READMEs
├── resources/
│   ├── icons/                    # App, tray and installer icons
│   └── launcher/                 # Windows launcher source and binary
├── samples/                      # Sample EPUBs for tests
├── scripts/
│   ├── dev/                      # Development / preview launcher wrapper
│   ├── setup/                    # Electron binary bootstrap
│   └── test/                     # End-to-end smoke test
├── src/
│   ├── main/                     # Electron main process
│   ├── preload/                  # contextBridge API
│   ├── renderer/                 # Vue 3 UI
│   └── shared/                   # Shared types and defaults
├── .gitignore
├── .npmrc                        # Electron download mirror
├── LICENSE                       # MIT License
├── THIRD_PARTY_NOTICES.md        # Third-party licenses and notices
├── CONTRIBUTING.md               # Contribution guide
├── README.md                     # Chinese documentation
├── README.en.md                  # English documentation (this file)
├── electron-builder.yml          # Windows packaging config
├── electron.vite.config.ts       # main / preload / renderer build config
├── package.json
├── package-lock.json             # Locked dependency versions
├── tsconfig.json                 # TypeScript project references
├── tsconfig.node.json            # Main / preload / shared typecheck
└── tsconfig.web.json             # Renderer typecheck
```

`out/` and `release/` are local build artifacts and are ignored by `.gitignore`; they are not committed.

## 🚀 Quick Start

### Requirements

- Windows 10 / 11
- Node.js ≥ 22.12
- npm ≥ 10

The project is pinned to **Electron 33.4.11**. On the Windows 10 19045 machine used for development (with a CJK project path), newer Electron versions crash while initializing the default user-data directory (`0xC0000005`). Electron 33 with a local `data/` directory starts reliably and is covered by the end-to-end test.

### Install and develop

```bash
npm install
npm run dev
```

`npm run dev` passes `--noSandbox` and clears `ELECTRON_RUN_AS_NODE`; locked-down Windows sessions cannot initialize Chromium's sandbox, and without these flags the process exits immediately without a window.

If Chromium's sandbox works normally on your machine, use the default secure configuration:

```bash
npm run dev:secure
```

### Build and package

```bash
npm run build        # Compile main / preload / renderer into out/
npm run start        # Preview the production build (with --noSandbox)
npm run pack         # Produce release/win-unpacked
npm run dist         # Produce an NSIS installer (requires extra packaging components)
```

The double-click entry in `release/win-unpacked` is **`Ebook Viewer.exe`**, a tiny launcher that starts **`EbookViewerCore.exe`** (the Electron app) with `--no-sandbox`. Keep the whole directory together; do not copy just one of the two executables.

`启动 Ebook Viewer.cmd` is an equivalent command-line entry.

The packaged `release/` directory looks like this:

```text
release/
├── win-unpacked/                 # Portable build
│   ├── Ebook Viewer.exe          # Double-click launcher
│   ├── EbookViewerCore.exe       # Electron app
│   ├── 启动 Ebook Viewer.cmd
│   └── data/                     # Created on first run
├── Ebook-Viewer-1.0.1-x64.exe    # NSIS installer
├── Ebook-Viewer-1.0.1-x64.exe.blockmap
├── Ebook-Viewer-v1.0.1-x64-portable.zip
├── latest.yml
└── builder-debug.yml             # electron-builder debug info (ignored)
```

For a GitHub Release, upload `Ebook-Viewer-1.0.1-x64.exe` and `Ebook-Viewer-v1.0.1-x64-portable.zip`; the blockmap and `latest.yml` are installer/auto-update helpers and optional.

## 📚 Usage

1. Launch the app, then click **Import EPUB** or drag an EPUB into the library.
2. Click a cover to start reading. Locations are generated on first open and progress is saved automatically.
3. The top bar opens the table of contents, adds bookmarks, adjusts typography, switches themes, enters fullscreen, and provides minimize / maximize / close controls.
4. Click the **Stealth** button in the reader toolbar, or press `Ctrl+Shift+M`, to open the transparent topmost window.
5. In the stealth window, use `←` / `→` to turn pages; drag the top 26px to move it; drag the bottom-right grip to resize; use the top-right toolbar to hide or exit.

## ⌨️ Shortcuts

| Shortcut | Action |
| --- | --- |
| `←` / `→` / `PgUp` / `PgDn` / `Space` | Previous / next page |
| `Esc` | Close panels; hide the stealth window |
| `F11` | Fullscreen |
| `Ctrl+Shift+H` | Global boss key: hide / restore all windows |
| `Ctrl+Shift+M` | Toggle stealth mode globally |
| Double-click the stealth window | Exit stealth mode and return to the main window |

If a hotkey is occupied by another application, the settings panel reports it. Hotkeys can be changed in `settings.hotkeys` inside `data.json`.

## 🗂️ Data Location

The app stores data next to the executable in a portable `data/` directory:

- Development: `ebook-viewer/.data/`
- Packaged: `release/win-unpacked/data/`

Contents:

- `data.json` – library, settings, bookmarks and reading progress
- `books/` – imported EPUB copies

Override the location with the `EBOOK_USER_DATA` environment variable. If the program directory is not writable (for example under `Program Files`), the app falls back to `%APPDATA%\ebook-viewer\`.

> The default deliberately avoids `%APPDATA%`: in some Windows sessions or under security software, Chromium crashes while initializing the default user-data directory (`0xC0000005`). A writable local directory keeps startup reliable.

## 🧠 Technical Notes

- **Electron 33 + electron-vite** – Separate main, preload and renderer builds; `contextIsolation` is enabled and `nodeIntegration` is disabled.
- **Vue 3 + TypeScript + Pinia + Vue Router** – Three routed views: library, reader and stealth window. No third-party UI kit; the interface uses custom design tokens.
- **epub.js** – Handles EPUB parsing, navigation, CFIs, horizontal pagination and book rendering. The reader keeps the existing `rendition` and only re-paginates on resize instead of reloading the whole book.
- **Custom `app://` protocol** – Production builds load pages from inside the asar; the CSP allows the `blob:` styles and frames required by epub.js.
- **Desktop color sampling** – The main process captures the desktop rectangle under the stealth window. The renderer draws a separate per-character text layer and samples the background in the vertical gaps above and below each line, then computes an ink color for every character.
- **Local storage** – The main process owns `data.json` and `books/`; nothing leaves the machine.

## 🧱 Tech Stack

| Technology | Purpose |
| --- | --- |
| [![TypeScript](https://shieldcn.dev/badge/Language-TypeScript-3178C6.svg?logo=typescript&variant=branded&size=sm&font=space-grotesk)](https://www.typescriptlang.org) | Type safety |
| [![Electron 33](https://shieldcn.dev/badge/Framework-Electron-47848F.svg?logo=electron&variant=branded&size=sm&font=space-grotesk)](https://www.electronjs.org) | Desktop runtime and main-process APIs |
| [![Vue 3](https://shieldcn.dev/badge/Framework-Vue.js-4FC08D.svg?logo=vuedotjs&variant=branded&size=sm&font=space-grotesk)](https://vuejs.org) | Renderer UI |
| [![Vite 7](https://shieldcn.dev/badge/Build-Vite-646CFF.svg?logo=vite&variant=branded&size=sm&font=space-grotesk)](https://vite.dev) | Front-end bundling |
| [![electron-vite](https://shieldcn.dev/badge/Stack-electron--vite-2C3E50.svg?logo=electron&variant=branded&size=sm&font=space-grotesk)](https://electron-vite.org) | Unified main / preload / renderer builds |
| [![Pinia](https://shieldcn.dev/badge/State-Pinia-FFD859.svg?logo=pinia&variant=branded&size=sm&font=space-grotesk)](https://pinia.vuejs.org) | Library, settings and stealth state |
| [![Vue Router](https://shieldcn.dev/badge/Router-Vue_Router-42B883.svg?logo=vuedotjs&variant=branded&size=sm&font=space-grotesk)](https://router.vuejs.org) | Library / reader / stealth routes |
| [![epub.js](https://shieldcn.dev/badge/EPUB-epub.js-8B5CF6.svg?variant=secondary&size=sm&font=space-grotesk)](https://github.com/futurepress/epub.js) | EPUB parsing, CFIs and pagination |
| [![electron-builder](https://shieldcn.dev/badge/Package-electron--builder-2C3E50.svg?logo=electron&variant=branded&size=sm&font=space-grotesk)](https://www.electron.build) | Windows packaging and installer |
| [![Playwright](https://shieldcn.dev/badge/Test-Playwright-2EAD33.svg?logo=playwright&variant=branded&size=sm&font=space-grotesk)](https://playwright.dev) | End-to-end smoke tests |

## 🎯 Page-Start Anchoring

1. After every page turn or jump, find the first visible character in the current iframe, expand backwards to a visible sentence start, and store a CFI plus sentence, chapter and percentage.
2. On resize, re-paginate with fixed pixel dimensions and pass the anchor CFI to `rendition.resize(width, height, cfi)`, so epub.js does not snap back to an old page.
3. Verify that the anchor is still on the current page; if not, call `display(anchor.cfi)` once more.
4. Do not capture a new anchor during reflow, so repeated resizing does not accumulate drift. Font size, line height and margin changes use the same path.

> The current implementation guarantees that the anchor sentence stays on the current page. Because EPUB pagination can only split at column/page boundaries, the anchor sentence is not always the literal first line. Locking the first line character-by-character would require a continuous-scroll layout or a custom paginator; that is not implemented yet.

## 🫥 Stealth Mode

- Transparent, frameless, always on top and hidden from the taskbar; suitable for reading a few lines beside another window.
- The visible text is rendered by a dedicated per-character layer. Each character's ink color is computed from the local background: dark text on light areas, light text on dark areas, with roughly 2.6–3.6:1 contrast.
- Colors refresh when the window is shown or moved, and every two seconds while stationary.
- The toolbar contains only **Hide** and **Exit**; resize freely with the bottom-right grip.
- Images are not shown in stealth mode; only the current page's text is rendered.

## ⚠️ Known Limitations

- EPUB only; PDF / MOBI / AZW3 are not supported.
- Page boundaries change with window size. Anchoring prevents page jumps and position loss, but the anchor sentence is not guaranteed to be the first line.
- The stealth window is text-only; images are hidden.
- Global hotkeys can conflict with other applications.
- Locked-down Windows sessions require `--no-sandbox`, so the default development command and launcher disable Chromium's sandbox. EPUB content is still rendered in an iframe with scripting disabled.

## 📄 License

This project is released under the [MIT License](./LICENSE). You are free to use, modify and distribute it.

The bundled `epub.js` is BSD-2-Clause; the other main dependencies are MIT / Apache-2.0. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the complete third-party copyright and license texts.

## 🤝 Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development, commit and testing workflow. Before submitting, run:

```bash
npm run typecheck
npm run test:e2e
```

## 📧 Contact

For questions, please open a GitHub issue.

**Happy reading! 📖**

# 🎥 Video Downloader (Web & Telegram)

A modern, high-performance Manifest V3 browser extension built with **WXT**, **React 18**, and **TypeScript**. It automatically detects progressive video streams and blobs on web pages (specifically optimized for **Telegram Web**) and renders an isolated floating download button directly over the video with real-time download progress tracking.

---

## ✨ Features

- **🚀 Telegram Web Optimized**:
  - Automatically hooks into dynamic Telegram Web video containers (`.full-media`, `video`, full-screen media viewer).
  - Handles authenticated progressive URLs (`https://web.telegram.org/a/progressive/document...`) by fetching with credentials within the page context.
  - Supports `blob:` URLs and standard MP4/WebM video formats.
- **🛡️ 100% Shadow DOM Style Isolation**:
  - The React overlay button is mounted inside a scoped Shadow Root (`attachShadow`). Telegram's styles will never break the button, and the button's styles will never break the website.
- **📊 Real-time Progress Tracking**:
  - Streams video bytes in chunks using `ReadableStream` to calculate and display exact download percentages (`0%` → `100%`).
- **🎛️ Dual Access (Overlay & Popup)**:
  - **Inline Overlay**: Floats directly on top of videos with resolution indicators (`1080p`, `720p`, `4K`).
  - **Toolbar Popup**: Click the extension icon to see a list of all detected videos on the active tab with one-click download and copy-link options.

---

## 📂 Project Structure

```
VideoDownloader/
├── entrypoints/
│   ├── background.ts          # Background service worker (badge counts, fallback downloads)
│   ├── content/               # Content script with Shadow DOM React injection
│   │   ├── DownloadOverlay.tsx # Floating React overlay with progress bar
│   │   ├── index.tsx          # MutationObserver detecting dynamic SPA videos
│   │   └── overlay.css        # Scoped CSS injected into the Shadow DOM
│   └── popup/                 # Extension toolbar popup UI
│       ├── App.tsx            # Popup React component
│       ├── index.html         # Popup entry HTML
│       ├── main.tsx           # Popup React root
│       └── style.css          # Dark-mode styling for popup
├── public/
│   └── icon/                  # Extension icons (16, 48, 128px)
├── utils/
│   └── downloader.ts          # In-page fetch engine, stream reader, and filename parser
├── package.json
├── tsconfig.json
└── wxt.config.ts              # Manifest V3 & WXT configuration
```

---

## 🛠️ Installation & Development

### 1. Install Dependencies
Run the following in the project root:
```bash
npm install
```

### 2. Start Live Development (Hot Reload)
```bash
npm run dev
```
WXT will start Vite and automatically launch a clean Chrome profile with the extension preloaded.

### 3. Build for Production
```bash
npm run build
```
The compiled extension will be output to `.output/chrome-mv3`.

---

## 📥 Loading into Chrome / Brave / Edge Manually

1. Open your browser and navigate to `chrome://extensions`.
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `.output/chrome-mv3` folder inside this project directory.
5. Open [Telegram Web](https://web.telegram.org/) or any video site and start watching or scrolling videos!


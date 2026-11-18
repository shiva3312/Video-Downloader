# Cross-Platform & Browser Compatibility

This module guides building, packaging, and maintaining compatibility across **Chromium** (Chrome, Edge, Brave, Opera) and **Firefox**.

---

## 1. WXT Multi-Target Framework

The project is structured using [WXT](https://wxt.dev/), which handles cross-browser manifest compilation and polyfilling automatically:

```bash
# Build target: Chrome MV3
npm run build
# Target folder: .output/chrome-mv3

# Build target: Firefox
npm run build:firefox
# Target folder: .output/firefox-mv2 (or mv3 depending on wxt config)
```

---

## 2. Cross-Browser API Usage

* **Universal Web APIs:** Always prefer standard Web APIs over vendor-specific browser extension APIs:
  - Streaming: `fetch()`, `ReadableStream`, `AbortController`
  - Buffering & Files: `Blob`, `Uint8Array`, `URL.createObjectURL()`, `URL.revokeObjectURL()`
  - UI Injection: DOM `MutationObserver`, `attachShadow()`
* **Extension APIs:**
  - When accessing tabs or messages, prefer WXT's imported `browser` object or check `typeof chrome !== 'undefined'`.
  - For toolbar actions, WXT automatically compiles `action` for MV3 (Chrome) and adapts it for MV2 (Firefox `browser_action`) if targeting MV2.

---

## 3. Platform Differences to Watch

1. **MAIN World Script Injection:**
   - In Chrome MV3, content scripts support `"world": "MAIN"` natively via `content_scripts`.
   - In Firefox, WXT automatically handles polyfilling script execution into the page context. Always define page-level interception in [entrypoints/main-world.content.ts](../entrypoints/main-world.content.ts).
2. **Background Context:**
   - Chrome MV3 uses a Service Worker (terminates when idle). Never rely on global JavaScript variables in `entrypoints/background.ts` persisting across tab navigations.
   - Firefox uses background event pages or service workers.
3. **Downloads & Anchor Tags:**
   - Standard `<a download>` works uniformly across Chrome, Firefox, Edge, and Brave for local object URLs created via `URL.createObjectURL(blob)`.

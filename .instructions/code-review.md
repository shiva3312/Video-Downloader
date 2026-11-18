# Code Review & Pre-Submission Checklist

This module provides the step-by-step verification process required before committing code, creating pull requests, or submitting new extension versions to Web Stores.

---

## 1. Automated Verification Commands

Run these commands in order. Every check must pass with zero errors:

```bash
# 1. Typecheck TypeScript across all files
npm run compile

# 2. Build production package for Chromium (Chrome MV3)
npm run build

# 3. Build package for Firefox
npm run build:firefox

# 4. Generate deployment zip archive
npm run zip
```

---

## 2. Manifest & Permissions Audit

Open and inspect `.output/chrome-mv3/manifest.json`:

* [ ] **Permissions Check:** Does every item in `"permissions"` have an active invocation in the compiled JavaScript bundle?
* [ ] **Host Permissions Check:** Are there any redundant patterns (e.g. both `*://web.telegram.org/*` and `*://*/*`)? Keep only the minimal necessary match patterns.
* [ ] **Version Bump Check:** If resubmitting after a rejection or bugfix, has the version string been incremented in both `wxt.config.ts` and `package.json`?
* [ ] **Icons & Assets:** Are `16.png`, `48.png`, and `128.png` present and referenced correctly?

---

## 3. Runtime & Memory Safety Checklist

* [ ] **DOM Leaks:** Are video elements tracked using `WeakSet` or `WeakMap`?
* [ ] **Observer Cleanup:** Are `MutationObserver` instances disconnected when elements are unmounted or when the extension context is invalidated (`ctx.onInvalidated()`)?
* [ ] **Buffer Purging:** When a download is cancelled or finishes, is `session.chunks = []` explicitly set to free RAM?
* [ ] **AbortController:** Is `abortController.abort()` called immediately upon cancellation or pause?
* [ ] **Subscription Cleanup:** Does every React `useEffect` subscribing to `downloadStore` return its `unsubscribe` function?

---

## 4. Store Submission Information

When submitting to the Chrome Web Store Developer Console:

1. **Package:** Upload the newly created `.output/video-downloader-<version>-chrome.zip`.
2. **Justification for `activeTab`:**
   > *"Used to detect HTML5 video elements and display active download status when the user opens the extension popup."*
3. **Justification for `*://*/*` (`host_permissions`):**
   > *"Required to detect video streams, progressive video endpoints, and media blobs across Telegram Web and any website visited by the user."*

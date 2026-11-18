# AI Agent Guidelines — Video Downloader (Web & Telegram)

This repository follows modular development, security, and architecture standards for AI assistants (Gemini, Claude, Copilot, Cursor, etc.).

All detailed rules are broken down into dedicated modules in the [`.instructions/`](.instructions/) folder:

---

## 📚 Instruction Modules

| Module | Description |
| :--- | :--- |
| 🛡️ [**1. Store Policy & Security Compliance**](.instructions/policy-compliance.md) | [Excessive Permissions Policy](https://developer.chrome.com/docs/webstore/troubleshooting/#excessive-permissions), Purple Potassium prevention, DOM downloads, zero telemetry. |
| 🔍 [**2. Code Review & Pre-Submission Checklist**](.instructions/code-review.md) | Verification commands (`npm run compile`, `npm run build`), manifest audits, memory cleanup checks. |
| 🧹 [**3. Clean Code, Formatting & Performance**](.instructions/clean-code-format.md) | TypeScript types, React 18 patterns, stream performance, progress throttling. |
| 🧩 [**4. Reusable Components & Architecture**](.instructions/reusable-components.md) | Multi-world context (MAIN vs ISOLATED), Shadow DOM encapsulation, shared helpers, in-memory store. |
| 🌐 [**5. Cross-Platform & Browser Compatibility**](.instructions/cross-platform.md) | WXT multi-targeting, Chrome MV3 and Firefox compatibility, unified Web APIs. |

---

## ⚡ Quick Verification Commands

```bash
npm run compile       # Verify TypeScript type check (tsc --noEmit)
npm run build         # Build Chrome MV3 extension (.output/chrome-mv3)
npm run build:firefox # Build Firefox extension (.output/firefox-*)
npm run zip           # Package for Web Store upload
```

> [!IMPORTANT]
> Always run `npm run compile` and check `.output/chrome-mv3/manifest.json` before completing tasks or submitting drafts.

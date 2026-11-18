# GitHub Copilot Instructions — Video Downloader (Web & Telegram)

Instructions for GitHub Copilot when generating code, suggesting edits, or reviewing pull requests.

Detailed project rules are modularized in the [`.instructions/`](../.instructions/) folder:

- 🛡️ [**Store Policy & Security**](../.instructions/policy-compliance.md): Strict least privilege rules, [Excessive Permissions Policy](https://developer.chrome.com/docs/webstore/troubleshooting/#excessive-permissions), avoiding unused permissions ("Purple Potassium").
- 🔍 [**Code Review Checklist**](../.instructions/code-review.md): Pre-commit verification (`npm run compile`, `npm run build`), manifest audits.
- 🧹 [**Clean Code & Performance**](../.instructions/clean-code-format.md): Strict TypeScript types, stream buffer disposal, progress throttling.
- 🧩 [**Reusable Components & Architecture**](../.instructions/reusable-components.md): Multi-world execution (MAIN vs ISOLATED), Shadow DOM styling, shared helpers in `utils/downloader.ts`.
- 🌐 [**Cross-Platform Building**](../.instructions/cross-platform.md): WXT cross-compilation for Chromium and Firefox.

## Key Rules for Copilot
1. **Reuse Utilities:** Always use helpers from `utils/downloader.ts` (`formatBytes`, `formatSpeed`, `cleanDisplayTitle`, `generateVideoFilename`) instead of duplicating formatting logic.
2. **Zero Unused Permissions:** Never add permissions (`storage`, `scripting`, `downloads`) to `wxt.config.ts`.
3. **Shadow DOM Encapsulation:** Any in-page DOM injection must be scoped inside `attachShadow({ mode: 'open' })`.
4. **Subscription Cleanup:** Always unsubscribe from `downloadStore` inside React `useEffect` cleanups.

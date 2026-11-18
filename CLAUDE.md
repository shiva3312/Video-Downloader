# CLAUDE.md — Video Downloader (Web & Telegram)

Instructions for Claude Code and Anthropic assistants working on this repository.

Detailed modular guidelines are organized in the [`.instructions/`](.instructions/) directory:

- 🛡️ [**Policy & Security Compliance**](.instructions/policy-compliance.md): [Excessive Permissions Policy](https://developer.chrome.com/docs/webstore/troubleshooting/#excessive-permissions), Purple Potassium prevention, DOM downloads.
- 🔍 [**Code Review Checklist**](.instructions/code-review.md): Verification commands, manifest audit, memory leak checks.
- 🧹 [**Clean Code & Formatting**](.instructions/clean-code-format.md): Strict TypeScript types, message union contracts, stream throttling.
- 🧩 [**Components & Architecture**](.instructions/reusable-components.md): MAIN world vs ISOLATED world, Shadow DOM, shared helpers.
- 🌐 [**Cross-Platform Standards**](.instructions/cross-platform.md): WXT cross-browser building (Chrome MV3 & Firefox).

## Essential Commands
```bash
npm run compile       # Run TypeScript checks (tsc --noEmit)
npm run build         # Build Chrome MV3 (.output/chrome-mv3)
npm run build:firefox # Build Firefox extension
npm run zip           # Create production .zip packages
```

## Core Rules
1. **Never add unused permissions** to `wxt.config.ts`.
2. **Never request `downloads` or `storage`**: Use `<a download>` and `stores/downloadStore.ts`.
3. **Always use Shadow DOM** (`attachShadow({ mode: 'open' })`) for in-page UI.
4. Always pass `npm run compile` with zero errors.

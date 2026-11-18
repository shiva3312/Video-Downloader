# Store Policy & Security Compliance

This module enforces strict compliance with the **Chrome Web Store Use of Permissions Policy** and the official **Chrome Web Store Troubleshooting Guide for Excessive Permissions**.

Official Policy References:
- [Chrome Web Store Troubleshooting: Excessive Permissions](https://developer.chrome.com/docs/webstore/troubleshooting/#excessive-permissions)
- [Chrome Web Store Program Policies: Use of Permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions/)
- [Single Purpose Policy](https://developer.chrome.com/docs/webstore/program-policies/single-purpose/)

---

## 1. Official Policy Requirements

According to Google's official documentation:
> *"Request access to the narrowest permissions necessary to implement your product's features or services. Don't attempt to 'future proof' your product by requesting a permission that might benefit services or features that have not yet been implemented."*

### Key Rules
1. **Request the Narrowest Permissions:** Always select the API with the lowest level of privilege that achieves the feature.
2. **No "Future-Proofing":** Never declare a permission in `wxt.config.ts` in anticipation of future roadmap features. Permissions may only be added when the code using them is committed and active.
3. **1-to-1 Code Audit:** Every permission declared in `manifest.json` must have a corresponding, active API call in the production bundle. If an automated AST scan finds zero calls, Chrome reviewers issue a **"Purple Potassium"** rejection.
4. **Single Purpose Alignment:** All permissions must directly serve the extension's stated single purpose (*detecting and downloading progressive video streams and blobs*).

---

## 2. Rejection Case Study: "Purple Potassium"

* **Violation Notice:** 
  > *Violation reference ID: Purple Potassium*  
  > *Violation: Requesting but not using the following permission(s): storage, scripting*
* **Root Cause:**
  - `storage` was listed in `wxt.config.ts`, but the extension stores task states in an in-memory `Map` inside `stores/downloadStore.ts`. No `chrome.storage.*` API was called.
  - `scripting` was listed in `wxt.config.ts`, but content scripts are registered declaratively via WXT's `content_scripts` manifest entry. No `chrome.scripting.*` API was called.
* **Resolution:**
  - Removed `storage` and `scripting` from `wxt.config.ts`.
  - Removed dormant `downloads` permission because file saving uses native browser DOM.
  - Bumped version from `1.0.0` to `1.0.1` (Chrome Web Store rejects re-uploading the same version string).

---

## 3. Alternative APIs (Least Privilege in Practice)

Per Google's troubleshooting guide, developers should actively replace broad permissions with narrower alternatives:

| Instead of Requesting... | Use This Alternative | Why |
| :--- | :--- | :--- |
| **`chrome.downloads`** | Standard HTML5 `<a download>` | Generates zero scary install warnings (*"Manage your downloads"*), operates in the page context, and handles in-memory blobs effortlessly. |
| **`chrome.storage`** | In-memory JS Map / standard web storage | Requires zero permissions if data is only needed for the active session. |
| **`chrome.scripting`** | Declarative `content_scripts` via WXT | WXT injects scripts automatically on matching URLs without requiring runtime execution permissions. |
| **Broad `tabs` permission** | **`activeTab`** | Grants temporary, user-initiated host and tab access only when the user explicitly clicks the extension action/popup. |

---

## 4. File Download Protocol (Implementation)

All video downloads in this extension must use native DOM object URLs:

```ts
function saveBlobToDisk(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(blobUrl);
  }, 25000);
}
```

* **Never introduce `chrome.downloads.download`** without explicit user instruction and an architecture change.

---

## 5. Developer Dashboard Justifications

When submitting updates to the Chrome Web Store Developer Console, you must provide concise, technically accurate justifications under the **Privacy** tab:

* **`activeTab` Justification:**
  > *"Required to query the active browser tab when the user clicks the toolbar popup, enabling the extension to detect on-page video elements and relay download commands."*
* **`*://*/*` (`host_permissions`) Justification:**
  > *"Required to detect video elements, stream video data chunks directly from media hosts, and communicate with in-page Service Workers (such as Telegram Web) to stream progressive video documents across web pages."*

---

## 6. Privacy Policy Synchronization

* Whenever any permission or host permission changes:
  1. Update [PRIVACY.md](../PRIVACY.md) Section 3 immediately.
  2. Keep disclosures 100% synchronized with `wxt.config.ts`.
* **Zero Telemetry Rule:** No remote tracking, third-party analytics, or data exfiltration. All processing is 100% local.

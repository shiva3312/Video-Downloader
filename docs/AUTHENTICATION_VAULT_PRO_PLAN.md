# Architecture & Technical Documentation: Multi-User Authentication, Protected Media Vault & Pro License System

**Project:** Video Downloader & Private Media Vault (Web & Telegram)  
**Version:** 1.1.0 (Production Architecture)  
**Target Platform:** Chrome MV3 & Modern Chromium Browsers (WXT Framework + React 18 + TypeScript)  
**Document Status:** Complete & Fully Implemented  

---

## 1. Executive Overview

This document specifies the architecture, data security model, user interface workflows, and technical implementation of the multi-user authentication, in-app encrypted media vault, and cryptographic license verification systems in the Video Downloader extension.

### Core Objectives Achieved:
1. **Multi-User Zero-Knowledge Architecture**: Multiple users on a single machine have completely independent profiles. Each user's media files are encrypted at rest using `AES-256-GCM` with keys derived from their own password via `PBKDF2`.
2. **Protected In-App Media Vault (Local PC Privacy & Isolation)**: Media (videos, photos, chat screenshots, text transcripts) is written directly to the extension's isolated **IndexedDB** database (`AppMediaVaultDB`). No files touch the operating system's `Downloads` folder or Windows Explorer / macOS Finder unless the user explicitly exports them.
3. **Dual-Interface Management (Popup & Native Side Panel)**:
   - **Popup**: Authentication gate, Recent (5) downloads, live Page Media sniffer, active download tasks, and direct side panel launcher.
   - **Side Panel**: Docked manager with 4 dedicated media tabs (**Videos**, **Images**, **Screenshots**, **Texts & Notes**), full-text search, inline HTML5 video player, lightbox zoom, and clipboard copy.
4. **Media Preservation (Blur & Visibility Event Interception)**: Captures `blur` and `visibilitychange` events in capture phase at `document_start` in the Main World, preventing Telegram Web and Snapchat Web from blurring or auto-dismissing view-once media when windows lose focus.
5. **0 KB Media Suppression**: In-page overlays and popup UI automatically probe and omit the `"Save"` action on empty 0 KB videos, broken elements, 0x0 images, and tracking pixels.
6. **Hardened Pro License System**: Tamper-proof license keys (`PRO-TIER-EXPIRY-NONCE-SIG`) verified offline via HMAC-SHA256. Key generation is strictly isolated to off-client administrator CLI scripts (`scripts/generate-key.mjs`), with zero key-minting code present in client bundles.

---

## 2. High-Level System Architecture

```
+-----------------------------------------------------------------------------------------+
|                                    BROWSER ENVIRONMENT                                  |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  +------------------------+  +--------------------------+  +-------------------------+  |
|  |     Popup Dashboard    |  |    Side Panel (Vault)    |  |  Content Scripts & DOM  |  |
|  | - Auth (Login/Register)|  | - 1. Videos (HTML5 Play) |  | - Main World Consumer   |  |
|  | - Recent (5) Vault Items| | - 2. Images (Lightbox)   |  | - Blur/Visibility Shield|  |
|  | - Page Media Sniffer   |  | - 3. Chat Screenshots    |  | - Video/Image Overlays  |  |
|  | - 0 KB Media Filter    |  | - 4. Texts & Transcripts |  | - Chat Range Selector   |  |
|  | - Side Panel Launcher  |  | - Clipboard Copy & Export|  | - Shadow DOM Isolation  |  |
|  +-----------+------------+  +------------+-------------+  +------------+------------+  |
|              |                            |                             |               |
|              +--------------------+       |       +---------------------+               |
|                                   |       |       |                                     |
|                                   v       v       v                                     |
|                         +-------------------------------+                               |
|                         |  Vault & Auth Service Layer   |                               |
|                         |    (User Sessions & RBAC)     |                               |
|                         +---------------+---------------+                               |
|                                         |                                               |
|                +------------------------+------------------------+                      |
|                v                                                 v                      |
|  +-----------------------------+                  +------------------------------+      |
|  |     License & Pro Engine    |                  |    Encrypted In-App Vault    |      |
|  | - Offline HMAC Verification |                  |   (IndexedDB + Web Crypto)   |      |
|  | - Expiration Enforcement    |                  | - AES-256-GCM At Rest        |      |
|  | - Install Instance Binding  |                  | - PBKDF2 Password Derivation |      |
|  | - Feature Gate Enforcement  |                  | - User Data Partitioning     |      |
|  +-----------------------------+                  | - Zero Local PC File Leakage |      |
|                                                   +------------------------------+      |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Data Security & Cryptographic Model

### 3.1 Key Derivation & User Authentication
- **Password Hashing**: User authentication uses `PBKDF2` with `SHA-256`, 100,000 iterations, and a unique 16-byte random salt per user.
- **Vault Encryption Key**:
  $$\text{Key} = \text{PBKDF2}(\text{password}, \text{user.salt}, 100000, 256\text{-bit})$$
- When User A logs in, their vault encryption key is held only in transient session memory.
- When saving an item to the vault, `AES-256-GCM` encrypts the binary payload with a unique 12-byte initialization vector (`IV`).
- User B, having a different password and salt, cannot decrypt User A's ciphertext; any cross-user decryption attempt fails cryptographic tag verification.

### 3.2 Vault Data Schema (`VaultItem`)
```typescript
interface VaultItem {
  id: string;                     // UUIDv4 identifier
  userId: string;                 // Owner profile ID (strict tenant isolation)
  type: 'video' | 'image' | 'chat_screenshot' | 'text';
  title: string;                  // Sanitized display title (decrypted in memory)
  sourceUrl: string;              // Origin stream URL (decrypted in memory)
  format: string;                 // 'MP4', 'WEBM', 'MKV', 'JPG', 'PNG', 'TXT'
  sizeBytes: number;              // Raw unencrypted binary size
  createdAt: number;              // Epoch timestamp (ms)

  // Encrypted Payload at Rest
  isEncrypted: boolean;           // True for all vault items
  iv?: string;                    // 96-bit (12-byte) hex IV for binary payload
  blobData?: Blob;                // AES-256-GCM ciphertext Blob (type: application/octet-stream)
  encryptedThumb?: string;        // "ivHex:ciphertextBase64"
  encryptedMeta?: string;         // "ivHex:ciphertextBase64" (chat & text transcripts)
  encryptedTitle?: string;        // "ivHex:ciphertextBase64"
  encryptedSourceUrl?: string;    // "ivHex:ciphertextBase64"
  originalMimeType?: string;      // Normalized MIME for in-memory playback

  // Media Specific Metadata (decrypted in memory)
  videoMeta?: {
    duration?: number;            // Playback duration in seconds
    resolution?: string;          // e.g. "1080p", "720p"
    dimensions?: { width: number; height: number };
  };
  imageMeta?: {
    dimensions?: { width: number; height: number };
  };
  chatMeta?: {
    participants: string[];       // e.g. ["Alex", "Taylor"]
    messageCount: number;         // Count of captured messages
    formattedTranscript?: string; // Text conversation
    sourceApp?: 'telegram' | 'snapchat' | 'generic';
  };
}
```

### 3.3 Storage Layer Isolation & File Privacy Guarantees
- **Inaccessible from File Explorers & External Players**:
  - Media files are **never** written as regular files into `~/Downloads`, `~/Videos`, or the desktop filesystem.
  - Data is saved exclusively inside the browser's protected, sandboxed IndexedDB storage (`AppMediaVaultDB`).
  - At rest on the user's hard drive / SSD, binary video and image payloads are scrambled `AES-256-GCM` ciphertext labeled as `application/octet-stream`.
  - External players (VLC, Windows Media Player, QuickTime, ffmpeg) and photo viewers **cannot read, parse, or play** these files on disk. Any attempt to inspect them reports corrupt/unrecognized binary data.
  - Titles and origin URLs are also encrypted at rest; unauthenticated database inspection reveals only masked placeholders (`"🔒 Encrypted Media"`).
- **Ephemeral In-Memory Decryption**:
  - The AES-256 key is derived from the user's password using PBKDF2 (100,000 iterations) and retained solely in memory during an active 24-hour session.
  - When viewing or playing media, the extension decrypts the ciphertext in memory into a temporary `blob:` Object URL. As soon as the modal is closed or unmounted, `URL.revokeObjectURL()` frees the memory.
  - On logout or session expiration, the key is permanently purged from memory, locking all media.

---

## 4. Subsystem Implementations

### 4.1 In-App Media Vault & Large File Chunking
- In Manifest V3, message passing between content scripts and background workers via `chrome.runtime.sendMessage` has a memory limit (~32MB - 64MB).
- To support arbitrary file sizes ($>1\text{ GB}$ videos):
  - Files $\le 25\text{ MB}$ transfer in a single Base64 Data URL payload (`VAULT_SAVE_ITEM`).
  - Files $> 25\text{ MB}$ stream sequentially in **10MB chunks** (`VAULT_SAVE_CHUNK`), assembled in the background worker before atomic commit to IndexedDB.
- **MIME Demuxing**: HTML5 `<video>` elements reject raw `application/octet-stream`. Decrypted blobs are mapped to valid browser MIME types (`video/mp4`, `video/webm`, `image/jpeg`, `image/png`).

### 4.2 Pro License Verification & Anti-Tamper Hardening
- **License Key Structure**:
  `PRO-<TIER>-<EXPIRY_HEX>-<NONCE>-<HMAC_SIG>`
- **Offline Signature Verification**:
  $$\text{Data} = \text{TIER} + \text{"-"} + \text{EXPIRY\_HEX} + \text{"-"} + \text{NONCE}$$
  $$\text{FullSig} = \text{HMAC-SHA256}(\text{Data}, \text{SECRET})$$
  $$\text{ExpectedSig} = \text{FullSig}[0 \dots 12]$$
  If $\text{Key.Sig} \ne \text{ExpectedSig}$ or $\text{Date.now()} > \text{Key.ExpiresAt}$, activation is rejected.
- **Client Hardening**:
  - The client bundle contains **only verification logic**.
  - No key-generating functions (`generateLicenseKey`, `generateExpiredKey`) or test generation buttons exist in client-facing code or production builds.
  - Keys are generated exclusively via `scripts/generate-key.mjs`.

### 4.3 Anti-Distraction & Media Preservation Shield
- Many web applications (Telegram Web, Snapchat Web) automatically pause videos, blur self-destructing snaps, or dismiss ephemeral media when the browser window loses focus.
- **Solution**:
  In `entrypoints/main-world.content.ts`, capture-phase listeners are registered at `document_start`:
  ```javascript
  window.addEventListener('blur', (e) => e.stopImmediatePropagation(), true);
  document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
  ```
  This prevents `blur` and `visibilitychange` events from reaching page listeners, keeping media open and playing when using the extension popup, sidepanel, or devtools.

### 4.4 0 KB Media Suppression
- Empty tracking pixels ($0 \times 0$), broken images, and dummy placeholder `<video>` tags are prevented from spawning `"Save"` overlays:
  1. `DownloadOverlay.tsx`: Probes Content-Range and blob size; if `0 B` or $0 \times 0$ dimensions, returns `null` to omit the overlay.
  2. `ImageDownloadOverlay.tsx`: Probes blob size and image dimensions; suppresses the button if $0\text{ B}$ or incomplete.
  3. `index.tsx`: `GET_TAB_VIDEOS` filters out items with 0 dimensions and duration, omitting them from the popup list.
  4. `popup/App.tsx`: `fetchData` and the Page Media renderer suppress the `"Save"` action on any item evaluating to 0 KB.

### 4.5 Clean Chat Injection & Video Clipboard Staging
- **No Drag-and-Drop Triggers**:
  - Synthetic `dragenter` and `dragover` events were observed to lock Telegram Web into a full-screen "Drop files here" overlay waiting for a native drop.
  - Chat sharing now strictly dispatches standard `ClipboardEvent('paste')` on composer inputs and triggers the attach menu file input (`input[type="file"]`), completely eliminating drag overlays.
- **Suppression of Blob Cache IDs (`blob:https://...`)**:
  - Internal browser blob URLs are memory-scoped handles that cannot be accessed across contexts.
  - The clipboard service strictly rejects writing `blob:` URLs as text.
- **Seamless Video Pasting**:
  - Clicking **Copy** on a video stages the binary `File` in the active chat tab and writes rich HTML containing the embedded video DataURL to the clipboard.
  - Pressing `Ctrl+V` inside Telegram Web or chat inputs automatically intercepts the event and injects the staged video `File` directly into the conversation.

---

## 5. Verification & Testing Reference

| Test Script | Scope | Command |
| :--- | :--- | :--- |
| `scripts/test-encryption.mjs` | Verifies AES-256-GCM encryption at rest, PBKDF2 derivation, and user isolation. | `node scripts/test-encryption.mjs` |
| `scripts/test-media-playback.mjs` | Verifies decrypted video/image byte integrity, HTML5 MIME mapping, and Matroska normalization. | `node scripts/test-media-playback.mjs` |
| `scripts/test-zerokb-filtering.mjs` | Tests 0 KB media suppression rules against dummy videos, 0-byte blobs, and tracking pixels. | `node scripts/test-zerokb-filtering.mjs` |
| `scripts/test-batch-and-chat.mjs` | Verifies multi-select toggles, batch filtering, and DataURL chat payload generation. | `node scripts/test-batch-and-chat.mjs` |
| `scripts/generate-key.mjs` | Administrator CLI to generate cryptographically signed Pro activation keys. | `node scripts/generate-key.mjs 30 PRO` |

---

## 6. Manifest & Policy Compliance

- **No `downloads` Permission**: Exporting media to PC utilizes standard DOM `<a download>` object URLs on-demand, maintaining strict compliance with Chrome Web Store minimal permission policies.
- **No `storage` Abuse**: Large media files are stored strictly in IndexedDB, which handles arbitrary binary storage without quota-limiting extension local storage.
- **Side Panel API**: Declared in `wxt.config.ts` via standard Manifest V3 `sidePanel` permissions.

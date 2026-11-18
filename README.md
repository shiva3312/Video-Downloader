# 🎥 Video Downloader & Private Media Vault (Web & Telegram)

A modern, high-performance, security-focused Manifest V3 browser extension built with **WXT**, **React 18**, and **TypeScript**. It automatically detects progressive video streams and photos on web pages (specifically optimized for **Telegram Web** and **Snapchat Web**), enables interactive chat transcript/screenshot captures, and stores all saved media inside a **password-protected, AES-256-GCM encrypted in-app Media Vault** in IndexedDB—keeping your media completely hidden from your computer's OS file system and downloads folder.

---

## ✨ Features

### 🛡️ Protected In-App Media Vault (Zero PC Leakage)
- **Zero OS Leakage**: Downloaded videos, photos, and chat captures are saved directly into the extension's private **IndexedDB** database (`AppMediaVaultDB`), completely isolated from the operating system's `Downloads` folder, Windows Explorer, and macOS Finder.
- **Export to PC On-Demand**: Files only leave the private vault and save to your computer when you explicitly click the **"Download to PC"** button inside the extension.
- **Auto-Sync & Instant Tab Redirection**: Saving content displays live animated loaders (`"Saving in progress..."`) and automatically updates the active list, redirecting you straight to the corresponding media tab.

### 👤 Multi-User Profiles & Zero-Knowledge Encryption
- **Multi-User Isolation**: Multiple people sharing the same computer can each create independent password-protected profiles. User A cannot see, access, or decrypt User B's vault items.
- **AES-256-GCM Encryption at Rest**: Binary media payloads are encrypted using standard Web Crypto `AES-256-GCM` with a key derived from the user's password via `PBKDF2` (100,000 iterations of SHA-256).
- **Session Auto-Lock**: Profiles can be locked and logged out at any time, with sessions automatically expiring after 24 hours.

### 🚀 Telegram Web & Web Video Sniffer
- **Telegram Stream Interceptor**: Automatically hooks into dynamic Telegram Web video containers (`.full-media`, `video`, full-screen viewers) and captures progressive authenticated streams (`https://web.telegram.org/a/progressive/document...`) via Main World Service Worker bridges.
- **Audio Preservation**: Preserves Opus audio by multiplexing Matroska streams into `.mkv` and `.webm` format.
- **Resumable Continuous Streaming**: Reads streams via direct zero-copy ArrayBuffers with pause/resume and automatic recovery on network drops.

### 🖼️ Photo & Image Sniffer
- **Smart Element Detection**: Detects photos, Snapchat snaps, and Telegram image blobs while filtering out small icons, emojis, badges, and avatars.
- **Instant Clipboard Copy**: One-click copy writes images directly to your system clipboard (`navigator.clipboard.write`) as PNG for instant pasting into chats or documents.

### 💬 Chat Range Selector & Visual Archiving
- **Interactive Message Picker**: Hold `Shift` or click messages on Telegram Web and Snapchat Web to select continuous ranges of chat history.
- **Dual Export Modes**: Captures clean visual conversation screenshots (PNG) and formatted text transcripts.

### 🎛️ Dual-Interface Access (Popup + Side Panel)
- **Compact Popup Dashboard**:
  - Profile authentication gate (Sign In & Create Profile).
  - **Recent (5)** list of the latest saved vault items with instant preview and export.
  - **Page Media** sniffer showing active videos and images detected on the current webpage.
  - Quick launcher to open the full Vault Side Panel.
- **Full-Featured Side Panel**:
  - Docked alongside your browser with 4 dedicated tabs: **Videos**, **Images**, **Screenshots**, and **Texts & Notes**.
  - Integrated search bar across titles, formats, and chat participants.
  - Built-in HTML5 video player modal with scrubbing and volume controls.
  - Image lightbox zoom preview modal.

### 👁️ Media Preservation & Event Protection
- **Focus & Visibility Interceptor**: Injects capture-phase listeners at `document_start` in the page's Main World to intercept `blur` and `visibilitychange` events (`e.stopImmediatePropagation()`).
- Prevents web applications (such as Telegram Web and Snapchat Web) from blurring the screen, pausing media playback, or auto-closing ephemeral view-once media when you open the extension popup, side panel, or devtools.

### 🚫 0 KB Media Suppression
- **Strict Size Guards**: Automatically probes and detects 0 KB media, 0x0 images, broken elements, and empty tracking pixels.
- The `"Save"` button is omitted on 0 KB media across both in-page overlays and the extension popup, preventing empty files from cluttering the vault.

### 🔑 Cryptographic Pro License System
- **Verifiable Activation Keys**: Premium features (unlimited vault items, unlimited multi-user profiles) are unlocked via cryptographically signed activation keys (`PRO-TIER-EXPIRY-NONCE-SIG`).
- **Offline HMAC-SHA256 Verification**: Keys are verified locally using constant-time cryptographic signatures and expiration timestamps.
- **Instance Binding**: Uninstallation purges local instance tokens, requiring a fresh key upon re-installation.
- **Secure Architecture**: Client code only contains validation logic; key generation is performed off-client via dedicated administrator CLI scripts.

---

## 📂 Project Structure

```
VideoDownloader/
├── docs/
│   └── AUTHENTICATION_VAULT_PRO_PLAN.md   # Detailed architecture and security design
├── entrypoints/
│   ├── background.ts                      # MV3 service worker (vault chunking, sidepanel opener)
│   ├── main-world.content.ts              # Main World script (stream consumer, blur interceptor)
│   ├── components/
│   │   ├── ErrorBoundary.tsx              # React crash isolation boundary
│   │   └── MediaPreviewModal.tsx          # Universal modal for video playback, images & transcripts
│   ├── content/                           # Shadow DOM in-page overlays
│   │   ├── index.tsx                      # MutationObserver media sniffer & event routing
│   │   ├── DownloadOverlay.tsx            # Floating video download overlay with progress bar
│   │   ├── ImageDownloadOverlay.tsx       # Floating photo download overlay
│   │   ├── DownloadManagerWidget.tsx      # Persistent bottom-right floating progress dock
│   │   ├── overlay.css                    # Scoped CSS for Shadow DOM overlays
│   │   └── chat/                          # Chat selection controller, parser & action bar
│   ├── popup/                             # Toolbar popup UI
│   │   ├── App.tsx                        # Popup main dashboard & media sniffer
│   │   ├── components/
│   │   │   ├── AuthView.tsx               # Sign in & profile gate
│   │   │   ├── RecentVaultList.tsx        # 5 most recent vault items with action buttons
│   │   │   └── ProKeyModal.tsx            # Pro key activation modal
│   │   ├── index.html & main.tsx
│   │   └── style.css
│   └── sidepanel/                         # Native browser Side Panel UI
│       ├── App.tsx                        # 4 Media Tabs (Videos, Images, Screenshots, Texts)
│       ├── components/
│       │   ├── SidePanelHeader.tsx        # Search bar, stats gauge & profile switcher
│       │   ├── SidePanelRegister.tsx      # Registration & Pro key choice form
│       │   ├── SidePanelProLocked.tsx     # Pro upgrade gate screen
│       │   └── VaultTabContent.tsx        # Media card list with preview, copy, PC download
│       ├── index.html & main.tsx
│       └── style.css
├── public/
│   └── icon/                              # Extension icons (16, 48, 128px)
├── scripts/
│   ├── generate-key.mjs                   # Admin CLI tool for generating Pro license keys
│   ├── test-encryption.mjs                # Test suite for AES-256-GCM user vault isolation
│   ├── test-media-playback.mjs            # Test suite for video/image decryption & MIME demuxing
│   └── test-zerokb-filtering.mjs          # Test suite for 0 KB media suppression rules
├── services/
│   ├── authService.ts                     # User management, PBKDF2 hashing & session tokens
│   ├── cryptoUtils.ts                     # Web Crypto PBKDF2, AES-256-GCM & HMAC-SHA256 helpers
│   ├── licenseService.ts                  # Pro license status & key verification
│   └── vaultStorage.ts                    # IndexedDB persistence layer & encryption at rest
├── types/
│   ├── auth.ts                            # User profile and session schemas
│   ├── license.ts                         # License key status and tier schemas
│   └── vault.ts                           # Media item metadata and storage schemas
├── utils/
│   └── downloader.ts                      # Binary streaming, chunked messaging, MIME resolvers
├── package.json
├── tsconfig.json
└── wxt.config.ts                          # Manifest V3 & WXT configuration
```

---

## 🛠️ Installation & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Live Development (Hot Module Reload)
```bash
npm run dev
```
WXT will build the extension in watch mode and launch a fresh, isolated Chrome profile with the extension preloaded.

### 3. Build for Production
```bash
npm run compile   # Verify 0 TypeScript errors
npm run build     # Compile production bundle
```
The optimized, production-ready extension is emitted to `.output/chrome-mv3`.

---

## 🔑 Generating Pro License Keys (Admin CLI)

Pro activation keys are generated **strictly off-client** using the administrator CLI script in `scripts/generate-key.mjs`:

```bash
# Generate a 30-Day Pro key
node scripts/generate-key.mjs 30 PRO

# Generate a 1-Year Pro key
node scripts/generate-key.mjs 365 PRO

# Generate a Lifetime Pro key
node scripts/generate-key.mjs 0 LIFETIME

# Generate an expired key (for testing rejection)
node scripts/generate-key.mjs -1 PRO
```

### Key Format
`PRO-<TIER>-<EXPIRY_HEX>-<NONCE>-<HMAC_SIG>`
- **Example**: `PRO-PRO-1a28996b001-49F61C5A-B5818FDD8DBD`
- Keys are cryptographically verified offline inside the extension using HMAC-SHA256 with timestamp validation.

---

## 🧪 Automated Test Suite

Run the standalone verification suites to test cryptographic isolation, media playback demuxing, and 0 KB suppression:

```bash
# 1. Test AES-256-GCM Multi-User Encryption & Isolation
node scripts/test-encryption.mjs

# 2. Test Decrypted Media Playback, Blobs, and HTML5 MIME Negotiation
node scripts/test-media-playback.mjs

# 3. Test 0 KB Media & Empty Element Suppression Rules
node scripts/test-zerokb-filtering.mjs
```

---

## 📥 Loading into Chrome / Brave / Edge Manually

1. Open your browser and navigate to `chrome://extensions`.
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `.output/chrome-mv3` folder inside this project directory.
5. Open [Telegram Web](https://web.telegram.org/) or [Snapchat Web](https://web.snapchat.com/) and click the extension icon to create your private vault profile!

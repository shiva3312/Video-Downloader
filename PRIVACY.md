# Privacy Policy — Video Downloader (Web & Telegram)

**Last Updated:** November 2026

Video Downloader (Web & Telegram) ("we", "our", or "the extension") values your privacy. This Privacy Policy explains our commitment to transparency regarding user data.

---

## 1. No Data Collection or Tracking
- **Zero Personal Data Collected:** The extension does not collect, record, transmit, or sell any personal information, contact information, passwords, browsing history, or user identities.
- **Zero Analytics or Telemetry:** There are no third-party tracking cookies, analytics SDKs, advertising scripts, or telemetry trackers embedded in this software.

---

## 2. Local In-Browser Processing
- All video stream detection, range requests, chunk assembly, and demuxing occur **100% locally on your computer** within your browser's private sandbox and memory.
- Video bytes are downloaded directly from the media source host to your browser session and saved to your device's local download directory. No media, audio, or video files are ever routed through or stored on external servers or proxies.

---

## 3. Permissions Justification
- **`downloads`**: Used strictly to save completed video files to your local device upon your explicit request.
- **`activeTab`**: Used strictly to inspect the active browser tab for `<video>` elements when the extension popup is opened.
- **`storage`**: Used strictly to save local UI preferences (such as minimized/expanded dock state) and active download task states across tab switches.
- **`scripting`**: Used strictly to render the isolated Shadow DOM download overlay button directly over video elements on web pages.
- **Host Permissions (`*://*/*`, `*://web.telegram.org/*`)**: Required to stream video data chunks directly from media hosts and communicate with Telegram Web's Service Worker to stream progressive video documents.

---

## 4. Policy Changes
Any future updates to this Privacy Policy will be posted to this repository.

---

## 5. Contact
If you have any questions or feedback regarding this Privacy Policy, please open an issue in the official GitHub repository:
https://github.com/shiva3312/Video-Downloader


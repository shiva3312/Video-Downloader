import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChatActionBar } from './ChatActionBar';
import {
  parseAllChatMessages,
  ChatMessageItem,
} from './chatParser';
import {
  copyMessagesToClipboard,
  insertMessagesIntoChatInput,
  copyMessagesAsImage,
  triggerNativeForward,
  formatMessagesAsText,
  renderMessagesAsBlob,
} from './chatFormatter';
import { isSupportedDomain } from '@/utils/mediaDetector';
import chatCss from './chatStyles.css?inline';

const INJECTED_STYLE_ID = 'vd-chat-selection-styles';

const GLOBAL_STYLES = `
/* While in Selection Mode */
[data-vd-chat-active="true"] ul.ujRzj > li {
  cursor: pointer !important;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

[data-vd-chat-active="true"] ul.ujRzj > li:hover .KB4Aq {
  box-shadow: 0 0 0 2px #38bdf8, 0 4px 16px rgba(0, 136, 204, 0.35) !important;
  transform: translateY(-1px) !important;
}

/* Selected Message Rows */
[data-vd-msg-selected="true"] {
  position: relative !important;
  border-left: 3.5px solid #0088cc !important;
  padding-left: 6px !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

/* Highlighted Speech Bubble */
[data-vd-msg-selected="true"] .KB4Aq {
  background: rgba(0, 136, 204, 0.14) !important;
  box-shadow: 0 0 0 2px #0088cc, 0 4px 16px rgba(0, 136, 204, 0.35) !important;
  border-radius: 14px !important;
}

/* START Message (Top-most) */
[data-vd-msg-start="true"] {
  border-left: 3.5px solid #10b981 !important;
}

[data-vd-msg-start="true"] .KB4Aq {
  background: rgba(16, 185, 129, 0.16) !important;
  box-shadow: 0 0 0 2.5px #10b981, 0 6px 20px rgba(16, 185, 129, 0.45) !important;
}

[data-vd-msg-start="true"]::before {
  content: "▲ START";
  position: absolute;
  top: -12px;
  left: 8px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.6px;
  padding: 2px 8px;
  border-radius: 9999px;
  box-shadow: 0 3px 10px rgba(16, 185, 129, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.25);
  z-index: 2147483640;
  pointer-events: none;
  animation: vdBadgePop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

/* END Message (Bottom-most) */
[data-vd-msg-end="true"] {
  border-left: 3.5px solid #3b82f6 !important;
}

[data-vd-msg-end="true"] .KB4Aq {
  background: rgba(59, 130, 246, 0.16) !important;
  box-shadow: 0 0 0 2.5px #3b82f6, 0 6px 20px rgba(59, 130, 246, 0.45) !important;
}

[data-vd-msg-end="true"]::after {
  content: "▼ END";
  position: absolute;
  bottom: -12px;
  right: 8px;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.6px;
  padding: 2px 8px;
  border-radius: 9999px;
  box-shadow: 0 3px 10px rgba(59, 130, 246, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.25);
  z-index: 2147483640;
  pointer-events: none;
  animation: vdBadgePop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes vdBadgePop {
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
}
`;

export class ChatSelectionManager {
  private isSelecting: boolean = false;
  private step: 'start' | 'end' | 'done' = 'start';
  private startMessageId: string | null = null;
  private endMessageId: string | null = null;
  private selectedMessages: ChatMessageItem[] = [];
  private toastMessage: string | null = null;
  private toastTimeout: any = null;

  private hostElement: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private reactRoot: ReactDOM.Root | null = null;

  private lastProjectionId: string | null = null;
  private projectionObserver: MutationObserver | null = null;

  constructor() {
    if (!isSupportedDomain()) return;
    this.injectGlobalStyles();
    this.mountShadowUI();
    this.attachEventListeners();
    this.setupProjectionObserver();
  }

  private injectGlobalStyles() {
    if (!isSupportedDomain()) return;
    if (document.getElementById(INJECTED_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = INJECTED_STYLE_ID;
    style.textContent = GLOBAL_STYLES;
    document.head.appendChild(style);
  }

  public ensureMounted() {
    if (!isSupportedDomain()) return;
    this.injectGlobalStyles();
    this.checkChatProjectionChange();
    const existing = document.getElementById('vd-chat-selection-host');
    if (!existing || !this.hostElement?.isConnected) {
      if (this.hostElement && !this.hostElement.isConnected && document.body) {
        document.body.appendChild(this.hostElement);
      } else {
        this.mountShadowUI();
      }
    }
  }

  /**
   * Detects when active chat switches to a different user via Snapchat's data-projection-id on .aXEpU.
   * When user switches to a different friend, cleanly exits selection mode and clears all highlights
   * to allow fresh selection in the new conversation.
   */
  private checkChatProjectionChange() {
    const activeChatEl = document.querySelector<HTMLElement>(
      '.aXEpU[data-projection-id], div[role="presentation"].aXEpU[data-projection-id], [data-projection-id].aXEpU, div[role="presentation"][data-projection-id]'
    );
    if (activeChatEl) {
      const projId = activeChatEl.getAttribute('data-projection-id');
      if (projId && this.lastProjectionId !== null && projId !== this.lastProjectionId) {
        if (this.isSelecting || this.selectedMessages.length > 0) {
          this.clearSelection(false);
          this.showToast('💬 Chat changed — selection reset');
        }
      }
      if (projId) {
        this.lastProjectionId = projId;
      }
    }
  }

  private setupProjectionObserver() {
    this.checkChatProjectionChange();

    this.projectionObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-projection-id') {
          this.checkChatProjectionChange();
          return;
        }
        if (m.type === 'childList') {
          for (const node of Array.from(m.addedNodes)) {
            if (node instanceof HTMLElement) {
              if (
                node.classList.contains('aXEpU') ||
                node.closest('.aXEpU') ||
                node.querySelector('.aXEpU')
              ) {
                this.checkChatProjectionChange();
                return;
              }
            }
          }
        }
      }
    });

    this.projectionObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-projection-id'],
      childList: true,
      subtree: true,
    });
  }

  private mountShadowUI() {
    if (document.getElementById('vd-chat-selection-host')) return;
    if (!document.body) return;

    this.hostElement = document.createElement('div');
    this.hostElement.id = 'vd-chat-selection-host';
    this.hostElement.style.position = 'fixed';
    this.hostElement.style.top = '0';
    this.hostElement.style.left = '0';
    this.hostElement.style.width = '100%';
    this.hostElement.style.height = '100%';
    this.hostElement.style.zIndex = '2147483647';
    this.hostElement.style.pointerEvents = 'none';

    // 1. Append host element to document.body FIRST so shadow root is connected
    document.body.appendChild(this.hostElement);

    // 2. Attach Shadow Root
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

    // 3. Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = chatCss;
    this.shadowRoot.appendChild(styleEl);

    // 4. Create mount point with pointer-events: none (only individual buttons have pointer-events: auto)
    const mountPoint = document.createElement('div');
    mountPoint.id = 'vd-chat-mount-root';
    mountPoint.style.pointerEvents = 'none';
    this.shadowRoot.appendChild(mountPoint);

    // 5. Mount React Root and render
    this.reactRoot = ReactDOM.createRoot(mountPoint);
    this.render();
  }

  private showToast(msg: string) {
    this.toastMessage = msg;
    this.render();
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = null;
      this.render();
    }, 2800);
  }

  private render() {
    if (!this.reactRoot) return;

    this.reactRoot.render(
      <React.StrictMode>
        <ChatActionBar
          isSelecting={this.isSelecting}
          step={this.step}
          selectedMessages={this.selectedMessages}
          onToggleMode={() => this.toggleSelectionMode()}
          onClear={() => this.clearSelection()}
          onCopyText={() => this.handleCopyText()}
          onCopyImage={() => this.handleCopyImage()}
          onSaveToVault={() => this.handleSaveToVault()}
          toastMessage={this.toastMessage}
        />
      </React.StrictMode>
    );
  }

  public toggleSelectionMode(forceState?: boolean) {
    if (!isSupportedDomain()) return;
    this.isSelecting = forceState !== undefined ? forceState : !this.isSelecting;
    document.body.setAttribute('data-vd-chat-active', this.isSelecting ? 'true' : 'false');

    if (!this.isSelecting) {
      this.clearSelection(false);
    } else {
      this.step = 'start';
    }
    this.render();
  }

  public clearSelection(keepModeOpen: boolean = true) {
    // Clear DOM attributes
    const allMsgs = document.querySelectorAll<HTMLElement>(
      '[data-vd-msg-selected], [data-vd-msg-start], [data-vd-msg-end]'
    );
    allMsgs.forEach((el) => {
      el.removeAttribute('data-vd-msg-selected');
      el.removeAttribute('data-vd-msg-start');
      el.removeAttribute('data-vd-msg-end');
    });

    this.startMessageId = null;
    this.endMessageId = null;
    this.selectedMessages = [];
    this.step = 'start';

    if (!keepModeOpen) {
      this.isSelecting = false;
      document.body.removeAttribute('data-vd-chat-active');
    }

    this.render();
  }

  private attachEventListeners() {
    // 1. External trigger event listener (from popup or persistent widget)
    window.addEventListener('vd:toggle-chat-selection', () => {
      this.toggleSelectionMode();
    });

    // 2. Double-click on ANY message bubble starts range selection directly!
    document.addEventListener(
      'dblclick',
      (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (this.hostElement && this.hostElement.contains(target)) return;

        const msgLi = target.closest('ul.ujRzj > li') as HTMLElement | null;
        if (msgLi) {
          e.preventDefault();
          this.toggleSelectionMode(true);
          this.handleMessageClick(msgLi);
        }
      },
      true
    );

    // 3. Listen for clicks on messages
    document.addEventListener(
      'click',
      (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Ignore clicks inside our own shadow UI
        if (this.hostElement && this.hostElement.contains(target)) return;

        // Check if user clicked a message row inside ul.ujRzj
        const msgLi = target.closest('ul.ujRzj > li') as HTMLElement | null;
        if (!msgLi) return;

        // Check if Shift or Alt key was held -> automatically start selection mode
        if (!this.isSelecting && (e.shiftKey || e.altKey)) {
          e.preventDefault();
          e.stopPropagation();
          this.toggleSelectionMode(true);
          this.handleMessageClick(msgLi);
          return;
        }

        // If selection mode is active, intercept click
        if (this.isSelecting) {
          e.preventDefault();
          e.stopPropagation();
          this.handleMessageClick(msgLi);
        }
      },
      true // capture phase
    );
  }

  private handleMessageClick(msgLi: HTMLElement) {
    const allMessages = parseAllChatMessages();
    if (allMessages.length === 0) return;

    // Find the clicked message item
    const clickedItem = allMessages.find((m) => m.element === msgLi || m.element.contains(msgLi));
    if (!clickedItem) return;

    if (this.step === 'start' || this.step === 'done') {
      // Step 1: Initial Selection
      this.clearSelection(true);
      this.startMessageId = clickedItem.id;
      this.step = 'end';
      this.selectedMessages = [clickedItem];

      clickedItem.element.setAttribute('data-vd-msg-start', 'true');
      clickedItem.element.setAttribute('data-vd-msg-selected', 'true');
      this.render();
    } else if (this.step === 'end') {
      // Step 2: Second message clicked -> Establish range from TOP to BOTTOM!
      this.endMessageId = clickedItem.id;

      const firstIdx = allMessages.findIndex((m) => m.id === this.startMessageId);
      const secondIdx = allMessages.findIndex((m) => m.id === this.endMessageId);

      if (firstIdx === -1 || secondIdx === -1) return;

      // REQUIREMENT: Flow from START to END will ALWAYS be top to bottom!
      // If user selected bottom first and top second, automatically swap them!
      const topIdx = Math.min(firstIdx, secondIdx);
      const bottomIdx = Math.max(firstIdx, secondIdx);

      this.startMessageId = allMessages[topIdx].id;
      this.endMessageId = allMessages[bottomIdx].id;
      this.selectedMessages = allMessages.slice(topIdx, bottomIdx + 1);
      this.step = 'done';

      // Apply attributes in strict top-to-bottom order
      allMessages.forEach((m, idx) => {
        if (idx >= topIdx && idx <= bottomIdx) {
          m.element.setAttribute('data-vd-msg-selected', 'true');
          if (idx === topIdx) {
            m.element.setAttribute('data-vd-msg-start', 'true');
          } else {
            m.element.removeAttribute('data-vd-msg-start');
          }
          if (idx === bottomIdx) {
            m.element.setAttribute('data-vd-msg-end', 'true');
          } else {
            m.element.removeAttribute('data-vd-msg-end');
          }
        } else {
          m.element.removeAttribute('data-vd-msg-selected');
          m.element.removeAttribute('data-vd-msg-start');
          m.element.removeAttribute('data-vd-msg-end');
        }
      });

      this.render();
    }
  }

  // --- ACTIONS ---

  // 1. Copy as Text
  private async handleCopyText() {
    if (this.selectedMessages.length === 0) return;
    const count = this.selectedMessages.length;
    const ok = await copyMessagesToClipboard(this.selectedMessages);
    if (ok) {
      // Also automatically save the text transcript into the user's encrypted Media Vault
      const transcript = formatMessagesAsText(this.selectedMessages);
      const participants = Array.from(
        new Set(this.selectedMessages.map((m) => m.sender).filter(Boolean))
      );
      const title = participants.length > 0
        ? `Chat: ${participants.join(' ↔ ')} (${count} msgs)`
        : `Chat Text (${count} msgs)`;

      try {
        chrome.runtime
          .sendMessage({
            type: 'VAULT_SAVE_IN_PROGRESS',
            payload: { type: 'text', title },
          })
          .catch(() => {});
      } catch {}

      chrome.runtime.sendMessage({
        type: 'VAULT_SAVE_ITEM',
        payload: {
          type: 'text',
          title,
          sourceUrl: window.location.href,
          format: 'TXT',
          textContent: transcript,
          sizeBytes: new Blob([transcript]).size,
          chatMeta: {
            participants,
            messageCount: count,
            formattedTranscript: transcript,
            sourceApp: window.location.hostname.includes('telegram')
              ? 'telegram'
              : 'generic',
          },
          textMeta: {
            wordCount: transcript.split(/\s+/).filter(Boolean).length,
            charCount: transcript.length,
            previewSnippet: transcript.substring(0, 160),
          },
        },
      });

      // Exit selection cleanly and allow user to make a fresh selection
      this.clearSelection(false);
      this.showToast(`✅ Copied & saved ${count} messages to Vault!`);
    } else {
      this.showToast('❌ Failed to copy to clipboard');
    }
  }

  // 2. Screenshot (Captures actual live screen chat from start to end element without download labels or duplications)
  private async handleCopyImage() {
    if (this.selectedMessages.length === 0) return;

    const count = this.selectedMessages.length;
    this.showToast(`📸 Capturing ${count} messages...`);

    const styleEl = document.getElementById(INJECTED_STYLE_ID) as HTMLStyleElement | null;
    const hideStyleId = 'vd-temp-screenshot-hide-styles';

    // Helper: capture native visible tab screen
    const captureFrame = (): Promise<{ success: boolean; dataUrl?: string; error?: string }> =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_TAB_SCREEN' }, (res) => {
          if (chrome.runtime.lastError || !res) {
            resolve({
              success: false,
              error: chrome.runtime.lastError?.message || 'No response from background',
            });
          } else {
            resolve(res);
          }
        });
      });

    // Helper: load image
    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    // Helper: wait for browser paint
    const waitFrame = (ms = 70): Promise<void> =>
      new Promise((r) => requestAnimationFrame(() => setTimeout(r, ms)));

    const firstEl = this.selectedMessages[0].element;
    const lastEl = this.selectedMessages[this.selectedMessages.length - 1].element;

    // --- Identify the true scrollable container reliably ---
    const findScrollContainer = (el: HTMLElement): HTMLElement => {
      // 1. Walk up and find ancestor that has overflow and scrollHeight > clientHeight
      let curr: HTMLElement | null = el.parentElement;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        if (curr.scrollHeight > curr.clientHeight) {
          const style = window.getComputedStyle(curr);
          const ov = style.overflowY;
          if (ov === 'auto' || ov === 'scroll' || ov === 'overlay') {
            return curr;
          }
        }
        curr = curr.parentElement;
      }
      // 2. Direct test: check which ancestor can actually scroll
      curr = el.parentElement;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        if (curr.scrollHeight > curr.clientHeight) {
          const prev = curr.scrollTop;
          curr.scrollTop = prev + 1;
          if (curr.scrollTop !== prev) {
            curr.scrollTop = prev;
            return curr;
          }
        }
        curr = curr.parentElement;
      }
      return (document.scrollingElement as HTMLElement) || document.documentElement;
    };

    const scrollContainer = findScrollContainer(firstEl);
    const savedScrollTop = scrollContainer.scrollTop;
    const prevScrollBehavior = scrollContainer.style.scrollBehavior;
    scrollContainer.style.scrollBehavior = 'auto';

    // Query all download button hosts
    const downloadHosts = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.video-downloader-host, .image-downloader-host, [class*="downloader-host"], #vd-persistent-widget-host, #vd-chat-selection-host'
      )
    );

    try {
      // --- Safe viewport area (avoiding Snapchat sticky top header ~65px and bottom input footer ~70px) ---
      let safeTop = 64;
      const header = document.querySelector<HTMLElement>(
        '.aXEpU > header, .aXEpU header, header.R1ne3, [role="banner"]'
      );
      if (header) {
        const hRect = header.getBoundingClientRect();
        if (hRect.bottom > 0 && hRect.bottom < window.innerHeight * 0.4) {
          safeTop = Math.max(safeTop, Math.round(hRect.bottom));
        }
      }

      let safeBottom = window.innerHeight - 68;
      const footer = document.querySelector<HTMLElement>(
        '.aXEpU form, .aXEpU footer, [role="form"], [contenteditable="true"]'
      );
      if (footer) {
        const fRect = footer.getBoundingClientRect();
        if (fRect.top > window.innerHeight * 0.5 && fRect.top < window.innerHeight) {
          safeBottom = Math.min(safeBottom, Math.round(fRect.top));
        }
      }

      const safeHeight = Math.max(120, safeBottom - safeTop);

      // --- Horizontal crop bounds across all selected messages ---
      let minLeft = Infinity;
      let maxRight = -Infinity;
      for (const msg of this.selectedMessages) {
        const r = msg.element.getBoundingClientRect();
        if (r.width > 0) {
          minLeft = Math.min(minLeft, r.left);
          maxRight = Math.max(maxRight, r.right);
        }
      }

      // Generous horizontal padding (24px) so left text is never clipped
      const paddingX = 24;
      const paddingY = 16;

      const container =
        firstEl.closest<HTMLElement>('ul.ujRzj, ul.MibAa, [class*="messageList"]') ||
        firstEl.parentElement;

      let cropLeft: number;
      let cropRight: number;

      if (container) {
        const cRect = container.getBoundingClientRect();
        cropLeft = Math.max(0, Math.min(minLeft - paddingX, cRect.left));
        cropRight = Math.min(window.innerWidth, Math.max(maxRight + paddingX, cRect.right));
      } else {
        cropLeft = Math.max(0, minLeft - paddingX);
        cropRight = Math.min(window.innerWidth, maxRight + paddingX);
      }

      const cropW = Math.max(40, Math.round(cropRight - cropLeft));

      // --- Calculate scroll-invariant content coordinates ---
      const scRect = scrollContainer.getBoundingClientRect();
      const currentScrollTop = scrollContainer.scrollTop;

      const fRect = firstEl.getBoundingClientRect();
      const lRect = lastEl.getBoundingClientRect();

      const contentStart = (fRect.top - scRect.top) + currentScrollTop - paddingY;
      const contentEnd = (lRect.bottom - scRect.top) + currentScrollTop + paddingY;
      const totalRangeHeight = Math.max(20, Math.round(contentEnd - contentStart));

      // --- CRITICAL: Hide all download labels & buttons from the screenshot ---
      let hideStyleEl = document.getElementById(hideStyleId) as HTMLStyleElement | null;
      if (!hideStyleEl) {
        hideStyleEl = document.createElement('style');
        hideStyleEl.id = hideStyleId;
        hideStyleEl.textContent = `
          .video-downloader-host,
          .image-downloader-host,
          [class*="video-downloader"],
          [class*="image-downloader"],
          [class*="downloader-host"],
          #vd-persistent-widget-host,
          #vd-chat-selection-host {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
        `;
        document.head.appendChild(hideStyleEl);
      }

      downloadHosts.forEach((el) => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
      });

      if (styleEl) {
        styleEl.disabled = true; // Instantly hides START/END badges & outlines
      }
      if (this.hostElement) {
        this.hostElement.style.setProperty('display', 'none', 'important');
        this.hostElement.style.setProperty('visibility', 'hidden', 'important');
      }

      // --- Capture execution ---
      let scaleX = 1;
      let scaleY = 1;
      let finalCanvas: HTMLCanvasElement | null = null;
      let drawnUntilY = 0;

      // PATH 1: Single Frame Fast Path (fits comfortably within safe viewport height)
      if (totalRangeHeight <= safeHeight) {
        // Position firstEl comfortably at safeTop + paddingY
        const currentFirstTop = firstEl.getBoundingClientRect().top;
        const desiredFirstTop = safeTop + paddingY;
        scrollContainer.scrollTop += Math.round(currentFirstTop - desiredFirstTop);
        await waitFrame(80);

        const capRes = await captureFrame();
        if (!capRes.success || !capRes.dataUrl) {
          throw new Error(capRes.error || 'Failed to capture frame');
        }

        const img = await loadImage(capRes.dataUrl);
        scaleX = img.naturalWidth / window.innerWidth;
        scaleY = img.naturalHeight / window.innerHeight;

        const currentTop = Math.max(0, Math.round(firstEl.getBoundingClientRect().top - paddingY));
        const currentBottom = Math.round(lastEl.getBoundingClientRect().bottom + paddingY);
        const cropH = Math.max(20, currentBottom - currentTop);

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(cropW * scaleX);
        canvas.height = Math.round(cropH * scaleY);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const sx = Math.max(0, Math.round(cropLeft * scaleX));
          const sy = Math.max(0, Math.round(currentTop * scaleY));
          const sw = Math.min(img.naturalWidth - sx, canvas.width);
          const sh = Math.min(img.naturalHeight - sy, canvas.height);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          finalCanvas = canvas;
          drawnUntilY = cropH;
        }
      } else {
        // PATH 2: Multi-Frame Long Screenshot (Scroll & Stitch)
        // Waits 520ms between slices on later steps to respect Chrome's MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND
        let masterCanvas: HTMLCanvasElement | null = null;
        let masterCtx: CanvasRenderingContext2D | null = null;
        let step = 0;
        const maxSteps = 30;
        let lastActualScrollTop = -1;

        while (drawnUntilY < totalRangeHeight && step < maxSteps) {
          step++;

          const overlap = step === 1 ? 0 : 20;
          const targetContentY = contentStart + drawnUntilY - overlap;
          const desiredScrollTop = Math.max(0, Math.round(targetContentY - safeTop + scRect.top));

          scrollContainer.scrollTop = desiredScrollTop;
          // Wait 520ms on subsequent steps to prevent Chrome rate limit errors
          await waitFrame(step === 1 ? 80 : 520);

          const actualScrollTop = scrollContainer.scrollTop;

          const capRes = await captureFrame();
          if (!capRes.success || !capRes.dataUrl) {
            throw new Error(capRes.error || 'Failed to capture frame');
          }

          const img = await loadImage(capRes.dataUrl);
          scaleX = img.naturalWidth / window.innerWidth;
          scaleY = img.naturalHeight / window.innerHeight;

          if (!masterCanvas) {
            masterCanvas = document.createElement('canvas');
            masterCanvas.width = Math.round(cropW * scaleX);
            masterCanvas.height = Math.round(totalRangeHeight * scaleY);
            masterCtx = masterCanvas.getContext('2d');
          }

          if (!masterCtx) break;

          const visibleCanvasTop = Math.round((safeTop - scRect.top + actualScrollTop) - contentStart);
          const visibleCanvasBottom = Math.round((safeBottom - scRect.top + actualScrollTop) - contentStart);

          const sliceStartCanvas = Math.max(drawnUntilY, visibleCanvasTop);
          const sliceEndCanvas = Math.min(totalRangeHeight, visibleCanvasBottom);
          const sliceH = sliceEndCanvas - sliceStartCanvas;

          if (sliceH > 0) {
            const screenY = Math.round(contentStart + sliceStartCanvas - actualScrollTop + scRect.top);

            const sx = Math.max(0, Math.round(cropLeft * scaleX));
            const sy = Math.max(0, Math.round(screenY * scaleY));
            const sw = Math.min(img.naturalWidth - sx, Math.round(cropW * scaleX));
            const sh = Math.min(img.naturalHeight - sy, Math.round(sliceH * scaleY));

            const dx = 0;
            const dy = Math.round(sliceStartCanvas * scaleY);

            masterCtx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
            drawnUntilY = sliceEndCanvas;
          }

          if (actualScrollTop === lastActualScrollTop && sliceH <= 0) {
            break;
          }
          lastActualScrollTop = actualScrollTop;
        }

        finalCanvas = masterCanvas;
        if (masterCanvas && drawnUntilY > 0 && drawnUntilY < totalRangeHeight) {
          const trimmed = document.createElement('canvas');
          trimmed.width = masterCanvas.width;
          trimmed.height = Math.round(drawnUntilY * scaleY);
          const tCtx = trimmed.getContext('2d');
          if (tCtx) {
            tCtx.drawImage(masterCanvas, 0, 0, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
            finalCanvas = trimmed;
          }
        }
      }

      if (!finalCanvas || drawnUntilY <= 0) {
        throw new Error('Canvas rendering was empty');
      }

      const finalBlob = await new Promise<Blob | null>((resolve) => {
        finalCanvas!.toBlob((blob) => resolve(blob), 'image/png');
      });

      if (finalBlob) {
        try {
          window.focus();
        } catch {}

        // 1. Write PNG to system clipboard
        let copiedToClipboard = false;
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': finalBlob }),
            ]);
            copiedToClipboard = true;
          } catch (clipErr) {
            console.warn('[ChatSelector] Clipboard write failed:', clipErr);
          }
        }

        // 2. Automatically archive screenshot & transcript in user's encrypted Media Vault (no PC download)
        try {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const participants = Array.from(
              new Set(this.selectedMessages.map((m) => m.sender).filter(Boolean))
            );
            const transcript = formatMessagesAsText(this.selectedMessages);
            const title = participants.length > 0
              ? `Chat: ${participants.join(' ↔ ')} (${count} msgs)`
              : `Chat Screenshot (${count} msgs)`;

            try {
              chrome.runtime
                .sendMessage({
                  type: 'VAULT_SAVE_IN_PROGRESS',
                  payload: { type: 'chat_screenshot', title },
                })
                .catch(() => {});
            } catch {}

            chrome.runtime.sendMessage({
              type: 'VAULT_SAVE_ITEM',
              payload: {
                type: 'chat_screenshot',
                title,
                sourceUrl: window.location.href,
                format: 'PNG',
                dataUrl,
                sizeBytes: finalBlob.size,
                chatMeta: {
                  participants,
                  messageCount: count,
                  formattedTranscript: transcript,
                  sourceApp: window.location.hostname.includes('telegram')
                    ? 'telegram'
                    : 'generic',
                },
              },
            });
          };
          reader.readAsDataURL(finalBlob);
        } catch (vaultErr) {
          console.warn('[ChatSelector] Background vault archive error:', vaultErr);
        }

        // 3. Cleanly exit selection mode
        this.clearSelection(false);

        if (copiedToClipboard) {
          this.showToast(`📸 Screenshot (${count} msgs) copied & saved to Vault!`);
        } else {
          this.showToast(`📸 Screenshot saved to Vault!`);
        }
        return;
      }

      this.showToast('❌ Screen capture failed. Check browser permissions.');
    } catch (err) {
      console.warn('[ChatSelector] Screen capture error:', err);
      this.showToast('❌ Screen capture failed. Please try again.');
    } finally {
      // Restore scroll
      scrollContainer.scrollTop = savedScrollTop;
      scrollContainer.style.scrollBehavior = prevScrollBehavior;

      // Remove temporary hide styles
      const tempStyle = document.getElementById(hideStyleId);
      if (tempStyle) {
        tempStyle.remove();
      }

      // Restore download hosts
      downloadHosts.forEach((el) => {
        el.style.removeProperty('display');
        el.style.removeProperty('visibility');
      });

      // Restore selection styles and floating UI
      if (styleEl) {
        styleEl.disabled = false;
      }
      if (this.hostElement) {
        this.hostElement.style.removeProperty('display');
        this.hostElement.style.removeProperty('visibility');
      }
    }
  }

  // 3. Copy as Styled (HTML Bubbles)
  private async handleCopyHtml() {
    if (this.selectedMessages.length === 0) return;
    const count = this.selectedMessages.length;
    const ok = await copyMessagesToClipboard(this.selectedMessages);
    if (ok) {
      this.clearSelection(false);
      this.showToast(`✨ Copied ${count} styled chat bubbles!`);
    } else {
      this.showToast('❌ Failed to copy styled bubbles');
    }
  }

  // Additional: Paste to Chat Input
  private handleInsertChat() {
    if (this.selectedMessages.length === 0) return;
    const count = this.selectedMessages.length;
    const ok = insertMessagesIntoChatInput(this.selectedMessages);
    if (ok) {
      this.clearSelection(false);
      this.showToast(`💬 Inserted ${count} messages into chat!`);
    } else {
      this.showToast('⚠️ Chat input box not found. Text copied instead!');
      this.handleCopyText();
    }
  }

  private handleNativeForward() {
    if (this.selectedMessages.length === 1) {
      const ok = triggerNativeForward(this.selectedMessages[0]);
      if (ok) {
        this.clearSelection(false);
        this.showToast('↗️ Opened Snapchat Forward dialog');
      } else {
        this.showToast('⚠️ Snapchat forward button not visible on this message');
      }
    }
  }

  // Save selected chat screenshot & transcript to Protected In-App Vault
  private async handleSaveToVault() {
    if (this.selectedMessages.length === 0) return;
    const count = this.selectedMessages.length;
    this.showToast(`🔒 Capturing & saving ${count} messages to Vault...`);

    try {
      const blob = await renderMessagesAsBlob(this.selectedMessages);
      if (!blob) {
        this.showToast('❌ Failed to render chat screenshot');
        return;
      }

      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const participants = Array.from(
        new Set(this.selectedMessages.map((m) => m.sender).filter(Boolean))
      );

      const transcript = formatMessagesAsText(this.selectedMessages);
      const title = participants.length > 0
        ? `Chat: ${participants.join(' ↔ ')} (${count} msgs)`
        : `Chat Screenshot (${count} msgs)`;

      chrome.runtime.sendMessage(
        {
          type: 'VAULT_SAVE_ITEM',
          payload: {
            type: 'chat_screenshot',
            title,
            sourceUrl: window.location.href,
            format: 'PNG',
            dataUrl,
            sizeBytes: blob.size,
            chatMeta: {
              participants,
              messageCount: count,
              formattedTranscript: transcript,
              sourceApp: window.location.hostname.includes('telegram')
                ? 'telegram'
                : 'generic',
            },
          },
        },
        (res) => {
          if (res?.success) {
            this.clearSelection(false);
            this.showToast(`🔒 Saved ${count} messages to Private Vault!`);
          } else if (res?.error === 'NOT_AUTHENTICATED') {
            this.showToast('⚠️ Please sign in to Vault in extension popup first');
          } else {
            this.showToast(`⚠️ ${res?.error || 'Failed to save to Vault'}`);
          }
        }
      );
    } catch (err: any) {
      console.error('[ChatSelector] Save to vault failed:', err);
      this.showToast('❌ Failed to save to Vault. Please try again.');
    }
  }
}

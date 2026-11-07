import { defineContentScript } from 'wxt/sandbox';
import React from 'react';
import ReactDOM from 'react-dom/client';
import DownloadOverlay from './DownloadOverlay';
import DownloadManagerWidget from './DownloadManagerWidget';
import { downloadStore } from '@/stores/downloadStore';
import { downloadVideoWithProgress } from '@/utils/downloader';
import overlayCss from './overlay.css?inline';
import widgetCss from './widget.css?inline';

export default defineContentScript({
  matches: ['*://web.telegram.org/*', '*://*/*'],
  cssInjectionMode: 'manual',
  runAt: 'document_idle',
  main(ctx) {
    console.log('[VideoDownloader] Content script loaded on:', window.location.href);

    // 1. Mount Persistent Download Manager Widget on document.body
    mountPersistentWidget();

    // 2. Global message listener from Main World bridge to update downloadStore
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.source !== 'VD_MAIN') return;

      const { type, url, percent, loadedBytes, totalBytes, format, speed, error } = event.data;
      if (!url) return;

      if (type === 'PROGRESS') {
        downloadStore.updateProgress(url, percent, loadedBytes, totalBytes, format, speed);
      } else if (type === 'RECONNECTING') {
        downloadStore.setReconnecting(url, true);
      } else if (type === 'SUCCESS') {
        downloadStore.setCompleted(url);
      } else if (type === 'ERROR') {
        downloadStore.setError(url, error || 'Download failed');
      }
    });

    const mountedVideos = new WeakSet<HTMLVideoElement>();
    const roots = new WeakMap<HTMLVideoElement, ReactDOM.Root>();

    /**
     * Mounts the global floating Download Manager Widget once directly on document.body.
     * This ensures the active download progress stays alive and visible even when the user
     * scrolls chats or switches channels.
     */
    function mountPersistentWidget() {
      if (document.getElementById('vd-persistent-widget-host')) return;

      const host = document.createElement('div');
      host.id = 'vd-persistent-widget-host';
      host.style.position = 'fixed';
      host.style.bottom = '24px';
      host.style.right = '24px';
      host.style.zIndex = '2147483647';
      host.style.pointerEvents = 'none';

      const shadowRoot = host.attachShadow({ mode: 'open' });
      const styleEl = document.createElement('style');
      styleEl.textContent = widgetCss;
      shadowRoot.appendChild(styleEl);

      const mountPoint = document.createElement('div');
      mountPoint.style.pointerEvents = 'auto';
      shadowRoot.appendChild(mountPoint);

      const root = ReactDOM.createRoot(mountPoint);
      root.render(
        <React.StrictMode>
          <DownloadManagerWidget />
        </React.StrictMode>
      );

      document.body.appendChild(host);
    }

    /**
     * Attaches the React download overlay to a target video element
     */
    function attachOverlayToVideo(video: HTMLVideoElement) {
      if (mountedVideos.has(video)) return;

      const parent = video.parentElement;
      if (!parent) return;

      const computedStyle = window.getComputedStyle(parent);
      if (computedStyle.position === 'static') {
        parent.style.position = 'relative';
      }

      const hostContainer = document.createElement('div');
      hostContainer.className = 'video-downloader-host';
      hostContainer.style.position = 'absolute';
      hostContainer.style.top = '0';
      hostContainer.style.left = '0';
      hostContainer.style.width = '100%';
      hostContainer.style.height = '100%';
      hostContainer.style.pointerEvents = 'none';
      hostContainer.style.zIndex = '2147483640';

      const shadowRoot = hostContainer.attachShadow({ mode: 'open' });
      const styleEl = document.createElement('style');
      styleEl.textContent = overlayCss;
      shadowRoot.appendChild(styleEl);

      const reactMountPoint = document.createElement('div');
      shadowRoot.appendChild(reactMountPoint);

      const root = ReactDOM.createRoot(reactMountPoint);
      root.render(
        <React.StrictMode>
          <DownloadOverlay video={video} />
        </React.StrictMode>
      );

      parent.appendChild(hostContainer);
      mountedVideos.add(video);
      roots.set(video, root);

      // Clean up when video element is destroyed
      const cleanupObserver = new MutationObserver(() => {
        if (!document.contains(video)) {
          root.unmount();
          hostContainer.remove();
          mountedVideos.delete(video);
          cleanupObserver.disconnect();
          notifyVideoCount();
        }
      });

      cleanupObserver.observe(parent, { childList: true });
    }

    /**
     * Scans the document for any video elements and mounts overlays
     */
    function scanAndAttach() {
      const videos = document.querySelectorAll<HTMLVideoElement>('video, video.full-media');
      videos.forEach((video) => {
        if (
          video.offsetWidth > 0 ||
          video.offsetHeight > 0 ||
          video.classList.contains('full-media') ||
          video.src ||
          video.currentSrc
        ) {
          attachOverlayToVideo(video);
        }
      });
      notifyVideoCount();
    }

    function notifyVideoCount() {
      const activeVideos = document.querySelectorAll('video');
      const count = activeVideos.length;
      try {
        chrome.runtime.sendMessage({
          type: 'UPDATE_VIDEO_COUNT',
          payload: { count },
        });
      } catch {
        // Context might be invalidated on extension update
      }
    }

    // Initial scan
    scanAndAttach();

    // Listen for requests from popup to list all active videos or trigger download
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GET_TAB_VIDEOS') {
        const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
        const list = videos
          .map((v, i) => {
            let src = v.currentSrc || v.src;
            if (!src) {
              const s = v.querySelector('source');
              if (s) src = s.src;
            }
            const isBlob = src?.startsWith('blob:');
            const isProgressive = src?.includes('/progressive/');
            return {
              id: i,
              src: src || '',
              videoWidth: v.videoWidth || 0,
              videoHeight: v.videoHeight || 0,
              duration: Math.round(v.duration || 0),
              type: isBlob ? 'Blob Stream' : isProgressive ? 'Telegram Progressive' : 'Direct MP4',
            };
          })
          .filter((v) => Boolean(v.src));

        sendResponse({
          videos: list,
          tasks: downloadStore.getTasks(),
        });
        return true;
      }

      if (message.type === 'POPUP_PAUSE_TASK') {
        downloadStore.pauseTask(message.url);
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'POPUP_RESUME_TASK') {
        downloadStore.resumeTask(message.url);
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'POPUP_DELETE_TASK') {
        downloadStore.deleteTask(message.url);
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'POPUP_RENAME_TASK') {
        downloadStore.renameTask(message.url, message.newFilename);
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'POPUP_CLEAR_COMPLETED') {
        downloadStore.clearCompleted();
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'TRIGGER_TAB_DOWNLOAD') {
        const { url, filename } = message.payload;
        downloadStore.addTask(url, filename);
        downloadVideoWithProgress(url, filename)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }

      return false;
    });

    // Use MutationObserver to detect dynamically mounted videos (essential for Telegram Web SPAs)
    let debounceTimer: any = null;
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
              if (node.tagName === 'VIDEO' || node.querySelector('video')) {
                shouldScan = true;
                break;
              }
            }
          }
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          scanAndAttach();
        }, 150);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    ctx.onInvalidated(() => {
      observer.disconnect();
    });
  },
});

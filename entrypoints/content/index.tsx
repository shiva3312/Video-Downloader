import { defineContentScript } from 'wxt/sandbox';
import React from 'react';
import ReactDOM from 'react-dom/client';
import DownloadOverlay from './DownloadOverlay';
import ImageDownloadOverlay from './ImageDownloadOverlay';
import DownloadManagerWidget from './DownloadManagerWidget';
import { downloadStore } from '@/stores/downloadStore';
import { ChatSelectionManager } from './chat/ChatSelectionController';
import {
  downloadVideoWithProgress,
  downloadImage,
  generateFriendlyVideoName,
  generateFriendlyImageName,
  generateVideoFilename,
  generateImageFilename,
  getImageResolutionLabel,
  isImageUrl,
} from '@/utils/downloader';
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

    // 2. Mount Chat Range Selector for Snapchat Web & modern chat UIs
    const chatSelectionManager = new ChatSelectionManager();

    // 3. Global message listener from Main World bridge to update downloadStore
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
    const videoHostContainers = new WeakMap<HTMLVideoElement, HTMLElement>();

    const mountedImages = new WeakSet<HTMLImageElement>();
    const imageRoots = new WeakMap<HTMLImageElement, ReactDOM.Root>();
    const imageHostContainers = new WeakMap<HTMLImageElement, HTMLElement>();

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
     * Finds the nearest enclosing media container, bubble, or card for a video or image element
     */
    function getMediaCard(el: HTMLElement): HTMLElement {
      const card = el.closest<HTMLElement>(
        '.f8j5n, .ChG6a, .KB4Aq, li.T1yt2, [class*="snap"], [class*="Snap"], [class*="player"], [class*="Player"], [class*="video"], [class*="Video"], [class*="media"], [class*="Media"], [class*="bubble"], [class*="Bubble"], [class*="message"], [class*="Message"], [class*="card"], [class*="story"], figure, article'
      );
      return card || el.parentElement || el;
    }

    /**
     * Checks if an image is actually a poster, thumbnail, or backdrop of an active video player
     * or belongs to a media card containing a video.
     */
    function isImagePosterOrOverlappingVideo(img: HTMLImageElement): boolean {
      // 1. Direct parent / container hierarchy check (up to 6 levels)
      let cur: HTMLElement | null = img.parentElement;
      for (let i = 0; i < 6 && cur && cur.tagName !== 'BODY'; i++) {
        if (cur.querySelector('video')) {
          if (
            i <= 3 ||
            cur.matches(
              '.f8j5n, .ChG6a, .p8r1z, .KB4Aq, li.T1yt2, [class*="snap"], [class*="Snap"], [class*="player"], [class*="Player"], [class*="bubble"], [class*="media"]'
            )
          ) {
            return true;
          }
        }
        cur = cur.parentElement;
      }

      // 2. Enclosing media card check
      const card = getMediaCard(img);
      if (card && card.querySelector('video')) {
        return true;
      }

      // 3. Spatial bounding box overlap check with any video on page
      const imgRect = img.getBoundingClientRect();
      if (imgRect.width > 0 && imgRect.height > 0) {
        const videos = document.querySelectorAll<HTMLVideoElement>('video');
        for (const video of videos) {
          const videoRect = video.getBoundingClientRect();
          if (videoRect.width === 0 || videoRect.height === 0) continue;

          const overlapX = Math.max(0, Math.min(imgRect.right, videoRect.right) - Math.max(imgRect.left, videoRect.left));
          const overlapY = Math.max(0, Math.min(imgRect.bottom, videoRect.bottom) - Math.max(imgRect.top, videoRect.top));
          const overlapArea = overlapX * overlapY;
          const imgArea = imgRect.width * imgRect.height;

          // If more than 15% of the image overlaps with a video, it is a video poster or thumbnail!
          if (imgArea > 0 && overlapArea / imgArea > 0.15) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Removes an active image overlay and unmounts its React tree
     */
    function removeOverlayFromImage(img: HTMLImageElement) {
      const root = imageRoots.get(img);
      if (root) {
        root.unmount();
        imageRoots.delete(img);
      }
      const host = imageHostContainers.get(img);
      if (host) {
        host.remove();
        imageHostContainers.delete(img);
      }
      mountedImages.delete(img);

      // Clean up any residual hosts in parent
      let cur: HTMLElement | null = img.parentElement;
      for (let i = 0; i < 3 && cur && cur.tagName !== 'BODY'; i++) {
        const hosts = cur.querySelectorAll('.image-downloader-host');
        hosts.forEach((h) => h.remove());
        cur = cur.parentElement;
      }
    }

    /**
     * Attaches the React download overlay to a target video element
     */
    function attachOverlayToVideo(video: HTMLVideoElement) {
      // 1. Target parent: on Snapchat, outer card is .f8j5n so the overlay sits at top-left
      // above any snap action overlays. On Telegram and standard players, video.parentElement.
      const snapCard = video.closest<HTMLElement>('.f8j5n, [class*="snap"], [class*="Snap"]');
      const targetParent = snapCard || video.parentElement;
      if (!targetParent) return;

      const card = getMediaCard(video);

      // 2. Remove ANY conflicting image overlays in this media card or targetParent
      const imgsInCard = card.querySelectorAll<HTMLImageElement>('img');
      imgsInCard.forEach((img) => removeOverlayFromImage(img));
      card.querySelectorAll('.image-downloader-host').forEach((h) => h.remove());
      targetParent.querySelectorAll('.image-downloader-host').forEach((h) => h.remove());

      // 3. Prevent duplicate video overlays on the same target parent
      const existingHost = targetParent.querySelector<HTMLElement>(':scope > .video-downloader-host');
      if (mountedVideos.has(video) && roots.has(video) && existingHost?.isConnected) {
        return;
      }

      // If an existing host exists (e.g. stale from a previous React render), clean it up
      if (existingHost) {
        existingHost.remove();
      }
      if (roots.has(video)) {
        try {
          roots.get(video)?.unmount();
        } catch {}
        roots.delete(video);
      }
      mountedVideos.delete(video);

      const computedStyle = window.getComputedStyle(targetParent);
      if (computedStyle.position === 'static') {
        targetParent.style.position = 'relative';
      }

      const hostContainer = document.createElement('div');
      hostContainer.className = 'video-downloader-host';
      hostContainer.style.position = 'absolute';
      hostContainer.style.top = '0';
      hostContainer.style.left = '0';
      hostContainer.style.width = '100%';
      hostContainer.style.height = '100%';
      hostContainer.style.overflow = 'visible'; // Never crop overlay badges or button!
      hostContainer.style.pointerEvents = 'none';
      hostContainer.style.zIndex = '2147483647'; // Highest possible z-index: Video label on top!

      const updatePosition = () => {
        if (!document.contains(video)) return;
        if (targetParent === video.parentElement) {
          const vOffsetTop = video.offsetTop || 0;
          const vOffsetLeft = video.offsetLeft || 0;
          if (vOffsetTop > 0 || vOffsetLeft > 0) {
            hostContainer.style.top = `${vOffsetTop}px`;
            hostContainer.style.left = `${vOffsetLeft}px`;
            hostContainer.style.width = `${video.offsetWidth || video.clientWidth}px`;
            hostContainer.style.height = `${video.offsetHeight || video.clientHeight}px`;
          } else {
            hostContainer.style.top = '0';
            hostContainer.style.left = '0';
            hostContainer.style.width = '100%';
            hostContainer.style.height = '100%';
          }
        } else {
          hostContainer.style.top = '0';
          hostContainer.style.left = '0';
          hostContainer.style.width = '100%';
          hostContainer.style.height = '100%';
        }
      };

      updatePosition();

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

      targetParent.appendChild(hostContainer);
      mountedVideos.add(video);
      roots.set(video, root);
      videoHostContainers.set(video, hostContainer);

      window.addEventListener('resize', updatePosition, { passive: true });
      video.addEventListener('loadedmetadata', updatePosition, { passive: true });

      // Clean up when video element is destroyed
      const cleanupObserver = new MutationObserver(() => {
        if (!document.contains(video)) {
          window.removeEventListener('resize', updatePosition);
          video.removeEventListener('loadedmetadata', updatePosition);
          root.unmount();
          hostContainer.remove();
          mountedVideos.delete(video);
          roots.delete(video);
          videoHostContainers.delete(video);
          cleanupObserver.disconnect();
          notifyMediaCount();
        }
      });

      if (video.parentElement) {
        cleanupObserver.observe(video.parentElement, { childList: true });
      }
      if (targetParent !== video.parentElement) {
        cleanupObserver.observe(targetParent, { childList: true });
      }
    }

    /**
     * Determines whether an <img> qualifies as a downloadable photo
     */
    function shouldAttachToImage(img: HTMLImageElement): boolean {
      if (!img.isConnected) return false;
      if (mountedImages.has(img)) return false;

      // 1. Must NOT be part of any video media card or overlap any video
      if (isImagePosterOrOverlappingVideo(img)) {
        return false;
      }

      const card = getMediaCard(img);
      if (card && card.querySelector('video')) {
        return false;
      }

      // 2. Only ONCE per card / parent (never duplicate overlays on the same media card)
      if (card && card.querySelector('.video-downloader-host, .image-downloader-host')) {
        return false;
      }
      if (
        img.parentElement &&
        img.parentElement.querySelector('.video-downloader-host, .image-downloader-host')
      ) {
        return false;
      }

      const src = img.currentSrc || img.src;
      if (!src || src.startsWith('data:image/svg') || src.length < 5) return false;
      if (src === window.location.href || src === 'about:blank') return false;

      // Ignore internal extension UI elements
      if (
        img.closest('#vd-persistent-widget-host') ||
        img.closest('.video-downloader-host') ||
        img.closest('.image-downloader-host')
      ) {
        return false;
      }

      const parent = img.parentElement;
      if (!parent || parent.tagName === 'BODY' || parent.querySelector('video')) {
        return false;
      }

      const attrW = parseInt(img.getAttribute('width') || '0', 10);
      const attrH = parseInt(img.getAttribute('height') || '0', 10);
      const naturalW = img.naturalWidth || 0;
      const naturalH = img.naturalHeight || 0;
      const clientW = img.clientWidth || img.offsetWidth || 0;
      const clientH = img.clientHeight || img.offsetHeight || 0;

      const w = Math.max(attrW, naturalW, clientW);
      const h = Math.max(attrH, naturalH, clientH);

      // Snapchat photo snap check (matches classes e.g. ChG6a dCE9D or snapchat.com blob)
      const isSnapchatMedia =
        src.includes('snapchat.com') ||
        img.classList.contains('ChG6a') ||
        img.classList.contains('dCE9D');

      if (isSnapchatMedia) {
        return true;
      }

      // Blob images (Telegram, Snapchat, WhatsApp, etc.)
      if (src.startsWith('blob:')) {
        return (w >= 100 && h >= 100) || (w === 0 && h === 0) || w >= 150 || h >= 150;
      }

      // Standard images: filter out small icons, emojis, badges, and avatars
      return (w >= 140 && h >= 140) || (w >= 200 && h >= 80) || (w >= 80 && h >= 200);
    }

    /**
     * Attaches the React download overlay to a target image element
     */
    function attachOverlayToImage(img: HTMLImageElement) {
      if (mountedImages.has(img)) return;
      if (isImagePosterOrOverlappingVideo(img)) return;

      const snapCard = img.closest<HTMLElement>('.f8j5n, [class*="snap"], [class*="Snap"]');
      const targetParent = snapCard || img.parentElement;
      if (!targetParent || targetParent.tagName === 'BODY') return;

      const card = getMediaCard(img);
      if (card && card.querySelector('video')) return;
      if (targetParent.querySelector('video')) return;

      // Ensure ONLY ONCE per card / parent
      if (
        targetParent.querySelector(':scope > .video-downloader-host') ||
        targetParent.querySelector(':scope > .image-downloader-host') ||
        (card && (card.querySelector('.video-downloader-host') || card.querySelector('.image-downloader-host')))
      ) {
        return;
      }

      if (
        img.closest('#vd-persistent-widget-host') ||
        img.closest('.video-downloader-host') ||
        img.closest('.image-downloader-host')
      ) {
        return;
      }

      const computedStyle = window.getComputedStyle(targetParent);
      if (computedStyle.position === 'static') {
        targetParent.style.position = 'relative';
      }

      const hostContainer = document.createElement('div');
      // Strictly image-downloader-host so it never conflicts with video-downloader-host
      hostContainer.className = 'image-downloader-host';
      hostContainer.style.position = 'absolute';
      hostContainer.style.top = '0';
      hostContainer.style.left = '0';
      hostContainer.style.width = '100%';
      hostContainer.style.height = '100%';
      hostContainer.style.overflow = 'visible';
      hostContainer.style.pointerEvents = 'none';
      hostContainer.style.zIndex = '2147483640';

      const updatePosition = () => {
        if (!document.contains(img)) return;
        if (
          targetParent !== img.parentElement ||
          targetParent.children.length <= 2 ||
          (img.offsetLeft === 0 && img.offsetTop === 0)
        ) {
          hostContainer.style.top = '0';
          hostContainer.style.left = '0';
          hostContainer.style.width = '100%';
          hostContainer.style.height = '100%';
        } else {
          hostContainer.style.top = `${img.offsetTop}px`;
          hostContainer.style.left = `${img.offsetLeft}px`;
          hostContainer.style.width = `${img.offsetWidth || img.clientWidth}px`;
          hostContainer.style.height = `${img.offsetHeight || img.clientHeight}px`;
        }
      };

      updatePosition();

      const shadowRoot = hostContainer.attachShadow({ mode: 'open' });
      const styleEl = document.createElement('style');
      styleEl.textContent = overlayCss;
      shadowRoot.appendChild(styleEl);

      const reactMountPoint = document.createElement('div');
      shadowRoot.appendChild(reactMountPoint);

      const root = ReactDOM.createRoot(reactMountPoint);
      root.render(
        <React.StrictMode>
          <ImageDownloadOverlay image={img} />
        </React.StrictMode>
      );

      targetParent.appendChild(hostContainer);
      mountedImages.add(img);
      imageRoots.set(img, root);
      imageHostContainers.set(img, hostContainer);

      window.addEventListener('resize', updatePosition, { passive: true });
      img.addEventListener('load', updatePosition, { passive: true });

      // Clean up when image element is destroyed
      const cleanupObserver = new MutationObserver(() => {
        if (!document.contains(img)) {
          window.removeEventListener('resize', updatePosition);
          img.removeEventListener('load', updatePosition);
          root.unmount();
          hostContainer.remove();
          mountedImages.delete(img);
          imageRoots.delete(img);
          imageHostContainers.delete(img);
          cleanupObserver.disconnect();
          notifyMediaCount();
        }
      });

      if (img.parentElement) {
        cleanupObserver.observe(img.parentElement, { childList: true });
      }
      if (targetParent !== img.parentElement) {
        cleanupObserver.observe(targetParent, { childList: true });
      }
    }





    /**
     * Scans the document for any video or photo elements and mounts overlays
     */
    function scanAndAttach() {
      // 1. Scan videos FIRST so active video players are established
      const videos = document.querySelectorAll<HTMLVideoElement>(
        'video, video.full-media, video.nauoE, [class*="snap"] video, [class*="player"] video'
      );
      videos.forEach((video) => {
        if (
          video.offsetWidth > 0 ||
          video.offsetHeight > 0 ||
          video.classList.contains('full-media') ||
          video.classList.contains('nauoE') ||
          video.src ||
          video.currentSrc ||
          video.querySelector('source')
        ) {
          attachOverlayToVideo(video);
        }
      });

      // 2. Remove any image overlays that now conflict/overlap with an active video
      const allImgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
      allImgs.forEach((img) => {
        if (mountedImages.has(img) && isImagePosterOrOverlappingVideo(img)) {
          removeOverlayFromImage(img);
        }
      });

      // 3. Scan standalone photo images (ignoring any posters/thumbnails of videos)
      const images = document.querySelectorAll<HTMLImageElement>('img');
      images.forEach((img) => {
        if (shouldAttachToImage(img)) {
          attachOverlayToImage(img);
        } else if (!img.complete && (img.src || img.currentSrc)) {
          img.addEventListener(
            'load',
            () => {
              if (shouldAttachToImage(img)) {
                attachOverlayToImage(img);
              }
            },
            { once: true }
          );
        }
      });

      notifyMediaCount();
    }

    function notifyMediaCount() {
      const activeVideos = Array.from(document.querySelectorAll<HTMLVideoElement>('video')).filter(
        (v) => v.src || v.currentSrc || v.querySelector('source')
      );
      const activeImages = Array.from(document.querySelectorAll<HTMLImageElement>('img')).filter(
        (img) => shouldAttachToImage(img) || (mountedImages.has(img) && !isImagePosterOrOverlappingVideo(img))
      );
      const count = activeVideos.length + activeImages.length;
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

    // Listen for requests from popup to list all active media or trigger download
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GET_TAB_VIDEOS') {
        const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
        const videoList = videos
          .map((v, i) => {
            let src = v.currentSrc || v.src;
            if (!src) {
              const s = v.querySelector('source');
              if (s) src = s.src;
            }
            const isBlob = src?.startsWith('blob:');
            const isProgressive = src?.includes('/progressive/');
            const videoIndex = i + 1;
            return {
              id: videoIndex,
              index: videoIndex,
              src: src || '',
              mediaType: 'video' as const,
              videoWidth: v.videoWidth || 0,
              videoHeight: v.videoHeight || 0,
              duration: Math.round(v.duration || 0),
              type: isBlob ? 'Blob Stream' : isProgressive ? 'Telegram Progressive' : 'Direct MP4',
              title: generateFriendlyVideoName(src || '', videoIndex),
            };
          })
          .filter((v) => Boolean(v.src));

        const images = Array.from(document.querySelectorAll<HTMLImageElement>('img')).filter((img) =>
          !isImagePosterOrOverlappingVideo(img) && (shouldAttachToImage(img) || mountedImages.has(img))
        );
        const imageList = images
          .map((img, i) => {
            const src = img.currentSrc || img.src;
            const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10) || img.clientWidth;
            const h = img.naturalHeight || parseInt(img.getAttribute('height') || '0', 10) || img.clientHeight;
            const isBlob = src?.startsWith('blob:');
            const imgIndex = videoList.length + i + 1;
            return {
              id: imgIndex,
              index: imgIndex,
              src: src || '',
              mediaType: 'image' as const,
              videoWidth: w,
              videoHeight: h,
              duration: 0,
              type: isBlob ? 'Blob Photo' : 'Image',
              title: generateFriendlyImageName(src || '', i + 1),
            };
          })
          .filter((img) => Boolean(img.src));

        sendResponse({
          videos: [...videoList, ...imageList],
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
        const { url, filename, title, mediaType } = message.payload;
        const allImages = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
        const isImg =
          mediaType === 'image' ||
          allImages.some((img) => img.src === url || img.currentSrc === url) ||
          isImageUrl(url) ||
          filename?.endsWith('.jpg') ||
          filename?.endsWith('.png') ||
          filename?.endsWith('.webp');

        if (isImg) {
          const safeFilename = filename || generateImageFilename(url, 'jpg', 1);
          const task = downloadStore.addTask(url, safeFilename, undefined, 'JPG', title);
          downloadImage(url, task.filename)
            .then(() => {
              downloadStore.setCompleted(url);
              sendResponse({ success: true });
            })
            .catch((err) => {
              downloadStore.setError(url, err.message);
              sendResponse({ success: false, error: err.message });
            });
        } else {
          const safeFilename = filename || generateVideoFilename(url, 'mp4', 1);
          const task = downloadStore.addTask(url, safeFilename, undefined, 'MP4', title);
          downloadVideoWithProgress(url, task.filename)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        }
        return true;
      }

      if (message.type === 'TOGGLE_CHAT_SELECTION') {
        chatSelectionManager.toggleSelectionMode();
        sendResponse({ success: true });
        return true;
      }

      return false;
    });

    // Use MutationObserver to detect dynamically mounted media (essential for Telegram & Snapchat SPAs)
    let debounceTimer: any = null;
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
              if (
                node.tagName === 'VIDEO' ||
                node.tagName === 'IMG' ||
                node.querySelector('video, img')
              ) {
                shouldScan = true;
                break;
              }
            }
          }
        }
        if (
          mutation.type === 'attributes' &&
          mutation.target instanceof HTMLImageElement &&
          (mutation.attributeName === 'src' || mutation.attributeName === 'currentSrc')
        ) {
          shouldScan = true;
          break;
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          scanAndAttach();
          chatSelectionManager.ensureMounted();
        }, 150);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });

    ctx.onInvalidated(() => {
      observer.disconnect();
    });
  },
});

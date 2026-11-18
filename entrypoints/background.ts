import { authService } from '@/services/authService';
import { vaultStorage } from '@/services/vaultStorage';
import { licenseService } from '@/services/licenseService';
import { sniffBlobMediaInfo, isSupportedDomain } from '@/utils/mediaDetector';
import { isAppExpired } from '@/utils/expiration';

interface PendingChunkUpload {
  uploadId: string;
  totalChunks: number;
  chunks: Blob[];
  meta: any;
}

export default defineBackground(() => {
  console.log('[VideoDownloader] Background service worker initialized.');
  const pendingChunkUploads = new Map<string, PendingChunkUpload>();

  // Handle messages from content script or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_VIDEO_COUNT') {
      const tabId = sender.tab?.id;
      const count = message.payload?.count || 0;
      const senderUrl = sender.tab?.url || '';

      if (tabId) {
        const actionApi = chrome.action || (chrome as any).browserAction;
        if (actionApi) {
          // Strictly suppress badge if app is expired or on non-Telegram/non-Snapchat tabs
          if (isAppExpired() || !isSupportedDomain(senderUrl)) {
            actionApi.setBadgeText({ tabId, text: '' });
          } else {
            actionApi.setBadgeText({
              tabId,
              text: count > 0 ? String(count) : '',
            });
            actionApi.setBadgeBackgroundColor({
              tabId,
              color: '#0088cc', // Modern Telegram/cyan blue badge
            });
          }
        }
      }
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'CAPTURE_TAB_SCREEN') {
      if (isAppExpired()) {
        sendResponse({ success: false, error: 'APPLICATION_EXPIRED' });
        return false;
      }
      const winId = sender.tab?.windowId;
      const options = { format: 'png' as const };

      const attemptCapture = (useSpecificWindow: boolean) => {
        const cb = (dataUrl?: string) => {
          const err = chrome.runtime.lastError;
          if ((err || !dataUrl) && useSpecificWindow) {
            // Fallback: try capturing without specifying winId
            attemptCapture(false);
          } else if (err || !dataUrl) {
            console.error('[VideoDownloader:Background] captureVisibleTab error:', err?.message);
            sendResponse({
              success: false,
              error: err?.message || 'Failed to capture screen',
            });
          } else {
            sendResponse({ success: true, dataUrl });
          }
        };

        try {
          if (useSpecificWindow && typeof winId === 'number' && winId > 0) {
            chrome.tabs.captureVisibleTab(winId, options, cb);
          } else {
            chrome.tabs.captureVisibleTab(options, cb);
          }
        } catch (e: any) {
          if (useSpecificWindow) {
            attemptCapture(false);
          } else {
            sendResponse({ success: false, error: e?.message || 'Capture exception' });
          }
        }
      };

      attemptCapture(typeof winId === 'number' && winId > 0);
      return true; // Keep message port open for async response
    }

    if (message.type === 'OPEN_SIDE_PANEL') {
      const windowId = sender.tab?.windowId || message.payload?.windowId;
      const sidePanelApi = (chrome as any).sidePanel;

      if (sidePanelApi && typeof sidePanelApi.open === 'function') {
        if (typeof windowId === 'number' && windowId > 0) {
          sidePanelApi.open({ windowId }, () => {
            sendResponse({ success: !chrome.runtime.lastError });
          });
          return true;
        } else {
          chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab?.windowId) {
              sidePanelApi.open({ windowId: tab.windowId }, () => {
                sendResponse({ success: !chrome.runtime.lastError });
              });
            } else {
              sendResponse({ success: false, error: 'No active window found' });
            }
          });
          return true;
        }
      } else {
        // Fallback: Open sidepanel.html in a new tab if sidePanel API is unsupported
        chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
        sendResponse({ success: true, fallback: true });
        return false;
      }
    }

    if (message.type === 'VAULT_GET_SESSION') {
      authService.getActiveSession().then((session) => {
        sendResponse({ session });
      });
      return true;
    }

    if (message.type === 'VAULT_SAVE_ITEM') {
      if (isAppExpired()) {
        sendResponse({ success: false, error: 'APPLICATION_EXPIRED' });
        return false;
      }
      (async () => {
        try {
          const session = await authService.getActiveSession();
          if (!session?.userId || !session?.encryptionKeyHex) {
            sendResponse({ success: false, error: 'NOT_AUTHENTICATED' });
            return;
          }

          const canSave = await licenseService.canSaveVaultItem(session.userId);
          if (!canSave.allowed) {
            sendResponse({ success: false, error: canSave.reason });
            return;
          }

          const payload = message.payload || {};

          // Broadcast that saving is in progress to show loader in sidepanel & popup
          try {
            chrome.runtime
              .sendMessage({
                type: 'VAULT_SAVE_IN_PROGRESS',
                payload: {
                  type: payload.type || 'video',
                  title: payload.title || 'Saved Media',
                },
              })
              .catch(() => {});
          } catch {}

          let blobData: Blob | undefined;
          let finalFormat = payload.format || (payload.type === 'text' ? 'TXT' : 'PNG');
          let finalMime = payload.mimeType;

          if (payload.dataUrl) {
            const res = await fetch(payload.dataUrl);
            const rawBlob = await res.blob();
            try {
              const sniffed = await sniffBlobMediaInfo(rawBlob);
              if (payload.type === 'video' || sniffed.type === 'video') {
                finalFormat = sniffed.format;
                finalMime = sniffed.mimeType;
              } else if (payload.type === 'image' || sniffed.type === 'image') {
                finalFormat = sniffed.format;
                finalMime = sniffed.mimeType;
              }
            } catch {}

            finalMime =
              finalMime ||
              (payload.type === 'video'
                ? finalFormat === 'MKV' || finalFormat === 'WEBM'
                  ? 'video/webm'
                  : 'video/mp4'
                : finalFormat === 'PNG'
                ? 'image/png'
                : 'image/jpeg');

            blobData = new Blob([rawBlob], { type: finalMime });
          } else if (payload.textContent) {
            blobData = new Blob([payload.textContent], { type: 'text/plain;charset=utf-8' });
          }

          const saved = await vaultStorage.saveItem({
            userId: session.userId,
            type: payload.type || 'video',
            title: payload.title || 'Saved Media',
            sourceUrl: payload.sourceUrl || '',
            format: finalFormat,
            sizeBytes: blobData?.size || payload.sizeBytes || 0,
            blobData,
            thumbnail: payload.thumbnail || (payload.type === 'image' ? payload.dataUrl : undefined),
            videoMeta: payload.videoMeta,
            imageMeta: payload.imageMeta,
            chatMeta: payload.chatMeta,
            textMeta: payload.textMeta,
          });

          sendResponse({ success: true, item: { id: saved.id, title: saved.title } });
        } catch (err: any) {
          console.error('[Background:Vault] Failed to save item:', err);
          try {
            chrome.runtime
              .sendMessage({
                type: 'VAULT_SAVE_ERROR',
                payload: { error: err?.message || 'Failed to save item to vault' },
              })
              .catch(() => {});
          } catch {}
          sendResponse({ success: false, error: err?.message || 'Failed to save item to vault' });
        }
      })();
      return true;
    }

    if (message.type === 'VAULT_SAVE_CHUNK') {
      if (isAppExpired()) {
        sendResponse({ success: false, error: 'APPLICATION_EXPIRED' });
        return false;
      }
      (async () => {
        try {
          const { uploadId, chunkIndex, totalChunks, chunkDataUrl, meta } = message.payload;
          let upload = pendingChunkUploads.get(uploadId);
          if (!upload) {
            upload = { uploadId, totalChunks, chunks: [], meta };
            pendingChunkUploads.set(uploadId, upload);
          }

          const res = await fetch(chunkDataUrl);
          const chunkBlob = await res.blob();
          upload.chunks[chunkIndex] = chunkBlob;

          let receivedCount = 0;
          for (let i = 0; i < totalChunks; i++) {
            if (upload.chunks[i]) receivedCount++;
          }

          if (receivedCount === totalChunks) {
            pendingChunkUploads.delete(uploadId);
            const assembledBlob = new Blob(upload.chunks);
            let finalFormat = meta.format || 'MP4';
            let targetMime = meta.mimeType;

            try {
              const sniffed = await sniffBlobMediaInfo(assembledBlob);
              if (meta.type === 'video' || sniffed.type === 'video') {
                finalFormat = sniffed.format;
                targetMime = sniffed.mimeType;
              }
            } catch {}

            targetMime =
              targetMime ||
              (meta.type === 'video'
                ? finalFormat === 'MKV' || finalFormat === 'WEBM'
                  ? 'video/webm'
                  : 'video/mp4'
                : 'image/jpeg');

            const fullBlob = new Blob(upload.chunks, { type: targetMime });

            const session = await authService.getActiveSession();
            if (!session?.userId || !session?.encryptionKeyHex) {
              sendResponse({ success: false, error: 'NOT_AUTHENTICATED' });
              return;
            }

            const saved = await vaultStorage.saveItem({
              userId: session.userId,
              type: meta.type || 'video',
              title: meta.title || 'Saved Video',
              sourceUrl: meta.sourceUrl || '',
              format: finalFormat,
              sizeBytes: fullBlob.size,
              blobData: fullBlob,
              thumbnail: meta.thumbnail,
              videoMeta: meta.videoMeta,
              imageMeta: meta.imageMeta,
            });

            sendResponse({ success: true, item: { id: saved.id, title: saved.title } });
          } else {
            sendResponse({ success: true, chunkReceived: chunkIndex + 1, totalChunks });
          }
        } catch (err: any) {
          console.error('[Background:Vault] Chunk upload error:', err);
          sendResponse({ success: false, error: err?.message || 'Chunk error' });
        }
      })();
      return true;
    }

    return false;
  });

  // Clean up badge when tab is updated, refreshed, or navigates away from supported domains
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' || (tab?.url && !isSupportedDomain(tab.url))) {
      const actionApi = chrome.action || (chrome as any).browserAction;
      if (actionApi) {
        actionApi.setBadgeText({ tabId, text: '' });
      }
    }
  });
});


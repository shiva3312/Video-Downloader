import { defineContentScript } from 'wxt/sandbox';
import { detectMediaContainer, isSupportedDomain } from '@/utils/mediaDetector';

interface DownloadController {
  paused: boolean;
  cancelled: boolean;
  abortController?: AbortController;
  resumeResolve?: () => void;
}

interface DownloadSession {
  url: string;
  filename: string;
  offset: number;
  total: number | null;
  chunks: Uint8Array[];
  contentType: string;
  format: string;
  controller: DownloadController;
  lastCalcTime: number;
  lastCalcBytes: number;
  currentSpeed: number;
}

export default defineContentScript({
  matches: [
    '*://web.telegram.org/*',
    '*://*.telegram.org/*',
    '*://www.snapchat.com/*',
    '*://web.snapchat.com/*',
    '*://*.snapchat.com/*',
  ],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    // Strictly restrict Main World streaming bridge to Telegram & Snapchat
    if (!isSupportedDomain(window.location.href)) {
      return;
    }

    console.log('[VideoDownloader:MainWorld] Initialized high-performance streaming in MAIN world.');

    // Stop blur events from propagating or hiding elements
    window.addEventListener('blur', (e) => e.stopImmediatePropagation(), true);
    document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);

    // Persistent sessions map so downloads RESUME from the exact same byte offset!
    const downloadSessions = new Map<string, DownloadSession>();

    window.addEventListener('message', async (event: MessageEvent) => {
      if (event.data?.source !== 'VD_ISOLATED') return;

      const { type, url, filename } = event.data;
      if (!url) return;

      // Handle Pause
      if (type === 'PAUSE_DOWNLOAD') {
        const session = downloadSessions.get(url);
        if (session) {
          session.controller.paused = true;
          session.currentSpeed = 0;
          if (session.controller.abortController) {
            session.controller.abortController.abort();
          }
          console.log('[VideoDownloader:MainWorld] Paused download at offset:', session.offset);
        }
        return;
      }

      // Handle Resume
      if (type === 'RESUME_DOWNLOAD') {
        const session = downloadSessions.get(url);
        if (session) {
          session.controller.paused = false;
          if (session.controller.resumeResolve) {
            session.controller.resumeResolve();
            session.controller.resumeResolve = undefined;
          }
          console.log('[VideoDownloader:MainWorld] Resumed download from offset:', session.offset);
        } else {
          executeResumableDownload(url, filename || `video_${Date.now()}.mp4`, downloadSessions);
        }
        return;
      }

      // Handle Cancel / Delete (immediately purge in-memory chunks, abort network, NEVER save partial data)
      if (type === 'CANCEL_DOWNLOAD') {
        const session = downloadSessions.get(url);
        if (session) {
          session.controller.cancelled = true;
          if (session.controller.abortController) {
            session.controller.abortController.abort();
          }
          if (session.controller.resumeResolve) {
            session.controller.resumeResolve();
            session.controller.resumeResolve = undefined;
          }
          // Immediately purge all buffered bytes from memory
          session.chunks = [];
          session.offset = 0;
          downloadSessions.delete(url);
          console.log('[VideoDownloader:MainWorld] Cancelled download and purged all partial data for:', url);
        }
        return;
      }

      // Handle Rename
      if (type === 'RENAME_DOWNLOAD') {
        const session = downloadSessions.get(url);
        if (session) {
          session.filename = filename;
          console.log('[VideoDownloader:MainWorld] Renamed session file to:', filename);
        }
        return;
      }

      // Handle Probe Video Details (returns exact Service Worker Content-Range size & format or Blob size)
      if (type === 'PROBE_VIDEO_DETAILS') {
        try {
          if (url.startsWith('blob:')) {
            try {
              const probeRes = await window.fetch(url);
              const blob = await probeRes.blob();
              let format = 'MP4';
              let contentType = blob.type || '';

              try {
                const headerBuf = await blob.slice(0, 128).arrayBuffer();
                const sniffed = detectMediaContainer(new Uint8Array(headerBuf));
                format = sniffed.format;
                contentType = sniffed.mimeType;
              } catch {}

              if (contentType.includes('matroska')) format = 'MKV';
              else if (contentType.includes('webm')) format = 'WEBM';

              window.postMessage(
                {
                  source: 'VD_MAIN',
                  type: 'PROBE_RESULT',
                  url,
                  totalBytes: blob.size,
                  format,
                },
                '*'
              );
            } catch (blobErr) {
              console.warn('[VideoDownloader:MainWorld] Blob probe error:', blobErr);
            }
            return;
          }

          const isSameOrigin = url.startsWith(window.location.origin) || url.startsWith('/') || url.includes('web.telegram.org');
          const credentialsMode = isSameOrigin ? 'include' : 'same-origin';

          const probeRes = await window.fetch(url, {
            headers: {
              Range: 'bytes=0-128',
            },
            credentials: credentialsMode,
          });

          let format = 'MP4';
          const contentType = probeRes.headers.get('content-type') || '';
          if (contentType.includes('matroska')) format = 'MKV';
          else if (contentType.includes('webm')) format = 'WEBM';

          try {
            const probeHeader = await probeRes.clone().arrayBuffer();
            if (probeHeader.byteLength >= 4) {
              const sniffed = detectMediaContainer(new Uint8Array(probeHeader));
              format = sniffed.format;
            }
          } catch {}

          let totalBytes = 0;
          const contentRange = probeRes.headers.get('content-range');
          if (contentRange) {
            const match = contentRange.match(/\/(\d+|\*)$/);
            if (match && match[1] !== '*') {
              totalBytes = parseInt(match[1], 10);
            }
          } else {
            const cl = probeRes.headers.get('content-length');
            if (cl) totalBytes = parseInt(cl, 10);
          }

          window.postMessage(
            {
              source: 'VD_MAIN',
              type: 'PROBE_RESULT',
              url,
              totalBytes,
              format,
            },
            '*'
          );
        } catch (err) {
          console.warn('[VideoDownloader:MainWorld] Probe error:', err);
        }
        return;
      }

      // Handle Start Download
      if (type === 'START_DOWNLOAD') {
        console.log('[VideoDownloader:MainWorld] Starting/resuming download for:', { url, filename });

        try {
          await executeResumableDownload(url, filename || `video_${Date.now()}.mp4`, downloadSessions);
        } catch (err: any) {
          if (err?.message === 'Download cancelled') {
            console.log('[VideoDownloader:MainWorld] Download cleanly cancelled.');
            return;
          }
          console.error('[VideoDownloader:MainWorld] Download error:', err);
          window.postMessage(
            {
              source: 'VD_MAIN',
              type: 'ERROR',
              url,
              error: err?.message || 'Download failed',
            },
            '*'
          );
        }
      }

      // Handle Probe Image Details
      if (type === 'PROBE_IMAGE_DETAILS') {
        try {
          const probeRes = await window.fetch(url, { credentials: 'include' });
          const blob = await probeRes.blob();
          let format = 'JPG';
          const contentType = blob.type || probeRes.headers.get('content-type') || '';
          if (contentType.includes('png')) format = 'PNG';
          else if (contentType.includes('webp')) format = 'WEBP';
          else if (contentType.includes('gif')) format = 'GIF';
          else if (contentType.includes('svg')) format = 'SVG';

          window.postMessage(
            {
              source: 'VD_MAIN',
              type: 'IMAGE_PROBE_RESULT',
              url,
              totalBytes: blob.size,
              format,
            },
            '*'
          );
        } catch {
          // Best-effort
        }
        return;
      }

      // Handle Start Image Download
      if (type === 'START_IMAGE_DOWNLOAD') {
        console.log('[VideoDownloader:MainWorld] Starting image download for:', { url, filename });
        try {
          await executeImageDownload(url, filename || `photo_${Date.now()}.jpg`);
        } catch (err: any) {
          console.error('[VideoDownloader:MainWorld] Image download error:', err);
          window.postMessage(
            {
              source: 'VD_MAIN',
              type: 'ERROR',
              url,
              error: err?.message || 'Image download failed',
            },
            '*'
          );
        }
        return;
      }
    });

    /**
     * High-speed, resumable continuous stream consumer.
     * Uses direct zero-copy ArrayBuffers and stream pipelining for maximum download speed.
     * Strictly cancels without saving any partial data if user cancels.
     */
    async function executeResumableDownload(
      url: string,
      filename: string,
      sessions: Map<string, DownloadSession>
    ) {
      let session = sessions.get(url);
      if (!session) {
        session = {
          url,
          filename,
          offset: 0,
          total: null,
          chunks: [],
          contentType: 'video/mp4',
          format: 'MP4',
          controller: { paused: false, cancelled: false },
          lastCalcTime: Date.now(),
          lastCalcBytes: 0,
          currentSpeed: 0,
        };
        sessions.set(url, session);
      } else {
        console.log(
          `[VideoDownloader:MainWorld] Resuming existing session! Already downloaded: ${session.offset} bytes (${session.chunks.length} chunks)`
        );
        session.controller.paused = false;
        session.controller.cancelled = false;
        session.lastCalcTime = Date.now();
        session.lastCalcBytes = session.offset;
      }

      const { controller } = session;

      // Handle in-memory Blob URLs directly
      if (url.startsWith('blob:')) {
        try {
          const res = await window.fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          if (controller.cancelled) {
            session.chunks = [];
            sessions.delete(url);
            return;
          }
          if (blob.size === 0) {
            throw new Error('Blob is empty (0 bytes)');
          }

          // Sniff container magic bytes from the first 128 bytes
          let detectedFormat = 'MP4';
          let detectedMime = 'video/mp4';
          let ext = 'mp4';

          try {
            const sliceBuf = await blob.slice(0, 128).arrayBuffer();
            const sniffed = detectMediaContainer(new Uint8Array(sliceBuf));
            detectedFormat = sniffed.format;
            detectedMime = sniffed.mimeType;
            ext = sniffed.ext;
          } catch {}

          if (blob.type && blob.type.includes('webm')) {
            detectedFormat = 'WEBM';
            detectedMime = 'video/webm';
            ext = 'webm';
          } else if (blob.type && blob.type.includes('matroska')) {
            detectedFormat = 'MKV';
            detectedMime = 'video/webm';
            ext = 'mkv';
          }

          let finalFilename = filename;
          if (!finalFilename.toLowerCase().endsWith(`.${ext}`)) {
            finalFilename = finalFilename.replace(/\.[a-zA-Z0-9]+$/, '') + `.${ext}`;
          }

          const typedBlob = blob.type === detectedMime ? blob : new Blob([blob], { type: detectedMime });

          window.postMessage(
            {
              source: 'VD_MAIN',
              type: 'SUCCESS',
              url,
              blob: typedBlob,
              filename: finalFilename,
              format: detectedFormat,
            },
            '*'
          );
          sessions.delete(url);
          return;
        } catch (e: any) {
          console.warn('[VideoDownloader:MainWorld] Direct blob fetch failed:', e);
        }
      }

      while (true) {
        if (controller.cancelled) {
          session.chunks = [];
          sessions.delete(url);
          console.log('[VideoDownloader:MainWorld] Cancelled - discarded partial chunks.');
          return;
        }

        // Pause loop
        while (controller.paused) {
          await new Promise<void>((resolve) => {
            controller.resumeResolve = resolve;
          });
          if (controller.cancelled) {
            session.chunks = [];
            sessions.delete(url);
            console.log('[VideoDownloader:MainWorld] Cancelled during pause - discarded partial chunks.');
            return;
          }
        }

        let chunkRes: Response | null = null;
        let retryAttempt = 0;

        // Resilient retry loop on connection drops
        while (true) {
          if (controller.cancelled) {
            session.chunks = [];
            sessions.delete(url);
            return;
          }

          while (controller.paused) {
            await new Promise<void>((resolve) => {
              controller.resumeResolve = resolve;
            });
            if (controller.cancelled) {
              session.chunks = [];
              sessions.delete(url);
              return;
            }
          }

          if (!navigator.onLine) {
            console.warn('[VideoDownloader:MainWorld] Browser offline. Waiting for connection...');
            window.postMessage(
              {
                source: 'VD_MAIN',
                type: 'RECONNECTING',
                url,
                attempt: retryAttempt,
                reason: 'Offline',
              },
              '*'
            );

            await new Promise<void>((resolve) => {
              const onOnline = () => {
                window.removeEventListener('online', onOnline);
                resolve();
              };
              window.addEventListener('online', onOnline);
            });
          }

          try {
            const abortController = new AbortController();
            controller.abortController = abortController;

            // Check if URL is same-origin or Telegram vs third-party CDN (e.g. Snapchat CDN)
            const isSameOrigin = url.startsWith(window.location.origin) || url.startsWith('/') || url.includes('web.telegram.org');
            const credentialsMode = isSameOrigin ? 'include' : 'same-origin';

            // Open-ended Range allows Service Worker to stream continuously at maximum throughput
            chunkRes = await window.fetch(url, {
              headers: {
                Range: `bytes=${session.offset}-`,
              },
              credentials: credentialsMode,
              signal: abortController.signal,
            });

            // If server returned HTTP 200 OK while offset was > 0, it means the server ignored the Range header
            // and sent from byte 0. Reset chunks and offset so we don't corrupt the file with duplicated headers!
            if (chunkRes.status === 200 && session.offset > 0) {
              console.warn('[VideoDownloader:MainWorld] Server returned HTTP 200 for Range request. Restarting stream from byte 0 to prevent corruption.');
              session.chunks = [];
              session.offset = 0;
            }

            if (chunkRes.status === 206 || chunkRes.status === 200) {
              break;
            }

            console.warn(
              `[VideoDownloader:MainWorld] Chunk HTTP ${chunkRes.status} at offset ${session.offset}. Retrying...`
            );
          } catch (fetchErr: any) {
            if (controller.cancelled || fetchErr?.name === 'AbortError') {
              session.chunks = [];
              sessions.delete(url);
              return;
            }
            console.warn(
              `[VideoDownloader:MainWorld] Network failure at offset ${session.offset} (attempt ${retryAttempt + 1}):`,
              fetchErr
            );
          }

          retryAttempt++;
          const backoffDelay = Math.min(4000, 350 * Math.pow(1.3, Math.min(retryAttempt, 5)));

          window.postMessage(
            {
              source: 'VD_MAIN',
              type: 'RECONNECTING',
              url,
              attempt: retryAttempt,
            },
            '*'
          );

          await new Promise((r) => setTimeout(r, backoffDelay));
        }

        const res = chunkRes!;
        const resContentType = res.headers.get('content-type');
        if (resContentType) {
          session.contentType = resContentType;
          if (resContentType.includes('matroska')) session.format = 'MKV';
          else if (resContentType.includes('webm')) session.format = 'WEBM';
          else session.format = 'MP4';
        }

        // Parse content-range: e.g. "bytes 3145728-3670015/101059217"
        const contentRange = res.headers.get('content-range');
        if (contentRange) {
          const match = contentRange.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/i);
          if (match && match[3] !== '*') {
            session.total = parseInt(match[3], 10);
          }
        } else if (!session.total) {
          const cl = res.headers.get('content-length');
          if (cl) session.total = parseInt(cl, 10);
        }

        // Direct Stream Reader: reads chunks with zero serialization overhead
        const reader = res.body?.getReader();
        let bytesReceivedInStream = 0;
        let lastProgressTime = 0;

        if (reader) {
          try {
            while (true) {
              if (controller.cancelled) {
                reader.cancel().catch(() => {});
                session.chunks = [];
                sessions.delete(url);
                return;
              }

              if (controller.paused) {
                reader.cancel().catch(() => {});
                break;
              }

              const { done, value } = await reader.read();
              if (done) break;

              if (value && value.length > 0) {
                session.chunks.push(value);
                session.offset += value.length;
                bytesReceivedInStream += value.length;

                // Throttled progress reporting (every 150ms)
                // This keeps UI smooth at ~7 fps while freeing 99% of CPU time for max network speed!
                const now = Date.now();
                if (now - lastProgressTime >= 150) {
                  const timeDiff = (now - session.lastCalcTime) / 1000;
                  if (timeDiff >= 0.2) {
                    const bytesDiff = session.offset - session.lastCalcBytes;
                    session.currentSpeed = Math.round(bytesDiff / timeDiff);
                    session.lastCalcTime = now;
                    session.lastCalcBytes = session.offset;
                  }

                  lastProgressTime = now;

                  if (session.total && session.total > 0) {
                    const percent = Math.min(99, Math.round((session.offset / session.total) * 100));
                    window.postMessage(
                      {
                        source: 'VD_MAIN',
                        type: 'PROGRESS',
                        url,
                        percent,
                        loadedBytes: session.offset,
                        totalBytes: session.total,
                        speed: session.currentSpeed,
                        format: session.format,
                      },
                      '*'
                    );
                  }
                }
              }
            }
          } catch (readerErr: any) {
            if (controller.cancelled || readerErr?.name === 'AbortError') {
              session.chunks = [];
              sessions.delete(url);
              return;
            }
            console.warn('[VideoDownloader:MainWorld] Reader stream interrupted:', readerErr);
          }
        } else {
          // Direct fast ArrayBuffer fallback
          const buffer = await res.arrayBuffer();
          if (controller.cancelled) {
            session.chunks = [];
            sessions.delete(url);
            return;
          }
          if (buffer.byteLength > 0) {
            const arr = new Uint8Array(buffer);
            session.chunks.push(arr);
            session.offset += arr.length;
            bytesReceivedInStream += arr.length;
          }
        }

        if (controller.cancelled) {
          session.chunks = [];
          sessions.delete(url);
          return;
        }

        if (controller.paused) {
          continue;
        }

        if (bytesReceivedInStream === 0) {
          console.warn('[VideoDownloader:MainWorld] Received 0 bytes at offset:', session.offset);
          break;
        }

        if (session.total && session.offset >= session.total) {
          break;
        }

        if (res.status === 200) {
          break;
        }
      }

      // CRITICAL CHECK: NEVER save if cancelled, or if no chunks were collected!
      if (controller.cancelled || session.chunks.length === 0 || session.offset === 0) {
        console.log('[VideoDownloader:MainWorld] Cancelled or empty. Discarding partial chunks without saving.');
        session.chunks = [];
        sessions.delete(url);
        return;
      }

      console.log('[VideoDownloader:MainWorld] All stream bytes collected! Total bytes:', session.offset);

      // Determine proper format and extension: Sniff magic bytes from collected stream chunks!
      let ext = 'mp4';
      let detectedFormat = 'MP4';
      let targetMime = session.contentType || 'video/mp4';

      if (session.chunks.length > 0 && session.chunks[0].length >= 4) {
        const sniffed = detectMediaContainer(session.chunks[0]);
        detectedFormat = sniffed.format;
        ext = sniffed.ext;
        targetMime = sniffed.mimeType;
      } else if (session.contentType.includes('matroska')) {
        ext = 'mkv';
        detectedFormat = 'MKV';
        targetMime = 'video/webm';
      } else if (session.contentType.includes('webm')) {
        ext = 'webm';
        detectedFormat = 'WEBM';
        targetMime = 'video/webm';
      }

      let finalName = session.filename;
      if (!finalName.toLowerCase().endsWith(`.${ext}`)) {
        finalName = finalName.replace(/\.[a-zA-Z0-9]+$/, '') + `.${ext}`;
      }

      const finalBlob = new Blob(session.chunks as BlobPart[], { type: targetMime });
      window.postMessage(
        {
          source: 'VD_MAIN',
          type: 'SUCCESS',
          url,
          blob: finalBlob,
          filename: finalName,
          format: detectedFormat,
        },
        '*'
      );

      // Clear memory after saving
      session.chunks = [];
      sessions.delete(url);
    }

    async function executeImageDownload(url: string, suggestedFilename: string) {
      let blob: Blob | null = null;
      let contentType = 'image/jpeg';

      if (url.startsWith('blob:') || url.startsWith('data:')) {
        const res = await window.fetch(url);
        blob = await res.blob();
        if (blob.type) contentType = blob.type;
      } else {
        try {
          const res = await window.fetch(url, { credentials: 'include' });
          blob = await res.blob();
          if (blob.type) contentType = blob.type;
        } catch (fetchErr) {
          console.warn('[VideoDownloader:MainWorld] Image fetch error, falling back to canvas:', fetchErr);
          const allImages = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
          const imgEl = allImages.find((img) => img.src === url || img.currentSrc === url);
          if (imgEl && (imgEl.naturalWidth > 0 || imgEl.width > 0)) {
            blob = await new Promise<Blob | null>((resolve) => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = imgEl.naturalWidth || imgEl.width;
                canvas.height = imgEl.naturalHeight || imgEl.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(imgEl, 0, 0);
                  canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95);
                  return;
                }
              } catch (e) {
                console.warn('[VideoDownloader:MainWorld] Canvas capture failed:', e);
              }
              resolve(null);
            });
          }
          if (!blob) throw fetchErr;
        }
      }

      if (!blob || blob.size === 0) {
        throw new Error('Image data was empty');
      }

      let ext = 'jpg';
      if (contentType.includes('png')) ext = 'png';
      else if (contentType.includes('webp')) ext = 'webp';
      else if (contentType.includes('gif')) ext = 'gif';
      else if (contentType.includes('svg')) ext = 'svg';
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';

      let finalFilename = suggestedFilename;
      if (!/\.[a-zA-Z0-9]+$/.test(finalFilename)) {
        finalFilename = `${finalFilename}.${ext}`;
      } else {
        finalFilename = finalFilename.replace(/\.[a-zA-Z0-9]+$/, `.${ext}`);
      }

      window.postMessage(
        {
          source: 'VD_MAIN',
          type: 'SUCCESS',
          url,
          blob,
          filename: finalFilename,
          format: ext.toUpperCase(),
        },
        '*'
      );
    }
  },
});

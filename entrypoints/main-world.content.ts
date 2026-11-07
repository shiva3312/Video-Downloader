import { defineContentScript } from 'wxt/sandbox';

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
  matches: ['*://web.telegram.org/*', '*://*/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    console.log('[VideoDownloader:MainWorld] Initialized high-performance streaming in MAIN world.');

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

      // Handle Probe Video Details (returns exact Service Worker Content-Range size & format)
      if (type === 'PROBE_VIDEO_DETAILS') {
        try {
          const probeRes = await window.fetch(url, {
            headers: {
              Range: 'bytes=0-0',
            },
            credentials: 'include',
          });

          let format = 'MP4';
          const contentType = probeRes.headers.get('content-type') || '';
          if (contentType.includes('matroska')) format = 'MKV';
          else if (contentType.includes('webm')) format = 'WEBM';

          let totalBytes = 0;
          const contentRange = probeRes.headers.get('content-range');
          if (contentRange) {
            const match = contentRange.match(/\/(\d+|\*)$/);
            if (match && match[1] !== '*') {
              totalBytes = parseInt(match[1], 10);
            }
          }

          if (totalBytes > 0) {
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
          }
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
          const blob = await res.blob();
          if (controller.cancelled) {
            session.chunks = [];
            sessions.delete(url);
            return;
          }
          saveBlobToDisk(blob, filename);
          window.postMessage({ source: 'VD_MAIN', type: 'SUCCESS', url }, '*');
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

            // Open-ended Range allows Service Worker to stream continuously at maximum throughput
            chunkRes = await window.fetch(url, {
              headers: {
                Range: `bytes=${session.offset}-`,
              },
              credentials: 'include',
              signal: abortController.signal,
            });

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

      // Determine proper extension: Matroska MUST be .mkv so media players decode Opus audio!
      let ext = 'mp4';
      if (session.contentType.includes('matroska')) {
        ext = 'mkv';
      } else if (session.contentType.includes('webm')) {
        ext = 'webm';
      }

      let finalName = session.filename;
      if (!finalName.toLowerCase().endsWith(`.${ext}`)) {
        finalName = finalName.replace(/\.[a-zA-Z0-9]+$/, '') + `.${ext}`;
      }

      const finalBlob = new Blob(session.chunks as BlobPart[], { type: session.contentType });
      saveBlobToDisk(finalBlob, finalName);
      window.postMessage({ source: 'VD_MAIN', type: 'SUCCESS', url }, '*');

      // Clear memory after saving
      session.chunks = [];
      sessions.delete(url);
    }

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
      console.log('[VideoDownloader:MainWorld] File saved to disk:', filename, 'Bytes:', blob.size);
    }
  },
});

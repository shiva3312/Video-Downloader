export interface DownloadProgress {
  percent: number;
  loadedBytes: number;
  totalBytes: number | null;
  speed?: number;
  format?: string;
}

export interface VideoMetadata {
  size: string;
  format: string;
  totalBytes: number;
}

/**
 * Formats byte counts into human-readable strings (e.g., 14.2 MB)
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Formats download speed in bytes per second (e.g. 4.5 MB/s, 720 KB/s)
 */
export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * Returns a clean resolution badge string for a video element (e.g. "1080p", "720p")
 */
export function getVideoResolutionLabel(video: HTMLVideoElement): string {
  const h = video.videoHeight;
  if (!h) return '';
  if (h >= 2160) return '4K';
  if (h >= 1440) return '2K';
  if (h >= 1080) return '1080p';
  if (h >= 720) return '720p';
  if (h >= 480) return '480p';
  if (h >= 360) return '360p';
  return `${h}p`;
}

/**
 * Extracts a sensible filename based on the video source URL and context
 */
export function generateVideoFilename(url: string, extension: string = 'mp4'): string {
  try {
    // 1. Telegram progressive URLs (e.g. /progressive/document4970121728136055163)
    const tgDocMatch = url.match(/document(\d+)/i);
    if (tgDocMatch) {
      let cleanTitle = '';
      if (document.title) {
        cleanTitle = document.title
          .replace(/telegram/gi, '')
          .replace(/web/gi, '')
          .replace(/[-|·]/g, '')
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 25);
      }
      return cleanTitle
        ? `telegram_${cleanTitle}_${tgDocMatch[1]}.${extension}`
        : `telegram_document_${tgDocMatch[1]}.${extension}`;
    }

    // 2. Check if URL path has a natural file name
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filenameFromPath = pathname.substring(pathname.lastIndexOf('/') + 1);
    if (filenameFromPath && filenameFromPath.includes('.') && filenameFromPath.length < 60) {
      return filenameFromPath.replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    // 3. Document title + timestamp
    const title = document.title ? document.title.slice(0, 30).trim().replace(/[^a-zA-Z0-9]/g, '_') : 'video';
    return `${title}_${Date.now()}.${extension}`;
  } catch {
    return `video_${Date.now()}.${extension}`;
  }
}

/**
 * Probes the video URL via the Main World bridge using Range: bytes=0-0
 * to retrieve the TRUE Content-Range total size and format from Telegram's Service Worker.
 */
export function probeVideoDetails(url: string): Promise<VideoMetadata | null> {
  if (!url || url.startsWith('blob:')) return Promise.resolve(null);

  return new Promise((resolve) => {
    let resolved = false;

    const handler = (event: MessageEvent) => {
      if (
        event.data?.source !== 'VD_MAIN' ||
        event.data?.type !== 'PROBE_RESULT' ||
        event.data?.url !== url
      ) {
        return;
      }

      resolved = true;
      window.removeEventListener('message', handler);
      const { totalBytes, format } = event.data;
      if (totalBytes > 0) {
        resolve({
          size: formatBytes(totalBytes),
          format: format || 'MP4',
          totalBytes,
        });
      } else {
        resolve(null);
      }
    };

    window.addEventListener('message', handler);

    window.postMessage(
      {
        source: 'VD_ISOLATED',
        type: 'PROBE_VIDEO_DETAILS',
        url,
      },
      '*'
    );

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        window.removeEventListener('message', handler);
        resolve(null);
      }
    }, 2000);
  });
}

/**
 * Backward compatibility helper
 */
export async function probeVideoSize(url: string): Promise<string | null> {
  const details = await probeVideoDetails(url);
  return details ? details.size : null;
}

/**
 * Starts or resumes a download via the Main World bridge
 */
export function downloadVideoWithProgress(
  url: string,
  filename: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let responded = false;

    const messageHandler = (event: MessageEvent) => {
      if (event.data?.source !== 'VD_MAIN' || event.data?.url !== url) return;

      if (event.data.type === 'PROGRESS') {
        responded = true;
        if (onProgress) {
          onProgress({
            percent: event.data.percent,
            loadedBytes: event.data.loadedBytes,
            totalBytes: event.data.totalBytes,
            speed: event.data.speed,
            format: event.data.format,
          });
        }
      } else if (event.data.type === 'SUCCESS') {
        window.removeEventListener('message', messageHandler);
        resolve();
      } else if (event.data.type === 'ERROR') {
        window.removeEventListener('message', messageHandler);
        reject(new Error(event.data.error || 'Download failed'));
      }
    };

    window.addEventListener('message', messageHandler);

    // Send START_DOWNLOAD to Main World bridge
    window.postMessage(
      {
        source: 'VD_ISOLATED',
        type: 'START_DOWNLOAD',
        url,
        filename,
      },
      '*'
    );

    setTimeout(() => {
      if (!responded) {
        console.warn('[VideoDownloader] Main-world bridge did not respond. Trying direct fetch fallback...');
        window.removeEventListener('message', messageHandler);
        directFetchFallback(url, filename, onProgress).then(resolve).catch(reject);
      }
    }, 3000);
  });
}

async function directFetchFallback(
  url: string,
  filename: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const response = await fetch(url, {
    credentials: 'include',
    mode: 'cors',
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : null;
  const contentType = response.headers.get('content-type') || 'video/mp4';

  if (!response.body) {
    const blob = await response.blob();
    triggerAnchorSave(blob, filename);
    return;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (value) {
      chunks.push(value);
      loadedBytes += value.length;

      if (onProgress) {
        const percent = totalBytes && totalBytes > 0
          ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
          : 0;
        onProgress({ percent, loadedBytes, totalBytes });
      }
    }
  }

  const completeBlob = new Blob(chunks, { type: contentType });
  triggerAnchorSave(completeBlob, filename);
}

function triggerAnchorSave(blob: Blob, filename: string) {
  let safeName = filename;
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(blobUrl);
  }, 10000);
}

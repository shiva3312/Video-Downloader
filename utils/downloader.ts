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
 * Returns clean formatted timestamps for file saving and UI display
 */
export function getFormattedDateTime(date: Date = new Date()): { fileTimestamp: string; displayTimestamp: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  const fileTimestamp = `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
  const displayDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const displayTime = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  const displayTimestamp = `${displayDate}, ${displayTime}`;

  return { fileTimestamp, displayTimestamp };
}

/**
 * Generates a clean, friendly name for a video (e.g. "Video 1 (Nov 8, 12:15 AM)" or "Telegram Video 5516")
 * Never returns raw "blob:..." or long URLs!
 */
export function generateFriendlyVideoName(url: string, index: number = 1): string {
  const tgDocMatch = url.match(/document(\d+)/i);
  if (tgDocMatch) {
    const docId = tgDocMatch[1];
    return `Telegram Video ${docId.length > 6 ? docId.slice(-4) : docId}`;
  }

  const { displayTimestamp } = getFormattedDateTime();
  return `Video ${index} (${displayTimestamp})`;
}

/**
 * Extracts a sensible, clean filename for saving to disk.
 * Uses formatted dates and indices instead of raw blob URLs or unix milliseconds!
 */
export function generateVideoFilename(url: string, extension: string = 'mp4', index: number = 1): string {
  const ext = extension.replace(/^\./, '').toLowerCase();

  try {
    // 1. Telegram progressive URLs
    const tgDocMatch = url.match(/document(\d+)/i);
    if (tgDocMatch) {
      return `telegram_document_${tgDocMatch[1]}.${ext}`;
    }

    // 2. Natural filename from clean web URLs (excluding blobs)
    if (!url.startsWith('blob:') && !url.includes('progressive')) {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filenameFromPath = pathname.substring(pathname.lastIndexOf('/') + 1);
      if (
        filenameFromPath &&
        filenameFromPath.includes('.') &&
        filenameFromPath.length < 50 &&
        !filenameFromPath.startsWith('blob')
      ) {
        return filenameFromPath.replace(/[^a-zA-Z0-9._-]/g, '_');
      }
    }

    // 3. Formatted timestamp fallback (e.g. Video_1_2026-11-08_00-15-30.mp4)
    const { fileTimestamp } = getFormattedDateTime();
    return `Video_${index}_${fileTimestamp}.${ext}`;
  } catch {
    const { fileTimestamp } = getFormattedDateTime();
    return `Video_${index}_${fileTimestamp}.${ext}`;
  }
}

/**
 * Sanitizes any raw title or URL string into a friendly user-facing label.
 * Converts raw "blob:https://..." or "http..." into "Video 1 (Nov 8, 12:15 AM)".
 */
export function cleanDisplayTitle(rawTitle: string | undefined, url?: string, fallbackIndex: number = 1): string {
  if (!rawTitle) {
    return generateFriendlyVideoName(url || '', fallbackIndex);
  }

  // If the title is literally a blob URL or web URL, replace with friendly name
  if (
    rawTitle.startsWith('blob:') ||
    rawTitle.startsWith('http://') ||
    rawTitle.startsWith('https://') ||
    rawTitle.includes('://')
  ) {
    return generateFriendlyVideoName(url || rawTitle, fallbackIndex);
  }

  // If the title is a raw telegram_document_123456 filename, clean it up for display
  const tgDocMatch = rawTitle.match(/document(\d+)/i) || url?.match(/document(\d+)/i);
  if (tgDocMatch && rawTitle.toLowerCase().startsWith('telegram_document_')) {
    const docId = tgDocMatch[1];
    return `Telegram Video ${docId.length > 6 ? docId.slice(-4) : docId}`;
  }

  return rawTitle;
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
    const messageHandler = (event: MessageEvent) => {
      // Listen for isolated world CANCEL
      if (
        event.data?.source === 'VD_ISOLATED' &&
        event.data?.type === 'CANCEL_DOWNLOAD' &&
        event.data?.url === url
      ) {
        window.removeEventListener('message', messageHandler);
        reject(new Error('Download cancelled'));
        return;
      }

      if (event.data?.source !== 'VD_MAIN' || event.data?.url !== url) return;

      if (event.data.type === 'PROGRESS') {
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
  });
}

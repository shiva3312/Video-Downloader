import { sniffBlobMediaInfo, detectMediaContainer } from '@/utils/mediaDetector';

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

export interface ImageMetadata {
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
 * Returns a clean resolution badge string for an image element (e.g. "720×1280", "1080×1920")
 */
export function getImageResolutionLabel(img: HTMLImageElement): string {
  const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10) || img.clientWidth || img.width;
  const h = img.naturalHeight || parseInt(img.getAttribute('height') || '0', 10) || img.clientHeight || img.height;
  if (!w || !h) return '';
  const minDim = Math.min(w, h);
  if (minDim >= 2160) return '4K';
  if (minDim >= 1440) return '2K';
  if (minDim >= 1080) return '1080p';
  if (minDim >= 720) return '720p';
  return `${w}×${h}`;
}

/**
 * Checks if a URL or filename points to a common image format
 */
export function isImageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)$/.test(cleanUrl);
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
 * Generates a clean, friendly name for an image/photo (e.g. "Snapchat Photo (Nov 8, 12:15 AM)")
 */
export function generateFriendlyImageName(url: string, index: number = 1): string {
  if (url.includes('snapchat.com')) {
    const { displayTimestamp } = getFormattedDateTime();
    return `Snapchat Photo (${displayTimestamp})`;
  }
  const tgDocMatch = url.match(/document(\d+)/i);
  if (tgDocMatch) {
    const docId = tgDocMatch[1];
    return `Telegram Photo ${docId.length > 6 ? docId.slice(-4) : docId}`;
  }

  const { displayTimestamp } = getFormattedDateTime();
  return `Photo ${index} (${displayTimestamp})`;
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
 * Generates a clean filename for saving images/photos to disk.
 */
export function generateImageFilename(url: string, extension: string = 'jpg', index: number = 1): string {
  let ext = extension.replace(/^\./, '').toLowerCase() || 'jpg';
  if (ext === 'jpeg') ext = 'jpg';

  try {
    if (url.includes('snapchat.com')) {
      const { fileTimestamp } = getFormattedDateTime();
      return `Snapchat_Photo_${fileTimestamp}.${ext}`;
    }

    const tgDocMatch = url.match(/document(\d+)/i);
    if (tgDocMatch) {
      return `telegram_photo_${tgDocMatch[1]}.${ext}`;
    }

    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
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

    const { fileTimestamp } = getFormattedDateTime();
    return `Photo_${index}_${fileTimestamp}.${ext}`;
  } catch {
    const { fileTimestamp } = getFormattedDateTime();
    return `Photo_${index}_${fileTimestamp}.${ext}`;
  }
}

/**
 * Sanitizes any raw title or URL string into a friendly user-facing label.
 * Converts raw "blob:https://..." or "http..." into friendly name.
 */
export function cleanDisplayTitle(rawTitle: string | undefined, url?: string, fallbackIndex: number = 1): string {
  if (!rawTitle) {
    if (url && (isImageUrl(url) || url.includes('snapchat.com'))) {
      return generateFriendlyImageName(url, fallbackIndex);
    }
    return generateFriendlyVideoName(url || '', fallbackIndex);
  }

  // If the title is literally a blob URL or web URL, replace with friendly name
  if (
    rawTitle.startsWith('blob:') ||
    rawTitle.startsWith('http://') ||
    rawTitle.startsWith('https://') ||
    rawTitle.includes('://')
  ) {
    if (
      rawTitle.includes('snapchat.com') ||
      url?.includes('snapchat.com') ||
      isImageUrl(rawTitle) ||
      (url && isImageUrl(url))
    ) {
      return generateFriendlyImageName(url || rawTitle, fallbackIndex);
    }
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
  if (!url) return Promise.resolve(null);

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
      if (typeof totalBytes === 'number') {
        resolve({
          size: totalBytes > 0 ? formatBytes(totalBytes) : '0 B',
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
 * Converts a Blob to a Base64 data: URL string using FileReader
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Transfers a media Blob to background.ts to be encrypted and saved in the Media Vault.
 * Supports files of any size by streaming 10MB chunks for large files (> 25MB).
 */
export async function sendMediaBlobToVault(
  blob: Blob,
  meta: {
    type: 'video' | 'image';
    title: string;
    sourceUrl: string;
    format: string;
    sizeBytes: number;
    thumbnail?: string;
    mimeType?: string;
  }
): Promise<void> {
  if (!blob || blob.size === 0) {
    throw new Error('Cannot save 0 KB file to vault');
  }

  // Sniff magic bytes of the blob to guarantee accurate format and container
  let format = meta.format || 'MP4';
  let mimeType = meta.mimeType || blob.type;
  let ext = format.toLowerCase();

  try {
    const sniffed = await sniffBlobMediaInfo(blob);
    format = sniffed.format;
    mimeType = sniffed.mimeType;
    ext = sniffed.ext;
  } catch {
    if (meta.type === 'video') {
      mimeType = meta.format === 'MKV' || meta.format === 'WEBM' ? 'video/webm' : 'video/mp4';
    } else {
      mimeType = meta.format === 'PNG' ? 'image/png' : 'image/jpeg';
    }
  }

  let finalTitle = meta.title;
  if (!finalTitle.toLowerCase().endsWith(`.${ext}`)) {
    finalTitle = finalTitle.replace(/\.[a-zA-Z0-9]+$/, '') + `.${ext}`;
  }

  const typedBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
  const MAX_SINGLE_MSG = 25 * 1024 * 1024; // 25 MB

  if (typedBlob.size <= MAX_SINGLE_MSG) {
    const dataUrl = await blobToDataUrl(typedBlob);
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'VAULT_SAVE_ITEM',
          payload: {
            ...meta,
            title: finalTitle,
            format,
            dataUrl,
            mimeType,
          },
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        }
      );
    });
  } else {
    // Sliced chunk streaming for files > 25MB
    const CHUNK_SIZE = 10 * 1024 * 1024;
    const totalChunks = Math.ceil(typedBlob.size / CHUNK_SIZE);
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    for (let i = 0; i < totalChunks; i++) {
      const slice = typedBlob.slice(i * CHUNK_SIZE, Math.min(typedBlob.size, (i + 1) * CHUNK_SIZE));
      const chunkDataUrl = await blobToDataUrl(slice);

      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'VAULT_SAVE_CHUNK',
            payload: {
              uploadId,
              chunkIndex: i,
              totalChunks,
              chunkDataUrl,
              meta: {
                ...meta,
                title: finalTitle,
                format,
                mimeType,
              },
            },
          },
          () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          }
        );
      });
    }
  }
}

/**
 * Starts or resumes a download via the Main World bridge
 */
export function downloadVideoWithProgress(
  url: string,
  filename: string,
  onProgress?: (progress: DownloadProgress) => void,
  thumbnail?: string
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

        const rawBlob = event.data.blob;
        const isBlobLike =
          rawBlob instanceof Blob ||
          (rawBlob && typeof rawBlob.slice === 'function' && typeof rawBlob.size === 'number');

        if (isBlobLike) {
          const blob = rawBlob as Blob;
          if (blob.size === 0) {
            reject(new Error('Video is 0 KB'));
            return;
          }

          (async () => {
            try {
              let detectedFormat = event.data.format || 'MP4';
              let detectedMime =
                event.data.format === 'MKV' || event.data.format === 'WEBM'
                  ? 'video/webm'
                  : 'video/mp4';
              let detectedExt = detectedFormat.toLowerCase();

              try {
                const sniffed = await sniffBlobMediaInfo(blob);
                detectedFormat = sniffed.format;
                detectedMime = sniffed.mimeType;
                detectedExt = sniffed.ext;
              } catch {}

              let title = event.data.filename || filename;
              if (!title.toLowerCase().endsWith(`.${detectedExt}`)) {
                title = title.replace(/\.[a-zA-Z0-9]+$/, '') + `.${detectedExt}`;
              }

              const typedBlob =
                blob.type === detectedMime ? blob : new Blob([blob], { type: detectedMime });

              await sendMediaBlobToVault(typedBlob, {
                type: 'video',
                title,
                sourceUrl: url,
                format: detectedFormat,
                sizeBytes: typedBlob.size,
                thumbnail,
                mimeType: detectedMime,
              });
              resolve();
            } catch (err: any) {
              console.error('[VideoDownloader] Failed to save video to vault:', err);
              resolve();
            }
          })();
        } else {
          resolve();
        }
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

/**
 * Probes the image URL via the Main World bridge to retrieve size and format
 */
export function probeImageDetails(url: string): Promise<ImageMetadata | null> {
  if (!url) return Promise.resolve(null);

  return new Promise((resolve) => {
    let resolved = false;

    const handler = (event: MessageEvent) => {
      if (
        event.data?.source !== 'VD_MAIN' ||
        event.data?.type !== 'IMAGE_PROBE_RESULT' ||
        event.data?.url !== url
      ) {
        return;
      }

      resolved = true;
      window.removeEventListener('message', handler);
      const { totalBytes, format } = event.data;
      if (typeof totalBytes === 'number') {
        resolve({
          size: totalBytes > 0 ? formatBytes(totalBytes) : '0 B',
          format: format || 'JPG',
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
        type: 'PROBE_IMAGE_DETAILS',
        url,
      },
      '*'
    );

    setTimeout(() => {
      if (!resolved) {
        window.removeEventListener('message', handler);
        resolve(null);
      }
    }, 2000);
  });
}

/**
 * Downloads an image (blob or web URL) to disk via the Main World bridge
 */
export function downloadImage(
  url: string,
  filename: string,
  thumbnail?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const messageHandler = (event: MessageEvent) => {
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

      if (event.data.type === 'SUCCESS') {
        window.removeEventListener('message', messageHandler);

        const rawBlob = event.data.blob;
        const isBlobLike =
          rawBlob instanceof Blob ||
          (rawBlob && typeof rawBlob.slice === 'function' && typeof rawBlob.size === 'number');

        if (isBlobLike) {
          const blob = rawBlob as Blob;
          if (blob.size === 0) {
            reject(new Error('Video is 0 KB'));
            return;
          }
          sendMediaBlobToVault(blob, {
            type: 'image',
            title: event.data.filename || filename,
            sourceUrl: url,
            format: event.data.format || 'JPG',
            sizeBytes: blob.size,
            thumbnail: thumbnail,
            mimeType: event.data.format === 'PNG' ? 'image/png' : 'image/jpeg',
          })
            .then(() => resolve())
            .catch((err) => {
              console.error('[VideoDownloader] Failed to save image to vault:', err);
              resolve();
            });
        } else {
          resolve();
        }
      } else if (event.data.type === 'ERROR') {
        window.removeEventListener('message', messageHandler);
        reject(new Error(event.data.error || 'Image download failed'));
      }
    };

    window.addEventListener('message', messageHandler);

    window.postMessage(
      {
        source: 'VD_ISOLATED',
        type: 'START_IMAGE_DOWNLOAD',
        url,
        filename,
      },
      '*'
    );

    setTimeout(() => {
      window.removeEventListener('message', messageHandler);
      resolve();
    }, 15000);
  });
}

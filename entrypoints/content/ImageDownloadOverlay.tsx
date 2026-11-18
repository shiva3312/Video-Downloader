import React, { useState, useEffect } from 'react';
import {
  downloadImage,
  generateImageFilename,
  generateFriendlyImageName,
  getImageResolutionLabel,
  probeImageDetails,
} from '@/utils/downloader';
import { downloadStore, DownloadTask } from '@/stores/downloadStore';

interface ImageDownloadOverlayProps {
  image: HTMLImageElement;
}

export const ImageDownloadOverlay: React.FC<ImageDownloadOverlayProps> = ({ image }) => {
  const [resolution, setResolution] = useState<string>('');
  const [format, setFormat] = useState<string>('JPG');
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [taskState, setTaskState] = useState<DownloadTask | undefined>(undefined);
  const [currentSrc, setCurrentSrc] = useState<string>('');

  const getSource = (): string => {
    return image.currentSrc || image.src || '';
  };

  // 1. Keep track of dynamic image source changes (e.g. Snapchat switching photo snaps)
  useEffect(() => {
    const syncSource = () => {
      const src = getSource();
      if (src && src !== currentSrc) {
        setCurrentSrc(src);
      }
    };

    syncSource();

    image.addEventListener('load', syncSource);

    const observer = new MutationObserver(() => syncSource());
    observer.observe(image, { attributes: true, attributeFilter: ['src', 'currentSrc'] });

    return () => {
      image.removeEventListener('load', syncSource);
      observer.disconnect();
    };
  }, [image, currentSrc]);

  // 2. React to currentSrc changes and subscribe to store updates
  useEffect(() => {
    const src = currentSrc || getSource();

    if (src) {
      const existingTask = downloadStore.getTask(src);
      setTaskState(existingTask ? { ...existingTask } : undefined);
    } else {
      setTaskState(undefined);
    }

    const unsubscribe = downloadStore.subscribe(() => {
      const activeSrc = currentSrc || getSource();
      if (activeSrc) {
        const task = downloadStore.getTask(activeSrc);
        setTaskState(task ? { ...task } : undefined);
      } else {
        setTaskState(undefined);
      }
    });

    // Determine image resolution
    const updateResolution = () => {
      const res = getImageResolutionLabel(image);
      if (res) setResolution(res);
    };

    if (image.naturalWidth > 0 || image.width > 0) {
      updateResolution();
    } else {
      image.addEventListener('load', updateResolution, { once: true });
    }

    // Determine format from URL or probe
    if (src) {
      if (src.includes('.png') || src.includes('image/png')) setFormat('PNG');
      else if (src.includes('.webp') || src.includes('image/webp')) setFormat('WEBP');
      else if (src.includes('.gif') || src.includes('image/gif')) setFormat('GIF');
      else if (src.includes('.svg') || src.includes('image/svg')) setFormat('SVG');
      else setFormat('JPG');

      probeImageDetails(src).then((details) => {
        if (details) {
          if (details.size) setFileSize(details.size);
          if (details.format) setFormat(details.format);
        }
      });
    }

    return () => {
      unsubscribe();
      image.removeEventListener('load', updateResolution);
    };
  }, [image, currentSrc]);

  const captureThumbnail = (): string | undefined => {
    try {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = Math.round((96 * image.naturalHeight) / image.naturalWidth) || 54;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.6);
        }
      }
    } catch {
      // Best-effort
    }
    return undefined;
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const src = currentSrc || getSource();
    if (!src) return;

    const ext = format.toLowerCase() || 'jpg';
    const filename = taskState?.filename || generateImageFilename(src, ext, 1);
    const friendlyTitle = generateFriendlyImageName(src, 1);
    const thumb = captureThumbnail();

    // Register into persistent download queue
    downloadStore.addTask(src, filename, resolution, format, friendlyTitle, thumb);
    const initialTask = downloadStore.getTask(src);
    if (initialTask) setTaskState({ ...initialTask });

    try {
      await downloadImage(src, filename);
      downloadStore.setCompleted(src);
    } catch (err: any) {
      if (err?.message !== 'Download cancelled') {
        console.error('[VideoDownloader] Image download error:', err);
        downloadStore.setError(src, err?.message || 'Download failed');
      }
    }
  };

  const status = taskState?.status || 'idle';
  const displayFileSize = fileSize;
  const displayFormat = taskState?.format || format;

  return (
    <div className="vd-overlay-container">
      <button
        type="button"
        className={`vd-button ${
          status === 'completed'
            ? 'vd-status-success'
            : status === 'error'
            ? 'vd-status-error'
            : ''
        }`}
        onClick={handleClick}
        title={
          status === 'error'
            ? taskState?.errorMessage || 'Click to retry download'
            : status === 'completed'
            ? 'Photo saved! Click to re-download.'
            : 'Download Image'
        }
      >
        {status === 'idle' && (
          <>
            {/* Photo / Image Icon */}
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="vd-type-label">Image</span>
            <span className="vd-badge-format">{displayFormat}</span>
            {resolution && <span className="vd-badge-resolution">{resolution}</span>}
            {displayFileSize && <span className="vd-badge-size">{displayFileSize}</span>}
          </>
        )}

        {status === 'downloading' && (
          <>
            {/* Spinning Loader */}
            <svg
              className="vd-icon-spin"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
            </svg>
            <span>Saving...</span>
          </>
        )}

        {status === 'completed' && (
          <>
            {/* Checkmark */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Saved!</span>
          </>
        )}

        {status === 'error' && (
          <>
            {/* Alert Circle */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Retry</span>
          </>
        )}
      </button>
    </div>
  );
};

export default ImageDownloadOverlay;

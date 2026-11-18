import React, { useState, useEffect, useRef } from 'react';
import {
  formatBytes,
  formatSpeed,
  downloadVideoWithProgress,
  generateVideoFilename,
  generateFriendlyVideoName,
  cleanDisplayTitle,
  getVideoResolutionLabel,
  probeVideoDetails,
} from '@/utils/downloader';
import { detectMediaContainer } from '@/utils/mediaDetector';
import { downloadStore, DownloadTask } from '@/stores/downloadStore';

interface DownloadOverlayProps {
  video: HTMLVideoElement;
}

export const DownloadOverlay: React.FC<DownloadOverlayProps> = ({ video }) => {
  const [resolution, setResolution] = useState<string>('');
  const [format, setFormat] = useState<string>('MP4');
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [taskState, setTaskState] = useState<DownloadTask | undefined>(undefined);
  const [currentSrc, setCurrentSrc] = useState<string>('');

  const getSource = (): string => {
    let src = video.currentSrc || video.src;
    if (!src) {
      const sourceEl = video.querySelector('source');
      if (sourceEl) src = sourceEl.src;
    }
    return src || '';
  };

  // 1. Keep track of dynamic video source changes (e.g. Telegram lazy-loading video src)
  useEffect(() => {
    const syncSource = () => {
      const src = getSource();
      if (src && src !== currentSrc) {
        setCurrentSrc(src);
      }
    };

    syncSource();

    video.addEventListener('loadedmetadata', syncSource);
    video.addEventListener('loadstart', syncSource);
    video.addEventListener('canplay', syncSource);
    video.addEventListener('playing', syncSource);

    // Also observe attribute mutations on the video element for src changes
    const observer = new MutationObserver(() => syncSource());
    observer.observe(video, { attributes: true, attributeFilter: ['src', 'currentSrc'] });

    return () => {
      video.removeEventListener('loadedmetadata', syncSource);
      video.removeEventListener('loadstart', syncSource);
      video.removeEventListener('canplay', syncSource);
      video.removeEventListener('playing', syncSource);
      observer.disconnect();
    };
  }, [video, currentSrc]);

  // 2. React to currentSrc changes and subscribe to store updates
  useEffect(() => {
    const src = currentSrc || getSource();

    // Sync initial task state (always clone to trigger fresh React state)
    if (src) {
      const existingTask = downloadStore.getTask(src);
      setTaskState(existingTask ? { ...existingTask } : undefined);
    } else {
      setTaskState(undefined);
    }

    // Subscribe to store updates with a fresh object clone so React never bails out
    const unsubscribe = downloadStore.subscribe(() => {
      const activeSrc = currentSrc || getSource();
      if (activeSrc) {
        const task = downloadStore.getTask(activeSrc);
        setTaskState(task ? { ...task } : undefined);
      } else {
        setTaskState(undefined);
      }
    });

    // Determine video resolution
    const updateResolution = () => {
      const res = getVideoResolutionLabel(video);
      if (res) setResolution(res);
    };

    if (video.videoHeight > 0) {
      updateResolution();
    } else {
      video.addEventListener('loadedmetadata', updateResolution, { once: true });
    }

    // Probe exact file size & format (direct blob fetch + service worker / main world probe)
    if (src) {
      if (src.startsWith('blob:')) {
        fetch(src)
          .then((res) => res.blob())
          .then(async (blob) => {
            if (blob) {
              if (blob.size === 0) {
                setFileSize('0 B');
              } else {
                setFileSize(formatBytes(blob.size));
                try {
                  const headerBuf = await blob.slice(0, 128).arrayBuffer();
                  const sniffed = detectMediaContainer(new Uint8Array(headerBuf));
                  setFormat(sniffed.format);
                } catch {
                  if (blob.type) {
                    if (blob.type.includes('webm')) setFormat('WEBM');
                    else if (blob.type.includes('matroska')) setFormat('MKV');
                    else if (blob.type.includes('mp4')) setFormat('MP4');
                  }
                }
              }
            }
          })
          .catch(() => {});
      }

      probeVideoDetails(src).then((details) => {
        if (details) {
          if (details.size) setFileSize(details.size);
          if (details.format) setFormat(details.format);
        }
      });
    }

    return () => {
      unsubscribe();
      video.removeEventListener('loadedmetadata', updateResolution);
    };
  }, [video, currentSrc]);

  const captureThumbnail = (): string | undefined => {
    try {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 54;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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

    // If currently downloading: click pauses the download
    if (taskState?.status === 'downloading') {
      downloadStore.pauseTask(src);
      return;
    }

    // If currently paused: click resumes the download
    if (taskState?.status === 'paused') {
      downloadStore.resumeTask(src);
      return;
    }

    // Use proper extension based on probed format (MKV for matroska to preserve Opus audio!)
    const ext = (taskState?.format || format).toLowerCase();
    const filename = taskState?.filename || generateVideoFilename(src, ext, 1);
    const friendlyTitle = generateFriendlyVideoName(src, 1);
    const thumb = captureThumbnail();

    // Register into persistent download queue
    downloadStore.addTask(src, filename, resolution, format, friendlyTitle, thumb);
    const initialTask = downloadStore.getTask(src);
    if (initialTask) setTaskState({ ...initialTask });

    try {
      chrome.runtime
        .sendMessage({
          type: 'VAULT_SAVE_IN_PROGRESS',
          payload: { type: 'video', title: friendlyTitle },
        })
        .catch(() => {});
    } catch {}

    try {
      await downloadVideoWithProgress(src, filename, undefined, thumb);
    } catch (err: any) {
      if (err?.message !== 'Download cancelled') {
        console.error('[VideoDownloader] Download trigger error:', err);
        downloadStore.setError(src, err?.message || 'Download failed');
      }
    }
  };

  const status = taskState?.status || 'idle';
  const progressPercent = taskState?.percent || 0;
  const displayFileSize = taskState?.totalBytes ? formatBytes(taskState.totalBytes) : fileSize;
  const displayFormat = taskState?.format || format;
  const displaySpeed = taskState?.speed ? ` • ${formatSpeed(taskState.speed)}` : '';

  // Do not show save label or overlay on 0 KB / empty videos
  const isZeroKb =
    (displayFileSize &&
      (displayFileSize === '0 B' ||
        displayFileSize === '0 KB' ||
        displayFileSize === '0 Bytes' ||
        displayFileSize.startsWith('0 B') ||
        displayFileSize.startsWith('0 KB'))) ||
    (taskState?.totalBytes === 0 && status !== 'downloading') ||
    (video.readyState >= 1 &&
      video.videoWidth === 0 &&
      video.videoHeight === 0 &&
      (!video.duration || video.duration === 0));

  if (isZeroKb && status === 'idle') {
    return null;
  }

  return (
    <div className="vd-overlay-container">
      <button
        type="button"
        className={`vd-button ${
          status === 'completed'
            ? 'vd-status-success'
            : status === 'paused'
            ? 'vd-status-paused'
            : status === 'error'
            ? 'vd-status-error'
            : ''
        }`}
        onClick={handleClick}
        title={
          status === 'error'
            ? taskState?.errorMessage || 'Click to retry saving'
            : status === 'downloading'
            ? 'Click to pause'
            : status === 'paused'
            ? 'Click to resume saving'
            : status === 'completed'
            ? 'Video saved to Vault! View in Side Panel or extension popup.'
            : 'Save Video to Vault (Hidden from PC)'
        }
      >
        {status === 'idle' && (
          <>
            {/* Save / Shield Icon */}
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
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <span className="vd-type-label">Save Video</span>
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
            {progressPercent > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div className="vd-progress-bar-wrap">
                  <div
                    className="vd-progress-bar-fill"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span>
                  Saving: {progressPercent}%{displaySpeed}
                </span>
              </div>
            ) : taskState?.loadedBytes && taskState.loadedBytes > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div className="vd-progress-bar-wrap">
                  <div className="vd-progress-bar-fill" style={{ width: '40%' }} />
                </div>
                <span>
                  {formatBytes(taskState.loadedBytes)}
                  {displaySpeed}
                </span>
              </div>
            ) : (
              <span>Saving in progress...</span>
            )}
          </>
        )}

        {status === 'paused' && (
          <>
            {/* Pause / Resume Icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M5 3h4v18H5V3zm10 0h4v18h-4V3z" />
            </svg>
            <span>
              {progressPercent > 0 ? `${progressPercent}% (Paused)` : 'Paused'}
            </span>
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
            <span>Saved to Vault!</span>
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
            <span>Resume</span>
          </>
        )}
      </button>
    </div>
  );
};

export default DownloadOverlay;

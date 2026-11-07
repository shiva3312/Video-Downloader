import React, { useState, useEffect } from 'react';
import {
  downloadVideoWithProgress,
  generateVideoFilename,
  getVideoResolutionLabel,
  probeVideoDetails,
} from '@/utils/downloader';
import { downloadStore, DownloadTask } from '@/stores/downloadStore';

interface DownloadOverlayProps {
  video: HTMLVideoElement;
}

export const DownloadOverlay: React.FC<DownloadOverlayProps> = ({ video }) => {
  const [resolution, setResolution] = useState<string>('');
  const [format, setFormat] = useState<string>('MP4');
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [taskState, setTaskState] = useState<DownloadTask | undefined>(undefined);

  const getSource = (): string => {
    let src = video.currentSrc || video.src;
    if (!src) {
      const sourceEl = video.querySelector('source');
      if (sourceEl) src = sourceEl.src;
    }
    return src || '';
  };

  useEffect(() => {
    const src = getSource();

    // 1. Sync initial task state from global store
    if (src) {
      setTaskState(downloadStore.getTask(src));
    }

    // 2. Subscribe to global download store updates
    const unsubscribe = downloadStore.subscribe(() => {
      const currentSrc = getSource();
      if (currentSrc) {
        setTaskState(downloadStore.getTask(currentSrc));
      }
    });

    // 3. Determine video resolution
    const updateResolution = () => {
      const res = getVideoResolutionLabel(video);
      if (res) setResolution(res);
    };

    if (video.videoHeight > 0) {
      updateResolution();
    } else {
      video.addEventListener('loadedmetadata', updateResolution, { once: true });
    }

    // 4. Probe exact file size & format from Service Worker via 1-byte Range
    if (src && !src.startsWith('blob:')) {
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
  }, [video]);

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

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const src = getSource();
    if (!src) return;

    if (taskState?.status === 'downloading') return;

    // Use proper extension based on probed format (MKV for matroska to preserve Opus audio!)
    const ext = format.toLowerCase();
    const filename = generateVideoFilename(src, ext);
    const thumb = captureThumbnail();

    // Register into persistent download queue
    downloadStore.addTask(src, filename, resolution, format, undefined, thumb);

    try {
      await downloadVideoWithProgress(src, filename);
    } catch (err: any) {
      console.error('[VideoDownloader] Download trigger error:', err);
      downloadStore.setError(src, err?.message || 'Download failed');
    }
  };

  const status = taskState?.status || 'idle';
  const progressPercent = taskState?.percent || 0;
  const displayFileSize = taskState?.totalBytes ? formatBytes(taskState.totalBytes) : fileSize;
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
        onClick={handleDownload}
        title={
          status === 'error'
            ? taskState?.errorMessage || 'Click to retry download'
            : status === 'downloading'
            ? 'Downloading (check download dock in bottom right)'
            : 'Download this video'
        }
      >
        {status === 'idle' && (
          <>
            {/* Download Icon */}
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download</span>
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
                <span>{progressPercent}%</span>
              </div>
            ) : (
              <span>Queueing...</span>
            )}
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
            <span>Resume</span>
          </>
        )}
      </button>
    </div>
  );
};

export default DownloadOverlay;

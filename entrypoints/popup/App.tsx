import React, { useState, useEffect, useRef } from 'react';
import {
  formatBytes,
  formatSpeed,
  cleanDisplayTitle,
  generateFriendlyVideoName,
  generateVideoFilename,
} from '@/utils/downloader';
import { DownloadTask } from '@/stores/downloadStore';

interface DetectedVideo {
  id: number;
  index?: number;
  src: string;
  videoWidth: number;
  videoHeight: number;
  duration: number;
  type: string;
  title?: string;
}

export const App: React.FC = () => {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [detectedVideos, setDetectedVideos] = useState<DetectedVideo[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'downloads' | 'detected'>('downloads');
  const [loading, setLoading] = useState<boolean>(true);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    init();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const init = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setLoading(false);
      return;
    }
    setActiveTabId(tab.id);
    fetchData(tab.id, true);

    // Poll every 600ms while popup is open to keep progress bars & speeds live
    pollIntervalRef.current = setInterval(() => {
      fetchData(tab.id!, false);
    }, 600);
  };

  const fetchData = (tabId: number, isInitial: boolean) => {
    chrome.tabs.sendMessage(tabId, { type: 'GET_TAB_VIDEOS' }, (response) => {
      if (!chrome.runtime.lastError && response) {
        if (response.tasks) setTasks(response.tasks);
        if (response.videos) setDetectedVideos(response.videos);

        if (isInitial) {
          if (response.tasks && response.tasks.length > 0) {
            setActiveTab('downloads');
          } else if (response.videos && response.videos.length > 0) {
            setActiveTab('detected');
          }
        }
      }
      if (isInitial) setLoading(false);
    });
  };

  const handlePauseResume = (task: DownloadTask) => {
    if (!activeTabId) return;
    const msgType = task.status === 'downloading' ? 'POPUP_PAUSE_TASK' : 'POPUP_RESUME_TASK';
    chrome.tabs.sendMessage(activeTabId, { type: msgType, url: task.url }, () => {
      fetchData(activeTabId, false);
    });
  };

  const handleDelete = (task: DownloadTask) => {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { type: 'POPUP_DELETE_TASK', url: task.url }, () => {
      fetchData(activeTabId, false);
    });
  };

  const handleDownloadTask = (task: DownloadTask) => {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(
      activeTabId,
      {
        type: 'TRIGGER_TAB_DOWNLOAD',
        payload: { url: task.url, filename: task.filename },
      },
      () => fetchData(activeTabId, false)
    );
  };

  const handleDownloadDetected = (video: DetectedVideo) => {
    if (!activeTabId) return;
    const filename = generateVideoFilename(video.src, 'mp4', video.index || video.id || 1);
    const title = video.title || generateFriendlyVideoName(video.src, video.index || video.id || 1);

    chrome.tabs.sendMessage(
      activeTabId,
      {
        type: 'TRIGGER_TAB_DOWNLOAD',
        payload: { url: video.src, filename, title },
      },
      () => {
        setActiveTab('downloads');
        fetchData(activeTabId, false);
      }
    );
  };

  const handleClearCompleted = () => {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { type: 'POPUP_CLEAR_COMPLETED' }, () => {
      fetchData(activeTabId, false);
    });
  };

  const startRename = (task: DownloadTask) => {
    setEditingUrl(task.url);
    const cleanCurrentTitle = cleanDisplayTitle(task.title || task.filename, task.url);
    setEditValue(cleanCurrentTitle.replace(/\.[a-zA-Z0-9]+$/, ''));
  };

  const saveRename = (url: string) => {
    if (!activeTabId || !editValue.trim()) {
      setEditingUrl(null);
      return;
    }
    chrome.tabs.sendMessage(
      activeTabId,
      {
        type: 'POPUP_RENAME_TASK',
        url,
        newFilename: editValue.trim(),
      },
      () => {
        setEditingUrl(null);
        fetchData(activeTabId, false);
      }
    );
  };

  const activeDownloadsCount = tasks.filter((t) => t.status === 'downloading').length;

  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="popup-brand">
          <img src="/icon/icon-48.png" alt="Logo" className="popup-logo" />
          <h1 className="popup-title">Video Downloader</h1>
        </div>
        <div className="popup-header-right">
          {activeDownloadsCount > 0 && <span className="vd-fab-badge">{activeDownloadsCount}</span>}
          {tasks.some((t) => t.status === 'completed' || t.status === 'error') && (
            <button
              type="button"
              className="vd-icon-btn"
              onClick={handleClearCompleted}
              title="Clear Finished"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="popup-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'downloads' ? 'active' : ''}`}
          onClick={() => setActiveTab('downloads')}
        >
          Downloads ({tasks.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'detected' ? 'active' : ''}`}
          onClick={() => setActiveTab('detected')}
        >
          Page Videos ({detectedVideos.length})
        </button>
      </div>

      {/* Body List */}
      <div className="vd-items-list">
        {loading ? (
          <div className="empty-state">
            <svg
              className="vd-icon-spin"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0088cc"
              strokeWidth="2"
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
            <span>Connecting...</span>
          </div>
        ) : activeTab === 'downloads' ? (
          tasks.length === 0 ? (
            <div className="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#484f58" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <div className="empty-title">No active downloads</div>
              <div className="empty-desc">Click Download on any video or in the Page Videos tab.</div>
            </div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="vd-task-item">
                <div className="vd-task-top-compact">
                  {/* Thumbnail */}
                  <div className="vd-thumb-wrap">
                    {task.thumbnail ? (
                      <img src={task.thumbnail} alt="Preview" className="vd-thumb-img" />
                    ) : (
                      <div className="vd-thumb-placeholder">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Title (with inline rename) & Badges */}
                  <div className="vd-task-main">
                    <div className="vd-task-title-row">
                      {editingUrl === task.url ? (
                        <div className="vd-rename-wrap">
                          <input
                            type="text"
                            className="vd-rename-input"
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(task.url);
                              if (e.key === 'Escape') setEditingUrl(null);
                            }}
                          />
                          <button
                            type="button"
                            className="vd-rename-btn save"
                            onClick={() => saveRename(task.url)}
                            title="Save name"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="vd-rename-btn cancel"
                            onClick={() => setEditingUrl(null)}
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="vd-title-container" onClick={() => startRename(task)}>
                          <span className="vd-task-name" title="Click to rename file">
                            {cleanDisplayTitle(task.title || task.filename, task.url)}
                          </span>
                          <button
                            type="button"
                            className="vd-rename-trigger"
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(task);
                            }}
                            title="Rename file"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="vd-badges-row">
                      <span className="vd-format-badge">{task.format || 'MP4'}</span>
                      {task.resolution && <span className="vd-res-badge">{task.resolution}</span>}
                      {task.status === 'paused' && <span className="vd-status-pill paused">Paused</span>}
                      {task.status === 'completed' && <span className="vd-status-pill completed">Done</span>}
                      {task.status === 'error' && <span className="vd-status-pill error">Error</span>}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="vd-task-actions">
                    {(task.status === 'downloading' || task.status === 'paused') && (
                      <button
                        type="button"
                        className="vd-action-btn pause-btn"
                        onClick={() => handlePauseResume(task)}
                        title={task.status === 'downloading' ? 'Pause download' : 'Resume download'}
                      >
                        {task.status === 'downloading' ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </button>
                    )}

                    {(task.status === 'completed' || task.status === 'error' || task.status === 'paused') && (
                      <button
                        type="button"
                        className="vd-action-btn download-btn"
                        onClick={() => handleDownloadTask(task)}
                        title="Download / Save to disk"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                    )}

                    <button
                      type="button"
                      className="vd-action-btn delete-btn"
                      onClick={() => handleDelete(task)}
                      title="Delete from list"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="vd-task-progress-wrap">
                  <div
                    className="vd-task-progress-fill"
                    style={{
                      width: `${task.percent}%`,
                      background:
                        task.status === 'completed'
                          ? '#10b981'
                          : task.status === 'paused'
                          ? '#f59e0b'
                          : task.status === 'error'
                          ? '#ef4444'
                          : undefined,
                    }}
                  />
                </div>

                {/* Progress Details & Speed & Reconnecting */}
                <div className="vd-task-bottom">
                  <span>
                    {task.loadedBytes > 0 ? (
                      <>
                        {formatBytes(task.loadedBytes)}
                        {task.totalBytes ? ` / ${formatBytes(task.totalBytes)}` : ''}
                        {task.isReconnecting ? (
                          <span className="vd-reconnecting-stat"> • Reconnecting...</span>
                        ) : task.status === 'downloading' && task.speed > 0 ? (
                          <span className="vd-speed-stat"> • {formatSpeed(task.speed)}</span>
                        ) : null}
                      </>
                    ) : task.status === 'downloading' ? (
                      task.isReconnecting ? (
                        <span className="vd-reconnecting-stat">Reconnecting...</span>
                      ) : (
                        'Connecting...'
                      )
                    ) : task.status === 'paused' ? (
                      'Paused'
                    ) : (
                      ''
                    )}
                  </span>
                  <span style={{ fontWeight: 600 }}>{task.percent}%</span>
                </div>
              </div>
            ))
          )
        ) : detectedVideos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No videos detected on page</div>
            <div className="empty-desc">Play or scroll to a video on Telegram Web.</div>
          </div>
        ) : (
          detectedVideos.map((vid) => (
            <div key={vid.id} className="vd-task-item">
              <div className="vd-task-top-compact">
                <div className="vd-thumb-wrap">
                  <div className="vd-thumb-placeholder">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                </div>
                <div className="vd-task-main">
                  <div className="vd-task-title-row">
                    <span className="vd-task-name" title={vid.title || vid.src}>
                      {vid.title || generateFriendlyVideoName(vid.src, vid.index || vid.id || 1)}
                    </span>
                  </div>
                  <div className="vd-badges-row">
                    <span className="vd-format-badge">{vid.src.includes('progressive') ? 'MP4/MKV' : 'MP4'}</span>
                    {vid.videoHeight > 0 && <span className="vd-res-badge">{vid.videoHeight}p</span>}
                  </div>
                </div>
                <div className="vd-task-actions">
                  <button
                    type="button"
                    className="vd-action-btn download-btn"
                    onClick={() => handleDownloadDetected(vid)}
                    title="Download this video"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <footer className="popup-footer">
        Resumable chunked streaming with automatic Service Worker integration
      </footer>
    </div>
  );
};

export default App;

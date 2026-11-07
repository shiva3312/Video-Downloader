import React, { useState, useEffect } from 'react';
import { downloadStore, DownloadTask } from '@/stores/downloadStore';
import {
  formatBytes,
  formatSpeed,
  downloadVideoWithProgress,
  cleanDisplayTitle,
} from '@/utils/downloader';

export const DownloadManagerWidget: React.FC = () => {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  useEffect(() => {
    const unsubscribe = downloadStore.subscribe(() => {
      const currentTasks = downloadStore.getTasks();
      setTasks([...currentTasks]);

      // Auto-open panel when a download is actively running
      if (currentTasks.some((t) => t.status === 'downloading')) {
        setIsOpen(true);
      }
    });

    return unsubscribe;
  }, []);

  if (tasks.length === 0) {
    return null;
  }

  const activeCount = tasks.filter((t) => t.status === 'downloading').length;

  const handlePauseResume = (task: DownloadTask) => {
    if (task.status === 'downloading') {
      downloadStore.pauseTask(task.url);
    } else if (task.status === 'paused') {
      downloadStore.resumeTask(task.url);
    }
  };

  const handleDelete = (task: DownloadTask) => {
    downloadStore.deleteTask(task.url);
  };

  const handleDownload = (task: DownloadTask) => {
    downloadStore.addTask(task.url, task.filename, task.resolution, task.format, task.title, task.thumbnail);
    downloadVideoWithProgress(task.url, task.filename);
  };

  const startRename = (task: DownloadTask) => {
    setEditingUrl(task.url);
    const cleanCurrentTitle = cleanDisplayTitle(task.title || task.filename, task.url);
    setEditValue(cleanCurrentTitle.replace(/\.[a-zA-Z0-9]+$/, ''));
  };

  const saveRename = (url: string) => {
    if (editValue.trim()) {
      downloadStore.renameTask(url, editValue.trim());
    }
    setEditingUrl(null);
  };

  return (
    <>
      {!isOpen ? (
        // Collapsed Floating Action Button (FAB)
        <button
          type="button"
          className="vd-fab"
          onClick={() => setIsOpen(true)}
          title="Open Download Manager"
        >
          <svg
            width="15"
            height="15"
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
          <span>Downloads</span>
          {activeCount > 0 && <span className="vd-fab-badge">{activeCount}</span>}
        </button>
      ) : (
        // Expanded Compact Download Manager Card
        <div className="vd-panel">
          <header className="vd-panel-header">
            <div className="vd-panel-title-wrap">
              <span className="vd-panel-title">Downloads</span>
              {activeCount > 0 && <span className="vd-fab-badge">{activeCount}</span>}
            </div>
            <div className="vd-panel-actions">
              {tasks.some((t) => t.status === 'completed' || t.status === 'error') && (
                <button
                  type="button"
                  className="vd-icon-btn"
                  onClick={() => downloadStore.clearCompleted()}
                  title="Clear Finished"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="vd-icon-btn"
                onClick={() => setIsOpen(false)}
                title="Minimize"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </header>

          <div className="vd-items-list">
            {tasks.map((task) => (
              <div key={task.id} className="vd-task-item">
                <div className="vd-task-top-compact">
                  {/* 1. Video Thumbnail Preview */}
                  <div className="vd-thumb-wrap">
                    {task.thumbnail ? (
                      <img src={task.thumbnail} alt="Preview" className="vd-thumb-img" />
                    ) : (
                      <div className="vd-thumb-placeholder">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* 2. Title (with inline rename), Format, Resolution & Status */}
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
                      {task.status === 'paused' && (
                        <span className="vd-status-pill paused">Paused</span>
                      )}
                      {task.status === 'completed' && (
                        <span className="vd-status-pill completed">Done</span>
                      )}
                      {task.status === 'error' && (
                        <span className="vd-status-pill error">Error</span>
                      )}
                    </div>
                  </div>

                  {/* 3. Action Buttons: Pause, Download, Delete */}
                  <div className="vd-task-actions">
                    {/* Pause / Resume Button */}
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

                    {/* Download / Redownload Button */}
                    {(task.status === 'completed' ||
                      task.status === 'error' ||
                      task.status === 'paused') && (
                      <button
                        type="button"
                        className="vd-action-btn download-btn"
                        onClick={() => handleDownload(task)}
                        title="Download / Save to disk"
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                    )}

                    {/* Delete / Cancel Button */}
                    <button
                      type="button"
                      className="vd-action-btn delete-btn"
                      onClick={() => handleDelete(task)}
                      title="Delete from list"
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* 4. Compact Progress Bar */}
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

                {/* Progress Details with Live Speed & Reconnecting Indicator */}
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
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default DownloadManagerWidget;

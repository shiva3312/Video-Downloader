import React, { useState, useEffect, useRef } from 'react';
import {
  formatBytes,
  formatSpeed,
  cleanDisplayTitle,
  generateFriendlyVideoName,
  generateFriendlyImageName,
  generateVideoFilename,
  generateImageFilename,
} from '@/utils/downloader';
import { sniffBlobMediaInfo, isSupportedDomain } from '@/utils/mediaDetector';
import { DownloadTask } from '@/stores/downloadStore';
import { authService } from '@/services/authService';
import { vaultStorage } from '@/services/vaultStorage';
import { licenseService } from '@/services/licenseService';
import { ActiveSession } from '@/types/auth';
import { VaultItem } from '@/types/vault';
import { AuthView } from './components/AuthView';
import { ProKeyModal } from './components/ProKeyModal';
import { RecentVaultList } from './components/RecentVaultList';
import { MediaPreviewModal } from '@/entrypoints/components/MediaPreviewModal';
import {
  ShieldCheck,
  Sparkles,
  Key,
  User,
  LogOut,
  FolderLock,
  ArrowRight,
  Download,
  Check,
  AlertCircle,
  Eye,
  MessageSquare,
  Loader2,
} from 'lucide-react';

interface DetectedVideo {
  id: number;
  index?: number;
  src: string;
  mediaType?: 'video' | 'image';
  videoWidth: number;
  videoHeight: number;
  duration: number;
  type: string;
  title?: string;
  fileSize?: string;
  sizeBytes?: number;
  isZeroKb?: boolean;
}

export const App: React.FC = () => {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [isSupportedSite, setIsSupportedSite] = useState<boolean>(true);

  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [detectedVideos, setDetectedVideos] = useState<DetectedVideo[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'recent' | 'detected' | 'tasks'>('recent');
  const [loading, setLoading] = useState<boolean>(true);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const [previewItem, setPreviewItem] = useState<VaultItem | null>(null);
  const [showProModal, setShowProModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [recentRefresh, setRecentRefresh] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savingItemId, setSavingItemId] = useState<number | string | null>(null);
  const [savingTitle, setSavingTitle] = useState<string>('');

  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    initAuthAndPage();

    // Listen for live vault events from background or on-page actions to show loader, update list and redirect to recent
    const handleRuntimeMsg = (message: any) => {
      if (message?.type === 'VAULT_SAVE_IN_PROGRESS') {
        setIsSaving(true);
        if (message.payload?.title) setSavingTitle(message.payload.title);
      } else if (message?.type === 'VAULT_ITEM_SAVED') {
        setIsSaving(false);
        setSavingItemId(null);
        setRecentRefresh((prev) => prev + 1);
        setActiveTab('recent'); // Redirect to Recent tab to see the newly saved item!
        showToast('🔒 Saved to Vault! Redirected to Recent list.');
      } else if (message?.type === 'VAULT_SAVE_ERROR') {
        setIsSaving(false);
        setSavingItemId(null);
        showToast(`⚠️ Save error: ${message.payload?.error || 'Failed'}`);
      }
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMsg);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      chrome.runtime.onMessage.removeListener(handleRuntimeMsg);
    };
  }, []);

  const initAuthAndPage = async () => {
    const safetyTimer = setTimeout(() => {
      setCheckingAuth(false);
      setLoading(false);
    }, 1200);

    try {
      const active = await authService.getActiveSession();
      setSession(active);
    } catch (err) {
      console.error('Session check failed:', err);
    } finally {
      clearTimeout(safetyTimer);
      setCheckingAuth(false);
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          setLoading(false);
          return;
        }
        setActiveTabId(tab.id);

        const supported = isSupportedDomain(tab.url || '');
        setIsSupportedSite(supported);

        if (supported) {
          fetchData(tab.id, true);

          // Poll while popup is open to keep progress bars & speeds live
          pollIntervalRef.current = setInterval(() => {
            if (tab.id) fetchData(tab.id, false);
          }, 800);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (tabErr) {
      console.warn('Tab query failed:', tabErr);
      setLoading(false);
    }
  };

  const fetchData = (tabId: number, isInitial: boolean) => {
    chrome.tabs.sendMessage(tabId, { type: 'GET_TAB_VIDEOS' }, (response) => {
      if (!chrome.runtime.lastError && response) {
        if (response.tasks) setTasks(response.tasks);
        if (response.videos) {
          // Filter out any 0 KB / empty media
          const filtered = (response.videos as DetectedVideo[]).filter((item) => {
            if (item.isZeroKb) return false;
            if (
              item.fileSize &&
              (item.fileSize === '0 B' ||
                item.fileSize === '0 KB' ||
                item.fileSize.startsWith('0 B') ||
                item.fileSize.startsWith('0 KB'))
            ) {
              return false;
            }
            if (item.sizeBytes === 0) return false;
            const isImg =
              item.mediaType === 'image' ||
              item.type.includes('Photo') ||
              item.type.includes('Image');
            if (isImg && item.videoWidth === 0 && item.videoHeight === 0) return false;
            if (!isImg && item.videoWidth === 0 && item.videoHeight === 0 && item.duration === 0) {
              return false;
            }
            return true;
          });
          setDetectedVideos(filtered);
        }
      }
      if (isInitial) setLoading(false);
    });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleLogout = async () => {
    await authService.logout();
    setSession(null);
    showToast('Logged out of Vault');
  };

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sidePanelApi = (chrome as any).sidePanel;

    if (sidePanelApi && typeof sidePanelApi.open === 'function' && tab?.windowId) {
      try {
        await sidePanelApi.open({ windowId: tab.windowId });
        window.close();
        return;
      } catch (e) {
        console.warn('sidePanel.open failed, trying background fallback:', e);
      }
    }

    // Background fallback
    chrome.runtime.sendMessage(
      { type: 'OPEN_SIDE_PANEL', payload: { windowId: tab?.windowId } },
      () => {
        window.close();
      }
    );
  };

  // Save detected media item directly into the protected in-app vault
  const handleSaveDetectedToVault = async (item: DetectedVideo) => {
    if (!session?.userId) {
      showToast('Please sign in to save to Vault');
      return;
    }

    if (!session.isPro) {
      showToast('⚠️ Saving to Private Vault (IndexedDB) is a Pro feature.');
      setShowProModal(true);
      return;
    }

    const isImage =
      item.mediaType === 'image' || item.type.includes('Photo') || item.type.includes('Image');

    const isZeroKb =
      Boolean(item.isZeroKb) ||
      item.sizeBytes === 0 ||
      (item.fileSize &&
        (item.fileSize === '0 B' ||
          item.fileSize === '0 KB' ||
          item.fileSize.startsWith('0 B') ||
          item.fileSize.startsWith('0 KB'))) ||
      (isImage && item.videoWidth === 0 && item.videoHeight === 0) ||
      (!isImage && item.videoWidth === 0 && item.videoHeight === 0 && item.duration === 0);

    if (isZeroKb) {
      showToast('⚠️ Cannot save: file is 0 KB / empty');
      return;
    }

    const filename = isImage
      ? generateImageFilename(item.src, 'jpg', item.index || item.id || 1)
      : generateVideoFilename(item.src, 'mp4', item.index || item.id || 1);
    const title =
      item.title ||
      (isImage
        ? generateFriendlyImageName(item.src, item.index || item.id || 1)
        : generateFriendlyVideoName(item.src, item.index || item.id || 1));

    const itemKey = item.id || item.src;
    setSavingItemId(itemKey);
    setIsSaving(true);
    setSavingTitle(title);

    try {
      chrome.runtime
        .sendMessage({
          type: 'VAULT_SAVE_IN_PROGRESS',
          payload: { type: isImage ? 'image' : 'video', title },
        })
        .catch(() => {});
    } catch {}

    showToast('Saving in progress... Encrypting content');

    const fallbackDirectFetch = async () => {
      try {
        const resp = await fetch(item.src);
        const rawBlob = await resp.blob();
        if (rawBlob.size === 0) {
          setIsSaving(false);
          setSavingItemId(null);
          showToast('⚠️ Cannot save: file is 0 KB (empty)');
          return;
        }

        let detectedFormat = isImage ? 'JPG' : 'MP4';
        let detectedMime = isImage ? 'image/jpeg' : 'video/mp4';

        try {
          const sniffed = await sniffBlobMediaInfo(rawBlob);
          detectedFormat = sniffed.format;
          detectedMime = sniffed.mimeType;
        } catch {}

        const blob = rawBlob.type === detectedMime ? rawBlob : new Blob([rawBlob], { type: detectedMime });

        await vaultStorage.saveItem({
          userId: session.userId,
          type: isImage ? 'image' : 'video',
          title,
          sourceUrl: item.src,
          format: detectedFormat,
          sizeBytes: blob.size,
          blobData: blob,
          videoMeta: !isImage
            ? { resolution: item.videoHeight ? `${item.videoHeight}p` : undefined }
            : undefined,
          imageMeta: isImage
            ? { dimensions: { width: item.videoWidth, height: item.videoHeight } }
            : undefined,
        });

        setIsSaving(false);
        setSavingItemId(null);
        setRecentRefresh((prev) => prev + 1);
        setActiveTab('recent');
        showToast('🔒 Saved to Vault! Redirected to Recent list.');
      } catch (err: any) {
        setIsSaving(false);
        setSavingItemId(null);
        console.error('Failed to save to vault:', err);
        showToast('Error saving: ' + (err?.message || 'Network error'));
      }
    };

    // When saving detected media:
    // If activeTabId is available, send TRIGGER_TAB_DOWNLOAD to the tab content script.
    // The content script runs inside the host origin (e.g. web.telegram.org) where blob: URLs
    // and ServiceWorker streams can be fetched and saved without CORS issues!
    if (activeTabId) {
      chrome.tabs.sendMessage(
        activeTabId,
        {
          type: 'TRIGGER_TAB_DOWNLOAD',
          payload: {
            url: item.src,
            filename,
            title,
            mediaType: isImage ? 'image' : 'video',
          },
        },
        (res) => {
          if (chrome.runtime.lastError) {
            console.warn('[Popup] Tab message failed, trying fallback:', chrome.runtime.lastError.message);
            fallbackDirectFetch();
          }
        }
      );
    } else {
      fallbackDirectFetch();
    }
  };

  const handlePauseResume = (task: DownloadTask) => {
    if (!activeTabId) return;
    const msgType = task.status === 'downloading' ? 'POPUP_PAUSE_TASK' : 'POPUP_RESUME_TASK';
    chrome.tabs.sendMessage(activeTabId, { type: msgType, url: task.url }, () => {
      fetchData(activeTabId, false);
    });
  };

  const handleDeleteTask = (task: DownloadTask) => {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { type: 'POPUP_DELETE_TASK', url: task.url }, () => {
      fetchData(activeTabId, false);
    });
  };

  const handleClearCompleted = () => {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { type: 'POPUP_CLEAR_COMPLETED' }, () => {
      fetchData(activeTabId, false);
    });
  };

  const activeDownloadsCount = tasks.filter((t) => t.status === 'downloading').length;

  if (checkingAuth) {
    return (
      <div className="popup-container" style={{ padding: 24, textAlign: 'center' }}>
        <span className="v-loading-spinner" />
        <div style={{ marginTop: 12, color: '#94a3b8', fontSize: 12 }}>Checking Vault Session...</div>
      </div>
    );
  }

  // If not logged in -> Display Auth Gate View
  if (!session) {
    return (
      <div className="popup-container auth-mode">
        <AuthView
          onAuthenticated={(newSession) => {
            setSession(newSession);
            showToast(`Welcome, ${newSession.username}!`);
          }}
          onOpenRegisterInSidePanel={() => {
            openSidePanel();
          }}
        />
      </div>
    );
  }

  return (
    <div className="popup-container">
      {/* Toast Notification */}
      {toastMessage && <div className="sp-toast">{toastMessage}</div>}

      {/* Header */}
      <header className="popup-header">
        <div className="popup-brand">
          <img src="/icon/icon-48.png" alt="Logo" className="popup-logo" />
          <h1 className="popup-title">Video Downloader</h1>
        </div>

        <div className="popup-header-right">
          {/* Pro Status Pill */}
          {session.isPro ? (
            <button
              type="button"
              className="sp-pro-pill active"
              onClick={() => setShowProModal(true)}
              title="Pro License Active"
            >
              <Sparkles size={11} style={{ marginRight: 3 }} />
              PRO
            </button>
          ) : (
            <button
              type="button"
              className="sp-pro-pill free"
              onClick={() => setShowProModal(true)}
              title="Upgrade to Pro"
            >
              <Key size={11} style={{ marginRight: 3 }} />
              Upgrade
            </button>
          )}

          {/* User profile tag */}
          <div className="sp-user-tag" title={`Logged in as ${session.username}`}>
            <User size={12} style={{ marginRight: 3 }} />
            <span className="sp-user-name">{session.username}</span>
          </div>

          {/* Chat message selector icon (Only available on Telegram & Snapchat) */}
          {isSupportedSite && (
            <button
              type="button"
              className="vd-icon-btn"
              onClick={() => {
                if (activeTabId) {
                  chrome.tabs.sendMessage(activeTabId, { type: 'TOGGLE_CHAT_SELECTION' }, () => {
                    window.close();
                  });
                }
              }}
              title="Select & Save Chat Messages"
              style={{ color: '#38bdf8' }}
            >
              <MessageSquare size={14} />
            </button>
          )}

          {/* Logout button */}
          <button
            type="button"
            className="vd-icon-btn"
            onClick={handleLogout}
            title="Lock & Log Out"
          >
            <LogOut size={13} />
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="popup-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'recent' ? 'active' : ''}`}
          onClick={() => setActiveTab('recent')}
        >
          Recent (5)
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'detected' ? 'active' : ''}`}
          onClick={() => setActiveTab('detected')}
        >
          Page Media ({detectedVideos.length})
        </button>
        {tasks.length > 0 && (
          <button
            type="button"
            className={`tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            Active ({tasks.length})
          </button>
        )}
      </div>

      {/* Saving in progress animated banner */}
      {isSaving && (
        <div className="popup-saving-banner">
          <Loader2 size={14} className="vd-icon-spin" color="#38bdf8" />
          <div className="popup-saving-text">
            <strong>Saving in progress...</strong>
            <span>
              {savingTitle
                ? `Encrypting "${savingTitle}"`
                : 'Content is being saved & encrypted to Vault'}
            </span>
          </div>
        </div>
      )}

      {/* Main Body List */}
      <div className="vd-items-list">
        {activeTab === 'recent' ? (
          /* Recent 5 items from Protected Vault */
          <RecentVaultList
            userId={session.userId}
            onPreview={(item) => setPreviewItem(item)}
            refreshTrigger={recentRefresh}
          />
        ) : activeTab === 'detected' ? (
          /* Detected media on page */
          !isSupportedSite ? (
            <div className="empty-state">
              <div className="empty-title" style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <FolderLock size={18} /> Active on Telegram & Snapchat Only
              </div>
              <div className="empty-desc" style={{ maxWidth: '280px', margin: '8px auto', lineHeight: '1.5' }}>
                Download buttons and chat capture tools are restricted exclusively to <strong>Telegram Web</strong> and <strong>Snapchat Web</strong>.
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <a
                  href="https://web.telegram.org/"
                  target="_blank"
                  rel="noreferrer"
                  className="v-action-btn secondary"
                  style={{ textDecoration: 'none', padding: '6px 12px', fontSize: '11px', borderRadius: '6px' }}
                >
                  Telegram Web
                </a>
                <a
                  href="https://www.snapchat.com/web"
                  target="_blank"
                  rel="noreferrer"
                  className="v-action-btn secondary"
                  style={{ textDecoration: 'none', padding: '6px 12px', fontSize: '11px', borderRadius: '6px' }}
                >
                  Snapchat Web
                </a>
              </div>
            </div>
          ) : detectedVideos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No media detected on page</div>
              <div className="empty-desc">
                Play a video or view a photo on Telegram Web or Snapchat Web to capture.
              </div>
            </div>
          ) : (
            detectedVideos.map((vid) => {
              const isImage =
                vid.mediaType === 'image' ||
                vid.type.includes('Photo') ||
                vid.type.includes('Image');

              const isZeroKb =
                Boolean(vid.isZeroKb) ||
                vid.sizeBytes === 0 ||
                (vid.fileSize &&
                  (vid.fileSize === '0 B' ||
                    vid.fileSize === '0 KB' ||
                    vid.fileSize.startsWith('0 B') ||
                    vid.fileSize.startsWith('0 KB'))) ||
                (isImage && vid.videoWidth === 0 && vid.videoHeight === 0) ||
                (!isImage && vid.videoWidth === 0 && vid.videoHeight === 0 && vid.duration === 0);

              return (
                <div key={vid.id} className="vd-task-item">
                  <div className="vd-task-top-compact">
                    <div className="vd-thumb-wrap">
                      <div className="vd-thumb-placeholder">
                        {isImage ? (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                        ) : (
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
                        )}
                      </div>
                    </div>
                    <div className="vd-task-main">
                      <div className="vd-task-title-row">
                        <span className="vd-task-name" title={vid.title || vid.src}>
                          {vid.title ||
                            (isImage
                              ? generateFriendlyImageName(vid.src, vid.index || vid.id || 1)
                              : generateFriendlyVideoName(vid.src, vid.index || vid.id || 1))}
                        </span>
                      </div>
                      <div className="vd-badges-row">
                        <span className="vd-format-badge">
                          {isImage ? 'IMAGE' : 'MP4'}
                        </span>
                        {vid.videoHeight > 0 && (
                          <span className="vd-res-badge">{vid.videoHeight}p</span>
                        )}
                      </div>
                    </div>

                    {/* Action: Save to Vault (Save to PC is available from the Vault list only) */}
                    <div className="vd-task-actions">
                      {isZeroKb ? (
                        <span
                          className="vd-zero-kb-label"
                          style={{
                            fontSize: 11,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            padding: '3px 6px',
                          }}
                        >
                          0 KB
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`vd-action-btn vault-save-btn ${savingItemId === (vid.id || vid.src) ? 'saving' : ''}`}
                          disabled={savingItemId === (vid.id || vid.src)}
                          onClick={() => handleSaveDetectedToVault(vid)}
                          title={
                            savingItemId === (vid.id || vid.src)
                              ? 'Saving to Vault in progress...'
                              : 'Save to Vault (Protected in-app storage, hidden from PC)'
                          }
                          style={{
                            width: 'auto',
                            padding: '3px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            background:
                              savingItemId === (vid.id || vid.src)
                                ? 'rgba(56, 189, 248, 0.22)'
                                : 'rgba(56, 189, 248, 0.12)',
                            borderColor: '#38bdf8',
                            color: '#38bdf8',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {savingItemId === (vid.id || vid.src) ? (
                            <>
                              <Loader2 size={13} className="vd-icon-spin" />
                              <span>Saving in progress...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={13} />
                              <span>Save</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )
        ) : (
          /* Active Tasks */
          tasks.map((task) => (
            <div key={task.id} className="vd-task-item">
              <div className="vd-task-top-compact">
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
                <div className="vd-task-main">
                  <div className="vd-task-title-row">
                    <span className="vd-task-name">
                      {cleanDisplayTitle(task.title || task.filename, task.url)}
                    </span>
                  </div>
                  <div className="vd-badges-row">
                    <span className="vd-format-badge">{task.format || 'MP4'}</span>
                    {task.status === 'paused' && <span className="vd-status-pill paused">Paused</span>}
                    {task.status === 'completed' && <span className="vd-status-pill completed">Done</span>}
                  </div>
                </div>
                <div className="vd-task-actions">
                  {(task.status === 'downloading' || task.status === 'paused') && (
                    <button
                      type="button"
                      className="vd-action-btn pause-btn"
                      onClick={() => handlePauseResume(task)}
                      title="Pause/Resume"
                    >
                      {task.status === 'downloading' ? '⏸' : '▶'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="vd-action-btn delete-btn"
                    onClick={() => handleDeleteTask(task)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Progress */}
              <div className="vd-task-progress-wrap">
                <div
                  className="vd-task-progress-fill"
                  style={{ width: `${task.percent}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Sticky Action Bar: Open Vault Side Panel */}
      <footer className="popup-vault-footer">
        <button
          type="button"
          className={`vd-open-vault-btn ${!session.isPro ? 'pro-locked' : ''}`}
          onClick={openSidePanel}
        >
          <FolderLock size={15} color={session.isPro ? '#38bdf8' : '#fbbf24'} />
          <span>
            {session.isPro
              ? 'View All Saved Files (Open Side Panel)'
              : 'Open Media Vault (Pro Feature)'}
          </span>
          <ArrowRight size={14} color="#94a3b8" />
        </button>
      </footer>

      {/* Universal Modals */}
      {previewItem && (
        <MediaPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}

      {showProModal && (
        <ProKeyModal
          onClose={() => setShowProModal(false)}
          onActivated={() => {
            initAuthAndPage();
            showToast('Pro License Activated!');
          }}
        />
      )}
    </div>
  );
};

export default App;

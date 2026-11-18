import React, { useState, useEffect } from 'react';
import { authService } from '@/services/authService';
import { vaultStorage } from '@/services/vaultStorage';
import { ActiveSession } from '@/types/auth';
import { VaultItem, VaultMediaType } from '@/types/vault';
import { SidePanelHeader } from './components/SidePanelHeader';
import { VaultTabContent } from './components/VaultTabContent';
import { SidePanelRegister } from './components/SidePanelRegister';
import { SidePanelProLocked } from './components/SidePanelProLocked';
import { ProKeyModal } from '@/entrypoints/popup/components/ProKeyModal';
import { MediaPreviewModal } from '@/entrypoints/components/MediaPreviewModal';
import { Film, Image as ImageIcon, MessageSquare, FileText, Loader2, ShieldAlert } from 'lucide-react';
import { isAppExpired, APP_EXPIRATION_DATE_STR } from '@/utils/expiration';
import './style.css';

export const App: React.FC = () => {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<VaultMediaType>('video');
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savingInfo, setSavingInfo] = useState<{ type?: string; title?: string } | null>(null);
  const [stats, setStats] = useState({
    totalCount: 0,
    videoCount: 0,
    imageCount: 0,
    chatCount: 0,
    textCount: 0,
    totalBytes: 0,
  });

  const [previewItem, setPreviewItem] = useState<VaultItem | null>(null);
  const [showProModal, setShowProModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (session?.userId && session.isPro) {
      loadVaultData();
    }
  }, [session, activeTab, searchQuery]);

  // Listen for live vault save events to show loader, update list, and redirect to tab
  useEffect(() => {
    const handleRuntimeMessage = (message: any) => {
      if (message?.type === 'VAULT_SAVE_IN_PROGRESS') {
        setIsSaving(true);
        setSavingInfo({
          type: message.payload?.type,
          title: message.payload?.title,
        });
        const incomingType = message.payload?.type as VaultMediaType;
        if (incomingType && ['video', 'image', 'chat_screenshot', 'text'].includes(incomingType)) {
          setActiveTab(incomingType);
        }
      } else if (message?.type === 'VAULT_ITEM_SAVED') {
        setIsSaving(false);
        setSavingInfo(null);
        const targetType = message.payload?.type as VaultMediaType;
        if (targetType && ['video', 'image', 'chat_screenshot', 'text'].includes(targetType)) {
          setActiveTab(targetType);
        }
        loadVaultData();
        const tabNames: Record<string, string> = {
          video: 'Videos',
          image: 'Images',
          chat_screenshot: 'Screenshots',
          text: 'Texts & Notes',
        };
        const tabName = targetType ? tabNames[targetType] || 'Vault' : 'Vault';
        showToast(`✅ Saved & updated ${tabName}!`);
      } else if (message?.type === 'VAULT_SAVE_ERROR') {
        setIsSaving(false);
        setSavingInfo(null);
        showToast(`⚠️ Save error: ${message.payload?.error || 'Failed to save'}`);
      }
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    };
  }, [session, activeTab]);

  const checkSession = async () => {
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1200);

    try {
      const active = await authService.getActiveSession();
      setSession(active);
    } catch (err) {
      console.error('Session check failed:', err);
    } finally {
      clearTimeout(safetyTimer);
      setLoading(false);
    }
  };

  const loadVaultData = async () => {
    if (!session?.userId) return;
    try {
      const [fetchedItems, fetchedStats] = await Promise.all([
        vaultStorage.getItems(session.userId, {
          type: activeTab,
          query: searchQuery,
          sort: 'newest',
        }),
        vaultStorage.getStats(session.userId),
      ]);
      setItems(fetchedItems);
      setStats(fetchedStats);
    } catch (err) {
      console.error('Failed to load vault items:', err);
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => {
      setToast(null);
    }, 2800);
  };

  const handleLogout = async () => {
    await authService.logout();
    setSession(null);
    showToast('Signed out of Vault');
  };

  if (loading) {
    return (
      <div className="sp-loading-screen">
        <span className="v-loading-spinner" />
        <span>Loading Media Vault...</span>
      </div>
    );
  }

  // 1. If not logged in -> Show Account Creation / Sign In in Side Panel
  if (!session) {
    return (
      <div className="sp-auth-wrapper">
        <SidePanelRegister
          onAuthenticated={(s) => {
            setSession(s);
            showToast(`Welcome, ${s.username}!`);
          }}
        />
      </div>
    );
  }

  // 2. If user is Free -> Side Panel content is locked (Pro Feature Gate)
  if (!session.isPro) {
    return (
      <SidePanelProLocked
        session={session}
        onActivated={() => {
          checkSession();
          showToast('⭐ Pro Activated! Media Vault unlocked.');
        }}
        onLogout={handleLogout}
      />
    );
  }

  // 3. If user is PRO -> Show Full Media Vault with the 3 Tabs
  return (
    <div className="sp-container">
      {/* Toast Notification */}
      {toast && <div className="sp-toast">{toast}</div>}

      {/* Expiration Notice Banner if expired */}
      {isAppExpired() && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.28)',
            padding: '8px 12px',
            fontSize: '11px',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ShieldAlert size={15} style={{ flexShrink: 0, color: '#ef4444' }} />
          <span>
            Application expired on <strong>{APP_EXPIRATION_DATE_STR}</strong>. New downloads and captures are disabled. Existing items can be previewed or exported to PC.
          </span>
        </div>
      )}

      {/* Header with Search and User Info */}
      <SidePanelHeader
        session={session}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenProModal={() => setShowProModal(true)}
        onLogout={handleLogout}
        totalStats={{
          totalCount: stats.totalCount,
          totalBytes: stats.totalBytes,
        }}
      />

      {/* 3 Main Tabs: Video, Images, Chat Screenshot */}
      <nav className="sp-tabs-nav">
        <button
          type="button"
          className={`sp-tab-btn ${activeTab === 'video' ? 'active' : ''}`}
          onClick={() => setActiveTab('video')}
        >
          <Film size={14} style={{ marginRight: 6 }} />
          <span>Videos</span>
          <span className="sp-tab-badge">{stats.videoCount}</span>
        </button>

        <button
          type="button"
          className={`sp-tab-btn ${activeTab === 'image' ? 'active' : ''}`}
          onClick={() => setActiveTab('image')}
        >
          <ImageIcon size={14} style={{ marginRight: 6 }} />
          <span>Images</span>
          <span className="sp-tab-badge">{stats.imageCount}</span>
        </button>

        <button
          type="button"
          className={`sp-tab-btn ${activeTab === 'chat_screenshot' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat_screenshot')}
        >
          <MessageSquare size={14} style={{ marginRight: 6 }} />
          <span>Screenshots</span>
          <span className="sp-tab-badge">{stats.chatCount}</span>
        </button>

        <button
          type="button"
          className={`sp-tab-btn ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
        >
          <FileText size={14} style={{ marginRight: 6 }} />
          <span>Texts & Notes</span>
          <span className="sp-tab-badge">{stats.textCount}</span>
        </button>
      </nav>

      {/* Saving In Progress Animated Banner */}
      {isSaving && (
        <div className="sp-saving-banner">
          <Loader2 size={16} className="sp-icon-spin" color="#38bdf8" />
          <div className="sp-saving-text">
            <strong>Saving in progress...</strong>
            <span>
              {savingInfo?.title
                ? `Encrypting "${savingInfo.title}" to Vault`
                : 'Content is being saved & encrypted to Vault'}
            </span>
          </div>
        </div>
      )}

      {/* Tab Body Content */}
      <main className="sp-content-body">
        <VaultTabContent
          type={activeTab}
          items={items}
          userId={session.userId}
          onPreview={(item) => setPreviewItem(item)}
          onItemDeleted={loadVaultData}
          onShowToast={showToast}
        />
      </main>

      {/* Modals */}
      {previewItem && (
        <MediaPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}

      {showProModal && (
        <ProKeyModal
          onClose={() => setShowProModal(false)}
          onActivated={() => {
            checkSession();
            showToast('Pro License Activated!');
          }}
        />
      )}
    </div>
  );
};

export default App;

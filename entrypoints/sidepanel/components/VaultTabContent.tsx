import React, { useState, useEffect } from 'react';
import { VaultItem, VaultMediaType } from '@/types/vault';
import { vaultStorage } from '@/services/vaultStorage';
import {
  Film,
  Image as ImageIcon,
  MessageSquare,
  FileText,
  Eye,
  Copy,
  Download,
  Trash2,
  Calendar,
  Check,
  Users,
  Inbox,
  Send,
  CheckSquare,
  Square,
  X,
  Loader2,
} from 'lucide-react';

interface VaultTabContentProps {
  type: VaultMediaType;
  items: VaultItem[];
  userId: string;
  onPreview: (item: VaultItem) => void;
  onItemDeleted: () => void;
  onShowToast: (msg: string) => void;
}

const VaultThumb: React.FC<{ item: VaultItem }> = ({ item }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(item.thumbnail || null);

  useEffect(() => {
    if (item.thumbnail) {
      setThumbUrl(item.thumbnail);
      return;
    }
    if ((item.type === 'image' || item.type === 'chat_screenshot') && item.blobData) {
      const url = URL.createObjectURL(item.blobData);
      setThumbUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [item.thumbnail, item.blobData]);

  if (thumbUrl) {
    return <img src={thumbUrl} alt={item.title} className="sp-thumb-img" />;
  }

  if (item.type === 'video') {
    return (
      <div className="sp-thumb-placeholder video">
        <Film size={20} color="#38bdf8" />
      </div>
    );
  }
  if (item.type === 'image') {
    return (
      <div className="sp-thumb-placeholder image">
        <ImageIcon size={20} color="#34d399" />
      </div>
    );
  }
  if (item.type === 'text') {
    return (
      <div className="sp-thumb-placeholder text" style={{ background: '#3b0764' }}>
        <FileText size={20} color="#e879f9" />
      </div>
    );
  }
  return (
    <div className="sp-thumb-placeholder chat">
      <MessageSquare size={20} color="#a78bfa" />
    </div>
  );
};

export const VaultTabContent: React.FC<VaultTabContentProps> = ({
  type,
  items,
  userId,
  onPreview,
  onItemDeleted,
  onShowToast,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Clear selection if active tab changes
  useEffect(() => {
    setSelectedIds(new Set());
    setIsSelectMode(false);
  }, [type]);

  const handleCopy = async (e: React.MouseEvent, item: VaultItem) => {
    e.stopPropagation();
    const res = await vaultStorage.copyItemToClipboard(item);
    if (res.success) {
      setCopiedId(item.id);
      onShowToast(res.message);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      onShowToast(res.message);
    }
  };

  const handleDownload = (e: React.MouseEvent, item: VaultItem) => {
    e.stopPropagation();
    vaultStorage.exportToPC(item);
    onShowToast(`Downloading "${item.title}" to PC...`);
  };

  const handleDelete = async (e: React.MouseEvent, item: VaultItem) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${item.title}" from your private vault?`)) {
      await vaultStorage.deleteItem(item.id, userId);
      onShowToast('Item deleted from Vault');
      onItemDeleted();
    }
  };

  // Direct 1-Click Send to Chat (Telegram / Active Tab)
  const handleSendSingleToChat = async (e: React.MouseEvent, item: VaultItem) => {
    e.stopPropagation();
    onShowToast(`Sending "${item.title}" to active chat...`);
    const res = await vaultStorage.sendItemsToActiveChat([item]);
    onShowToast(res.message);
  };

  // Multi-Selection: Toggle Select All
  const handleToggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((it) => it.id)));
    }
  };

  // Multi-Selection: Toggle Single Item
  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Multi-Selection: Batch Send to Chat
  const handleBatchSendToChat = async () => {
    const selectedItems = items.filter((it) => selectedIds.has(it.id));
    if (selectedItems.length === 0) return;
    setIsProcessing(true);
    onShowToast(`Sending ${selectedItems.length} items to chat...`);
    try {
      const res = await vaultStorage.sendItemsToActiveChat(selectedItems);
      onShowToast(res.message);
      if (res.success) {
        setIsSelectMode(false);
        setSelectedIds(new Set());
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Multi-Selection: Batch Delete
  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (confirm(`Delete ${ids.length} selected items from your vault?`)) {
      setIsProcessing(true);
      try {
        const count = await vaultStorage.deleteItems(ids, userId);
        onShowToast(`Deleted ${count} items from Vault`);
        setIsSelectMode(false);
        setSelectedIds(new Set());
        onItemDeleted();
      } catch (err: any) {
        onShowToast(`Failed to delete: ${err?.message || 'Error'}`);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Multi-Selection: Batch Export
  const handleBatchExport = () => {
    const selectedItems = items.filter((it) => selectedIds.has(it.id));
    if (selectedItems.length === 0) return;
    for (const item of selectedItems) {
      vaultStorage.exportToPC(item);
    }
    onShowToast(`Exporting ${selectedItems.length} items to PC Downloads...`);
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    const kb = bytes / 1024;
    return `${kb.toFixed(0)} KB`;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (items.length === 0) {
    return (
      <div className="sp-empty-tab">
        <Inbox size={32} color="#64748b" />
        <div className="sp-empty-title">
          No saved{' '}
          {type === 'video'
            ? 'videos'
            : type === 'image'
            ? 'images'
            : type === 'chat_screenshot'
            ? 'screenshots'
            : 'text transcripts'}
        </div>
        <div className="sp-empty-desc">
          {type === 'video' && 'Videos you save from Telegram or web streams will appear here.'}
          {type === 'image' && 'Images you save will be securely stored here.'}
          {type === 'chat_screenshot' && 'Chat captures and screenshots will be organized here.'}
          {type === 'text' && 'Saved chat transcripts and text notes will appear here.'}
        </div>
      </div>
    );
  }

  return (
    <div className="sp-tab-body-wrapper">
      {/* Multi-Selection Control Bar */}
      <div className={`sp-selection-bar ${isSelectMode ? 'active' : ''}`}>
        {!isSelectMode ? (
          <div className="sp-selection-bar-idle">
            <span className="sp-items-count-label">
              {items.length}{' '}
              {type === 'video'
                ? 'Videos'
                : type === 'image'
                ? 'Images'
                : type === 'chat_screenshot'
                ? 'Screenshots'
                : 'Notes'}
            </span>
            <button
              type="button"
              className="sp-select-mode-toggle-btn"
              onClick={() => setIsSelectMode(true)}
              title="Enable multi-selection to batch send to chat or delete"
            >
              <CheckSquare size={13} style={{ marginRight: 4 }} />
              <span>Select</span>
            </button>
          </div>
        ) : (
          <div className="sp-selection-bar-active">
            <div className="sp-selection-left">
              <button
                type="button"
                className="sp-select-all-btn"
                onClick={handleToggleSelectAll}
                title={selectedIds.size === items.length ? 'Deselect all' : 'Select all'}
              >
                {selectedIds.size === items.length ? (
                  <CheckSquare size={15} color="#38bdf8" />
                ) : (
                  <Square size={15} color="#94a3b8" />
                )}
                <span>{selectedIds.size === items.length ? 'Deselect All' : 'Select All'}</span>
              </button>
              <span className="sp-selected-counter-pill">
                {selectedIds.size} / {items.length} selected
              </span>
            </div>

            <div className="sp-selection-actions">
              {/* Send Selected to Chat */}
              <button
                type="button"
                className="sp-batch-btn chat"
                disabled={selectedIds.size === 0 || isProcessing}
                onClick={handleBatchSendToChat}
                title="Send all selected items into active chat"
              >
                {isProcessing ? (
                  <Loader2 size={13} className="sp-icon-spin" />
                ) : (
                  <Send size={13} />
                )}
                <span>Send to Chat ({selectedIds.size})</span>
              </button>

              {/* Delete Selected */}
              <button
                type="button"
                className="sp-batch-btn delete"
                disabled={selectedIds.size === 0 || isProcessing}
                onClick={handleBatchDelete}
                title="Delete selected items from Vault"
              >
                <Trash2 size={13} />
                <span>Delete ({selectedIds.size})</span>
              </button>

              {/* Batch Export to PC */}
              <button
                type="button"
                className="sp-batch-btn export"
                disabled={selectedIds.size === 0 || isProcessing}
                onClick={handleBatchExport}
                title="Download selected items to PC"
              >
                <Download size={13} />
              </button>

              {/* Cancel Selection */}
              <button
                type="button"
                className="sp-batch-btn cancel"
                onClick={() => {
                  setIsSelectMode(false);
                  setSelectedIds(new Set());
                }}
                title="Exit selection mode"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Items List */}
      <div className="sp-items-list">
        {items.map((item) => (
          <div
            key={item.id}
            className={`sp-vault-card ${isSelectMode ? 'selectable' : ''} ${
              selectedIds.has(item.id) ? 'selected' : ''
            }`}
            onClick={() => {
              if (isSelectMode) {
                toggleSelectItem(item.id);
              } else {
                onPreview(item);
              }
            }}
            title={isSelectMode ? 'Click to select / deselect' : 'Click to preview'}
          >
            {/* Multi-Select Checkbox */}
            {isSelectMode && (
              <div className="sp-card-checkbox-wrap" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  className="sp-card-checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelectItem(item.id)}
                />
              </div>
            )}

            {/* Thumbnail / Media Box */}
            <div className="sp-thumb-wrap">
              <VaultThumb item={item} />
              {item.videoMeta?.duration && (
                <span className="sp-duration-tag">
                  {Math.floor(item.videoMeta.duration / 60)}:
                  {(item.videoMeta.duration % 60).toString().padStart(2, '0')}
                </span>
              )}
            </div>

            {/* Details Column */}
            <div className="sp-card-main">
              {/* Title */}
              <div className="sp-card-title-row">
                <span className="sp-card-title" title={item.title}>
                  {item.title}
                </span>
              </div>

              {/* Chat between users (for chat screenshots and texts) */}
              {(item.type === 'chat_screenshot' || item.type === 'text') && item.chatMeta && (
                <div className="sp-chat-users-row">
                  <Users size={12} color="#a78bfa" style={{ flexShrink: 0, marginRight: 4 }} />
                  <span className="sp-chat-users-label">
                    <strong>Chat between:</strong>{' '}
                    {item.chatMeta.participants?.length > 0
                      ? item.chatMeta.participants.join(' ↔ ')
                      : 'Chat Members'}
                  </span>
                  {item.chatMeta.messageCount > 0 && (
                    <span className="sp-msg-count-pill">
                      {item.chatMeta.messageCount} msgs
                    </span>
                  )}
                </div>
              )}

              {/* Date & Time + Badges */}
              <div className="sp-card-meta-row">
                <span className={`sp-badge ${item.type}`}>{item.format}</span>
                <span className="sp-meta-size">{formatSize(item.sizeBytes)}</span>
                <span className="sp-dot">•</span>
                <span className="sp-meta-date">
                  <Calendar size={11} style={{ marginRight: 3, display: 'inline' }} />
                  {formatDate(item.createdAt)}
                </span>
              </div>
            </div>

            {/* Action Icon Buttons: Preview, Send to Chat, Copy, Download to PC, Delete */}
            {!isSelectMode && (
              <div className="sp-card-actions">
                {/* 1. Preview */}
                <button
                  type="button"
                  className="sp-icon-btn preview"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(item);
                  }}
                  title="Preview Media"
                >
                  <Eye size={14} />
                </button>

                {/* 2. Send to Chat (Direct 1-click paste into active chat) */}
                <button
                  type="button"
                  className="sp-icon-btn send"
                  onClick={(e) => handleSendSingleToChat(e, item)}
                  title="Send / Paste directly into active chat"
                >
                  <Send size={14} />
                </button>

                {/* 3. Copy */}
                <button
                  type="button"
                  className="sp-icon-btn copy"
                  onClick={(e) => handleCopy(e, item)}
                  title={
                    item.type === 'image'
                      ? 'Copy image to clipboard'
                      : item.type === 'text'
                      ? 'Copy text transcript'
                      : item.type === 'chat_screenshot'
                      ? 'Copy screenshot or transcript'
                      : 'Copy link / title (Use 💬 Send to Chat for video)'
                  }
                >
                  {copiedId === item.id ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                </button>

                {/* 4. Download to PC */}
                <button
                  type="button"
                  className="sp-icon-btn download"
                  onClick={(e) => handleDownload(e, item)}
                  title="Download to PC"
                >
                  <Download size={14} />
                </button>

                {/* 5. Delete */}
                <button
                  type="button"
                  className="sp-icon-btn delete"
                  onClick={(e) => handleDelete(e, item)}
                  title="Delete from Vault"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

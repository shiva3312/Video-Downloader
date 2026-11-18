import React, { useEffect, useState } from 'react';
import { VaultItem } from '@/types/vault';
import { vaultStorage } from '@/services/vaultStorage';
import {
  Film,
  Image as ImageIcon,
  MessageSquare,
  FileText,
  Eye,
  Download,
  Trash2,
  Calendar,
  Layers,
} from 'lucide-react';

interface RecentVaultListProps {
  userId: string;
  onPreview: (item: VaultItem) => void;
  refreshTrigger?: number;
}

const RecentThumb: React.FC<{ item: VaultItem }> = ({ item }) => {
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
    return <img src={thumbUrl} alt={item.title} className="v-thumb-img" />;
  }

  if (item.type === 'video') {
    return <Film size={18} color="#38bdf8" />;
  }
  if (item.type === 'image') {
    return <ImageIcon size={18} color="#34d399" />;
  }
  if (item.type === 'text') {
    return <FileText size={18} color="#e879f9" />;
  }
  return <MessageSquare size={18} color="#a78bfa" />;
};

export const RecentVaultList: React.FC<RecentVaultListProps> = ({
  userId,
  onPreview,
  refreshTrigger = 0,
}) => {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecent();
  }, [userId, refreshTrigger]);

  const loadRecent = async () => {
    try {
      setLoading(true);
      const recent = await vaultStorage.getRecentItems(userId, 5);
      setItems(recent);
    } catch (err) {
      console.error('Failed to load recent vault items:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, item: VaultItem) => {
    e.stopPropagation();
    if (confirm(`Remove "${item.title}" from your private vault?`)) {
      await vaultStorage.deleteItem(item.id, userId);
      loadRecent();
    }
  };

  const handleDownloadToPC = (e: React.MouseEvent, item: VaultItem) => {
    e.stopPropagation();
    vaultStorage.exportToPC(item);
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    const kb = bytes / 1024;
    return `${kb.toFixed(0)} KB`;
  };

  const timeAgo = (timestamp: number) => {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="v-recent-loading">
        <span className="v-loading-spinner" />
        <span>Loading vault items...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="v-empty-vault">
        <div className="v-empty-icon-wrap">
          <Layers size={24} color="#64748b" />
        </div>
        <div className="v-empty-title">Your Private Vault is Empty</div>
        <div className="v-empty-desc">
          Videos, photos, and chat screenshots you save will stay protected inside this extension
          and won't be visible in your computer's Downloads folder.
        </div>
      </div>
    );
  }

  return (
    <div className="v-recent-list">
      {items.map((item) => (
        <div key={item.id} className="v-vault-item-card" onClick={() => onPreview(item)}>
          {/* Thumbnail / Type Icon */}
          <div className="v-item-thumb-box">
            <RecentThumb item={item} />
          </div>

          {/* Details */}
          <div className="v-item-info">
            <div className="v-item-title-row">
              <span className="v-item-title" title={item.title}>
                {item.title}
              </span>
            </div>
            <div className="v-item-meta-row">
              <span className={`v-format-pill ${item.type}`}>{item.format}</span>
              <span className="v-meta-size">{formatSize(item.sizeBytes)}</span>
              <span className="v-dot">•</span>
              <span className="v-meta-time">{timeAgo(item.createdAt)}</span>
            </div>
          </div>

          {/* Action Icon Buttons */}
          <div className="v-item-actions">
            <button
              type="button"
              className="v-icon-btn preview"
              onClick={(e) => {
                e.stopPropagation();
                onPreview(item);
              }}
              title="Preview media"
            >
              <Eye size={13} />
            </button>
            <button
              type="button"
              className="v-icon-btn download"
              onClick={(e) => handleDownloadToPC(e, item)}
              title="Export to PC Downloads"
            >
              <Download size={13} />
            </button>
            <button
              type="button"
              className="v-icon-btn delete"
              onClick={(e) => handleDelete(e, item)}
              title="Delete from Vault"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

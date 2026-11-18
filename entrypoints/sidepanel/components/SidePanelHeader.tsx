import React from 'react';
import { ActiveSession } from '@/types/auth';
import {
  ShieldCheck,
  Sparkles,
  User,
  LogOut,
  Search,
  HardDrive,
  Key,
} from 'lucide-react';

interface SidePanelHeaderProps {
  session: ActiveSession;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenProModal: () => void;
  onLogout: () => void;
  totalStats: {
    totalCount: number;
    totalBytes: number;
  };
}

export const SidePanelHeader: React.FC<SidePanelHeaderProps> = ({
  session,
  searchQuery,
  onSearchChange,
  onOpenProModal,
  onLogout,
  totalStats,
}) => {
  const formatTotalSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <header className="sp-header">
      {/* Top brand row */}
      <div className="sp-top-bar">
        <div className="sp-brand">
          <ShieldCheck size={20} color="#38bdf8" />
          <h1 className="sp-title">Media Vault</h1>
        </div>

        <div className="sp-user-badge-wrap">
          {session.isPro ? (
            <button
              type="button"
              className="sp-pro-pill active"
              onClick={onOpenProModal}
              title="Pro License Active"
            >
              <Sparkles size={12} style={{ marginRight: 4 }} />
              PRO
            </button>
          ) : (
            <button
              type="button"
              className="sp-pro-pill free"
              onClick={onOpenProModal}
              title="Upgrade to Pro"
            >
              <Key size={12} style={{ marginRight: 4 }} />
              Upgrade
            </button>
          )}

          <div className="sp-user-tag" title={`Logged in as ${session.username}`}>
            <User size={13} style={{ marginRight: 4 }} />
            <span className="sp-user-name">{session.username}</span>
          </div>

          <button
            type="button"
            className="sp-logout-btn"
            onClick={onLogout}
            title="Lock & Sign Out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* Storage and stats summary */}
      <div className="sp-stats-row">
        <div className="sp-stat-item">
          <HardDrive size={13} style={{ marginRight: 5, color: '#94a3b8' }} />
          <span>Vault Usage: <strong>{formatTotalSize(totalStats.totalBytes)}</strong></span>
        </div>
        <div className="sp-stat-item">
          <span>{totalStats.totalCount} items saved</span>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="sp-search-bar">
        <Search size={14} className="sp-search-icon" />
        <input
          type="text"
          className="sp-search-input"
          placeholder="Search by title, chat participant, format..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="sp-search-clear"
            onClick={() => onSearchChange('')}
          >
            ✕
          </button>
        )}
      </div>
    </header>
  );
};

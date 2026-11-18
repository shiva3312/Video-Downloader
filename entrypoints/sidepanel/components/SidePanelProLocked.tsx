import React, { useState } from 'react';
import { authService } from '@/services/authService';
import { ActiveSession } from '@/types/auth';
import {
  Lock,
  Sparkles,
  Key,
  CheckCircle,
  AlertCircle,
  LogOut,
  User,
  Shield,
  Layers,
} from 'lucide-react';

interface SidePanelProLockedProps {
  session: ActiveSession;
  onActivated: () => void;
  onLogout: () => void;
}

export const SidePanelProLocked: React.FC<SidePanelProLockedProps> = ({
  session,
  onActivated,
  onLogout,
}) => {
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanKey = keyInput.trim();
    if (!cleanKey) {
      setError('Please enter a license key.');
      return;
    }

    setLoading(true);
    try {
      const res = await authService.activateProForUser(session.userId, cleanKey);
      if (res.success) {
        onActivated();
      } else {
        setError(res.error || 'Failed to activate license key.');
      }
    } catch (err: any) {
      setError(err?.message || 'Activation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sp-locked-container">
      {/* Header */}
      <header className="sp-header">
        <div className="sp-top-bar">
          <div className="sp-brand">
            <Shield size={18} color="#fbbf24" />
            <h1 className="sp-title">Media Vault (Pro)</h1>
          </div>

          <div className="sp-user-badge-wrap">
            <div className="sp-user-tag" title={`Logged in as ${session.username}`}>
              <User size={12} style={{ marginRight: 3 }} />
              <span className="sp-user-name">{session.username} (Free)</span>
            </div>

            <button
              type="button"
              className="sp-logout-btn"
              onClick={onLogout}
              title="Lock & Log Out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Lock Card Content */}
      <div className="sp-locked-content">
        <div className="sp-lock-icon-wrap">
          <Lock size={36} color="#fbbf24" />
        </div>

        <h2 className="sp-lock-title">Media Vault is a Pro Feature</h2>
        <p className="sp-lock-desc">
          The Private In-App Vault stores videos, photos, and chat screenshots securely in
          IndexedDB, completely hidden from your PC file system.
        </p>

        <div className="sp-free-vs-pro-card">
          <div className="sp-card-feature-item">
            <span className="sp-check-green">✓</span>
            <span>
              <strong>Free Account:</strong> Standard Telegram & web video downloading to your PC.
            </span>
          </div>
          <div className="sp-card-feature-item">
            <span className="sp-gem-gold">★</span>
            <span>
              <strong>Pro Account:</strong> Private in-app storage, side panel vault, and chat
              screenshots.
            </span>
          </div>
        </div>

        {error && (
          <div className="v-auth-error" style={{ width: '100%', maxWidth: 360 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginRight: 6 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Key Activation Form */}
        <form onSubmit={handleActivate} className="sp-lock-key-form">
          <label className="v-input-label">Enter Pro Activation Key to Unlock</label>
          <div className="v-input-field-wrap">
            <Key size={14} className="v-field-icon" />
            <input
              type="text"
              className="v-text-input"
              placeholder="PRO-PRO-XXXXXXXX-XXXX-XXXXXXXXXXXX"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="v-submit-btn pro-btn" disabled={loading}>
            {loading ? (
              'Verifying...'
            ) : (
              <>
                <Sparkles size={14} style={{ marginRight: 6 }} /> Unlock Media Vault
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

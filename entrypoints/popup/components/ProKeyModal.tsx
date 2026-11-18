import React, { useState, useEffect } from 'react';
import { licenseService } from '@/services/licenseService';
import { LicenseStatus } from '@/types/license';
import {
  X,
  Key,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Clock,
  Shield,
  Layers,
} from 'lucide-react';

interface ProKeyModalProps {
  onClose: () => void;
  onActivated: () => void;
}

export const ProKeyModal: React.FC<ProKeyModalProps> = ({ onClose, onActivated }) => {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refreshStatus();
  }, []);

  const refreshStatus = async () => {
    const s = await licenseService.getStatus();
    setStatus(s);
  };

  const handleActivate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);
    const cleanKey = keyInput.trim();
    if (!cleanKey) {
      setError('Please enter a license key.');
      return;
    }

    setLoading(true);
    try {
      const res = await licenseService.activateKey(cleanKey);
      if (res.isValid) {
        setSuccess(`Pro successfully activated! Valid for ${res.daysRemaining || 30} days.`);
        setKeyInput('');
        await refreshStatus();
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

  const isProActive = status?.isValid && !status?.isExpired && status.tier !== 'FREE';

  return (
    <div className="v-modal-overlay" onClick={onClose}>
      <div className="v-modal-card pro-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="v-modal-header">
          <div className="v-modal-title-wrap">
            <span className="v-pro-gem-icon">
              <Sparkles size={20} color="#fbbf24" />
            </span>
            <div className="v-modal-text">
              <h3 className="v-modal-title">Pro License Activation</h3>
              <div className="v-modal-subtitle">
                {isProActive ? (
                  <span className="v-pro-active-badge">
                    <CheckCircle size={12} style={{ marginRight: 4 }} />
                    PRO ACTIVE ({status?.tier})
                  </span>
                ) : (
                  <span className="v-free-tier-badge">FREE TIER</span>
                )}
              </div>
            </div>
          </div>
          <button type="button" className="v-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="v-modal-body">
          {/* Status Banner */}
          {isProActive ? (
            <div className="v-pro-status-banner active">
              <div className="v-banner-row">
                <Clock size={16} color="#10b981" />
                <span>
                  <strong>Validity:</strong> {status?.daysRemaining} days remaining (Expires:{' '}
                  {status?.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : 'Never'})
                </span>
              </div>
              <div className="v-banner-features">
                <span>✓ Unlimited Private Vault Storage</span>
                <span>✓ Unlimited Multi-User Profiles</span>
                <span>✓ Chat Screenshot & Transcript Vault</span>
                <span>✓ High-Resolution Video Sniffer</span>
              </div>
            </div>
          ) : (
            <div className="v-pro-status-banner inactive">
              <div className="v-banner-row">
                <AlertCircle size={16} color="#f59e0b" />
                <span>
                  Free tier is limited to <strong>1 profile</strong> and{' '}
                  <strong>3 saved items</strong>. Activate a Pro key to unlock all features.
                </span>
              </div>
            </div>
          )}

          {/* Feedback messages */}
          {error && (
            <div className="v-auth-error">
              <AlertCircle size={15} style={{ flexShrink: 0, marginRight: 8 }} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="v-auth-success">
              <CheckCircle size={15} style={{ flexShrink: 0, marginRight: 8 }} color="#10b981" />
              <span>{success}</span>
            </div>
          )}

          {/* Key Input Form */}
          <form onSubmit={handleActivate} className="v-key-form">
            <label className="v-input-label">Enter Pro License Key</label>
            <div className="v-input-field-wrap">
              <Key size={15} className="v-field-icon" />
              <input
                type="text"
                className="v-text-input"
                placeholder="PRO-PRO-XXXXXXXX-XXXX-XXXXXXXXXXXX"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" className="v-submit-btn pro-btn" disabled={loading}>
              {loading ? (
                'Verifying Key...'
              ) : (
                <>
                  <Sparkles size={15} style={{ marginRight: 6 }} /> Activate Pro Features
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="v-modal-footer">
          <span className="v-modal-note">
            Keys are tied to installation instance. On extension uninstall, a fresh key is required.
          </span>
        </div>
      </div>
    </div>
  );
};

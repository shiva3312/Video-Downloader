import React, { useState, useEffect } from 'react';
import { authService } from '@/services/authService';
import { ActiveSession } from '@/types/auth';
import {
  UserPlus,
  LogIn,
  Key,
  ShieldCheck,
  AlertCircle,
  User,
  Sparkles,
  Lock,
  CheckCircle2,
} from 'lucide-react';

interface SidePanelRegisterProps {
  onAuthenticated: (session: ActiveSession) => void;
  initialMode?: 'register' | 'login';
}

export const SidePanelRegister: React.FC<SidePanelRegisterProps> = ({
  onAuthenticated,
  initialMode = 'register',
}) => {
  const [mode, setMode] = useState<'register' | 'login'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasProKey, setHasProKey] = useState<'yes' | 'no'>('yes');
  const [licenseKey, setLicenseKey] = useState('');
  const [existingUsers, setExistingUsers] = useState<
    { id: string; username: string; isPro: boolean }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const users = await authService.listUsers();
      setExistingUsers(users);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && hasProKey === 'yes' && !licenseKey.trim()) {
      setError('Please enter your Pro Activation Key.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await authService.login(username, password);
        if (res.success && res.session) {
          onAuthenticated(res.session);
        } else {
          setError(res.error || 'Failed to sign in.');
        }
      } else {
        const keyToSubmit = hasProKey === 'yes' ? licenseKey.trim() : undefined;
        const res = await authService.register(username, password, keyToSubmit);
        if (res.success && res.session) {
          onAuthenticated(res.session);
        } else {
          setError(res.error || 'Failed to create account.');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sp-auth-card">
      <div className="v-auth-header">
        <div className="v-auth-icon-wrap">
          <ShieldCheck size={28} color="#38bdf8" />
        </div>
        <h2 className="v-auth-title">
          {mode === 'register' ? 'Create Media Vault Profile' : 'Sign In to Media Vault'}
        </h2>
        <p className="v-auth-subtitle">
          {mode === 'register'
            ? 'Set up an isolated profile. Activate with a Pro Key to unlock the private in-app vault.'
            : 'Access your private in-app videos, images, and chat screenshots.'}
        </p>
      </div>

      {/* Switcher */}
      <div className="v-auth-modes">
        <button
          type="button"
          className={`v-auth-mode-btn ${mode === 'register' ? 'active' : ''}`}
          onClick={() => {
            setMode('register');
            setError(null);
          }}
        >
          <UserPlus size={13} style={{ marginRight: 5 }} />
          Create Profile
        </button>
        <button
          type="button"
          className={`v-auth-mode-btn ${mode === 'login' ? 'active' : ''}`}
          onClick={() => {
            setMode('login');
            setError(null);
          }}
        >
          <LogIn size={13} style={{ marginRight: 5 }} />
          Sign In
        </button>
      </div>

      {/* Quick account chips when in Login mode */}
      {mode === 'login' && existingUsers.length > 0 && (
        <div className="v-user-chips-wrap">
          <span className="v-chips-label">Existing Profiles:</span>
          <div className="v-user-chips">
            {existingUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`v-user-chip ${username === u.username ? 'active' : ''}`}
                onClick={() => setUsername(u.username)}
              >
                <User size={11} style={{ marginRight: 3 }} />
                <span>{u.username}</span>
                {u.isPro && <span style={{ marginLeft: 3, color: '#fbbf24', fontSize: 9 }}>★</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="v-auth-error">
          <AlertCircle size={14} style={{ flexShrink: 0, marginRight: 6 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="v-auth-form">
        {/* Pro Key Choice in Register Mode */}
        {mode === 'register' && (
          <div className="v-pro-question-section">
            <div className="v-pro-question-label">
              <Sparkles size={13} color="#fbbf24" style={{ marginRight: 4 }} />
              <span>Have a Pro Activation Key?</span>
            </div>

            <div className="v-pro-choice-grid">
              <button
                type="button"
                className={`v-pro-choice-card ${hasProKey === 'yes' ? 'selected' : ''}`}
                onClick={() => {
                  setHasProKey('yes');
                  setError(null);
                }}
              >
                <div className="v-choice-radio">
                  {hasProKey === 'yes' ? (
                    <CheckCircle2 size={14} color="#38bdf8" />
                  ) : (
                    <span className="v-radio-circle" />
                  )}
                  <strong>Yes, I have a Key</strong>
                </div>
                <div className="v-choice-features">
                  <span>• Full In-App Media Vault</span>
                  <span>• Private Videos, Images, Chats</span>
                  <span>• Side Panel Access</span>
                </div>
              </button>

              <button
                type="button"
                className={`v-pro-choice-card ${hasProKey === 'no' ? 'selected' : ''}`}
                onClick={() => {
                  setHasProKey('no');
                  setLicenseKey('');
                  setError(null);
                }}
              >
                <div className="v-choice-radio">
                  {hasProKey === 'no' ? (
                    <CheckCircle2 size={14} color="#38bdf8" />
                  ) : (
                    <span className="v-radio-circle" />
                  )}
                  <strong>No, Continue Free</strong>
                </div>
                <div className="v-choice-features">
                  <span>• Standard Profile</span>
                  <span>• Standard Telegram/Web downloads</span>
                  <span>• Vault content locked</span>
                </div>
              </button>
            </div>

            {hasProKey === 'yes' && (
              <div className="v-input-group" style={{ marginTop: 6 }}>
                <label className="v-input-label">Enter Pro Activation Key</label>
                <div className="v-input-field-wrap">
                  <Key size={14} className="v-field-icon" />
                  <input
                    type="text"
                    className="v-text-input"
                    placeholder="PRO-PRO-XXXXXXXX-XXXX-XXXXXXXXXXXX"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Username */}
        <div className="v-input-group">
          <label className="v-input-label">Username</label>
          <div className="v-input-field-wrap">
            <User size={14} className="v-field-icon" />
            <input
              type="text"
              className="v-text-input"
              placeholder="e.g. Alex"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Password */}
        <div className="v-input-group">
          <label className="v-input-label">Password</label>
          <div className="v-input-field-wrap">
            <Lock size={14} className="v-field-icon" />
            <input
              type="password"
              className="v-text-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className={`v-submit-btn ${hasProKey === 'yes' && mode === 'register' ? 'pro-btn' : ''}`}
          disabled={loading}
        >
          {loading ? (
            'Processing...'
          ) : mode === 'login' ? (
            <>
              <LogIn size={14} style={{ marginRight: 6 }} /> Sign In to Vault
            </>
          ) : hasProKey === 'yes' ? (
            <>
              <Sparkles size={14} style={{ marginRight: 6 }} /> Create Pro Profile
            </>
          ) : (
            <>
              <UserPlus size={14} style={{ marginRight: 6 }} /> Create Free Profile
            </>
          )}
        </button>
      </form>
    </div>
  );
};

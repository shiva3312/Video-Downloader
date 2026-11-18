import React, { useState, useEffect } from 'react';
import { authService } from '@/services/authService';
import { ActiveSession } from '@/types/auth';
import {
  Lock,
  LogIn,
  ShieldCheck,
  AlertCircle,
  User,
  ArrowRight,
  UserPlus,
} from 'lucide-react';

interface AuthViewProps {
  onAuthenticated: (session: ActiveSession) => void;
  onOpenRegisterInSidePanel: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  onAuthenticated,
  onOpenRegisterInSidePanel,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      if (users.length > 0) {
        setUsername(users[0].username);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await authService.login(username, password);
      if (res.success && res.session) {
        onAuthenticated(res.session);
      } else {
        setError(res.error || 'Failed to sign in.');
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="v-auth-container">
      {/* Brand Header */}
      <div className="v-auth-header">
        <div className="v-auth-icon-wrap">
          <ShieldCheck size={26} color="#38bdf8" />
        </div>
        <h2 className="v-auth-title">Media Vault Sign In</h2>
        <p className="v-auth-subtitle">
          Protected in-app storage hidden from your PC. Sign in to access your media.
        </p>
      </div>

      {/* Existing users quick switcher */}
      {existingUsers.length > 0 && (
        <div className="v-user-chips-wrap">
          <span className="v-chips-label">Select Profile:</span>
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

      {/* Error alert */}
      {error && (
        <div className="v-auth-error">
          <AlertCircle size={14} style={{ flexShrink: 0, marginRight: 6 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleLogin} className="v-auth-form">
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
              autoFocus
            />
          </div>
        </div>

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

        <button type="submit" className="v-submit-btn" disabled={loading}>
          {loading ? (
            'Signing In...'
          ) : (
            <>
              <LogIn size={14} style={{ marginRight: 6 }} /> Sign In to Vault
            </>
          )}
        </button>
      </form>

      {/* Bottom: Don't have an account? Create new -> Opens Side Panel */}
      <div className="v-create-account-prompt">
        <span className="v-prompt-text">Don't have an account?</span>
        <button
          type="button"
          className="v-create-new-btn"
          onClick={onOpenRegisterInSidePanel}
        >
          <UserPlus size={13} style={{ marginRight: 4 }} />
          <span>Create new profile</span>
          <ArrowRight size={12} style={{ marginLeft: 'auto' }} />
        </button>
      </div>

      <div className="v-auth-footer">
        <span>🔒 Sessions remain active for up to 24 hours</span>
      </div>
    </div>
  );
};

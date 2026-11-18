import React from 'react';
import { AlertTriangle, Clock, ShieldX } from 'lucide-react';
import { APP_EXPIRATION_DATE_STR } from '@/utils/expiration';

interface AppExpiredViewProps {
  onOpenSidePanel?: () => void;
}

export const AppExpiredView: React.FC<AppExpiredViewProps> = ({ onOpenSidePanel }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 20px',
        textAlign: 'center',
        background: '#0f172a',
        color: '#f8fafc',
        minHeight: '360px',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}
      >
        <ShieldX size={30} color="#ef4444" />
      </div>

      <h2
        style={{
          fontSize: '18px',
          fontWeight: 700,
          color: '#ffffff',
          marginBottom: '8px',
          letterSpacing: '-0.3px',
        }}
      >
        Application Expired
      </h2>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          background: 'rgba(239, 68, 68, 0.1)',
          borderRadius: '9999px',
          color: '#f87171',
          fontSize: '11px',
          fontWeight: 600,
          marginBottom: '14px',
        }}
      >
        <Clock size={12} />
        Expired on {APP_EXPIRATION_DATE_STR}
      </div>

      <p
        style={{
          fontSize: '13px',
          lineHeight: '1.6',
          color: '#94a3b8',
          maxWidth: '300px',
          margin: '0 auto 20px auto',
        }}
      >
        This version was scheduled to stop working after {APP_EXPIRATION_DATE_STR}. All media detection, video downloads, and chat capturing tools have been permanently deactivated.
      </p>

      {onOpenSidePanel && (
        <button
          type="button"
          onClick={onOpenSidePanel}
          style={{
            padding: '8px 16px',
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#cbd5e1',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Open Media Vault Archive
        </button>
      )}
    </div>
  );
};

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[VideoDownloader:ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 16,
            background: '#0f172a',
            color: '#f8fafc',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              padding: 10,
              background: '#450a0a',
              borderRadius: '50%',
              border: '1px solid #dc2626',
              marginBottom: 12,
              display: 'flex',
            }}
          >
            <AlertCircle size={24} color="#ef4444" />
          </div>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px 0', color: '#fca5a5' }}>
            {this.props.fallbackTitle || 'Something went wrong'}
          </h3>
          <p
            style={{
              fontSize: 11,
              color: '#94a3b8',
              margin: '0 0 14px 0',
              maxWidth: 280,
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {this.state.error?.message || 'An unexpected error occurred while loading this view.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RefreshCw size={13} />
            Reload View
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

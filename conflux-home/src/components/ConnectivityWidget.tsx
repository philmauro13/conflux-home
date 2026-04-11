import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface EmailConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  tls: boolean;
}

interface ConnectivityStatus {
  googleConnected: boolean;
  googleEmail: string | null;
  smtpConfigured: boolean;
  loading: boolean;
  error: string | null;
}

// Check if Tauri runtime is available
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const ConnectivityWidget: React.FC = () => {
  const [status, setStatus] = useState<ConnectivityStatus>({
    googleConnected: false,
    googleEmail: null,
    smtpConfigured: false,
    loading: true,
    error: null,
  });

  const fetchConnectivityStatus = async () => {
    if (!isTauri()) {
      setStatus({
        googleConnected: false,
        googleEmail: null,
        smtpConfigured: false,
        loading: false,
        error: null,
      });
      return;
    }

    try {
      setStatus(prev => ({ ...prev, loading: true, error: null }));

      const googleConnected = await invoke<boolean>('engine_google_is_connected');
      let googleEmail: string | null = null;
      if (googleConnected) {
        googleEmail = await invoke<string>('engine_google_get_email');
      }

      let smtpConfigured = false;
      try {
        const emailConfig = await invoke<EmailConfig | null>('engine_get_email_config');
        smtpConfigured = !!emailConfig?.host;
      } catch {
        // SMTP config not available
      }

      setStatus({
        googleConnected,
        googleEmail,
        smtpConfigured,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      console.error('Failed to fetch connectivity status:', e);
      setStatus({
        googleConnected: false,
        googleEmail: null,
        smtpConfigured: false,
        loading: false,
        error: e.message || 'Error checking status',
      });
    }
  };

  useEffect(() => {
    fetchConnectivityStatus();
    const interval = setInterval(fetchConnectivityStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManageConnections = () => {
    window.dispatchEvent(new CustomEvent('conflux:navigate', { detail: 'settings' }));
  };

  return (
    <div
      style={{
        maxWidth: 320,
        margin: '0 auto 20px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '16px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        color: 'var(--text-primary)',
      }}
    >
      <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: 'var(--text-primary)' }}>
        🔗 Connections
      </h3>
      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '10px' }} />

      {status.loading && <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Checking...</p>}
      {!status.loading && (
        <>
          <ConnectionLine label="✉️ Google" connected={status.googleConnected} detail={status.googleConnected ? status.googleEmail || 'connected' : 'not connected'} />
          <ConnectionLine label="📄 Docs" connected={status.googleConnected} detail={status.googleConnected ? 'connected' : 'not connected'} />
          <ConnectionLine label="📊 Sheets" connected={status.googleConnected} detail={status.googleConnected ? 'connected' : 'not connected'} />
          <ConnectionLine label="📁 Drive" connected={status.googleConnected} detail={status.googleConnected ? 'connected' : 'not connected'} />
          <ConnectionLine label="📧 SMTP" connected={status.smtpConfigured} detail={status.smtpConfigured ? 'configured' : 'not set'} />
        </>
      )}

      <div style={{ marginTop: '15px', textAlign: 'center' }}>
        <button
          onClick={handleManageConnections}
          style={{
            background: 'var(--accent-primary)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 15px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          Manage Connections
        </button>
      </div>
    </div>
  );
};

function ConnectionLine({ label, connected, detail }: { label: string; connected: boolean; detail: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', fontSize: '13px' }}>
      <span style={{ marginRight: '8px', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: connected ? '#10b981' : '#f59e0b' }}>
        {connected ? '✅' : '⚠️'}
      </span>
      <span style={{
        marginLeft: '8px',
        color: 'var(--text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {detail}
      </span>
    </div>
  );
}

export default ConnectivityWidget;

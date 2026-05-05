// Conflux Home — Google Workspace Settings
// Connect/disconnect Google, manage OAuth credentials, show status.

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function GoogleSettings() {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Credentials form
  const [showCredentials, setShowCredentials] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hasCredentials, setHasCredentials] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const isConnected = await invoke<boolean>('engine_google_is_connected');
      setConnected(isConnected);

      if (isConnected) {
        const userEmail = await invoke<string>('engine_google_get_email');
        setEmail(userEmail);
      }

      const creds = await invoke<{ client_id: string; client_secret: string; has_credentials: boolean }>('engine_google_get_credentials');
      setHasCredentials(creds.has_credentials);
      setClientId(creds.client_id);
      setClientSecret(creds.client_secret);
    } catch (err) {
      console.error('[GoogleSettings] Failed to load status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleConnect() {
    if (!hasCredentials) {
      setShowCredentials(true);
      return;
    }

    setConnecting(true);
    try {
      const userEmail = await invoke<string>('engine_google_connect');
      setEmail(userEmail);
      setConnected(true);
    } catch (err) {
      alert(`Google connection failed: ${err}`);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Google? You\'ll need to re-authenticate to use Google tools.')) return;
    try {
      await invoke('engine_google_disconnect');
      setConnected(false);
      setEmail('');
    } catch (err) {
      console.error('[GoogleSettings] Failed to disconnect:', err);
    }
  }

  async function handleSaveCredentials() {
    if (!clientId || !clientSecret) return;
    try {
      await invoke('engine_google_set_credentials', { client_id: clientId, client_secret: clientSecret });
      setHasCredentials(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('[GoogleSettings] Failed to save credentials:', err);
    }
  }

  if (loading) {
    return (
      <div className="settings-section">
        <div className="settings-section-title">📧 Google Workspace</div>
        <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">📧 Google Workspace</div>

      {/* Status */}
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${connected ? 'rgba(52,199,89,0.3)' : 'var(--border)'}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>{connected ? '✅' : '🔌'}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {connected ? 'Connected' : 'Not Connected'}
              </div>
              {connected && email && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{email}</div>
              )}
              {!connected && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Connect to use Gmail, Drive, Docs, and Sheets tools
                </div>
              )}
            </div>
          </div>

          {connected ? (
            <button
              onClick={handleDisconnect}
              style={{
                background: 'rgba(255,68,68,0.1)',
                border: '1px solid rgba(255,68,68,0.2)',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                color: '#ff6666',
              }}
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              style={{
                background: 'var(--accent-primary)',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                color: '#000',
              }}
            >
              {connecting ? 'Waiting for auth...' : hasCredentials ? '🔗 Connect Google' : '⚙️ Set Up First'}
            </button>
          )}
        </div>
      </div>

      {/* Available Tools */}
      {connected && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
            Available Tools
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              { icon: '📧', name: 'Send Email', tool: 'gmail_send' },
              { icon: '🔍', name: 'Search Email', tool: 'gmail_search' },
              { icon: '📁', name: 'List Drive', tool: 'google_drive_list' },
              { icon: '📄', name: 'Read Doc', tool: 'google_doc_read' },
              { icon: '✏️', name: 'Write Doc', tool: 'google_doc_write' },
              { icon: '📊', name: 'Read Sheet', tool: 'google_sheet_read' },
              { icon: '📝', name: 'Write Sheet', tool: 'google_sheet_write' },
            ].map(t => (
              <span
                key={t.tool}
                style={{
                  background: 'rgba(0,212,255,0.08)',
                  border: '1px solid rgba(0,212,255,0.15)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  color: 'var(--accent-primary)',
                }}
              >
                {t.icon} {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Credentials Section */}
      <div>
        <button
          onClick={() => setShowCredentials(!showCredentials)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            padding: 0,
            marginBottom: showCredentials ? 12 : 0,
          }}
        >
          {showCredentials ? '▾ Hide' : '▸'} OAuth Credentials {hasCredentials && '✓'}
        </button>

        {showCredentials && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 16,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Create OAuth 2.0 credentials in{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener"
                style={{ color: 'var(--accent-primary)' }}>
                Google Cloud Console
              </a>
              {' '}→ Create OAuth Client ID → <strong>Desktop app</strong>
              <br />
              Then paste the Client ID and Secret below.
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Client ID
              </label>
              <input
                className="settings-input"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="xxxxx.apps.googleusercontent.com"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Client Secret
              </label>
              <input
                className="settings-input"
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="GOCSPX-..."
              />
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={handleSaveCredentials}
                disabled={!clientId || !clientSecret}
                style={{
                  background: saved ? '#34c759' : 'var(--accent-primary)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#000',
                  opacity: (!clientId || !clientSecret) ? 0.5 : 1,
                }}
              >
                {saved ? '✓ Saved!' : '💾 Save Credentials'}
              </button>
              {hasCredentials && (
                <span style={{ fontSize: 11, color: '#34c759' }}>Credentials configured</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

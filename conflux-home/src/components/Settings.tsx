import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { AGENT_PROFILES, AGENT_PROFILE_MAP } from '../data/agent-descriptions';
import Avatar from './Avatar';
import ProviderSettings from './settings/ProviderSettings';
import GoogleSettings from './settings/GoogleSettings';
import NotificationSettings from './settings/NotificationSettings';
import EmailSettings from './settings/EmailSettings';
import CronManager from './settings/CronManager';
import TaskView from './settings/TaskView';
import WebhookManager from './settings/WebhookManager';
import SkillsBrowser from './settings/SkillsBrowser';
import BillingSection from './settings/BillingSection';
import UsageSection from './settings/UsageSection';
import SoundSection from './settings/SoundSection';
import { useAuth } from '../hooks/useAuth';
import { playToggleOn, playToggleOff } from '../lib/sound';
import { useTourState } from '../hooks/useTourState';

// ── Constants ──

const ACCENT_COLORS = [
  { name: 'Blue', value: 'blue', hex: '#0071e3' },
  { name: 'Purple', value: 'purple', hex: '#7b2fff' },
  { name: 'Green', value: 'green', hex: '#00cc44' },
  { name: 'Orange', value: 'orange', hex: '#ff8800' },
  { name: 'Pink', value: 'pink', hex: '#ff2d78' },
  { name: 'Cyan', value: 'cyan', hex: '#00b4d8' },
];


// ── Toggle Switch Component ──

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={`toggle-switch ${checked ? 'on' : ''}`}
      onClick={() => { checked ? playToggleOff() : playToggleOn(); onChange(!checked); }}
      aria-label={checked ? 'Disable' : 'Enable'}
      type="button"
    >
      <span className="toggle-knob" />
    </button>
  );
}

// ── Section 1: Engine Status ──

function EngineSection() {
  const [health, setHealth] = useState<{ status: string } | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const checkEngine = useCallback(async () => {
    setLoading(true);
    try {
      const [h, agents] = await Promise.all([
        invoke<any>('engine_health').catch(() => null),
        invoke<any[]>('engine_get_agents').catch(() => []),
      ]);
      setHealth(h);
      setAgentCount((agents ?? []).length);
    } catch {
      setHealth(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    checkEngine();
  }, [checkEngine]);

  const isHealthy = health?.status === 'healthy' || health !== null;

  return (
    <div className="settings-section">
      <div className="settings-section-title">⚡ Engine Status</div>

      <div className="settings-row">
        <span className="settings-label">Status</span>
        <div className="settings-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`status-dot ${isHealthy ? 'connected' : 'disconnected'}`} />
          <span>{loading ? 'Checking…' : isHealthy ? 'Running' : 'Unavailable'}</span>
        </div>
      </div>

      <div className="settings-row">
        <span className="settings-label">Agents</span>
        <span className="settings-value">{agentCount} installed</span>
      </div>

      <div className="settings-row">
        <span className="settings-label">Mode</span>
        <span className="settings-value">Embedded (standalone)</span>
      </div>

      <div className="settings-actions">
        <button className="settings-button" onClick={checkEngine}>
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}

// ── Section 2: Appearance ──

function AppearanceSection() {
  const [accent, setAccent] = useState(
    () => localStorage.getItem('conflux-accent') || 'blue'
  );

  const handleAccentChange = (value: string) => {
    setAccent(value);
    localStorage.setItem('conflux-accent', value);
    document.body.setAttribute('data-accent', value);
    window.dispatchEvent(new CustomEvent('conflux:accent-change', { detail: value }));
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">🎨 Appearance</div>

      {/* Accent Color */}
      <div className="settings-row">
        <span className="settings-label">Accent Color</span>
        <div className="accent-row">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.value}
              className={`accent-circle ${accent === c.value ? 'selected' : ''}`}
              style={{ background: c.hex }}
              onClick={() => handleAccentChange(c.value)}
              title={c.name}
              aria-label={c.name}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Section 4: Data & Privacy ──

function DataSection() {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { resetTour } = useTourState();

  const handleReplayTour = () => {
    resetTour();
    window.location.reload();
  };

  const exportData = () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('conflux-')) {
        data[key] = localStorage.getItem(key) || '';
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conflux-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setShowClearConfirm(true);
  };

  const confirmClear = () => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('conflux-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    window.location.reload();
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">🔒 Data & Privacy</div>

      <div className="settings-actions" style={{ marginBottom: 12 }}>
        <button className="settings-button" onClick={exportData}>
          📦 Export Data
        </button>
        <button className="settings-button" onClick={handleReplayTour}>
          🔄 Replay Tour
        </button>
        <button className="settings-button danger" onClick={clearAll}>
          🗑️ Clear All Data
        </button>
      </div>

      {showClearConfirm && (
        <div className="settings-confirm-bar">
          <span>⚠️ Are you sure? This will reset everything.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="settings-button danger" onClick={confirmClear}>
              Yes, Clear Everything
            </button>
            <button
              className="settings-button"
              onClick={() => setShowClearConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="settings-info">
        All data is stored locally on this device. Nothing is sent to external servers.
      </p>
      <p className="settings-tagline">Your agents, your data, your machine.</p>
    </div>
  );
}

// ── Section 5: About & Support ──

function AboutSection() {
  const [logPath, setLogPath] = useState<string>('');
  const [systemInfo, setSystemInfo] = useState<{ os: string; arch: string; app_version: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState<string>('');

  useEffect(() => {
    // Fetch log path and system info from Tauri
    invoke<string>('get_log_path').then(setLogPath).catch(() => {});
    invoke<any>('get_system_info').then(setSystemInfo).catch(() => {});
  }, []);

  const handleCopyLogPath = async () => {
    if (!logPath) return;
    try {
      await navigator.clipboard.writeText(logPath);
      setCopyStatus('Copied!');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus('Failed to copy');
      setTimeout(() => setCopyStatus(''), 2000);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">ℹ️ About</div>

      <div className="settings-about">
        <div className="settings-about-logo">⚡</div>
        <h2 className="settings-about-name">Conflux Home</h2>
        <p className="settings-about-version">v{systemInfo?.app_version ?? '0.1.0'}-alpha</p>
        <p className="settings-about-built">Built with: Tauri + React + Embedded Engine</p>
        {systemInfo && (
          <p className="settings-about-built" style={{ opacity: 0.6 }}>
            {systemInfo.os} · {systemInfo.arch}
          </p>
        )}
        <p className="settings-about-tagline">A home for your AI family</p>

        <div className="settings-about-links">
          <a href="#" className="settings-link" onClick={(e) => { e.preventDefault(); open('https://theconflux.com'); }}>
            🌐 The Conflux
          </a>
          <a href="#" className="settings-link" onClick={(e) => { e.preventDefault(); open('https://github.com/TheConflux-Core/conflux-home'); }}>
            💻 GitHub
          </a>
        </div>
      </div>

      {/* Feedback & Support */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="settings-button"
          onClick={() => {
            open('https://github.com/TheConflux-Core/conflux-home/issues/new?template=bug_report.yml&labels=bug&title=%5BBug%5D%20');
          }}
        >
          🐛 Report a Bug
        </button>
        <button
          className="settings-button"
          onClick={() => {
            open('https://github.com/TheConflux-Core/conflux-home/issues/new?template=feature_request.yml');
          }}
        >
          💡 Request a Feature
        </button>
      </div>

      {/* Log Location */}
      {logPath && (
        <div style={{ marginTop: 12, opacity: 0.8, fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📋 Gateway Log:</span>
            <code style={{ background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
              {logPath}
            </code>
            <button
              className="settings-button"
              onClick={handleCopyLogPath}
              style={{ fontSize: 12, padding: '2px 8px' }}
            >
              {copyStatus || 'Copy'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span>📋 Updater Log:</span>
            <code style={{ background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
              {logPath.replace('gateway.log', 'updater.log')}
            </code>
            <button
              className="settings-button"
              onClick={() => {
                navigator.clipboard.writeText(logPath.replace('gateway.log', 'updater.log'));
                setCopyStatus('Copied!');
                setTimeout(() => setCopyStatus(''), 2000);
              }}
              style={{ fontSize: 12, padding: '2px 8px' }}
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section: Account Info ──

function AccountSection() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <div className="settings-section">
      <div className="settings-section-title">👤 Account</div>

      <div className="settings-row">
        <span className="settings-label">Email</span>
        <span className="settings-value" style={{ fontFamily: 'monospace', fontSize: 13 }}>{user.email}</span>
      </div>

      <div className="settings-row">
        <span className="settings-label">Account ID</span>
        <span className="settings-value" style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.7, userSelect: 'all', cursor: 'text' }} title="Click to select">
          {user.id}
        </span>
      </div>

      <div className="settings-row">
        <button
          onClick={signOut}
          style={{
            background: '#e74c3c',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 20px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ── Main Settings Component ──

export default function Settings() {
  // Listen for theme changes from elsewhere
  useEffect(() => {
    // Apply saved accent on mount
    const savedAccent = localStorage.getItem('conflux-accent');
    if (savedAccent) {
      document.body.setAttribute('data-accent', savedAccent);
    }
  }, []);

  return (
    <div className="settings-page">
      <AccountSection />
      <AboutSection />
      <EngineSection />
      <ProviderSettings />
      <GoogleSettings />
      <AppearanceSection />
      <SoundSection />
      <BillingSection />
      <UsageSection />
      <NotificationSettings />
      <EmailSettings />
      <div className="settings-section">
        <div className="settings-section-title">🤖 Agents</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Manage your AI agents in the dedicated Agents app.
        </p>
        <button
          className="settings-button"
          onClick={() => window.dispatchEvent(new CustomEvent('conflux:navigate', { detail: { viewId: 'agents' } }))}
        >
          🧩 Open Agents App
        </button>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">🔧 Engine</div>
      </div>
      <CronManager />
      <TaskView />
      <WebhookManager />
      <SkillsBrowser />
      <DataSection />
    </div>
  );
}

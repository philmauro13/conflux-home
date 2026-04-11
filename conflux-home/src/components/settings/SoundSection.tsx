import { useState, useEffect, useCallback } from 'react';
import { soundManager, SoundSettings } from '../../lib/sound';

// ── Volume Slider Component ──

function VolumeSlider({
  label,
  value,
  onChange,
  onTest,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onTest?: () => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 260, justifyContent: 'flex-end' }}>
        {onTest && (
          <button
            className="settings-icon-btn"
            onClick={onTest}
            title="Test sound"
            style={{ fontSize: 14, padding: '2px 6px' }}
          >
            🔊
          </button>
        )}
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="sound-slider"
          style={{ flex: 1, maxWidth: 160 }}
        />
        <span className="settings-value" style={{ minWidth: 32, textAlign: 'right', fontSize: 12 }}>
          {value}%
        </span>
      </div>
    </div>
  );
}

// ── Main Sound Section ──

export default function SoundSection() {
  const [settings, setSettings] = useState<SoundSettings>(() => soundManager.getSettings());

  const updateSetting = useCallback(
    <K extends keyof SoundSettings>(key: K, value: SoundSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        if (key === 'muted') {
          soundManager.setMuted(value as boolean);
        } else {
          soundManager.setVolume(key as 'master' | 'ui' | 'agents' | 'games' | 'onboarding', value as number);
        }
        return next;
      });
    },
    []
  );

  // Preload audio on first interaction
  useEffect(() => {
    soundManager.preload();
  }, []);

  return (
    <div className="settings-section">
      <div className="settings-section-title">🔊 Sound</div>

      {/* Mute Toggle */}
      <div className="settings-row">
        <span className="settings-label">Mute All</span>
        <button
          className={`toggle-switch ${!settings.muted ? 'on' : ''}`}
          onClick={() => updateSetting('muted', !settings.muted)}
          aria-label={settings.muted ? 'Unmute all sounds' : 'Mute all sounds'}
          type="button"
        >
          <span className="toggle-knob" />
        </button>
      </div>

      {/* Volume Sliders */}
      <div style={{ opacity: settings.muted ? 0.4 : 1, pointerEvents: settings.muted ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
        <VolumeSlider
          label="Master"
          value={settings.master}
          onChange={(v) => updateSetting('master', v)}
          onTest={() => soundManager.playSuccess()}
        />
        <VolumeSlider
          label="UI"
          value={settings.ui}
          onChange={(v) => updateSetting('ui', v)}
          onTest={() => soundManager.playClick()}
        />
        <VolumeSlider
          label="Agents"
          value={settings.agents}
          onChange={(v) => updateSetting('agents', v)}
          onTest={() => soundManager.playAgentWake('conflux')}
        />
        <VolumeSlider
          label="Games"
          value={settings.games}
          onChange={(v) => updateSetting('games', v)}
          onTest={() => soundManager.playNotification()}
        />
        <VolumeSlider
          label="Onboarding"
          value={settings.onboarding}
          onChange={(v) => updateSetting('onboarding', v)}
          onTest={() => soundManager.playWelcomeChime()}
        />
      </div>
    </div>
  );
}

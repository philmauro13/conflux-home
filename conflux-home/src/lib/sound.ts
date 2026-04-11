// SoundManager — Web Audio API sound system for Conflux Home
// Phase 1: UI Sounds Foundation
// All sounds are synthesized — no external audio files needed

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SoundSettings {
  master: number;    // 0-100
  ui: number;        // 0-100
  agents: number;    // 0-100
  games: number;     // 0-100
  onboarding: number; // 0-100
  muted: boolean;
}

export type SoundCategory = 'ui' | 'agents' | 'games' | 'onboarding';

const DEFAULT_SETTINGS: SoundSettings = {
  master: 80,
  ui: 80,
  agents: 80,
  games: 80,
  onboarding: 80,
  muted: false,
};

const STORAGE_KEY = 'conflux-sound-settings';

// ---------------------------------------------------------------------------
// SoundManager Class
// ---------------------------------------------------------------------------

class SoundManager {
  private ctx: AudioContext | null = null;
  private settings: SoundSettings;
  private preloaded = false;
  private loading = false;

  // Gain nodes per category
  private masterGain: GainNode | null = null;
  private categoryGains: Map<SoundCategory, GainNode> = new Map();

  constructor() {
    this.settings = this.loadSettings();
  }

  // ── Audio Context ──

  private getAudioContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.setupGainNodes();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private setupGainNodes(): void {
    if (!this.ctx) return;

    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.updateMasterGain();

    const categories: SoundCategory[] = ['ui', 'agents', 'games', 'onboarding'];
    for (const cat of categories) {
      const gain = this.ctx.createGain();
      gain.connect(this.masterGain);
      this.categoryGains.set(cat, gain);
      this.updateCategoryGain(cat);
    }
  }

  private updateMasterGain(): void {
    if (!this.masterGain) return;
    const vol = this.settings.muted ? 0 : this.settings.master / 100;
    this.masterGain.gain.setValueAtTime(vol, this.ctx!.currentTime);
  }

  private updateCategoryGain(cat: SoundCategory): void {
    const gain = this.categoryGains.get(cat);
    if (!gain) return;
    gain.gain.setValueAtTime(this.settings[cat] / 100, this.ctx!.currentTime);
  }

  // ── Settings Persistence ──

  private loadSettings(): SoundSettings {
    if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch { /* ignore */ }

    // Migrate from old keys if they exist
    const migrated = { ...DEFAULT_SETTINGS };
    try {
      const oldVol = localStorage.getItem('conflux-sound-volume');
      const oldEnabled = localStorage.getItem('conflux-sound-enabled');
      if (oldVol !== null) {
        const v = parseFloat(oldVol);
        if (!isNaN(v)) migrated.master = Math.round(v * 100);
      }
      if (oldEnabled === 'false') migrated.muted = true;
    } catch { /* ignore */ }

    return migrated;
  }

  private saveSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch { /* ignore */ }
  }

  // ── Public Settings API ──

  getSettings(): SoundSettings {
    return { ...this.settings };
  }

  setVolume(category: 'master' | SoundCategory, level: number): void {
    const clamped = Math.min(100, Math.max(0, Math.round(level)));
    this.settings[category] = clamped;

    if (category === 'master') {
      this.updateMasterGain();
    } else {
      this.updateCategoryGain(category as SoundCategory);
    }

    this.saveSettings();
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.updateMasterGain();
    this.saveSettings();
  }

  toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    this.updateMasterGain();
    this.saveSettings();
    return this.settings.muted;
  }

  isMuted(): boolean {
    return this.settings.muted;
  }

  // ── Preload (call on app start) ──

  async preload(): Promise<void> {
    if (this.preloaded || this.loading) return;
    this.loading = true;
    // Synthesized sounds don't need file preloading,
    // but we initialize the AudioContext here
    this.getAudioContext();
    this.preloaded = true;
    this.loading = false;
  }

  // ── Synthesized Sound Effects ──

  // UI: Click
  playClick(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.03);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.4, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // UI: Toggle on
  playToggleOn(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.3, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // UI: Toggle off
  playToggleOff(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.08);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.3, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // UI: Navigation swish
  playNavSwish(direction: 'forward' | 'back' = 'forward'): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    const startFreq = direction === 'forward' ? 400 : 800;
    const endFreq = direction === 'forward' ? 900 : 300;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.15, now + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  // UI: Notification chime
  playNotification(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    const notes = [880, 1100]; // A5, C#6
    notes.forEach((freq, i) => {
      const startAt = now + i * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(0.25, startAt + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.3);

      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.32);
    });
  }

  // UI: Modal open (whoosh up)
  playModalOpen(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.12, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  // UI: Modal close (whoosh down)
  playModalClose(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.12, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  // UI: Error buzz
  playError(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.15, now);
    env.gain.linearRampToValueAtTime(0, now + 0.2);

    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  // UI: Success ding
  playSuccess(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const startAt = now + i * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(0.2, startAt + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.35);

      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.37);
    });
  }

  // Onboarding: Welcome chime
  playWelcomeChime(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('onboarding');
    if (!gain) return;

    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const startAt = now + i * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(0.3, startAt + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.4);

      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.42);
    });
  }

  // Onboarding: Heartbeat
  playHeartbeat(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('onboarding');
    if (!gain) return;

    // "Lub"
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(60, now);
    const env1 = ctx.createGain();
    env1.gain.setValueAtTime(0, now);
    env1.gain.linearRampToValueAtTime(0.4, now + 0.01);
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc1.connect(env1);
    env1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // "Dub"
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(50, now + 0.15);
    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0, now + 0.15);
    env2.gain.linearRampToValueAtTime(0.3, now + 0.16);
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc2.connect(env2);
    env2.connect(gain);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.27);
  }

  // ── Agent Sounds ──

  // Agent-specific 3-note wake melody
  private agentTones: Record<string, number[]> = {
    conflux: [261.63, 329.63, 392.00],  // C4 → E4 → G4
    helix:   [369.99, 440.00, 554.37],   // F#4 → A4 → C#5
    forge:   [146.83, 174.61, 220.00],   // D3 → F3 → A3
    vector:  [392.00, 493.88, 587.33],   // G4 → B4 → D5
    pulse:   [329.63, 415.30, 493.88],   // E4 → G#4 → B4
    quanta:  [523.25, 659.25, 783.99],   // C5 → E5 → G5
    prism:   [440.00, 554.37, 659.25],   // A4 → C#5 → E5
    spectra: [246.94, 293.66, 369.99],   // B3 → D4 → F#4
    luma:    [783.99, 987.77, 1174.66],  // G5 → B5 → D6
    catalyst:[349.23, 440.00, 523.25],   // F4 → A4 → C5
  };

  playAgentWake(agentId: string): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('agents');
    if (!gain) return;

    const notes = this.agentTones[agentId] || this.agentTones.conflux;
    notes.forEach((freq, i) => {
      const startAt = now + i * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(0.2, startAt + 0.015);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.25);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.27);
    });
  }

  // Message sent — quick upward swoosh
  playMessageSent(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('agents');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.12, now + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  // Message received — soft pop/plink
  playMessageReceived(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('agents');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.06);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.18, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Task complete — bright chime with echo
  playTaskComplete(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('agents');
    if (!gain) return;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const startAt = now + i * 0.07;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(0.2, startAt + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.5);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.52);
    });
  }

  // Thinking/working ambient — returns handle to stop
  private thinkingOscs: OscillatorNode[] = [];
  private thinkingGain: GainNode | null = null;

  startThinkingAmbient(): { stop: () => void } {
    const ctx = this.getAudioContext();
    const gain = this.categoryGains.get('agents');
    if (!gain) return { stop: () => {} };
    const now = ctx.currentTime;
    const thinkGain = ctx.createGain();
    thinkGain.gain.setValueAtTime(0, now);
    thinkGain.gain.linearRampToValueAtTime(0.04, now + 0.5);
    thinkGain.connect(gain);
    this.thinkingGain = thinkGain;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(80, now);
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(82, now);
    osc1.connect(thinkGain);
    osc2.connect(thinkGain);
    osc1.start();
    osc2.start();
    this.thinkingOscs = [osc1, osc2];
    return {
      stop: () => {
        const t = ctx.currentTime;
        thinkGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        osc1.stop(t + 0.35);
        osc2.stop(t + 0.35);
        this.thinkingOscs = [];
        this.thinkingGain = null;
      },
    };
  }

  // Onboarding: Team alive celebration
  playTeamAlive(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('onboarding');
    if (!gain) return;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const startAt = now + i * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(0.2, startAt + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.4);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.42);
    });
  }

  // Onboarding: Tour step blip
  playTourBlip(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('onboarding');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.15, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // Boot-up tone
  playBootUp(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('onboarding');
    if (!gain) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.8);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.25, now);
    env.gain.linearRampToValueAtTime(0.25, now + 0.65);
    env.gain.linearRampToValueAtTime(0, now + 0.8);

    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.85);
  }

  // ── Game Sounds: Minesweeper ──

  playMinesweeperReveal(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.08, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playMinesweeperFlag(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.1, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playMinesweeperExplode(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.2, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.52);
  }

  playMinesweeperCascade(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.04, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playMinesweeperWin(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const startAt = now + i * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.1, startAt);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.3);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.32);
    });
  }

  // ── Game Sounds: Snake ──

  playSnakeEat(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1000, now + 0.08);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.12, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playSnakeTurn(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.05, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playSnakeDeath(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    // Low thud
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(100, now);
    const env1 = ctx.createGain();
    env1.gain.setValueAtTime(0.2, now);
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(env1);
    env1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.17);
    // Descending tone
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(400, now + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(100, now + 0.4);
    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0.15, now + 0.1);
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(env2);
    env2.connect(gain);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.47);
  }

  playSnakeNewBest(): void {
    this.playMinesweeperWin(); // Reuse ascending chime
  }

  playSnakeSpeedUp(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.06, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  // ── Game Sounds: Pac-Man ──

  playPacmanChomp(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.08, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playPacmanPower(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    [800, 1000, 1200].forEach((freq, i) => {
      const startAt = now + i * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.1, startAt);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.15);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.17);
    });
  }

  playPacmanEatGhost(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.12, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  playPacmanDeath(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.6);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.18, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.67);
  }

  playPacmanLevelClear(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const startAt = now + i * 0.15;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.12, startAt);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.35);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.37);
    });
  }

  // ── Orbit Mission Control Sounds ──

  // Task completion — C major chord ping (200ms)
  playOrbitTaskComplete(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    // C major chord: C5 (523.25), E5 (659.25), G5 (783.99)
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const startAt = now + i * 0.02;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(0.15, startAt + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.2);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.22);
    });
  }

  // Streak milestone — ascending chime (special for every 7 days)
  playOrbitStreakMilestone(streakDays: number): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    const isSpecial = streakDays % 7 === 0;
    const baseFreq = isSpecial ? 440 : 523; // A4 or C5
    const notes = isSpecial
      ? [440, 523, 659, 784, 880] // A4, C5, E5, G5, A5 (5 notes for special)
      : [523, 659, 784]; // C5, E5, G5 (3 notes for regular)

    notes.forEach((freq, i) => {
      const startAt = now + i * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(isSpecial ? 0.25 : 0.2, startAt + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + (isSpecial ? 0.4 : 0.3));
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + (isSpecial ? 0.42 : 0.32));
    });
  }

  // Altitude threshold crossed — subtle whoosh
  playOrbitAltitudeThreshold(percentage: number): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    // Different whoosh for different thresholds
    let duration = 0.3;
    let volume = 0.1;
    if (percentage >= 100) {
      duration = 0.35;
      volume = 0.15;
    } else if (percentage >= 80) {
      duration = 0.28;
      volume = 0.12;
    } else {
      duration = 0.22;
      volume = 0.08;
    }

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(percentage >= 100 ? 1200 : 900, now + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(volume, now + duration * 0.2);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  // Insight discovered — gentle notification chime
  playOrbitInsightDiscovered(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('ui');
    if (!gain) return;

    // Gentle two-note chime
    [880, 1100].forEach((freq, i) => {
      const startAt = now + i * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(0.2, startAt + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.3);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.32);
    });
  }

  // Morning brief generated — warm startup sound
  playOrbitMorningBrief(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('onboarding');
    if (!gain) return;

    // Warm ascending pattern: C4, E4, G4, C5
    [261.63, 329.63, 392.00, 523.25].forEach((freq, i) => {
      const startAt = now + i * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(0.2, startAt + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.4);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.42);
    });
  }

  // ── Game Sounds: Solitaire ──

  playSolitaireFlip(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.08, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playSolitairePlace(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.1, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playSolitaireFoundation(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.1, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playSolitaireWin(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const startAt = now + i * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.12, startAt);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.35);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.37);
    });
  }

  playSolitaireShuffle(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    for (let i = 0; i < 3; i++) {
      const startAt = now + i * 0.04;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600 + i * 200, startAt);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.06, startAt);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + 0.06);
      osc.connect(env);
      env.connect(gain);
      osc.start(startAt);
      osc.stop(startAt + 0.08);
    }
  }

  playSolitaireInvalid(): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const gain = this.categoryGains.get('games');
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, now);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.06, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 0.12);
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

export const soundManager = new SoundManager();

// Convenience functions for quick use in components
export const playClick = () => soundManager.playClick();
export const playToggleOn = () => soundManager.playToggleOn();
export const playToggleOff = () => soundManager.playToggleOff();
export const playNavSwish = (dir?: 'forward' | 'back') => soundManager.playNavSwish(dir);
export const playNotification = () => soundManager.playNotification();
export const playModalOpen = () => soundManager.playModalOpen();
export const playModalClose = () => soundManager.playModalClose();
export const playError = () => soundManager.playError();
export const playSuccess = () => soundManager.playSuccess();
export const playWelcomeChime = () => soundManager.playWelcomeChime();
export const playHeartbeat = () => soundManager.playHeartbeat();
export const playAgentWake = (id: string) => soundManager.playAgentWake(id);
export const playBootUp = () => soundManager.playBootUp();
export const playMessageSent = () => soundManager.playMessageSent();
export const playMessageReceived = () => soundManager.playMessageReceived();
export const playTaskComplete = () => soundManager.playTaskComplete();
export const startThinkingAmbient = () => soundManager.startThinkingAmbient();
export const playTeamAlive = () => soundManager.playTeamAlive();
export const playTourBlip = () => soundManager.playTourBlip();

// Game sound exports
export const playMinesweeperReveal = () => soundManager.playMinesweeperReveal();
export const playMinesweeperFlag = () => soundManager.playMinesweeperFlag();
export const playMinesweeperExplode = () => soundManager.playMinesweeperExplode();
export const playMinesweeperCascade = () => soundManager.playMinesweeperCascade();
export const playMinesweeperWin = () => soundManager.playMinesweeperWin();
export const playSnakeEat = () => soundManager.playSnakeEat();
export const playSnakeTurn = () => soundManager.playSnakeTurn();
export const playSnakeDeath = () => soundManager.playSnakeDeath();
export const playSnakeNewBest = () => soundManager.playSnakeNewBest();
export const playSnakeSpeedUp = () => soundManager.playSnakeSpeedUp();
export const playPacmanChomp = () => soundManager.playPacmanChomp();
export const playPacmanPower = () => soundManager.playPacmanPower();
export const playPacmanEatGhost = () => soundManager.playPacmanEatGhost();
export const playPacmanDeath = () => soundManager.playPacmanDeath();
export const playPacmanLevelClear = () => soundManager.playPacmanLevelClear();
export const playSolitaireFlip = () => soundManager.playSolitaireFlip();
export const playSolitairePlace = () => soundManager.playSolitairePlace();
export const playSolitaireFoundation = () => soundManager.playSolitaireFoundation();
export const playSolitaireWin = () => soundManager.playSolitaireWin();
export const playSolitaireShuffle = () => soundManager.playSolitaireShuffle();
export const playSolitaireInvalid = () => soundManager.playSolitaireInvalid();

// Orbit Mission Control sound exports
export const playOrbitTaskComplete = () => soundManager.playOrbitTaskComplete();
export const playOrbitStreakMilestone = (streakDays: number) => soundManager.playOrbitStreakMilestone(streakDays);
export const playOrbitAltitudeThreshold = (percentage: number) => soundManager.playOrbitAltitudeThreshold(percentage);
export const playOrbitInsightDiscovered = () => soundManager.playOrbitInsightDiscovered();
export const playOrbitMorningBrief = () => soundManager.playOrbitMorningBrief();

// Backwards compat with old sounds.ts
export const playUIClick = playClick;
export const playHeartbeatPulse = playHeartbeat;
export const playBootUpTone = playBootUp;

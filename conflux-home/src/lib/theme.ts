export type Theme = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';

// ── Color Themes (matched to user-known identities) ──

export interface ColorThemeDef {
  id: string;
  name: string;
  emoji: string;
  wallpaper: string;
  /** CSS custom properties applied to :root */
  vars: Record<string, string>;
}

/** Base themes — shared identity, category cards use per-app colors */
export const BASE_THEMES: ColorThemeDef[] = [
  {
    id: 'conflux',
    name: 'Conflux',
    emoji: '⚡',
    wallpaper: '/wallpapers/desktop-wallpaper.webp',
    vars: {
      '--accent-primary': '#0071e3',
      '--accent-glow': 'rgba(0, 113, 227, 0.3)',
      '--theme-accent': '#0071e3',
      '--theme-accent-glow': 'rgba(0, 113, 227, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #0071e3, #0a84ff)',
      '--theme-bg-tint': 'rgba(0, 113, 227, 0.03)',
    },
  },
  {
    id: 'nexus',
    name: 'Nexus',
    emoji: '🌐',
    wallpaper: '/wallpapers/wallpaper-dark.webp',
    vars: {
      '--accent-primary': '#94a3b8',
      '--accent-glow': 'rgba(148, 163, 184, 0.3)',
      '--theme-accent': '#94a3b8',
      '--theme-accent-glow': 'rgba(148, 163, 184, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #94a3b8, #64748b)',
      '--theme-bg-tint': 'rgba(148, 163, 184, 0.03)',
    },
  },
];

/** App/Agent themes — wallpaper + accent, matched to user-known identities */
export const COLOR_THEMES: ColorThemeDef[] = [
  {
    id: 'hearth',
    name: 'Hearth',
    emoji: '🔥',
    wallpaper: '/backgrounds/themes/luma.jpg',
    vars: {
      '--theme-accent': '#f59e0b',
      '--theme-accent-glow': 'rgba(245, 158, 11, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #f59e0b, #d97706)',
      '--theme-bg-tint': 'rgba(217, 119, 6, 0.03)',
    },
  },
  {
    id: 'pulse',
    name: 'Pulse',
    emoji: '💚',
    wallpaper: '/backgrounds/themes/forge.jpg',
    vars: {
      '--theme-accent': '#10b981',
      '--theme-accent-glow': 'rgba(16, 185, 129, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #10b981, #059669)',
      '--theme-bg-tint': 'rgba(5, 150, 105, 0.03)',
    },
  },
  {
    id: 'orbit',
    name: 'Orbit',
    emoji: '🧠',
    wallpaper: '/backgrounds/themes/conflux-default.jpg',
    vars: {
      '--theme-accent': '#6366f1',
      '--theme-accent-glow': 'rgba(99, 102, 241, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #6366f1, #4f46e5)',
      '--theme-bg-tint': 'rgba(99, 102, 241, 0.03)',
    },
  },
  {
    id: 'radar',
    name: 'Radar',
    emoji: '📡',
    wallpaper: '/backgrounds/themes/vector.jpg',
    vars: {
      '--theme-accent': '#ef4444',
      '--theme-accent-glow': 'rgba(239, 68, 68, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #ef4444, #dc2626)',
      '--theme-bg-tint': 'rgba(220, 38, 38, 0.03)',
    },
  },
  {
    id: 'horizon',
    name: 'Horizon',
    emoji: '🌅',
    wallpaper: '/backgrounds/themes/prism.jpg',
    vars: {
      '--theme-accent': '#a78bfa',
      '--theme-accent-glow': 'rgba(167, 139, 250, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #a78bfa, #7c3aed)',
      '--theme-bg-tint': 'rgba(124, 58, 237, 0.03)',
    },
  },
  {
    id: 'echo',
    name: 'Echo',
    emoji: '🌀',
    wallpaper: '/backgrounds/themes/echo.jpg',
    vars: {
      '--theme-accent': '#60a5fa',
      '--theme-accent-glow': 'rgba(96, 165, 250, 0.12)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #60a5fa, #3b82f6)',
      '--theme-bg-tint': 'rgba(59, 130, 246, 0.02)',
    },
  },
  {
    id: 'aegis',
    name: 'Aegis',
    emoji: '🛡️',
    wallpaper: '/backgrounds/themes/aegis.png',
    vars: {
      '--theme-accent': '#6366f1',
      '--theme-accent-glow': 'rgba(99, 102, 241, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #6366f1, #4f46e5)',
      '--theme-bg-tint': 'rgba(99, 102, 241, 0.03)',
    },
  },
  {
    id: 'viper',
    name: 'Viper',
    emoji: '🐍',
    wallpaper: '/backgrounds/themes/viper.png',
    vars: {
      '--theme-accent': '#22c55e',
      '--theme-accent-glow': 'rgba(34, 197, 94, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #22c55e, #16a34a)',
      '--theme-bg-tint': 'rgba(34, 197, 94, 0.03)',
    },
  },
];

/** Theme IDs that use per-app category card colors (not theme accent) */
const BASE_THEME_IDS = new Set(BASE_THEMES.map(t => t.id));

const STORAGE_KEYS = {
  theme: 'conflux-theme',
  accent: 'conflux-accent',
  wallpaper: 'conflux-wallpaper',
  colorTheme: 'conflux-color-theme',
} as const;

// ── Light/Dark Theme (unchanged) ──

export function getEffectiveTheme(preference: Theme): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: 'light' | 'dark'): void {
  document.body.classList.toggle('dark', theme === 'dark');
}

export function applyAccent(accent: AccentColor): void {
  document.body.setAttribute('data-accent', accent);
  // Also sync --current-accent so app CSS that uses this var gets the color
  const accentMap: Record<AccentColor, string> = {
    blue: '#0066FF',
    purple: '#8b5cf6',
    green: '#22c55e',
    orange: '#f97316',
    pink: '#ec4899',
    cyan: '#06b6d4',
  };
  const color = accentMap[accent] ?? '#0066FF';
  const root = document.documentElement;
  root.style.setProperty('--current-accent', color);
  root.style.setProperty('--current-accent-10', `${color}1a`);
  root.style.setProperty('--current-accent-15', `${color}26`);
  root.style.setProperty('--current-accent-20', `${color}33`);
}

export function watchSystemTheme(callback: (theme: 'light' | 'dark') => void): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches ? 'dark' : 'light');
  };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}

// ── Color Theme System ──

/**
 * Apply a theme's CSS custom properties to :root and set the wallpaper.
 * Sets data-color-theme on body so CSS can distinguish base vs color themes.
 */
export function applyColorTheme(themeId: string): void {
  const theme = BASE_THEMES.find(t => t.id === themeId) ?? COLOR_THEMES.find(t => t.id === themeId);
  if (!theme) return;

  // Always clear previous accent vars first
  clearColorThemeVars();

  // Apply new accent vars to :root
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }

  // Also sync --current-accent and derived opacity variants (used by app styles)
  // Extract the primary color from --theme-accent or --accent-primary
  const primaryColor = (theme.vars['--theme-accent'] as string | undefined)
    ?? (theme.vars['--accent-primary'] as string | undefined)
    ?? '#0071e3';
  root.style.setProperty('--current-accent', primaryColor);
  // Derive opacity variants from the primary
  root.style.setProperty('--current-accent-10', `${primaryColor}1a`);
  root.style.setProperty('--current-accent-15', `${primaryColor}26`);
  root.style.setProperty('--current-accent-20', `${primaryColor}33`);
  root.style.setProperty('--current-accent-30', `${primaryColor}4d`);

  // Set data attribute for CSS targeting (base themes get per-app category colors)
  document.body.setAttribute('data-color-theme', themeId);

  // Dispatch wallpaper event so App.tsx picks it up
  window.dispatchEvent(new CustomEvent('conflux:wallpaper-change', {
    detail: theme.wallpaper,
  }));
}

/**
 * Clear all color theme CSS custom properties (revert to defaults).
 */
export function clearColorThemeVars(): void {
  const root = document.documentElement;
  for (const key of ['--accent-primary', '--accent-glow', '--theme-accent', '--theme-accent-glow', '--theme-accent-gradient', '--theme-bg-tint']) {
    root.style.removeProperty(key);
  }
}

/**
 * Get saved color theme ID. Falls back to 'conflux' if saved ID no longer exists.
 */
export function getSavedColorTheme(): string {
  const saved = localStorage.getItem(STORAGE_KEYS.colorTheme) ?? 'conflux';
  const allThemes = [...BASE_THEMES, ...COLOR_THEMES];
  if (allThemes.some(t => t.id === saved)) return saved;
  // Migration: old theme removed, fall back to conflux
  localStorage.setItem(STORAGE_KEYS.colorTheme, 'conflux');
  return 'conflux';
}

/**
 * Save color theme ID to localStorage and apply it.
 */
export function saveColorTheme(themeId: string): void {
  localStorage.setItem(STORAGE_KEYS.colorTheme, themeId);
  applyColorTheme(themeId);
}

// ── Init ──

export function initTheme(): void {
  // Always dark mode
  applyTheme('dark');

  const storedAccent = localStorage.getItem(STORAGE_KEYS.accent) as AccentColor | null;
  if (storedAccent) {
    applyAccent(storedAccent);
  }

  // Apply saved color theme
  const colorTheme = getSavedColorTheme();
  applyColorTheme(colorTheme);
}

// ── Legacy wallpaper helpers ──

export function applyWallpaper(element: HTMLElement, url: string): void {
  if (url) {
    element.style.backgroundImage = `url('${url}')`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
  } else {
    element.style.backgroundImage = '';
    element.style.backgroundSize = '';
    element.style.backgroundPosition = '';
  }
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEYS.theme, theme);
}

export function saveAccent(accent: AccentColor): void {
  localStorage.setItem(STORAGE_KEYS.accent, accent);
}

export function saveWallpaper(url: string): void {
  localStorage.setItem(STORAGE_KEYS.wallpaper, url);
}

export function getSavedWallpaper(): string {
  return localStorage.getItem(STORAGE_KEYS.wallpaper) ?? '';
}

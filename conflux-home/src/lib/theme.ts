export type Theme = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';

// ── Color Themes (agent-named vibes) ──

export interface ColorThemeDef {
  id: string;
  name: string;
  emoji: string;
  wallpaper: string;
  /** CSS custom properties applied to :root */
  vars: Record<string, string>;
}

/** Base themes — wallpaper only, no accent overrides */
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
    id: 'aegis',
    name: 'Aegis',
    emoji: '🛡️',
    wallpaper: '/wallpapers/wallpaper-dark.webp',
    vars: {
      '--accent-primary': '#6366f1',
      '--accent-glow': 'rgba(99, 102, 241, 0.3)',
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
    wallpaper: '/wallpapers/wallpaper-dark.webp',
    vars: {
      '--accent-primary': '#22c55e',
      '--accent-glow': 'rgba(34, 197, 94, 0.3)',
      '--theme-accent': '#22c55e',
      '--theme-accent-glow': 'rgba(34, 197, 94, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #22c55e, #16a34a)',
      '--theme-bg-tint': 'rgba(34, 197, 94, 0.03)',
    },
  },
];

/** Color themes — wallpaper + accent overrides */
export const COLOR_THEMES: ColorThemeDef[] = [
  {
    id: 'catalyst',
    name: 'Catalyst',
    emoji: '💠',
    wallpaper: '/backgrounds/themes/conflux-default.jpg',
    vars: {
      '--theme-accent': '#818cf8',
      '--theme-accent-glow': 'rgba(129, 140, 248, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #818cf8, #6366f1)',
      '--theme-bg-tint': 'rgba(99, 102, 241, 0.03)',
    },
  },
  {
    id: 'prism',
    name: 'Prism',
    emoji: '🔮',
    wallpaper: '/backgrounds/themes/prism.jpg',
    vars: {
      '--theme-accent': '#a78bfa',
      '--theme-accent-glow': 'rgba(167, 139, 250, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #a78bfa, #7c3aed)',
      '--theme-bg-tint': 'rgba(124, 58, 237, 0.03)',
    },
  },
  {
    id: 'forge',
    name: 'Forge',
    emoji: '⚒️',
    wallpaper: '/backgrounds/themes/forge.jpg',
    vars: {
      '--theme-accent': '#34d399',
      '--theme-accent-glow': 'rgba(52, 211, 153, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #34d399, #059669)',
      '--theme-bg-tint': 'rgba(5, 150, 105, 0.03)',
    },
  },
  {
    id: 'luma',
    name: 'Luma',
    emoji: '💡',
    wallpaper: '/backgrounds/themes/luma.jpg',
    vars: {
      '--theme-accent': '#fbbf24',
      '--theme-accent-glow': 'rgba(251, 191, 36, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #fbbf24, #f59e0b)',
      '--theme-bg-tint': 'rgba(245, 158, 11, 0.03)',
    },
  },
  {
    id: 'vector',
    name: 'Vector',
    emoji: '🎯',
    wallpaper: '/backgrounds/themes/vector.jpg',
    vars: {
      '--theme-accent': '#f87171',
      '--theme-accent-glow': 'rgba(248, 113, 113, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #f87171, #dc2626)',
      '--theme-bg-tint': 'rgba(220, 38, 38, 0.03)',
    },
  },
  {
    id: 'pulse',
    name: 'Pulse',
    emoji: '💗',
    wallpaper: '/backgrounds/themes/pulse.jpg',
    vars: {
      '--theme-accent': '#f472b6',
      '--theme-accent-glow': 'rgba(244, 114, 182, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #f472b6, #ec4899)',
      '--theme-bg-tint': 'rgba(236, 72, 153, 0.03)',
    },
  },
  {
    id: 'spectra',
    name: 'Spectra',
    emoji: '🌈',
    wallpaper: '/backgrounds/themes/spectra.jpg',
    vars: {
      '--theme-accent': '#22d3ee',
      '--theme-accent-glow': 'rgba(34, 211, 238, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #22d3ee, #06b6d4)',
      '--theme-bg-tint': 'rgba(6, 182, 212, 0.03)',
    },
  },
  {
    id: 'quanta',
    name: 'Quanta',
    emoji: '⚛️',
    wallpaper: '/backgrounds/themes/quanta.jpg',
    vars: {
      '--theme-accent': '#e5e7eb',
      '--theme-accent-glow': 'rgba(229, 231, 235, 0.12)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #e5e7eb, #9ca3af)',
      '--theme-bg-tint': 'rgba(156, 163, 175, 0.02)',
    },
  },
  {
    id: 'helix',
    name: 'Helix',
    emoji: '🧬',
    wallpaper: '/backgrounds/themes/helix.jpg',
    vars: {
      '--theme-accent': '#d97706',
      '--theme-accent-glow': 'rgba(217, 119, 6, 0.15)',
      '--theme-accent-gradient': 'linear-gradient(135deg, #d97706, #b45309)',
      '--theme-bg-tint': 'rgba(180, 83, 9, 0.03)',
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
];

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
 * Base themes only swap wallpaper (no accent overrides).
 * Color themes set both wallpaper + accent CSS vars.
 */
export function applyColorTheme(themeId: string): void {
  const theme = BASE_THEMES.find(t => t.id === themeId) ?? COLOR_THEMES.find(t => t.id === themeId);
  if (!theme) return;

  // Always clear previous accent vars first
  clearColorThemeVars();

  // Apply new accent vars (base themes have empty vars, so nothing is set)
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }

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
 * Get saved color theme ID.
 */
export function getSavedColorTheme(): string {
  return localStorage.getItem(STORAGE_KEYS.colorTheme) ?? 'conflux';
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

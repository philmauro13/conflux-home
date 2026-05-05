// useGlobalClickSound — fires playClick on interactive element clicks globally
// Safe: unconditional hook placement, no conflicts with other hooks

import { useEffect } from 'react';
import { playClick } from '../lib/sound';

const IGNORE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'AUDIO', 'VIDEO']);
const IGNORE_CLASSES = ['conflux-bar-v2', 'conflux-menu', 'no-click-sound'];

const CLICKABLE_SELECTORS = [
  'button',
  '[role="button"]',
  '.desktop-widget',
  '.matrix-btn',
  '.cockpit-btn',
  '.agent-row',
  '.kitchen-tab',
  '.intel-agent-row',
  '.conflux-menu-app',
  '.conflux-menu-cat',
  '.quadrant-back-btn',
  '.mc-btn',
  '.mc-add-task-btn',
  '.mc-log-btn',
  '.pulse-btn',
  '.dream-card',
  '.meal-card',
  '.grocery-item',
  '.habit-row',
  '.echo-tab-btn',
  '.echo-session-btn',
];

export function useGlobalClickSound() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target) return;

      // Ignore specific tags
      if (IGNORE_TAGS.has(target.tagName)) return;

      // Ignore specific classes
      const classStr = typeof target.className === 'string' ? target.className : '';
      if (IGNORE_CLASSES.some(c => classStr.includes(c))) return;

      // Walk up to find a clickable ancestor
      let el: HTMLElement | null = target;
      while (el && el !== document.body) {
        const tag = el.tagName;
        if (IGNORE_TAGS.has(tag)) return;

        // Check if any known interactive class is present
        if (CLICKABLE_SELECTORS.some(sel => {
          if (sel.startsWith('.')) return el!.classList.contains(sel.slice(1));
          if (sel.startsWith('[')) return el!.hasAttribute(sel.slice(1, -1));
          return el!.tagName === sel;
        })) {
          playClick();
          return;
        }

        el = el.parentElement;
      }
    }

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
}

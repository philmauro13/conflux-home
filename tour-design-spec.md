# Conflux Home — Guided Tour Design Spec

## Overview

An interactive step-by-step walkthrough that triggers **after** the WelcomeOverlay dismisses, when the user first lands on the desktop. Think game tutorial, not software manual.

---

## Tour Flow

### Step 1: "Welcome Home"
- **Spotlight:** Full-screen dim with center message
- **Tooltip:** "Welcome to Conflux Home! This is your AI team's home. Let me show you around — it'll take 60 seconds."
- **Action:** User clicks "Let's Go" to begin
- **Duration:** Until clicked

### Step 2: "Your Dock"
- **Spotlight:** ConfluxBarV2 (bottom dock)
- **Tooltip:** "This is your command center. Quick access to your agents, apps, and settings. It follows you everywhere."
- **Highlight:** Rounded spotlight on the dock bar
- **Duration:** 6s or click Next

### Step 3: "Your Agents"
- **Spotlight:** First 2-3 agent icons in the dock
- **Tooltip:** "These are your agents. Each one has a personality, memory, and specialties. Click one to chat."
- **Highlight:** Pulse animation on agent avatars
- **Duration:** 6s or click Next

### Step 4: "Your Apps"
- **Spotlight:** App grid or first 3 app icons on desktop
- **Tooltip:** "16 built-in apps — Budget, Kitchen, Creative Studio, Games, and more. Each one is powered by your agents."
- **Highlight:** Slight zoom on app icons
- **Duration:** 6s or click Next

### Step 5: "Try It — Chat"
- **Spotlight:** Chat panel / agent chat button
- **Tooltip:** "Click any agent to start a conversation. They remember everything and get smarter over time."
- **Highlight:** Gentle glow on chat entry point
- **Action:** User can click to open chat (tour pauses) or skip
- **Duration:** Until dismissed or chat opened

### Step 6: "Make It Yours"
- **Spotlight:** Settings gear icon
- **Tooltip:** "Themes, sound, notifications, agent management — make this space yours."
- **Highlight:** Spotlight on settings icon
- **Duration:** 5s or click Next

### Step 7: "You're Ready"
- **Spotlight:** None (full overlay)
- **Tooltip:** "That's the tour! You can replay it anytime from Settings. Now go build something amazing."
- **Action:** "Enter Conflux Home" button dismisses tour permanently
- **Duration:** Until clicked

---

## Technical Implementation

### Component Structure

```
src/
  components/
    GuidedTour.tsx          # Main tour controller
    TourStep.tsx            # Individual step renderer
    TourSpotlight.tsx       # SVG overlay with cutout
    TourTooltip.tsx         # Floating tooltip with arrow
  hooks/
    useTourState.ts         # localStorage + state management
  styles/
    tour.css                # Spotlight, tooltip, animation styles
```

### State Management

```typescript
interface TourState {
  isActive: boolean;
  currentStep: number;
  hasCompletedTour: boolean;
}

// localStorage keys
const TOUR_COMPLETED_KEY = 'conflux-tour-completed';
const TOUR_SKIPPED_KEY = 'conflux-tour-skipped';

// On desktop mount:
// if (!localStorage.getItem(TOUR_COMPLETED_KEY)) → start tour
```

### Spotlight Implementation

Use an SVG overlay with a `mask` or `clip-path` to create a transparent cutout over the target element:

```tsx
function TourSpotlight({ targetRect }: { targetRect: DOMRect }) {
  return (
    <svg className="tour-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9998 }}>
      <defs>
        <mask id="spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={targetRect.x - 8}
            y={targetRect.y - 8}
            width={targetRect.width + 16}
            height={targetRect.height + 16}
            rx={12}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.6)"
        mask="url(#spotlight-mask)"
      />
    </svg>
  );
}
```

### Tooltip Positioning

```tsx
function TourTooltip({ targetRect, text, step, total, onNext, onSkip }) {
  const position = targetRect.bottom + 200 > window.innerHeight ? 'top' : 'bottom';

  return (
    <div
      className={`tour-tooltip tour-tooltip--${position}`}
      style={{
        position: 'fixed',
        [position === 'bottom' ? 'top' : 'bottom']: position === 'bottom'
          ? targetRect.bottom + 16
          : window.innerHeight - targetRect.top + 16,
        left: Math.min(
          Math.max(targetRect.left + targetRect.width / 2 - 150, 16),
          window.innerWidth - 316
        ),
        width: 300,
        zIndex: 9999,
      }}
    >
      <p className="tour-tooltip__text">{text}</p>
      <div className="tour-tooltip__footer">
        <span className="tour-tooltip__progress">{step}/{total}</span>
        <button onClick={onSkip} className="tour-tooltip__skip">Skip tour</button>
        <button onClick={onNext} className="tour-tooltip__next">
          {step === total ? "Let's go!" : "Next →"}
        </button>
      </div>
    </div>
  );
}
```

### Target Element Selection

Use `data-tour-id` attributes on key UI elements:

```html
<!-- In DesktopV2.tsx -->
<div data-tour-id="dock" className="conflux-bar-v2">...</div>
<div data-tour-id="agents" className="dock-agents">...</div>
<div data-tour-id="apps" className="desktop-apps">...</div>
<div data-tour-id="chat" className="chat-entry">...</div>
<div data-tour-id="settings" className="settings-icon">...</div>
```

```typescript
function getTourTarget(stepId: string): DOMRect | null {
  const el = document.querySelector(`[data-tour-id="${stepId}"]`);
  return el?.getBoundingClientRect() ?? null;
}
```

---

## Integration with Desktop

### Mount Point

In `DesktopV2.tsx` (or `Desktop.tsx`):

```tsx
import GuidedTour from './GuidedTour';

// Inside the component, after the main layout:
{!localStorage.getItem('conflux-tour-completed') && (
  <GuidedTour onComplete={() => localStorage.setItem('conflux-tour-completed', 'true')} />
)}
```

### Settings Replay

In Settings → General:

```tsx
<button onClick={() => {
  localStorage.removeItem('conflux-tour-completed');
  window.location.reload(); // or trigger tour state
}}>
  Replay Guided Tour
</button>
```

---

## Animations & Transitions

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Overlay fade-in | opacity 0 → 1 | 300ms | ease-out |
| Spotlight move | CSS transform translate | 400ms | cubic-bezier(0.4, 0, 0.2, 1) |
| Tooltip fade-in | opacity + translateY | 250ms | ease-out |
| Tooltip arrow | CSS border trick | static | — |
| Next button hover | scale(1.02) | 150ms | ease |
| Final step confetti | CSS particles (reuse from Onboarding.tsx) | 1.5s | ease-out |

---

## Accessibility

- **Keyboard navigation:** Arrow keys advance steps, Escape skips tour
- **Screen reader:** `aria-live="polite"` on tooltip text
- **Focus management:** Trap focus within tooltip during tour
- **Reduced motion:** Respect `prefers-reduced-motion`, disable animations
- **High contrast:** Ensure spotlight border is visible in all themes

---

## localStorage Keys

| Key | Value | Purpose |
|-----|-------|---------|
| `conflux-tour-completed` | `"true"` | Tour has been completed |
| `conflux-tour-skipped` | `"true"` | User skipped the tour |
| `conflux-tour-step` | `0-6` | Resume from step (optional) |

---

## Implementation Priority

1. **Phase 1:** Static overlay + tooltip (no spotlight cutout) — get the flow right
2. **Phase 2:** SVG spotlight cutout — the polished look
3. **Phase 3:** Animations, keyboard nav, accessibility

---

## File Checklist

- [ ] `src/components/GuidedTour.tsx` — main controller
- [ ] `src/components/TourStep.tsx` — step renderer
- [ ] `src/components/TourSpotlight.tsx` — SVG overlay
- [ ] `src/components/TourTooltip.tsx` — tooltip UI
- [ ] `src/hooks/useTourState.ts` — state + localStorage
- [ ] `src/styles/tour.css` — all tour styles
- [ ] Add `data-tour-id` attributes to DesktopV2.tsx
- [ ] Add "Replay Tour" button to Settings

---

*Design spec for Conflux Home · The Conflux · theconflux.com*

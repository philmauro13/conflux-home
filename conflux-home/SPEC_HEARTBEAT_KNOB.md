# INTEL Dashboard — Heartbeat Interval Knob + Autonomous Mode

## Spec v0.3

> **Date:** 2026-04-12
> **Status:** Built
> **Affected files:** `src/components/PulseKnob.tsx`, `src/components/DesktopQuadrants.tsx`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/styles-quadrants.css`
> **Vision note (v0.3):** The heartbeat is not a settings toggle. It is the **autonomous driving mode**. The red heart is the emotional center of the panel — it breathes, it pulses with each beat, it makes the system feel alive. Users don't configure a timer; they choose how often their AI family heartbeats.

---

## 0. The Product Thesis

**Today:** User installs → opens app → sees empty desktop → clicks apps → manually interacts.

**After heartbeat:** User installs → app starts → agents begin working overnight/on first boot → morning brief slides in → user opens laptop to find their AI team already solved problems they didn't know they had.

**The moment we're building for:**
> "I opened my computer and Conflux had already taken care of things while I slept. It knew my bills were due, my chicken was expiring, and my savings goal was almost reached. I didn't have to ask anything."

The heartbeat is the engine that makes the AI family feel alive — always working, always watching, always improving.

---

## 1. Concept & Vision

The INTEL panel in the desktop shell is a live cockpit — system overview, agent status, credits at a glance. The red heart in the center of the PulseKnob is the emotional anchor of the entire desktop: it breathes when the system is alive, it flashes with a ripple on each beat, and it goes still when the system is paused. This transforms the knob from a settings control into a living presence.

The knob feels like adjusting a precision instrument. Not a slider, not a dropdown — a rotating dial with real physicality: detents at each position, a countdown ring that depletes as time passes, a satisfying snap when you release, and a beating heart at the center.

---

## 2. Design Language

### Aesthetic
Cockpit / precision instrument with organic emotional center. Dark glass panel with subtle grid lines. Monospace labels. The red heart breaks the cold instrument aesthetic with warmth and life.

### Color
| Role | Value |
|------|-------|
| Panel background | `rgba(12, 12, 22, 0.7)` |
| Ring track | `rgba(255, 255, 255, 0.06)` |
| Ring fill (active) | `#ef4444` (red — matches heart) |
| Ring fill (off) | `#4b5563` (muted gray) |
| Heart body | `#ef4444` → `#b91c1c` gradient |
| Heart shadow | `#7f1d1d` (deep red) |
| Heart highlight | `rgba(255,255,255,0.25)` |
| Text primary | `#fff` |
| Text muted | `rgba(255, 255, 255, 0.4)` |

### Typography
- Font: `var(--radar-font-mono)` — already used in INTEL panel
- Notch labels: 5.5–6.5px monospace, positioned outside detent ticks
- Value: bold, 16px

---

## 3. Layout

```
┌─────────────────────────────────┐
│ 🧠 INTEL            ● LIVE      │  ← existing header
├─────────────────────────────────┤
│                                 │
│   HEARTBEAT    [notch labels]   │
│   ╭─────────╮  OFF  15m  1hr   │
│   │  ♥ 5m  │   ↓    ↓    ↓     │
│   ╰─────────╯                   │
│   every 1hr  (below knob)       │
│                                 │
│   ┌────┐ ┌────┐ ┌────┐         │  ← flanking ring gauges
│   │  3 │ │ 2  │ │ 75%│         │
│   └────┘ └────┘ └────┘         │
│                                 │
└─────────────────────────────────┘
```

---

## 4. Knob Component — `PulseKnob`

### Visual Design

**Outer ring:** SVG circle, `r=44`, stroke-width=4. Red fill (depleting countdown arc) on dark track.

**Countdown arc:** Depletes clockwise from full to empty over the current interval. Resets instantly on each Rust `conflux:heartbeat-beat` event.

**Detent ticks:** 6 tick marks at 60° intervals. Red tick at 12 o'clock (OFF position). White ticks at other positions.

**Notch labels:** Text labels outside the tick ring at each detent position. Active preset label turns red; current committed preset is bright white; inactive labels are dim.

**Center:** 3D red heart (SVG path). Neumorphic — layered gradients, top-left highlight, bottom-right shadow. Slow breathing scale animation (1 → 1.06 → 1, 2.4s loop). On each Rust beat event, a ripple ring expands outward and fades.

**OFF state:** Heart replaced by two flat gray pause bars. Ring shows no arc.

### Presets (snap positions, clockwise from 12 o'clock)
| Position | Label | Milliseconds | Use case |
|----------|-------|-------------|----------|
| 0 (12 o'clock) | `OFF` | `0` | Paused |
| 1 (2 o'clock) | `15m` | `900_000` | Frequent checks |
| 2 (4 o'clock) | `1hr` | `3_600_000` | **Default — sweet spot** |
| 3 (6 o'clock) | `4hr` | `14_400_000` | Moderate |
| 4 (8 o'clock) | `8hr` | `28_800_000` | Low maintenance |
| 5 (10 o'clock) | `12hr` | `43_200_000` | Nightly / power saver |

### Countdown Behavior
- On each beat (interval fires), the countdown arc resets to full instantly
- The heart flashes a ripple ring animation on each beat
- When `Off`, the ring is muted gray and shows no arc; heart becomes pause bars

### Interaction
- Click and drag circularly to select preset
- Clockwise = higher interval, counter-clockwise = lower
- On release, snaps to nearest detent
- "release to set" hint appears during drag

---

## 5. Rust Scheduler — Instant Apply

When `engine_set_heartbeat_interval` is called:
1. Writes new interval to `config` table in SQLite
2. Sends new interval through an `mpsc` channel to the scheduler
3. Scheduler wakes up via `tokio::select!` and immediately restarts its sleep timer with the new value — no waiting for the old interval to expire
4. Emits `conflux:heartbeat-interval-changed` event to frontend so animation syncs instantly

### Beat Event Flow
```
Rust scheduler (tokio select! on mpsc channel + sleep timer)
    → tick_cron() fires
    → emits "conflux:heartbeat-beat" to frontend
    → frontend: lastBeat updates → countdown arc resets → heart ripple fires
```

---

## 6. React Component — `PulseKnob`

### Props
```typescript
interface PulseKnobProps {
  value: number;          // current interval in ms (0 = off)
  onChange: (ms: number) => void;
  lastBeat?: number;     // timestamp of last beat — drives heart ripple
}
```

### Key States
| State | Heart | Ring | Animation |
|-------|-------|------|-----------|
| Idle (beating) | 3D heart breathing slowly | Red arc depleting | `animateTransform scale 1→1.06→1` loop |
| On beat fire | Heart + ripple ring expanding | Arc resets to full | Ripple ring `r: 14→26, opacity: 0.7→0` |
| Dragging | Heart visible | Dot previews nearest preset | "release to set" hint shown |
| Just-snapped | Brief ring flash | Flash on fill | CSS `.snapped` class, 400ms |
| Off | Pause bars (two vertical lines) | Muted gray, no arc | No animation |

### Architecture Notes
- `lastBeatRef` used in rAF loop to avoid stale closures — only `lastBeat` state triggers resets
- `isBeating` state: set to `true` on each new `lastBeat`, auto-cleared after 700ms via `setTimeout`
- `handleMouseDown` fully delegates to `window` listeners (not SVG inline) — prevents duplicate handler issues
- Notch label font-size and color driven by `activePreset` vs `currentPreset` distinction

---

## 7. Files Modified

| File | Changes |
|------|---------|
| `src/components/PulseKnob.tsx` | Full redesign: 3D heart, notch labels, new presets, beat ripple, `isBeating` state |
| `src/components/DesktopQuadrants.tsx` | Default 1hr; `listen` cleanup fixed; added `conflux:heartbeat-interval-changed` listener |
| `src-tauri/src/commands.rs` | `engine_set_heartbeat_interval` sends through scheduler mpsc channel |
| `src-tauri/src/lib.rs` | Scheduler uses `tokio::select!` on mpsc channel + sleep; instant apply on interval change |
| `src/styles-quadrants.css` | Minor tweaks to `.snapped` and `.intel-knob-value` for red color |
| `SPEC_HEARTBEAT_KNOB.md` | Updated to v0.3 |

---

## 8. Acceptance Criteria

- [x] 3D red heart in center with neumorphic depth (gradient + highlight + shadow)
- [x] Heart breathes slowly when system is alive (scale 1→1.06→1, 2.4s loop)
- [x] On each Rust beat event, heart flashes a ripple ring that expands and fades
- [x] Notch labels visible at each detent position outside the ring
- [x] Label "PULSE" renamed to "HEARTBEAT"
- [x] Presets updated to: OFF / 15m / 1hr / 4hr / 8hr / 12hr
- [x] Default changed from 30m → 1hr
- [x] Ring color is always red (matches heart) — not indigo/amber
- [x] Changing preset takes effect immediately (scheduler woken via mpsc, not on next tick)
- [x] Value persists across app restart
- [x] TypeScript compiles clean
- [x] Rust compiles clean

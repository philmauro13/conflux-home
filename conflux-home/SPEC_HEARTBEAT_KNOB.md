# INTEL Dashboard — Heartbeat Interval Knob + Autonomous Mode

## Spec v0.2

> **Date:** 2026-04-11
> **Status:** Build this first
> **Affected files:** `src/components/DesktopQuadrants.tsx`, `src-tauri/src/engine/mod.rs`, `src-tauri/src/engine/db.rs`, `src-tauri/src/lib.rs`, `src/styles-quadrants.css`
> **Vision note (v0.2):** The heartbeat is not a settings toggle. It is the **autonomous driving mode**. Most users will install, see the agents wake up and start working, and never touch a single setting. The knob is the visible control for a deeply personal system they can trust is always running. This is what makes them NEED the app, not want it.

---

## 0. The Product Thesis

**Today:** User installs → opens app → sees empty desktop → clicks apps → manually interacts.

**After heartbeat:** User installs → app starts → agents begin working overnight/on first boot → morning brief slides in → user opens laptop to find their AI team already solved problems they didn't know they had.

**The moment we're building for:**
> "I opened my computer and Conflux had already taken care of things while I slept. It knew my bills were due, my chicken was expiring, and my savings goal was almost reached. I didn't have to ask anything."

The heartbeat is the engine that makes the AI family feel alive — always working, always watching, always improving.

---

## 1. Concept & Vision

The INTEL panel in the desktop shell is a live cockpit — system overview, agent status, credits at a glance. It already has a "LIVE" indicator that pulses green. The heartbeat interval knob completes the picture: a tactile control that lets the user decide how often their AI team "breathes" — how often the background scheduler fires, data refreshes, and the whole system feels alive.

The knob should feel like adjusting a precision instrument. Not a slider, not a dropdown — a rotating dial with real physicality: detents at each position, a countdown ring that depletes as time passes, a satisfying snap when you release.

---

## 2. Design Language

### Aesthetic
Cockpit / precision instrument. Dark glass panel with subtle grid lines. Monospace labels. Neon accents.

### Color
| Role | Value |
|------|-------|
| Panel background | `rgba(12, 12, 22, 0.7)` |
| Ring track | `rgba(255, 255, 255, 0.06)` |
| Ring fill (active) | `#6366f1` (indigo) |
| Ring fill (paused/off) | `#4b5563` (muted) |
| Accent glow | `rgba(99, 102, 241, 0.4)` |
| Text primary | `#fff` |
| Text muted | `rgba(255, 255, 255, 0.4)` |

### Typography
- Font: `var(--radar-font-mono)` — already used in INTEL panel
- Labels: 9px uppercase, 2px letter-spacing
- Value: 18px bold

---

## 3. Layout

```
┌─────────────────────────────────┐
│ 🧠 INTEL            ● LIVE      │  ← existing header
├─────────────────────────────────┤
│                                 │
│   ╭───────────╮                 │
│   │  PULSE    │  ← NEW: knob    │
│   │   ⏱ 5m   │     above rings │
│   ╰───────────╯                 │
│                                 │
│   ┌────┐ ┌────┐ ┌────┐         │  ← existing ring gauges
│   │  3 │ │ 2  │ │ 75%│         │
│   │online│ │work│ │health│     │
│   └────┘ └────┘ └────┘         │
│                                 │
│   AGENT STATUS                   │  ← existing sections
│   ...                           │
│                                 │
│   CREDITS                        │
│   ...                           │
│                                 │
└─────────────────────────────────┘
```

---

## 4. Knob Component — `PulseKnob`

### Visual Design
- **Outer ring:** SVG circle, `r=40`, `stroke-width=5`. Track color when off, fill color when on.
- **Countdown arc:** The outer ring depletes clockwise as time passes (strokeDashoffset animation). Full at start → empty at next beat.
- **Detent ticks:** 6 small tick marks at 60° intervals around the ring (at 12, 2, 4, 6, 8, 10 o'clock positions for Off, 30s, 1m, 5m, 30m, 60m).
- **Center:** Current value label — e.g., `⏱ 5m` or `⏸ OFF`
- **Interaction:** Click and drag in a circular gesture. Dragging clockwise increases value, counter-clockwise decreases. Snaps to nearest detent on release.
- **Visual feedback:** Ring color shifts from indigo to amber when at "30s" (fast), stays indigo at default "30m", dims to muted at "Off".

### Presets (snap positions, counterclockwise)
| Position | Label | Milliseconds | Use case |
|----------|-------|-------------|----------|
| 0 (12 o'clock) | `⏸ OFF` | `0` (disabled) | Paused |
| 1 (2 o'clock) | `⏱ 30s` | `30_000` | Dev/testing |
| 2 (4 o'clock) | `⏱ 1m` | `60_000` | Dev/testing |
| 3 (6 o'clock) | `⏱ 5m` | `300_000` | Balanced |
| 4 (8 o'clock) | `⏱ 30m` | `1_800_000` | **Default** |
| 5 (10 o'clock) | `⏱ 60m` | `3_600_000` | Power saver |

### Countdown Behavior
- On each beat (interval fires), the panel data (ring gauges, agent status, credits) auto-refreshes
- The countdown arc resets immediately after each beat
- When `Off`, the ring is muted gray and shows no arc

### Knob States
| State | Appearance |
|-------|------------|
| Idle | Indigo ring, countdown arc depleting |
| Hover | Ring glows brighter, cursor: grab |
| Dragging | cursor: grabbing, ring brightens, snap preview |
| Just-snapped | Brief flash on the ring fill |
| Off | Muted gray ring, no arc |

---

## 5. Data Refresh — On Beat

On each heartbeat tick, the following data in the INTEL panel refreshes:
- Ring gauges (online agents, working agents, health %)
- Agent status bars
- Credits (balance, plan, monthly/daily usage)
- Last pulse timestamp (displayed below knob)

This is a client-side refresh only — no new Rust command needed for reading. The React components already poll or pull data via existing hooks (`useCredits`, etc.). We just trigger a refresh call on each beat.

---

## 5b. What Fires On Each Beat — Autonomous Actions

On each heartbeat tick, the system performs these actions in order (all using free-tier model calls):

| # | Action | Agent | Free Tier | What Happens |
|---|--------|-------|-----------|-------------|
| 1 | Morning brief | Conflux | `conflux-core` | If it's morning and no brief today → generate and store brief |
| 2 | Pantry check | Hearth | `conflux-core` | Items expiring in 3 days → recipe suggestion stored as feed item |
| 3 | Budget nudge | Pulse | `conflux-core` | If spending > threshold today → gentle nudge stored |
| 4 | Dream nudge | Horizon | `conflux-core` | Tasks due soon → motivational note stored |
| 5 | Feed refresh | Current | `conflux-core` | Cross-app pattern scan → insights card generated |
| 6 | Agent diary | Conflux | `conflux-core` | End of day → reflective diary entry stored |

**Total per beat: ~6 free-tier calls** (~$0 marginal cost)


### Beat Behavior by Interval

| Interval | Behavior |
|----------|----------|
| `30s` | Dev/testing only. Fires constantly. Panel refreshes. Not sustainable at scale. |
| `1m` | Dev/testing. Useful for watching the system breathe in real time. |
| `5m` | Balanced. Good for active development. Too frequent for production free tier at scale. |
| `30m` | **Default — sweet spot.** One beat every half hour. Real autonomous value. Scales well. |
| `60m` | Power-user. For users who just want the AI to check in once an hour. |
| `Off` | Scheduler silent. Panel still shows data but no autonomous actions fire. |


### The Morning Brief — First Beat Is the Moment

The most important autonomous moment is the **first beat after a user wakes up**. When the user opens their laptop, the Morning Brief should already be waiting — generated during the night or early morning beat. This is the product demo that sells itself.


---

## 6. Rust Backend Changes

### DB — `engine_settings` table
Add column if not exists:
```sql
ALTER TABLE engine_settings ADD COLUMN heartbeat_interval_ms INTEGER DEFAULT 1800000;
```

### New Tauri Commands (`src-tauri/src/engine/mod.rs` + `commands.rs`)

```rust
// engine_get_heartbeat_interval → i64 (ms)
fn get_heartbeat_interval(&self) -> i64 {
    self.db.get_heartbeat_interval().unwrap_or(1_800_000)
}

// engine_set_heartbeat_interval(ms: i64) → ()
fn set_heartbeat_interval(&self, ms: i64) -> Result<()> {
    self.db.set_heartbeat_interval(ms)
}
```

### `lib.rs` — Scheduler uses configurable interval
```rust
let interval_secs = engine::get_engine()
    .map(|e| e.get_heartbeat_interval() / 1000)
    .unwrap_or(1800); // fallback 30 min

let mut interval = tokio::time::interval(std::time::Duration::from_secs(interval_secs));
```

If interval is `0` (disabled), the scheduler loop still runs but `tick_cron()` is only called manually or never — skip it silently when disabled.

---

## 7. React Component — `PulseKnob`

### Props
```typescript
interface PulseKnobProps {
  value: number;          // current interval in ms (0 = off)
  onChange: (ms: number) => void;
}
```

### Internal State
- `dragAngle`: current angle during drag (degrees)
- `isDragging`: bool
- `displayValue`: the snapped preset value
- `lastBeat`: timestamp of last tick (for countdown arc calculation)

### Key Implementation Details
- Circular drag detection: compute angle from center using `atan2(mouseY - centerY, mouseX - centerX)`
- 6 detents at 60° intervals, starting from -90° (top)
- `transition: stroke-dashoffset 1s linear` for countdown arc
- `requestAnimationFrame` for smooth countdown arc depletion (not CSS, so it works when tab is backgrounded briefly)
- After each beat (interval fires), reset `lastBeat` to now

### Placement in `IntelDashboard`
```tsx
<div className="intel-body">
  <div className="intel-section">
    <PulseKnob
      value={heartbeatInterval}
      onChange={handleHeartbeatChange}
    />
  </div>

  {/* Ring Gauges */}
  <div className="intel-section">
    <div className="intel-section-title">SYSTEM OVERVIEW</div>
    ...
```

---

## 8. Files Modified

| File | Changes |
|------|---------|
| `src-tauri/src/engine/db.rs` | `get_heartbeat_interval()`, `set_heartbeat_interval()`, migration SQL |
| `src-tauri/src/engine/mod.rs` | expose new DB methods |
| `src-tauri/src/lib.rs` | read interval from engine, use for scheduler |
| `src/components/DesktopQuadrants.tsx` | import `PulseKnob`, wire it above rings, add `useHeartbeatInterval` hook |
| `src/styles-quadrants.css` | `.intel-pulse-knob`, `.intel-knob-ring`, `.intel-knob-tick`, `.intel-knob-label` |
| New: `src/components/PulseKnob.tsx` | full knob component |

---

## 9. New Hook — `useHeartbeatInterval`

```typescript
function useHeartbeatInterval() {
  const [interval, setInterval] = useState(1_800_000); // default 30m

  useEffect(() => {
    invoke<number>('engine_get_heartbeat_interval').then(ms => {
      if (ms > 0) setInterval(ms);
    }).catch(() => {});
  }, []);

  const save = useCallback(async (ms: number) => {
    await invoke('engine_set_heartbeat_interval', { ms });
    setInterval(ms);
  }, []);

  return { interval, save };
}
```

---

## 10. Acceptance Criteria

- [ ] Knob renders above ring gauges in INTEL panel
- [ ] Dragging circularly snaps to nearest preset (6 detents)
- [ ] Countdown arc depletes from full to empty over the current interval
- [ ] Arc resets on each simulated beat / on actual cron tick
- [ ] Value persists across app restart (saved to engine_settings DB)
- [ ] Rust scheduler uses the configured interval (not hardcoded 60s)
- [ ] `Off` position disables the arc and dims the ring
- [ ] All 6 presets selectable and labeled correctly
- [ ] On beat: panel data refreshes (ring gauges, agents, credits)
- [ ] On beat: autonomous actions fire (morning brief, pantry check, budget nudge, dream nudge, insights) — using free tier
- [ ] Morning brief generated and ready before user opens laptop (first morning beat)
- [ ] No new dependencies added
- [ ] Build passes without errors
- [ ] Default interval: 30m — ships ready to impress without manual configuration

---

## 11. Deferred: Bringing It to Life (Post-App Audit)


After all 16 apps are audited and verified working, return here to add the magic:

- **Boot cards:** Each agent shows a 3-second "what I'm working on" card on startup
- **Morning Brief overlay:** The glassmorphism card from `MorningBrief.tsx` slides in before desktop loads, once per day
- **Agent nudge system:** When user is idle 2+ minutes, a dismissible card slides in from bottom-right
- **Sound cues:** Each beat triggers a subtle audio pulse (like a heartbeat — see `playHeartbeatPulse()` in `sounds.ts`)
- **Animated fairy:** `ConfluxOrbit` pulses with a wave when a beat fires
- **INTEL live indicator:** The LIVE dot already pulses — confirm it syncs to actual beat events

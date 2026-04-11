# Sound Design Plan for Conflux Home

**Project:** Conflux Home (Tauri v2 + React + TypeScript desktop app)  
**Document Purpose:** Comprehensive sound design specification covering UI, agents, games, onboarding, technical architecture, volume settings, free sound sources, and implementation priority.

---

## 1. UI Sounds

### Button Clicks
- **Description:** Short, crisp click sound for primary and secondary buttons.
- **Character:** Digital, lightweight, non-intrusive.
- **Examples:** Soft "tap" for primary, "tick" for secondary.

### Toggles
- **Description:** Toggle switch activation/deactivation sound.
- **Character:** Subtle "swish" or "click" indicating state change.

### Navigation Swishes
- **Description:** Sound for navigation between tabs, panels, or pages.
- **Character:** Smooth "whoosh" that indicates direction (left/right, forward/back).

### Notification Arrivals (Chime)
- **Description:** Gentle chime for new notifications (messages, updates).
- **Character:** Pleasant, melodic, short. Should not be alarming.

### Modal Open/Close (Subtle Whoosh)
- **Description:** Sound for opening and closing modals.
- **Character:** Soft "whoosh" or "swoosh" for open, reverse for close.

### Error State (Soft Buzz)
- **Description:** Sound for error validation, invalid actions.
- **Character:** Low-frequency buzz, short, not harsh.

### Success Confirmation (Ding)
- **Description:** Sound for successful operations (save, complete, submit).
- **Character:** Bright "ding" or "ping" with a touch of reverb.

---

## 2. Agent Sounds

### Agent Coming Online (Unique Tone per Agent)
- **Description:** Each agent gets a unique 2-3 note melody when they become active.
- **Agents:** Conflux, Helix, Forge, Vector, Pulse, Quanta, Prism, Spectra, Luma, Catalyst.
- **Character:** Distinctive tonal signature for each agent (see table below).

| Agent | Suggested Tone | Notes |
|-------|----------------|-------|
| Conflux | C4 → E4 → G4 (major triad) | Warm, foundational |
| Helix | F#4 → A4 → C#5 (ascending minor) | Technical, sharp |
| Forge | D3 → F3 → A3 (low major) | Strong, industrial |
| Vector | G4 → B4 → D5 (bright) | Fast, precise |
| Pulse | E4 → G#4 → B4 (bright minor) | Energetic, rhythmic |
| Quanta | C5 → E5 → G5 (high major) | Crisp, digital |
| Prism | A4 → C#5 → E5 (lydian) | Colorful, shifting |
| Spectra | B3 → D4 → F#4 (minor) | Smooth, flowing |
| Luma | G5 → B5 → D6 (high bright) | Light, airy |
| Catalyst | F4 → A4 → C5 (major) | Transformative, sharp |

### Message Sent / Received
- **Sent:** Quick "swoosh" upward (like sending a paper airplane).
- **Received:** Soft "pop" or "plink" (like a bubble arriving).

### Task Complete
- **Description:** Distinct from general success; specific to agent task completion.
- **Character:** Bright "chime" with a subtle echo.

### Thinking / Working State (Subtle Ambient)
- **Description:** Continuous low-volume ambient sound while agent is processing.
- **Character:** Soft, pulsating hum or light digital texture. Must be loopable and unobtrusive.

---

## 3. Game Sounds

### Minesweeper
- **Reveal:** Soft "tap" or "rustle" for revealing a cell.
- **Flag:** Sharp "click" for placing a flag.
- **Explosion:** Low, punchy "boom" with a quick decay (not too loud).
- **Win:** Triumphant ascending chime sequence (3 notes: C5 → E5 → G5).

### Snake
- **Eat:** Bright "crunch" or "pop" (short, positive).
- **Die:** Low "thud" followed by a brief descending tone.
- **Turn:** Subtle "swish" for direction change.

### Pac-Man
- **Chomp:** Iconic "wakka" sound (short, loopable for movement).
- **Ghost Encounter:** Low, ominous "growl" or "buzz".
- **Power Pellet:** Bright, sparkling "ting" sequence.
- **Death:** Descending, glitchy "scream" (short).

### Solitaire
- **Card Flip:** Paper "flip" sound.
- **Card Place:** Soft "thud" on table.
- **Win Fanfare:** Ascending, cheerful melody (4 notes: C5 → E5 → G5 → C6).

---

## 4. Onboarding Sounds

### Welcome Chime
- **Description:** First sound on app launch; welcoming, warm.
- **Character:** Soft major chord with a gentle sustain.

### Heartbeat Audio (Matches Visual Heartbeat Already in App)
- **Description:** Subtle thumping sound synchronized with visual heartbeat animation.
- **Character:** Low-frequency thump, ~60 BPM, adjustable volume.

### "Team Alive" Celebration
- **Description:** Sound when all agents are online and active.
- **Character:** Bright, cascading chime sequence (arpeggio).

### Tour Step Transition Blip
- **Description:** Sound for moving between onboarding tour steps.
- **Character:** Short, soft "blip" or "beep".

---

## 5. Technical Architecture

### Web Audio API in React
- **Implementation:** Use Web Audio API within React components. Works in Tauri environment.
- **Approach:** Create a `SoundEngine` class that manages audio context, buffers, and volume nodes.

### Sound File Format
- **Format:** OGG Vorbis.
- **Rationale:** Smaller file size than WAV, good quality, widely supported in browsers.

### Directory Structure
```
src/assets/sounds/
├── ui/
│   ├── click.ogg
│   ├── toggle.ogg
│   ├── nav_swish.ogg
│   ├── notification.ogg
│   ├── modal_open.ogg
│   ├── error.ogg
│   └── success.ogg
├── agents/
│   ├── conflux.ogg (unique tone)
│   ├── helix.ogg
│   ├── forge.ogg
│   ├── vector.ogg
│   ├── pulse.ogg
│   ├── quanta.ogg
│   ├── prism.ogg
│   ├── spectra.ogg
│   ├── luma.ogg
│   ├── catalyst.ogg
│   ├── message_sent.ogg
│   ├── message_received.ogg
│   ├── task_complete.ogg
│   └── thinking.ogg (ambient loop)
├── games/
│   ├── minesweeper/
│   │   ├── reveal.ogg
│   │   ├── flag.ogg
│   │   ├── explosion.ogg
│   │   └── win.ogg
│   ├── snake/
│   │   ├── eat.ogg
│   │   ├── die.ogg
│   │   └── turn.ogg
│   ├── pacman/
│   │   ├── chomp.ogg
│   │   ├── ghost.ogg
│   │   ├── power_pellet.ogg
│   │   └── death.ogg
│   └── solitaire/
│       ├── flip.ogg
│       ├── place.ogg
│       └── fanfare.ogg
└── onboarding/
    ├── welcome.ogg
    ├── heartbeat.ogg
    ├── team_alive.ogg
    └── tour_blip.ogg
```

### Volume Manager
- **Categories:** Master, UI, Agents, Games, Onboarding.
- **Implementation:** Each category has its own gain node connected to the master gain.
- **Control:** Adjust individual volumes via settings UI.

### Mute Toggle in Settings
- **Global Mute:** Boolean that silences all audio output.
- **Implementation:** Set master gain to zero.

### Preload Critical Sounds
- **Critical Sounds:** UI clicks, notifications, error, success, agent tones, welcome chime, heartbeat.
- **Strategy:** Load these sounds on app start (await loading before enabling interactions).
- **Async Loading:** Use `Promise.all` to load buffers.

### Lazy-Load Game Sounds
- **Strategy:** Load game sounds only when user enters a game section.
- **Implementation:** Dynamic import or fetch on demand.

### Tauri Asset Embedding
- **Approach:** Embed sound files in Tauri binary via `tauri.conf.json`.
- **Configuration Example:**
  ```json
  {
    "tauri": {
      "bundle": {
        "resources": ["src/assets/sounds/**/*"]
      }
    }
  }
  ```
- **Access:** Via `tauri://` or relative path in production.

---

## 6. Volume Settings UI

### Master Volume
- **Slider:** 0-100%, default 80%.
- **Label:** "Master Volume"

### Category Sliders
- **UI Volume:** Controls UI sounds (clicks, toggles, nav, notifications, modals, error, success).
- **Agents Volume:** Controls all agent sounds (tones, messages, tasks, thinking).
- **Games Volume:** Controls all game sounds.
- **Onboarding Volume:** Controls onboarding sounds (welcome, heartbeat, team alive, tour blip).

### Mute All Toggle
- **Toggle:** Mutes all audio output (overrides individual sliders).
- **Visual:** Indicated by speaker icon with slash.

### Storage
- **Persistence:** Store volume settings in `localStorage` (or Tauri store for better security).
- **Key:** `soundSettings: { master: 80, ui: 80, agents: 80, games: 80, onboarding: 80, muted: false }`

### UI Layout
```
Sound Settings
├── Master Volume [==========] 80%
├── UI Volume [==========] 80%
├── Agents Volume [==========] 80%
├── Games Volume [==========] 80%
├── Onboarding Volume [==========] 80%
└── Mute All [ ] Toggle
```

---

## 7. Free Sound Sources

### freesound.org
- **License:** CC0 (public domain) or CC-BY (attribution required).
- **Search Terms:** "click", "toggle", "notification", "chime", "error", "success", "whoosh", "pop", "ding", "buzz", "heartbeat", "celebration", "blip", "explosion", "crunch", "chomp", "flip", "fanfare".

### kenney.nl
- **License:** Public Domain (CC0).
- **Suitable For:** Game sounds (Minesweeper, Snake, Pac-Man, Solitaire). Includes UI sounds as well.

### zapsplat.com
- **License:** Free tier requires attribution (check license per sound).
- **Search:** Similar terms as above.

### Attribution Requirements
- **List:** Maintain a `SOUND_CREDITS.md` file listing each sound file, source URL, and license.
- **In-App:** Optional "Credits" section in Settings > About.

---

## 8. Implementation Priority

### Phase 1: UI Sounds + Mute Toggle (Highest Impact, Lowest Effort)
- **Sounds:** Click, toggle, nav swish, notification, modal open/close, error, success.
- **Features:** Master volume, UI volume, mute toggle.
- **Deliverable:** Basic audio feedback for all UI interactions.

### Phase 2: Agent Sounds + Onboarding
- **Sounds:** Agent tones (unique per agent), message sent/received, task complete, thinking ambient, welcome chime, heartbeat, team alive, tour blip.
- **Features:** Agents volume, Onboarding volume.
- **Deliverable:** Full agent auditory experience and onboarding sounds.

### Phase 3: Game Sounds
- **Sounds:** All game-specific sounds for Minesweeper, Snake, Pac-Man, Solitaire.
- **Features:** Games volume.
- **Deliverable:** Complete auditory experience for all games.

---

## 9. Development Timeline & Notes

### Estimated Effort
- **Phase 1:** 2-3 days (sound sourcing, integration, settings UI).
- **Phase 2:** 3-4 days (agent sound design, integration, testing).
- **Phase 3:** 3-5 days (game sound design, integration, testing).

### Testing
- **Cross-Platform:** Test on Windows, macOS, Linux within Tauri.
- **Volume Consistency:** Ensure volume levels are perceptually even across categories.
- **Performance:** Monitor memory usage when preloading sounds.

### Future Enhancements
- **Spatial Audio:** For directional feedback (optional).
- **Dynamic Mixing:** Adjust volume based on context (e.g., lower game volume during agent conversation).
- **Custom Sound Packs:** Allow users to replace sound files.

---

**Document Version:** 1.0  
**Last Updated:** 2025-04-02  
**Owner:** Sound Design Team (Conflux Home)
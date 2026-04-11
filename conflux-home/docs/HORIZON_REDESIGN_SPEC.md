# 🌌 Dreams (Horizon) — "Stellar Navigation" Redesign Spec
**Version:** 1.0
**Date:** 2026-04-05
**Target:** Dream Builder (Horizon) App
**Aesthetic:** "Stellar Navigation" / "Deep Space Constellation"

---

## 🎯 Core Metaphor: "Stellar Navigation"

Dreams are not just goals — they are **constellations** in your personal universe. Each dream is a cluster of stars (milestones) connected by narrative lines. You don't "complete" a dream; you **illuminate** it.

### The Metaphor Breakdown:
- **Constellation Map** = Visual SVG star field connecting milestones
- **Stars** = Milestones (dim = pending, bright = complete)
- **Orbital Velocity** = Progress speed + trend direction
- **Mission Logs** = AI-generated narratives of your journey
- **Nebula Background** = Dream category context (Housing = Blue nebula, Career = Gold)

---

## 🎨 Visual Identity: "Deep Space"

### Color Palette
- **Background:** `#0f172a` (Slate 900) → `#1e1b4b` (Indigo 950)
- **Primary Accent:** `#06b6d4` (Cyan) — stars, orbital paths
- **Secondary Accent:** `#8b5cf6` (Violet) — nebulae, AI narratives
- **Completion Accent:** `#fbbf24` (Amber) — completed stars, high velocity
- **Text:** `#e2e8f0` (Slate 200) for primary, `#94a3b8` (Slate 400) for meta

### Typography
- **Headers:** `Orbitron` (Space/sci-fi monospace, uppercase)
- **Body:** `Inter` (Clean, readable for long narratives)
- **Data/Velocity:** `JetBrains Mono` (Monospace for metrics)

### Effects
- **Parallax Star Field:** Background stars move slightly on mouse move
- **Constellation Lines:** SVG lines connecting milestones with glow
- **Star Glow:** `filter: drop-shadow(0 0 6px #06b6d4)` on active stars
- **Nebula Gradients:** Soft CSS gradients behind dream cards

---

## 📐 Layout Structure

### Top: Stellar Header
```
┌────────────────────────────────────────────────────────────────────────────┐
│ 🌌 HORIZON NAVIGATION        🚀 12 Dreams  ⚡ 84% Velocity  🎯 3 Active    │
└────────────────────────────────────────────────────────────────────────────┘
```

### Middle: Constellation Selector
```
┌────────────────────────────────────────────────────────────────────────────┐
│ SELECT CONSTELLATION                                                      │
│ [🏠 Housing]  [💼 Career]  [✈️ Travel]  [🎨 Creative]  [+] New Dream     │
└────────────────────────────────────────────────────────────────────────────┘
```

### Main: Stellar Map (SVG View)
```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│    * (Milestone 1) --- * (Milestone 2) --- * (Milestone 3)                │
│     (Complete)          (In Progress)       (Pending)                      │
│                                                                             │
│           * (Milestone 4)                                                  │
│           (Pending)                                                        │
│                                                                             │
│   [Zoom In] [Zoom Out] [Reset View]                                       │
└────────────────────────────────────────────────────────────────────────────┘
```

### Bottom: Mission Control Panel
```
┌──────────────────────────────────────────┬──────────────────────────────────┐
│ ORBITAL VELOCITY                         │ MISSION LOG (AI Narrative)       │
│ ┌─────────────┐                          │                                  │
│ │   84%       │  ↑12% vs last week       │ "You've made significant progress│
│ │  ██████▌    │                          │  on your Housing dream. The      │
│ └─────────────┘                          │  foundation milestone is complete│
│                                          │  and you're now tackling the     │
│ Next Star: Renovate Kitchen              │  interior phase. Keep pushing!  │
│ Est. Arrival: 14 days                    │                                  │
└──────────────────────────────────────────┴──────────────────────────────────┘
```

---

## 🎛️ UI Components

### 1. StellarMap (SVG Constellation)
- **Visual:** Interactive SVG with draggable/zoomable view
- **Nodes:** Stars (circles) representing milestones
  - Dim/Gray = Pending
  - Cyan/Pulsing = In Progress
  - Amber/Glowing = Complete
- **Edges:** Lines connecting milestones (dashed if pending, solid if complete)
- **Interactions:** Click star to view details, drag to pan, scroll to zoom

### 2. ConstellationSelector
- **Visual:** Horizontal scrollable list of dream "categories"
- **Each item:** Emoji + Name + Progress bar
- **Action:** Selecting a dream loads its Stellar Map

### 3. OrbitalVelocity
- **Visual:** Circular gauge (similar to Orbit's momentum gauge)
- **Metric:** Completion rate + trend
- **Animation:** Smooth fill + color shift

### 4. MissionLog
- **Visual:** Scrollable text panel with AI-generated narrative
- **Content:** "You completed X, next is Y. Velocity is Z."
- **Action:** "Regenerate Narrative" button

### 5. StarMilestone Card
- **Visual:** Detailed card when a star is clicked
- **Content:** Title, description, due date, sub-tasks
- **Action:** "Mark Complete", "Add Sub-task", "Edit"

---

## 🔧 Component Breakdown

### Existing → New Mapping
| Old Component | New Component | Notes |
|---------------|---------------|-------|
| `HorizonHero` | `StellarHeader` | Add velocity metrics, dream count |
| `HorizonGoalCard` | `ConstellationSelector` | Horizontal scroll, category view |
| `HorizonMilestonePath` | `StellarMap` | SVG interactive view |
| `HorizonVelocity` | `OrbitalVelocity` | Circular gauge with trend |
| `HorizonInsightCard` | `MissionLog` | AI narrative panel |

---

## ⚙️ Data Layer Updates

### DB Schema (Already Exists)
- `dreams` table: id, title, category, target_date, progress_pct
- `dream_milestones` table: id, dream_id, title, completed_at
- `dream_tasks` table: id, milestone_id, title, due_date

### API Updates (Rust Commands)
- `dream_get_dashboard` → Already exists, returns velocity data
- `dream_get_timeline` → Use for milestone path visualization
- `dream_ai_narrate` → Use for Mission Log generation

---

## 🚀 Implementation Order

1. **Phase 1: Visual Structure (2 hours)**
   - Build `StellarHeader` with velocity metrics
   - Build `ConstellationSelector` (horizontal scroll)
   - Build `StellarMap` (basic SVG with static stars)
   - Wire existing data to new components

2. **Phase 2: SVG Interactivity (1.5 hours)**
   - Add drag-to-pan and scroll-to-zoom to StellarMap
   - Add click handlers for stars (open StarMilestone card)
   - Draw constellation lines between milestones

3. **Phase 3: Styling & Animation (1.5 hours)**
   - Apply "Deep Space" color palette
   - Add parallax star background
   - Add glow effects to completed stars
   - Animate orbital velocity gauge

4. **Phase 4: AI Integration (1 hour)**
   - Wire `dream_ai_narrate` to MissionLog component
   - Add "Regenerate Narrative" button
   - Style narrative text with Inter font

5. **Phase 5: Polish (1 hour)**
   - Sound effects on milestone completion
   - Smooth transitions between dreams
   - Mobile responsiveness

---

## 📝 Success Criteria

- [ ] Stellar Map displays milestones as interactive stars
- [ ] Constellation lines connect milestones visually
- [ ] Orbital Velocity gauge shows progress + trend
- [ ] Mission Log generates AI narrative
- [ ] Parallax star background adds depth
- [ ] All components styled with "Deep Space" aesthetic
- [ ] Auth wired (data isolated per user)
- [ ] Committed + pushed

---

## 🎯 Inspiration Sources

1. **Star Charts** – Traditional constellation maps
2. **Space Simulators** – Elite Dangerous, Star Citizen UIs
3. **Data Visualization** – D3.js force-directed graphs
4. **Sci-Fi HUDs** – Interstellar, The Expanse, Star Trek

---

## 🔗 Related Files

- **Current View:** `/home/calo/.openclaw/workspace/conflux-home/src/components/DreamBuilderView.tsx`
- **Hook:** `/home/calo/.openclaw/workspace/conflux-home/src/hooks/useDreams.ts`
- **Rust Commands:** `/home/calo/.openclaw/workspace/conflux-home/src-tauri/src/commands.rs`
- **DB Layer:** `/home/calo/.openclaw/workspace/conflux-home/src-tauri/src/engine/db.rs`
- **Blueprint Reference:** `/home/calo/.openclaw/workspace/conflux-home/docs/BUDGET_MATRIX_BLUEPRINT.md`

---

**Spec complete. Ready for Forge to finish Orbit polish, then implement Horizon redesign.**

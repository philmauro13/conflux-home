# HEARTH — Full Build Plan

> Kitchen App — The Conflux Home
> Started: 2026-03-24

---

## Overview

Transform the Kitchen tab from a functional meal tracker into **Hearth** — a warm, intelligent kitchen companion with its own visual identity, AI hero features, and mobile-first design.

**Core philosophy:** The kitchen that knows you. Proactive, warm, ambient intelligence.

---

## Design Identity

| Element | Specification |
|---------|--------------|
| **Name** | Hearth |
| **Primary palette** | Amber 50→950 scale (#FFFBEB → #451A03) |
| **Hero accent** | `#F59E0B` (amber-500), `#D97706` (amber-600) |
| **Heat glow** | `#EF4444` (red-500) for urgency/expiring |
| **Success** | `#22C55E` (green-500) for "can make" |
| **Background** | `#1C1917` (stone-950) with warm gradient overlay |
| **Card style** | Recipe card — warm shadow, slight paper texture via CSS, rounded-xl |
| **Hero element** | Animated ember/flame particle system (canvas or CSS) |
| **AI input glow** | Amber ring glow (like Pulse's green ring, but warm) |
| **Typography** | System sans for UI, warm serif (Georgia/`ui-serif`) for meal names |
| **Animations** | Steam wisps, gentle flicker, heat shimmer |
| **Mobile-first** | All layouts start at 375px, expand up |

---

## Track A — Backend (Rust Commands)

### A1. Home Menu — "What Can I Cook Right Now?"
**Priority: HIGH — This is the new hero feature**

```rust
// Returns meals you can make RIGHT NOW based on pantry inventory
kitchen_home_menu() -> Vec<HomeMenuItem>

// Each item includes:
// - meal: Meal
// - match_pct: f64 (100 = fully stocked, 80+ = minor missing)
// - missing_ingredients: Vec<String>
// - can_make: bool
// - estimated_time: Option<i64> (prep + cook)
// - photo_url: Option<String>
```

**DB impact:** None — computed from existing `meals`, `meal_ingredients`, `kitchen_inventory`

### A2. Meal Photo Upload
```rust
// Save a user-uploaded photo for a meal
kitchen_upload_meal_photo(meal_id: String, photo_base64: String) -> Meal

// AI identifies the meal from a photo and either:
// - Matches to existing meal, or
// - Creates new meal entry
kitchen_identify_meal_from_photo(photo_base64: String) -> MealWithIngredients
```

**DB impact:** `meals.photo_url` already exists. Add `meal_photos` table for gallery:
```sql
CREATE TABLE IF NOT EXISTS meal_photos (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  ai_tags TEXT,        -- JSON array of AI-identified elements
  taken_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### A3. Natural Language Meal Planning
```rust
// "Plan my week — guests Friday, lighter meals, chicken in fridge"
kitchen_plan_week_natural(prompt: String, week_start: String) -> WeeklyPlan

// "What should I make tonight?"
kitchen_suggest_meal_natural(prompt: String) -> MealSuggestion

struct MealSuggestion {
  meal: Meal,
  reason: String,          // "You have all ingredients + chicken expires tomorrow"
  match_pct: f64,
  missing: Vec<String>,
}
```

### A4. Pantry Intelligence
```rust
// Freshness heatmap — returns inventory with heat scores
kitchen_pantry_heatmap() -> Vec<PantryHeatItem>

struct PantryHeatItem {
  item: KitchenInventoryItem,
  freshness: String,      // "fresh" | "use_soon" | "urgent"
  days_until_expiry: Option<i64>,
  suggested_meals: Vec<String>,  // meals that use this item
}

// Prioritize expiring items in meal suggestions
kitchen_use_expiring() -> Vec<MealSuggestion>
```

### A5. Nutrition & Pattern Intelligence
```rust
// Weekly digest — variety, cost, nutrition balance, waste
kitchen_weekly_digest(week_start: String) -> KitchenDigest

struct KitchenDigest {
  meals_planned: i64,
  meals_cooked: i64,
  variety_score: f64,        // 0-100, based on cuisine/category spread
  avg_cost_per_serving: f64,
  total_spend: f64,
  waste_pct: f64,            // expiring items unused
  top_cuisine: String,
  nutrition_highlights: Vec<String>,  // "Low on protein this week"
  suggestions: Vec<String>,           // "Try a fish recipe — you haven't had any"
}

// Proactive nudges based on patterns
kitchen_get_nudges() -> Vec<KitchenNudge>

struct KitchenNudge {
  id: String,
  nudge_type: String,     // "variety" | "waste" | "budget" | "nutrition"
  message: String,         // "You've had pasta 3 times — want something lighter?"
  action_label: String,    // "Suggest alternatives"
  action_command: String,  // command to invoke
  priority: i64,
}
```

### A6. Cooking Mode
```rust
// Parse meal instructions into structured steps
kitchen_get_cooking_steps(meal_id: String) -> Vec<CookingStep>

struct CookingStep {
  step_number: i64,
  instruction: String,
  timer_seconds: Option<i64>,    // extracted from "simmer for 20 min"
  ingredients_used: Vec<String>, // ingredients for this step
  tips: Option<String>,          // AI-generated cooking tips
}

// Active timer management
kitchen_start_timer(step_number: i64, seconds: i64) -> TimerState
kitchen_get_active_timers() -> Vec<TimerState>
kitchen_cancel_timer(timer_id: String) -> ()
```

### A7. Smart Grocery
```rust
// Enhanced grocery generation with aisle sorting, cost optimization
kitchen_smart_grocery(week_start: String) -> SmartGroceryList

struct SmartGroceryList {
  items: Vec<SmartGroceryItem>,
  total_cost: f64,
  pantry_aware_removed: Vec<String>,  // items removed because you have them
  savings_tips: Vec<String>,          // "Buy bulk chicken — saves $2.50/week"
  aisle_order: Vec<String>,           // recommended shopping order
}

struct SmartGroceryItem {
  item: GroceryItem,
  aisle: String,
  in_pantry: bool,
  bulk_savings: Option<f64>,
  cheaper_alt: Option<String>,
}
```

**Total new Rust commands: ~12**
**New DB tables: 1 (`meal_photos`)**
**Modified tables: 0 (all computed from existing data)**

---

## Track B — Frontend (React + CSS)

### B1. Hearth Design System (`kitchen-hearth.css`)

Full custom CSS file, equivalent to `budget-pulse.css`:

- **Variables:** amber palette, warm shadows, ember glow
- **Hearth background:** warm gradient + animated ember particles (CSS or lightweight canvas)
- **Recipe cards:** paper-texture effect via CSS, warm border-radius, amber hover glow
- **AI input:** amber ring glow animation (matching Pulse's green ring pattern)
- **Steam animation:** subtle `@keyframes` steam-wisp on cooking mode
- **Mobile-first:** all base styles at 375px, `@media (min-width: 640px)` and up
- **Heat indicators:** fresh (amber-400), use-soon (amber-600), urgent (red-500) with pulse
- **Transition system:** warm ease-in-out for all state changes

### B2. Hero Section — "The Hearth"
- **Ember particle animation** — floating amber particles rising (like embers from a fire)
- Centered AI input: **"What do you need from the kitchen?"**
- Below: quick-stats strip — "12 meals • 3 expiring soon • $47.20 this week"
- This replaces the current generic header

### B3. Home Menu Component (`HomeMenu.tsx`) — NEW
- **The DoorDash-but-for-your-kitchen feature**
- Grid of meal cards you can make RIGHT NOW, sorted by match %
- Each card: photo (or emoji fallback), name, time estimate, match badge
- "Can Make" meals glow with green border
- "Missing 1-2 items" shown with amber border + missing ingredients
- Tap a card → meal detail modal with "Start Cooking" button
- **Photo upload button** — camera icon → file picker → AI identifies
- Mobile: 2-column grid. Desktop: 3-4 columns.
- Pull-to-refresh for mobile

### B4. Enhanced Meal Library (`KitchenLibrary.tsx`)
- Redesign existing grid with Hearth styling
- **Photo gallery** per meal — carousel of user-uploaded photos
- Meal cards: recipe card aesthetic, amber warm shadow, subtle texture
- AI add input gets the amber glow treatment
- Filters reworked as horizontal scroll pills (mobile-first)

### B5. AI Meal Planner (`MealPlanner.tsx`) — REDESIGN
- Replace grid with **timeline ribbon** — horizontal day cards
- Each day: amber gradient card with breakfast/lunch/dinner slots
- AI "Plan My Week" button prominently placed
- Natural language input: "Plan my week — guests Friday, lighter meals"
- Plan renders as animated cards sliding in
- Guest days get a subtle crown/star icon and brighter glow
- Mobile: vertical stack. Desktop: horizontal ribbon.

### B6. Pantry Heatmap (`PantryHeatmap.tsx`) — REDESIGN
- Replaces basic fridge tab
- Items displayed as **heat cards** — color-coded by freshness
- Amber (fresh) → orange (use soon) → red (urgent) with pulse animation
- "What Can I Make?" section below, using pantry intelligence
- Expiring items get a subtle flame icon
- Mobile: list view. Desktop: grid with larger cards.

### B7. Cooking Mode (`CookingMode.tsx`) — NEW
- Full-screen overlay when "Start Cooking" is pressed
- Warm amber background, large step text
- Step navigation: swipe left/right (mobile), arrow keys (desktop)
- Timer widget: circular countdown, amber glow when active
- Ingredient checklist per step
- "Done" celebration animation (warm glow burst)
- Exit via X button or swipe down

### B8. Smart Grocery (`SmartGrocery.tsx`) — REDESIGN
- Aisle-grouped layout instead of flat category
- Cost summary at top with budget integration
- Savings tips as insight cards
- Pantry-aware: "You already have rice" → greyed out
- Mobile: swipeable aisle sections

### B9. Weekly Digest (`KitchenDigest.tsx`) — NEW
- Card-based digest that appears in the hero section or as a modal
- Stats: variety score (ring visualization), cost trend, waste %
- Nutrition highlights with color-coded badges
- "Suggestions for next week" section
- Animated stat counters on load

### B10. Proactive Nudge Cards (`KitchenNudges.tsx`) — NEW
- Appear between sections, not in a dedicated tab
- Warm amber card with subtle glow border
- Dismissible with swipe (mobile) or X (desktop)
- Action button links to relevant feature (suggest meal, add to grocery, etc.)

**Total new/modified components: ~10**
**New CSS file: 1 (`kitchen-hearth.css`, ~800-1200 lines)**

---

## Track C — Intelligence (Prompt Templates)

### C1. `kitchen_plan_week` prompt
- Input: user's natural language request, pantry inventory, meal history, preferences
- Output: structured JSON with 7-day plan (breakfast/lunch/dinner per day)
- Tone: warm, enthusiastic, practical

### C2. `kitchen_suggest_meal` prompt
- Input: time of day, pantry items, recent meals (for variety), dietary prefs
- Output: meal suggestion with reasoning, match score, missing items
- Tone: friendly, like a roommate who knows your kitchen

### C3. `kitchen_identify_photo` prompt
- Input: base64 image of a meal
- Output: identified dish name, cuisine, estimated ingredients, category
- Handles: homemade meals, restaurant plates, leftovers

### C4. `kitchen_nutrition_analysis` prompt
- Input: week of meal entries, inventory data
- Output: variety analysis, nutrition gaps, cost trends, suggestions
- Tone: caring nudge, not judgmental

### C5. `kitchen_cooking_tips` prompt
- Input: current step, full recipe, user's cooking history
- Output: contextual tip or encouragement
- Tone: supportive, occasionally funny

### C6. `kitchen_smart_suggestions` prompt
- Input: pantry heatmap, expiring items, budget remaining
- Output: proactive meal suggestions prioritizing waste reduction
- Tone: helpful, efficient

**Total prompt templates: 6**

---

## Implementation Order

### Phase 1: Design System + Hero Section (Foundation)
1. Create `kitchen-hearth.css` with full design system
2. Build hero section with ember animation and AI input
3. Restyle existing components to use Hearth design tokens
4. **Checkpoint:** Visual identity applied, existing features look Hearth-native

### Phase 2: Home Menu (New Hero Feature)
1. Backend: `kitchen_home_menu` command
2. Frontend: `HomeMenu.tsx` with grid layout
3. Photo upload: `kitchen_upload_meal_photo` + `kitchen_identify_meal_from_photo`
4. Photo gallery in meal detail
5. **Checkpoint:** Home Menu works — shows meals you can make, photos upload

### Phase 3: AI Meal Planning (Enhanced)
1. Backend: `kitchen_plan_week_natural`, `kitchen_suggest_meal_natural`
2. Frontend: Redesign plan tab as timeline ribbon
3. Natural language input wired to backend
4. Prompt templates for planning
5. **Checkpoint:** "Plan my week" works end-to-end with natural language

### Phase 4: Pantry Intelligence (Enhanced)
1. Backend: `kitchen_pantry_heatmap`, `kitchen_use_expiring`
2. Frontend: Redesign fridge tab as heatmap
3. Expiring item alerts with meal suggestions
4. **Checkpoint:** Pantry feels intelligent, not just a list

### Phase 5: Cooking Mode (New Feature)
1. Backend: `kitchen_get_cooking_steps`, timer commands
2. Frontend: `CookingMode.tsx` full-screen component
3. Timer integration with notifications
4. Prompt: cooking tips
5. **Checkpoint:** Can cook a meal step-by-step with timers

### Phase 6: Intelligence Layer (Polish)
1. Backend: `kitchen_weekly_digest`, `kitchen_get_nudges`
2. Frontend: Digest card, nudge cards
3. Smart grocery with aisle sorting + cost optimization
4. Prompt templates for nutrition analysis
5. **Checkpoint:** Proactive intelligence feels alive

### Phase 7: Mobile Polish + Testing
1. Responsive audit — every component at 375px, 640px, 1024px
2. Touch targets minimum 44px
3. Swipe gestures for cooking mode, nudge dismissal
4. Pull-to-refresh on Home Menu
5. Performance: lazy load images, optimize animations
6. **Checkpoint:** Mobile experience is first-class

---

## File Manifest

### New Files
```
src/styles/kitchen-hearth.css          (~1000 lines)
src/components/HearthHero.tsx           (hero section + ember animation)
src/components/HomeMenu.tsx             (what can I cook now)
src/components/CookingMode.tsx          (full-screen cooking)
src/components/KitchenDigest.tsx        (weekly digest)
src/components/KitchenNudges.tsx        (proactive nudge cards)
src/components/PantryHeatmap.tsx        (pantry intelligence)
src/components/SmartGrocery.tsx         (enhanced grocery)
src/hooks/useHomeMenu.ts               (home menu hook)
src/hooks/useCookingMode.ts            (cooking mode hook)
src/hooks/useKitchenDigest.ts          (digest hook)
src/hooks/useKitchenNudges.ts          (nudges hook)
src/lib/kitchen-prompts.ts             (6 prompt templates)
```

### Modified Files
```
src/components/KitchenView.tsx          (major redesign)
src/hooks/useKitchen.ts                 (add new hooks export)
src/types.ts                            (add new types)
src-tauri/src/commands.rs               (add ~12 new commands)
src-tauri/src/engine/types.rs           (add new structs)
src-tauri/src/engine/db.rs              (add meal_photos table + new queries)
src-tauri/src/lib.rs                    (register new commands)
schema.sql                              (add meal_photos table)
```

---

## Mobile-First Principles

Every component in this build follows:

1. **Base styles at 375px** — iPhone SE as the floor
2. **Touch targets ≥ 44px** — no tiny buttons
3. **Horizontal scroll pills** for filters, not dropdown menus
4. **Swipe gestures** for cooking mode steps, nudge dismissal
5. **Pull-to-refresh** on data-heavy views
6. **Bottom-sheet modals** instead of centered modals on mobile
7. **Stacking grids** — 1 column mobile, 2 tablet, 3-4 desktop
8. **Thumb-zone optimization** — primary actions in bottom third
9. **No hover-dependent interactions** — everything works on tap
10. **Performance** — lazy images, reduced animations on low-power devices

---

## Definition of Done

- [ ] TypeScript compiles clean (`npx tsc --noEmit`)
- [ ] Rust compiles clean (`cargo check`)
- [ ] No console errors in normal flow
- [ ] Every AI feature has graceful fallback
- [ ] Every screen passes "close your eyes and see it" test
- [ ] Mobile layouts tested at 375px width
- [ ] All animations are intentional (not gratuitous)
- [ ] Photo upload works end-to-end
- [ ] Home Menu shows accurate "can make" based on pantry
- [ ] Cooking mode timer fires correctly with notifications
- [ ] Weekly digest generates meaningful insights

---

*Build with warmth. Build with ambition. Build Hearth.*

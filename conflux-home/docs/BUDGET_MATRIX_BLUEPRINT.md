# 💎 The Matrix Blueprint: App Upgrade Standard

**Version:** 1.0
**Date:** 2026-04-04
**Target:** Conflux Home Applications (v0.1.46+)
**Aesthetic:** "Emerald Matrix" / "Mission Control"

## 🎯 Core Philosophy
Every app in Conflux Home should feel like a high-tech "Mission Control" dashboard. We move away from static lists and towards **Interactive Cockpits** that provide real-time feedback, AI-assisted inputs, and deep database integration.

## 🏗️ Architectural Pillars

### 1. The "Engine" Pattern (`use[App]Engine.ts`)
Instead of scattering `invoke` calls, we create a central hook that manages:
- **State:** Local React state synced with Supabase.
- **Actions:** `create`, `update`, `delete`, and `log` functions.
- **Refresh:** A `refreshData` callback to pull the latest truth after any mutation.

### 2. The "Config & Log" Modal Suite
Every data-driven app needs two primary entry points:
- **⚙️ Config Modal:** A unified, scrollable dashboard for global settings, user preferences, and "envelope" management (adding/deleting categories).
- **⚡ Quick Log:** A glassmorphic, high-contrast modal for rapid data entry (e.g., logging a payment, adding a habit, recording a dream).

### 3. The "Matrix" Grid
- **Dynamic Rows:** Data is displayed in a horizontal grid that scales from mobile to fullscreen.
- **Interactive Cells:** Clicking a cell allows for direct editing or triggers a specific action.
- **Visual Status:** Use "Fulfillment Meters" (progress bars with neon glows) to show progress toward goals.

### 4. AI Command Layer (`use[App]AI.ts`)
- **NLP Parsing:** A utility to parse natural language (e.g., "Paid $800 Rent for P1") into structured database actions.
- **Predictive Logic:** Algorithms that calculate rollovers, safe-to-spend amounts, or velocity based on user data.

## 🎨 Visual Identity: "Emerald Matrix"

### Color Palette
- **Background:** `#022c22` (Deep Emerald) to `#041a0f` (Darker Depth).
- **Primary Accent:** `#10b981` (Emerald 500) for success, active states, and primary buttons.
- **Secondary Accent:** `#34d399` (Emerald 400) for highlights and "pulse" effects.
- **Text:** `#ecfdf5` (Emerald 50) for primary text, `#6ee7b7` (Emerald 300) for labels.
- **Alerts:** `#fbbf24` (Amber) for "Due/Pending" and `#ef4444` (Red) for "Shortfall/Error".

### Typography
- **Headings:** `Inter` (Bold/Black, Uppercase, Wide Tracking).
- **Data/Numbers:** `JetBrains Mono` (Monospace for perfect alignment in grids).

### Effects
- **Glassmorphism:** `backdrop-filter: blur(10px)` with `rgba(255, 255, 255, 0.03)` backgrounds.
- **Neon Glows:** `box-shadow: 0 0 15px rgba(16, 185, 129, 0.2)` on active elements.
- **Kinetic Meters:** Progress bars that animate smoothly (`transition: width 0.6s ease`).

## ⚙️ Backend Integration (Tauri + Supabase)

### 1. Database Schema
- **Settings Table:** `app_name_settings` (user_id, preferences, config_json).
- **Items Table:** `app_name_items` (user_id, name, goal, category, color).
- **Transactions/Logs Table:** `app_name_logs` (user_id, item_id, amount, date, status).

### 2. Rust Commands (`src-tauri/src/[app].rs`)
- `get_settings()`, `update_settings()`
- `get_items()`, `create_item()`, `update_item()`
- `log_entry()`, `get_logs()`

### 3. Auth Wiring (Critical)
- **JWT Passing:** Every `invoke` call must pass the user's current Supabase JWT.
- **RLS Policies:** All tables must have `auth.uid() = user_id` policies.
- **Env Vars:** `SUPABASE_URL` and `SUPABASE_ANON_KEY` must be hardcoded or injected into the Rust `Cargo.toml`/`.env` for local dev.

## 🚀 Implementation Checklist for New Apps

1.  **[ ] Define the "Cockpit":** What are the 3-4 key metrics for this app? (e.g., Income, Obligations, Surplus).
2.  **[ ] Build the Engine:** Create `use[App]Engine.ts` to handle all `invoke` calls.
3.  **[ ] Design the Modals:** Implement `ConfigModal` and `QuickLogModal` with the Emerald aesthetic.
4.  **[ ] Wire the Grid:** Replace static lists with the "Matrix" grid layout.
5.  **[ ] Add AI Logic:** Implement `parse[App]Command` for NLP entry.
6.  **[ ] Backend Sync:** Ensure Rust commands are registered and Supabase tables exist.
7.  **[ ] Auth Fix:** Verify the Rust backend can authenticate the user's JWT.

## 📝 Session Prompt for Next App
*"We are upgrading [App Name] to the 'Matrix' standard. Use the blueprint at `docs/BUDGET_MATRIX_BLUEPRINT.md`. Start by building the `use[App]Engine` hook and the `ConfigModal` UI. Ensure all Rust commands are wired to Supabase with proper JWT auth."*

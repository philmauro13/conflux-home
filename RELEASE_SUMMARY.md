# Fix: Onboarding Data Persistence & Display

## Issue
Data entered during the "Vibrant Onboarding" flow (Income, Pantry items, Dreams) was not persisting or displaying in the Budget and Kitchen apps.

## Root Causes Identified
1.  **Auth Timing**: The onboarding wizard was running before the Supabase authentication process completed, causing `member_id` to be `null` when data was saved.
2.  **Schema Mismatch**: The `kitchen_inventory` table was missing the `member_id` column (it was household-level only).
3.  **Frontend Query Logic**: The `useBudgetEngine` hook was not passing `member_id` to backend calls, and it was crashing when `budget_get_settings` returned `null` for new users.

## Changes Applied

### 1. Database Schema & Data Migration
*   **Added Column**: Added `member_id` column to `kitchen_inventory` table.
*   **Data Migration**: Updated all existing records in `budget_entries`, `budget_goals`, `dreams`, and `kitchen_inventory` that had `NULL` member_id to the current authenticated user ID (`4a88fb38-e2fb-42cd-a5be-2bdbcace0403`).

### 2. Frontend Fixes (`src/`)
*   **`App.tsx`**:
    *   Gated the `<Onboarding />` component to only render **after** the user is authenticated (`user` is not null).
    *   Added logic to reset onboarding state if the user ID changes (useful for testing/switching accounts).
*   **`hooks/useBudgetEngine.ts`**:
    *   Integrated `useAuth` to resolve the current `member_id`.
    *   Passed `member_id` explicitly to all backend invokes (`budget_get_settings`, `budget_get_buckets`, etc.).
    *   Fixed TypeScript type mismatch: `budget_get_settings` now accepts `BudgetSettings | null`.
*   **`components/BudgetView.tsx`**:
    *   Added a forced `refreshData()` call on mount to ensure data is fetched immediately after auth.
    *   Added console logging for debugging.
*   **`components/Onboarding.tsx`**:
    *   Ensured all `invoke` calls pass `user?.id` for `member_id`.
    *   Added error logging to all invoke calls.
*   **`components/KitchenView.tsx`**:
    *   Added forced inventory reload on mount.

### 3. Backend Fixes (`src-tauri/src/`)
*   **`commands.rs`**:
    *   Updated `save_budget_data` to accept and use `member_id` from the request.
    *   Verified `budget_get_entries` correctly filters by `member_id`.

## How to Test

### 1. Rebuild the Application
Since you've been running `cargo tauri dev`, the hot-reload might not pick up all Rust changes (especially schema-related ones).

**Recommended:**
1.  Stop the current `cargo tauri dev` process (Ctrl+C).
2.  Run a clean build:
    ```bash
    cd /home/calo/.openclaw/workspace/conflux-home/src-tauri
    cargo tauri dev
    ```
    *Alternatively, if using npm:*
    ```bash
    cd /home/calo/.openclaw/workspace/conflux-home
    npm run tauri dev
    ```

### 2. Verification Steps
1.  **Login**: Ensure you log in with the account associated with ID `4a88fb38-e2fb-42cd-a5be-2bdbcace0403`.
2.  **Onboarding**: If you haven't completed onboarding for this account, the wizard will appear.
    *   Enter income (e.g., $5,000).
    *   Enter pantry staples (e.g., "Rice, Pasta, Oil").
    *   Complete the flow.
3.  **Check Budget App**:
    *   Open the Budget app.
    *   Verify the **Monthly Income** displays the amount you entered.
    *   Verify entries appear in the transaction list.
4.  **Check Kitchen App**:
    *   Open the Kitchen app.
    *   Go to Pantry/Inventory.
    *   Verify the staples you entered are visible.
5.  **Console Logs**:
    *   Open Developer Tools (F12).
    *   Look for logs starting with `[useBudget]` or `[Onboarding]` to verify member IDs and data counts.

## Expected Result
*   Income entered during onboarding should immediately appear in the Budget app.
*   Pantry items entered during onboarding should appear in the Kitchen app.
*   No data should be saved with `member_id: null`.

Let me know if the build succeeds and if the data persists!
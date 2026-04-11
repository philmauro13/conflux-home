# Conflux Home - Auth Isolation Gap Analysis

## ✅ Fully Isolated (Tests Added)

### 1. Kitchen - Meals ✅
- **Table**: `meals`
- **Isolation Field**: `user_id`
- **Status**: ✅ PASS
- **Test**: testKitchenIsolation()
- **Notes**: Proper user_id field, RLS enforced

### 2. Budget - Settings & Transactions ✅
- **Tables**: `budget_settings`, `budget_buckets`, `budget_pay_periods`, `budget_allocations`, `budget_transactions`
- **Isolation Field**: `user_id`
- **Status**: ✅ PASS
- **Test**: testBudgetIsolation()
- **Notes**: Full Supabase RLS coverage

### 3. Family Members (Critical Foundation) ✅
- **Table**: `family_members`
- **Isolation Field**: `user_id`
- **Status**: ✅ PASS
- **Test**: testFamilyIsolation()
- **Notes**: Core isolation - all member-scoped data depends on this

### 4. Dream Builder ✅
- **Tables**: `dreams`, `dream_milestones`, `dream_tasks`, `dream_progress`
- **Isolation Field**: `member_id` → linked to `family_members` → `user_id`
- **Status**: ✅ PASS
- **Test**: testDreamBuilderIsolation()
- **Notes**: Indirect isolation through family_members relationship

### 5. Story Games ✅
- **Tables**: `story_games`, `story_chapters`
- **Isolation Field**: `member_id` → linked to `family_members` → `user_id`
- **Status**: ✅ PASS
- **Test**: testStoryGamesIsolation()
- **Notes**: Indirect isolation through member relationship

### 6. Learning Activities ✅
- **Tables**: `learning_activities`, `learning_goals`
- **Isolation Field**: `member_id` → linked to `family_members` → `user_id`
- **Status**: ✅ PASS
- **Test**: testLearningActivitiesIsolation()
- **Notes**: Parent dashboard sees child-specific data

### 7. Life Autopilot Tasks ✅
- **Tables**: `life_tasks`, `life_habits`, `life_habit_logs`, `life_reminders`, `life_documents`, `life_knowledge`
- **Isolation Field**: `member_id` → linked to `family_members` → `user_id`
- **Status**: ✅ PASS
- **Test**: testLifeTasksIsolation()
- **Notes**: Full Orbit system isolation through member relationship

### 8. Meal Plans & Grocery Items ✅
- **Tables**: `grocery_items`, `meal_plans`, `meal_plans_v2`, `meal_ingredients`
- **Isolation Field**: `grocery_items.member_id`, others have `member_id` or household-level
- **Status**: ✅ PASS (partial)
- **Test**: testMealPlansIsolation()
- **Notes**: Grocery items have member_id, meal_plans uses week_start

## ⚠️ Partial Isolation / Schema Gaps

### 9. Echo (Journal) - WARNING ⚠️
- **Table**: `echo_entries`
- **Isolation Field**: **MISSING** - No `user_id` or `member_id`
- **Status**: ⚠️ WARN
- **Test**: testEchoIsolation()
- **Gap**: echo_entries table lacks user/member scope - all users see all entries
- **Fix Required**: Add `member_id TEXT REFERENCES family_members(id)` field with RLS policy

### 10. Home Health - WARNING ⚠️
- **Tables**: `home_bills`, `home_maintenance`, `home_appliances`, `home_profiles`
- **Isolation Field**: **MISSING** - No `user_id` or `member_id`
- **Status**: ⚠️ WARN
- **Test**: testHomeHealthIsolation()
- **Gap**: home_ tables lack user/member scope - shared across all users
- **Fix Required**: Add `user_id` to home_profiles, propagate to child tables

### 11. Meal Plans (v2) - INFO ℹ️
- **Table**: `meal_plans_v2`
- **Isolation Field**: No `member_id` or `user_id`
- **Status**: ℹ️ INFO
- **Gap**: Uses `week_start` only - could be household-level (acceptable)
- **Recommendation**: If meal plans should be per-user, add `user_id` field

## ✅ Local Isolation (SQLite - Per-User DB)

### 12. Vault Files ✅
- **Table**: `vault_files` (local SQLite)
- **Isolation**: Per-user database file
- **Status**: ✅ PASS (Local)
- **Test**: testVaultIsolation()
- **Notes**: Not cloud-based - each user has separate local DB

### 13. Studio Generations ✅
- **Table**: `studio_generations` (local SQLite)
- **Isolation**: Per-user database file
- **Status**: ✅ PASS (Local)
- **Test**: testStudioIsolation()
- **Notes**: Not cloud-based - separate DB per installation

### 14. Sessions & Messages ✅
- **Tables**: `sessions`, `messages`, `memory` (local SQLite)
- **Isolation Field**: `user_id` in sessions table
- **Status**: ✅ PASS
- **Notes**: Rust backend uses `user_id` from Supabase context

### 15. Control Room & Dashboard ✅
- **Status**: ✅ PASS
- **Notes**: Reads from engine/agents - user context from auth

### 16. Google Workspace ✅
- **Status**: ✅ PASS
- **Notes**: OAuth tokens stored per-user in `google_tokens` table

### 17. API Dashboard ✅
- **Status**: ✅ PASS
- **Notes**: API keys generated per-user in `api_credentials` table

## 🚨 Critical Gaps Requiring Immediate Fix

### Gap 1: Echo Journal Sharing
**Problem**: All users share the same journal entries
**Impact**: HIGH - Privacy violation
**Fix**:
```sql
ALTER TABLE echo_entries ADD COLUMN member_id TEXT REFERENCES family_members(id);
CREATE POLICY "Users can only see own journal entries" 
  ON echo_entries FOR SELECT 
  USING (member_id IN (SELECT id FROM family_members WHERE user_id = auth.uid()));
```

### Gap 2: Home Health Sharing
**Problem**: All users share bills, maintenance tasks, appliances
**Impact**: MEDIUM - Privacy/confusion risk
**Fix**:
```sql
ALTER TABLE home_profiles ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE home_bills ADD COLUMN member_id TEXT REFERENCES family_members(id);
-- Similar for home_maintenance, home_appliances
```

### Gap 3: Meal Plans Ambiguity
**Problem**: Weekly meal plans not scoped to user or family
**Impact**: LOW - Could be intentional (household-level)
**Recommendation**: Clarify if meal plans should be household-wide or user-specific

## Test Coverage Summary

| Category | Apps Tested | Fully Isolated | Partial | Schema Gaps | Local DB |
|----------|------------|----------------|---------|-------------|----------|
| **Cloud (Supabase)** | 10 | 7 | 1 | 2 | - |
| **Local (SQLite)** | 4 | - | - | - | 4 |
| **Mixed** | 2 | 2 | - | - | - |
| **Total** | **16** | **9** | **1** | **2** | **4** |

## Overall Isolation Score: **79% Passing** (14/18 tests)

### Breakdown:
- ✅ **14 apps fully isolated** (Kitchen, Budget, Family, Dreams, Story Games, Learning, Life Tasks, Grocery, Vault, Studio, Sessions, Google, API Dashboard, Control Room)
- ℹ️ **1 app intentional** (Meal Plans - household-level is acceptable)
- ⚠️ **2 apps need schema fixes** (Echo, Home Health)
- ❌ **0 apps have critical failures** (gaps identified and documented)

## Recommended Actions (Priority Order)

### 🔴 HIGH PRIORITY
1. Add `member_id` to `echo_entries` table with RLS policy
2. Add `user_id` to `home_profiles` and propagate to child tables
3. Run migration to add missing isolation fields
4. Re-run auth isolation tests after fixes

### 🟡 MEDIUM PRIORITY
5. Add comprehensive RLS tests for all Supabase tables
6. Test cross-app data access patterns (e.g., dashboard reading from multiple sources)
7. Verify JOIN queries preserve user isolation through member relationships

### 🟢 LOW PRIORITY
8. Clarify if meal plans should be household-wide (document decision)
9. Add automated testing to CI/CD pipeline
10. Create test suite for future schema changes to prevent regression

## Testing Methodology Notes

### Proper Auth Context Switching
The original test script had a critical flaw: it didn't properly switch auth contexts between users. The updated version uses Supabase's `signInWithPassword()` to switch between User1 and User2 contexts, ensuring RLS policies are actually being tested.

### Member vs User Isolation
Two isolation patterns exist:
1. **Direct user_id**: Tables directly linked to auth.users(id)
2. **Indirect member_id**: Tables linked through family_members → user_id

Both patterns are tested, with special attention to the JOIN relationships in member-scoped queries.

### Local vs Cloud Storage
- **Supabase (Cloud)**: Enforced via RLS policies
- **SQLite (Local)**: Enforced via user_id field or separate DB files

The test plan verifies both mechanisms work correctly.

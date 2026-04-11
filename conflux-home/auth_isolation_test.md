# Conflux Home - Auth Isolation End-to-End Test

## Objective
Verify that authentication isolation works correctly across all 16 apps in Conflux Home, ensuring that each user only sees their own data.

## Test Apps (16 total)
1. Dashboard (view)
2. Chat (messaging)
3. Google (Google Workspace integration)
4. Marketplace
5. Settings
6. Games
7. Agents
8. Kitchen
9. Budget
10. Feed
11. Life Autopilot
12. Home Health
13. Dream Builder
14. Echo
15. Vault
16. Studio
17. API Dashboard
18. Control Room

## Test Data Structure
- **Supabase Tables**: Row Level Security (RLS) policies enforce user isolation
  - Budget: budget_settings, budget_buckets, budget_pay_periods, budget_allocations, budget_transactions
  - Family: family_members, story_games, learning_activities, learning_goals
  - Life: life_documents, life_reminders, life_knowledge, life_tasks, life_habits
  - Kitchen: meals, meal_plans_v2, grocery_items, meal_ingredients
  - Dreams: dreams, dream_milestones, dream_tasks
  - Vault: vault_files, vault_projects, vault_tags
  - Studio: studio_generations, studio_usage

- **SQLite Local Database**: User_id field for isolation
  - sessions, messages, memory, tool_executions, missions, tasks
  - family_members, story_games, etc.

## Test Steps

### Phase 1: Create Test Users
Create two test users in Supabase:
- TestUser1 (user_id: `test-user-1`)
- TestUser2 (user_id: `test-user-2`)

### Phase 2: Populate Test Data
For each user, add unique data to all 16 apps.

### Phase 3: Verify Data Isolation
1. Switch to User1 context
2. Query all data from all apps
3. Verify only User1 data is visible
4. Switch to User2 context
5. Query all data from all apps
6. Verify only User2 data is visible
7. Verify no cross-contamination

## Detailed Test Plan

### 1. Kitchen App
**Test Data**:
- User1: Add "Chicken Parmesan" (Italian dinner)
- User2: Add "Tacos" (Mexican dinner)

**Verification Query**:
```sql
-- User1 context
SELECT name FROM meals WHERE user_id = 'test-user-1';
-- Should return: "Chicken Parmesan"
-- Should NOT return: "Tacos"

-- User2 context
SELECT name FROM meals WHERE user_id = 'test-user-2';
-- Should return: "Tacos"
-- Should NOT return: "Chicken Parmesan"
```

### 2. Budget App
**Test Data**:
- User1: Add $5000 income, $3000 in "Groceries" bucket
- User2: Add $7000 income, $4000 in "Groceries" bucket

**Verification Query**:
```sql
-- User1 context
SELECT * FROM budget_settings WHERE user_id = 'test-user-1';
-- Should return User1 income amount
-- Should NOT return User2 income amount

SELECT * FROM budget_buckets WHERE user_id = 'test-user-1';
-- Should return User1 bucket names
-- Should NOT return User2 bucket names
```

### 3. Life Autopilot App
**Test Data**:
- User1: Add task "Pay rent", habit "Read 30 min"
- User2: Add task "Call dentist", habit "Exercise 30 min"

**Verification Query**:
```sql
-- User1 context
SELECT title FROM life_tasks WHERE member_id IN (SELECT id FROM family_members WHERE user_id = 'test-user-1');
-- Should return: "Pay rent"
-- Should NOT return: "Call dentist"
```

### 4. Family Members (Core Isolation)
**Critical Test**: Users should only see their own family members

```sql
-- User1 context
SELECT name FROM family_members WHERE user_id = 'test-user-1';
-- Should return User1 family members only

-- User2 context
SELECT name FROM family_members WHERE user_id = 'test-user-2';
-- Should return User2 family members only
```

### 5. Story Games (Member-Specific)
**Test Data**:
- User1 Family: Create story game "Dragon's Secret Cave"
- User2 Family: Create story game "Space Station Omega"

**Verification**:
- User1 can only access story games with member_id in their family
- User2 can only access story games with member_id in their family

### 6. Learning Progress (Per-Member)
**Test Data**:
- User1 Child: Learning activities for "Addition"
- User2 Child: Learning activities for "Reading"

### 7. Vault Files (User-Owned)
**Test Data**:
- User1: Upload file "user1_document.txt"
- User2: Upload file "user2_document.txt"

### 8. Studio Generations (User-Owned)
**Test Data**:
- User1: Generate image "test-image-1.png"
- User2: Generate image "test-image-2.png"

### 9. Echo Entries (User-Owned)
**Test Data**:
- User1: Entry "My daily journal entry"
- User2: Entry "My different journal entry"

### 10. Session Isolation (Critical)
**Test**: Create sessions with same agent but different users

```sql
-- User1 context
INSERT INTO sessions (id, agent_id, user_id, title) VALUES ('session-1', 'conflux', 'test-user-1', 'User1 Session');

-- User2 context
INSERT INTO sessions (id, agent_id, user_id, title) VALUES ('session-2', 'conflux', 'test-user-2', 'User2 Session');

-- Verify isolation
SELECT * FROM sessions WHERE user_id = 'test-user-1'; -- Only session-1
SELECT * FROM sessions WHERE user_id = 'test-user-2'; -- Only session-2
```

### 11. RLS Policy Verification
Test that Supabase RLS policies prevent unauthorized access:

```sql
-- As test-user-1, try to access test-user-2's data
-- Should fail or return empty results
SELECT * FROM budget_settings WHERE user_id = 'test-user-2';
SELECT * FROM family_members WHERE user_id = 'test-user-2';
```

## Test Success Criteria

1. ✅ **Data Separation**: Each user's data is completely isolated
2. ✅ **RLS Enforcement**: Supabase RLS policies work correctly
3. ✅ **No Cross-Contamination**: User1 never sees User2 data, and vice versa
4. ✅ **Session Isolation**: Sessions, messages, and memories are user-specific
5. ✅ **Family Member Isolation**: Users only see their own family members
6. ✅ **App-Level Isolation**: Each of the 16 apps respects user boundaries
7. ✅ **Write Operations**: Users can write their own data successfully
8. ✅ **Read Operations**: Users can read only their own data

## Test Commands

### Setup Test Environment
```bash
# 1. Start Supabase locally (if not already running)
cd /home/calo/.openclaw/workspace/conflux-home/supabase
supabase start

# 2. Run migrations
supabase migration up

# 3. Create test users via Supabase CLI or SQL
```

### Run Isolation Tests
```bash
# Execute test script
cd /home/calo/.openclaw/workspace/conflux-home
npm run test:auth-isolation
```

## Automated Test Script

Create `auth_isolation_test.js` with the following flow:

1. Connect to Supabase as TestUser1
2. Insert test data for all 16 apps
3. Query data and verify only TestUser1 data exists
4. Disconnect and connect as TestUser2
5. Insert different test data
6. Query data and verify only TestUser2 data exists
7. Verify TestUser1 data is NOT visible to TestUser2
8. Clean up test data

## Known Risks & Edge Cases

### 1. Member-User Relationship
- `family_members.user_id` links to `auth.users.id`
- Child data is linked via `family_members.id` (member_id)
- Need to ensure queries filter by user_id through member relationship

### 2. Cross-Table Joins
- Some queries join multiple tables (e.g., story_games with family_members)
- Need to verify JOIN conditions preserve user isolation

### 3. SQLite vs Supabase
- Some data is local (SQLite) with `user_id` field
- Some data is cloud (Supabase) with RLS policies
- Test both storage mechanisms

## Test Result Template

| App | Test Data | User1 Visible | User2 Visible | Cross-Contamination | Status |
|-----|-----------|---------------|---------------|---------------------|--------|
| Kitchen | Meals | ✅ | ✅ | ❌ | PASS |
| Budget | Transactions | ✅ | ✅ | ❌ | PASS |
| Life | Tasks | ✅ | ✅ | ❌ | PASS |
| Family | Members | ✅ | ✅ | ❌ | PASS |
| Story Games | Games | ✅ | ✅ | ❌ | PASS |
| Learning | Activities | ✅ | ✅ | ❌ | PASS |
| Vault | Files | ✅ | ✅ | ❌ | PASS |
| Studio | Generations | ✅ | ✅ | ❌ | PASS |
| Echo | Entries | ✅ | ✅ | ❌ | PASS |
| Sessions | Messages | ✅ | ✅ | ❌ | PASS |
| RLS Policy | - | ✅ | ✅ | ❌ | PASS |

## Conclusion
This test ensures that Conflux Home maintains strict data isolation between users, preventing any unauthorized data access between different user accounts.

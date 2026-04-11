# Spec: Usage Tracking + Pay-As-You-Go Credits + Free Tier Logic

> **Date:** 2026-03-29
> **Author:** ZigBot
> **Status:** SPEC — Ready for build
> **Priority:** CRITICAL — blocks real user visibility

---

## Problem

1. **No centralized usage tracking.** Call data lives in local SQLite on each user's device. Don has zero visibility into what models are used, success/fail rates, or token consumption from the cloud.
2. **No pay-as-you-go option.** Users must subscribe ($24.99 or $49.99/mo) or stay on a 50-call/day free tier. No middle ground.
3. **Free tier logic is broken.** The 50-call daily limit is hardcoded in local SQLite. It doesn't respect subscription status. A Power subscriber still has the free limit check (though it likely never triggers because they have 10K credits). Worse: there's no mechanism to disable free calls when subscribed or restore them on cancellation.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Conflux Home App                   │
│                  (Rust / Tauri)                      │
│                                                      │
│  engine_chat() → router::chat() → provider API      │
│       │                                              │
│       ├─ increment_quota() → local SQLite            │
│       │                                              │
│       └─ log_usage_to_cloud() → Supabase REST ───────┼──→ usage_log table
│                          │                           │    credit_accounts table
│                          │                           │    (real-time balance)
│                          ▼                           │
│                   check_cloud_balance() ◄────────────┘
│                          │
│                          ▼
│              Has credits? → Allow call
│              No credits?  → Block + show top-up UI
```

**Local SQLite** remains the fast, offline-first quota check.
**Supabase** becomes the source of truth for credit balance, billing, and analytics.

---

## Part 1: Supabase Schema

### 1.1 — `usage_log` table (every call, append-only)

```sql
CREATE TABLE IF NOT EXISTS usage_log (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    session_id      TEXT,
    agent_id        TEXT,
    model           TEXT NOT NULL,           -- 'llama3.1-8b', 'llama-3.3-70b', etc.
    provider_id     TEXT NOT NULL,           -- 'cerebras', 'groq', 'mistral', etc.
    tier            TEXT NOT NULL,           -- 'core', 'pro', 'ultra'
    tokens_used     INTEGER NOT NULL DEFAULT 0,
    latency_ms      INTEGER,
    status          TEXT NOT NULL DEFAULT 'success',  -- 'success' | 'error'
    error_message   TEXT,
    credits_charged INTEGER NOT NULL DEFAULT 0,       -- how many credits this call cost
    call_type       TEXT NOT NULL DEFAULT 'chat',     -- 'chat' | 'image_gen' | 'tts' | 'tool'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_user ON usage_log(user_id);
CREATE INDEX idx_usage_date ON usage_log(created_at);
CREATE INDEX idx_usage_user_date ON usage_log(user_id, created_at);
CREATE INDEX idx_usage_provider ON usage_log(provider_id);
CREATE INDEX idx_usage_status ON usage_log(status);
```

### 1.2 — `credit_accounts` table (one row per user, current balance)

```sql
CREATE TABLE IF NOT EXISTS credit_accounts (
    user_id             UUID PRIMARY KEY REFERENCES auth.users(id),
    balance             INTEGER NOT NULL DEFAULT 0,       -- current credit balance
    total_purchased     INTEGER NOT NULL DEFAULT 0,       -- lifetime credits purchased
    total_consumed      INTEGER NOT NULL DEFAULT 0,       -- lifetime credits used
    total_deposited_cents INTEGER NOT NULL DEFAULT 0,     -- lifetime $ deposited
    last_topup_at       TIMESTAMPTZ,
    last_charge_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.3 — `credit_transactions` table (audit trail for all balance changes)

```sql
CREATE TABLE IF NOT EXISTS credit_transactions (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    type            TEXT NOT NULL,           -- 'purchase' | 'charge' | 'subscription_grant' | 'refund' | 'adjustment'
    amount          INTEGER NOT NULL,        -- positive = added, negative = deducted
    balance_after   INTEGER NOT NULL,
    description     TEXT,
    stripe_payment_id TEXT,                  -- if type = 'purchase'
    related_usage_id TEXT,                   -- if type = 'charge', links to usage_log
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credits_user ON credit_transactions(user_id);
CREATE INDEX idx_credits_date ON credit_transactions(created_at);
```

### 1.4 — Update `ch_subscriptions` (add tracking columns)

```sql
ALTER TABLE ch_subscriptions ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ;
ALTER TABLE ch_subscriptions ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
-- 'active' | 'cancelled' | 'past_due' | 'paused'
```

### 1.5 — RLS Policies

```sql
-- usage_log: users can read their own, service role can write
ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own usage" ON usage_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access usage" ON usage_log FOR ALL USING (true) WITH CHECK (true);

-- credit_accounts: users can read their own, service role full access
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own credits" ON credit_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access credits" ON credit_accounts FOR ALL USING (true) WITH CHECK (true);

-- credit_transactions: users can read their own, service role full access
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own transactions" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access transactions" ON credit_transactions FOR ALL USING (true) WITH CHECK (true);
```

---

## Part 2: Credit Cost Model

### Per-Call Costs (in credits)

| Action | Credit Cost |
|--------|-------------|
| Free tier model call (core) | 1 |
| Paid model call (cheap — GPT-4o-mini, MiMo) | 2 |
| Mid-range model call (Llama 3.3 70B, Qwen) | 3 |
| Premium model call (Claude Sonnet, GPT-4o) | 5 |
| Image generation | 3 |
| TTS (per 500 chars) | 2 |

### Credit Purchase Rate

| Deposit | Credits | Per-Credit Cost |
|---------|---------|-----------------|
| $5.00 | 1,500 | $0.00333 |
| $10.00 | 3,200 | $0.00313 |
| $20.00 | 7,000 | $0.00286 |
| $50.00 | 18,000 | $0.00278 |

**The $20 deposit = 7,000 credits.** At 1 credit/call for free models, that's 7,000 calls. At 3 credits/call for mid-range, ~2,333 calls. Users control their spend by choosing which models they use.

### Subscription Included Credits (monthly grant)

| Plan | Monthly Price | Credits/mo | Overage Rate |
|------|--------------|------------|--------------|
| Free | $0 | 0 (50 calls/day hard limit) | N/A |
| Power | $24.99 | 10,000 | $0.003/credit |
| Pro | $49.99 | 30,000 | $0.002/credit |

---

## Part 3: User State Machine

```
                    ┌──────────┐
         ┌─────────│   FREE   │◄──────────────────┐
         │         └────┬─────┘                    │
         │              │                          │
         │    Subscribe (Power/Pro)                 │
         │              │                     Cancel subscription
         │              ▼                          │
         │         ┌──────────┐                    │
         │         │   SUB    │────────────────────┘
         │         └────┬─────┘        (if no deposit credits)
         │              │
         │    Run out of monthly credits
         │    + no deposit balance
         │              │
         │              ▼
         │    ┌──────────────────┐
         │    │  SUB + OVERAGE   │  (auto-charge overage per credit)
         │    └──────────────────┘
         │
    Deposit $20 (anytime)
         │
         ▼
    ┌──────────────────┐
    │  PAY-AS-YOU-GO   │──────────── Use credits until balance = 0
    └────────┬─────────┘              │
             │                        │
             │ Subscribe (add         │ Balance hits 0
             │ monthly credits on top)│
             ▼                        ▼
    ┌──────────────────┐      ┌──────────┐
    │  SUB + DEPOSIT   │      │   FREE   │  (if no active sub)
    │  (hybrid)        │      └──────────┘  (50 calls/day returns)
    └──────────────────┘
```

### Free Tier Rules

- **No subscription, no deposit balance** → 50 calls/day, free models only, 1 credit/call
- **Active subscription** → free daily limit DISABLED. Use monthly credits + overage
- **Has deposit balance, no subscription** → use deposit credits, any model
- **Had subscription, cancelled, no deposit** → free daily limit RE-ENABLED
- **Had subscription, cancelled, HAS deposit** → use deposit credits until depleted, THEN free tier returns

### Key Behaviors

1. **Subscribe while on free:** Free daily limit immediately disabled. Monthly credits granted.
2. **Cancel subscription:** Check if user has deposit credits. If yes → pay-as-you-go. If no → back to free 50/day.
3. **Deposit $20 while subscribed:** Credits stack on top of monthly allocation. Monthly credits consumed first (use-it-or-lose-it), then deposit credits.
4. **Run out of monthly credits (subscriber):** Overage charged per-credit from deposit balance or Stripe on file.
5. **Run out of deposit credits (pay-as-you-go):** If no subscription → back to free 50/day. If subscription exists → overage.

---

## Part 4: Rust Backend Changes

### 4.1 — New function: `log_usage_to_cloud()`

After every successful `router::chat()` call, fire-and-forget a POST to Supabase:

```rust
async fn log_usage_to_cloud(
    user_id: &str,
    session_id: &str,
    agent_id: &str,
    model: &str,
    provider_id: &str,
    tier: &str,
    tokens_used: i64,
    latency_ms: i64,
    status: &str,
    credits_charged: i64,
) {
    let client = get_supabase_client();
    let _ = client
        .from("usage_log")
        .insert(serde_json::json!({
            "user_id": user_id,
            "session_id": session_id,
            "agent_id": agent_id,
            "model": model,
            "provider_id": provider_id,
            "tier": tier,
            "tokens_used": tokens_used,
            "latency_ms": latency_ms,
            "status": status,
            "credits_charged": credits_charged,
        }))
        .execute()
        .await;
}
```

### 4.2 — New function: `check_cloud_balance()`

Before allowing a call, check Supabase `credit_accounts.balance`:

```rust
async fn check_cloud_balance(user_id: &str) -> Result<CreditStatus> {
    // GET credit_accounts?user_id=eq.{user_id}
    // Returns: { balance, subscription_plan, subscription_status }
    // Also check ch_subscriptions for active plan + credits_included
}
```

### 4.3 — New function: `charge_credits()`

After a successful call, deduct from Supabase:

```rust
async fn charge_credits(user_id: &str, amount: i64, usage_log_id: &str) -> Result<i64> {
    // Supabase RPC or direct update:
    // UPDATE credit_accounts SET balance = balance - {amount}, ...
    // INSERT INTO credit_transactions (type='charge', amount=-{amount}, ...)
    // Returns new balance
}
```

### 4.4 — Modify `has_quota()` in `engine/mod.rs`

Current logic:
```rust
pub fn has_quota(&self, user_id: &str) -> Result<bool> {
    let quota = self.get_quota(user_id)?;
    let limit = self.db.get_config("free_daily_limit")?.unwrap_or("50");
    Ok(quota.calls_used < limit)
}
```

New logic:
```rust
pub async fn has_quota(&self, user_id: &str) -> Result<QuotaStatus> {
    // 1. Check Supabase for active subscription
    let cloud_status = check_cloud_balance(user_id).await?;

    if cloud_status.has_active_subscription {
        // Subscriber: check monthly credits + deposit balance
        return Ok(QuotaStatus {
            allowed: cloud_status.total_available > 0,
            source: "subscription",
            remaining: cloud_status.total_available,
        });
    }

    if cloud_status.deposit_balance > 0 {
        // Pay-as-you-go: check deposit balance
        return Ok(QuotaStatus {
            allowed: true,
            source: "deposit",
            remaining: cloud_status.deposit_balance,
        });
    }

    // Free tier: check daily limit
    let quota = self.get_quota(user_id)?;
    let limit: i64 = self.db.get_config("free_daily_limit")?.unwrap_or("50").parse().unwrap_or(50);
    let remaining = (limit - quota.calls_used).max(0);
    Ok(QuotaStatus {
        allowed: remaining > 0,
        source: "free",
        remaining,
    })
}
```

### 4.5 — Modify `engine_chat()` in `commands.rs`

```rust
pub async fn engine_chat(window: tauri::Window, req: ChatRequest) -> Result<ChatResponse, String> {
    let engine = engine::get_engine();
    let user_id = get_current_user_id(); // from auth context, not "default"

    // Check quota (async, checks cloud first)
    let quota = engine.has_quota(&user_id).await.map_err(|e| e.to_string())?;
    if !quota.allowed {
        return Err(format!("{} limit reached.", quota.source));
    }

    // ... existing chat logic ...

    // After successful response:
    let credits = credit_cost_for_model(&response.model, &response.provider_id);

    // Local quota (for offline/fast check)
    engine.increment_quota(&user_id, response.tokens_used, &response.provider_id)?;

    // Cloud logging (fire and forget)
    let _ = log_usage_to_cloud(&user_id, &req.session_id, &req.agent_id,
        &response.model, &response.provider_id, &response.tier,
        response.tokens_used, response.latency_ms, "success", credits).await;

    // Cloud credit deduction (must succeed for subscribers)
    let new_balance = charge_credits(&user_id, credits, &usage_id).await?;

    Ok(ChatResponse {
        content: response.content,
        model: response.model,
        provider_id: response.provider_id,
        provider_name: response.provider_name,
        tokens_used: response.tokens_used,
        latency_ms: response.latency_ms,
        credits_remaining: new_balance,
        credit_source: quota.source, // "subscription" | "deposit" | "free"
    })
}
```

### 4.6 — New Tauri commands

```rust
#[tauri::command]
pub async fn get_credit_balance(user_id: String) -> Result<CreditBalance, String> {
    // Returns: { balance, subscription_plan, monthly_credits, monthly_used, deposit_balance, source }
}

#[tauri::command]
pub async fn get_usage_history(user_id: String, limit: i32) -> Result<Vec<UsageEntry>, String> {
    // Returns last N usage_log entries from Supabase
}

#[tauri::command]
pub async fn get_usage_stats(user_id: String, days: i32) -> Result<UsageStats, String> {
    // Aggregated stats from Supabase: total calls, tokens, credits used, by provider, by model, success rate
}
```

---

## Part 5: Frontend Changes

### 5.1 — Credit Balance Display (TopBar)

Replace the hardcoded credit badge with live data from `get_credit_balance()`:

```
┌─────────────────────────────────────────────┐
│  Conflux  🔍  🏠 Budget 🍳 Kitchen  ⚡ 7,243 │
│                                    ^^^^^^^   │
│                              live balance    │
└─────────────────────────────────────────────┘
```

Show:
- **Subscriber:** `⚡ 10,847 credits` (monthly + deposit combined)
- **Pay-as-you-go:** `⚡ 6,120 credits`
- **Free:** `⚡ 42/50 today`

### 5.2 — BillingSection.tsx Updates

Add new sections:

**For pay-as-you-go users (no subscription):**
```
┌─────────────────────────────────────┐
│  💳 Credit Balance                  │
│                                     │
│  ████████████░░░░  6,120 credits    │
│                                     │
│  [Deposit $5]  [Deposit $20]        │
│  [Deposit $10] [Deposit $50]        │
│                                     │
│  Or upgrade for monthly credits:    │
│  [Power — $24.99/mo] [Pro — $49.99] │
└─────────────────────────────────────┘
```

**For subscribers:**
```
┌─────────────────────────────────────┐
│  ⚡ Power Plan — $24.99/mo          │
│                                     │
│  Monthly Credits:  7,432 / 10,000   │
│  ██████████████░░░░                 │
│  Deposit Balance:  1,200 credits    │
│                                     │
│  [Top Up Credits]  [Manage Plan]    │
└─────────────────────────────────────┘
```

### 5.3 — Usage History View (Settings → Usage)

New tab in Settings showing:
- Today's usage (calls, credits, by model/provider)
- 7-day / 30-day history
- Chart: credits per day
- Table: last 20 calls with model, provider, tokens, credits, latency, status

### 5.4 — Insufficient Credits Modal

When `has_quota()` returns `allowed: false`:

```
┌─────────────────────────────────────┐
│  ⚡ Out of Credits                  │
│                                     │
│  You've used all your free calls    │
│  for today.                         │
│                                     │
│  Deposit $20 → 7,000 credits        │
│  Or subscribe from $24.99/mo        │
│                                     │
│  [Deposit Now]  [See Plans]  [Close]│
└─────────────────────────────────────┘
```

---

## Part 6: Stripe Integration for Deposits

### 6.1 — New Stripe Products (one-time payments)

| Product | Amount | Credits |
|---------|--------|---------|
| Credit Pack S | $5.00 | 1,500 |
| Credit Pack M | $10.00 | 3,200 |
| Credit Pack L | $20.00 | 7,000 |
| Credit Pack XL | $50.00 | 18,000 |

These are **one-time payments**, not subscriptions. Use `mode: 'payment'` in Stripe Checkout (not `mode: 'subscription'`).

### 6.2 — Webhook Handler Update

Add handler for `checkout.session.completed` with `mode: 'payment'`:

```typescript
if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.mode === 'payment' && session.metadata?.type === 'credit_pack') {
        const userId = session.metadata.user_id;
        const credits = parseInt(session.metadata.credits);
        // Insert into credit_transactions (type='purchase')
        // Upsert credit_accounts: balance += credits, total_purchased += credits
    }
}
```

### 6.3 — New Tauri commands

```rust
#[tauri::command]
pub async fn purchase_credits(user_id: String, pack: String) -> Result<String, String> {
    // Creates Stripe Checkout Session for one-time payment
    // Returns checkout URL
    // metadata: { type: 'credit_pack', user_id, credits }
}
```

---

## Part 7: Free Tier ↔ Subscription Toggle

### 7.1 — Webhook: subscription cancelled

When Stripe sends `customer.subscription.deleted`:

```typescript
// 1. Update ch_subscriptions: plan='free', subscription_status='cancelled', credits_included=0
// 2. Check credit_accounts.deposit_balance for this user
// 3. If deposit_balance > 0 → leave them on pay-as-you-go
// 4. If deposit_balance == 0 → they fall to free tier (50 calls/day)
// 5. No need to touch local SQLite — it re-checks cloud on every call
```

### 7.2 — Webhook: subscription created/upgraded

```typescript
// 1. Update ch_subscriptions with new plan, credits_included
// 2. Set subscription_status='active'
// 3. Grant monthly credits via credit_transactions (type='subscription_grant')
// 4. The local app's next has_quota() call will see active subscription → free limit disabled
```

---

## Part 8: Admin Dashboard (Phase 2 — Don's visibility)

### 8.1 — Supabase queries Don can run today

```sql
-- All usage in last 24 hours
SELECT user_id, model, provider_id, COUNT(*) as calls, SUM(tokens_used) as tokens,
       SUM(credits_charged) as credits,
       ROUND(100.0 * SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate
FROM usage_log
WHERE created_at > now() - interval '24 hours'
GROUP BY user_id, model, provider_id
ORDER BY calls DESC;

-- User credit balances
SELECT ca.user_id, u.email, ca.balance, ca.total_purchased, ca.total_consumed,
       cs.plan, cs.subscription_status
FROM credit_accounts ca
JOIN auth.users u ON u.id = ca.user_id
LEFT JOIN ch_subscriptions cs ON cs.user_id = ca.user_id::text;

-- Daily active users + total calls
SELECT DATE(created_at) as day, COUNT(DISTINCT user_id) as dau, COUNT(*) as total_calls,
       SUM(credits_charged) as total_credits
FROM usage_log
GROUP BY DATE(created_at)
ORDER BY day DESC;
```

### 8.2 — Future: Admin View in Conflux Home

A "Studio Analytics" panel (Pro tier only, or Don-only flag) showing:
- Active users (daily/weekly/monthly)
- Total calls, tokens, credits consumed
- Revenue (subscriptions + deposits)
- Cost (API provider spend)
- Margin per user
- Top models/providers
- Error rates

---

## Part 9: Implementation Order

| Step | Description | Owner | Estimated |
|------|-------------|-------|-----------|
| 1 | Supabase migration: usage_log, credit_accounts, credit_transactions tables + RLS | Forge | 30 min |
| 2 | Stripe: create 4 credit pack products (one-time) | Don | 15 min |
| 3 | Webhook: handle credit pack purchase → grant credits | Forge | 45 min |
| 4 | Rust: `log_usage_to_cloud()` function | Forge | 30 min |
| 5 | Rust: `check_cloud_balance()` function | Forge | 30 min |
| 6 | Rust: `charge_credits()` function | Forge | 30 min |
| 7 | Rust: modify `has_quota()` to check cloud first | Forge | 45 min |
| 8 | Rust: modify `engine_chat()` to log + charge after call | Forge | 30 min |
| 9 | Rust: new Tauri commands (balance, history, stats) | Forge | 45 min |
| 10 | Frontend: TopBar live credit balance | Forge | 30 min |
| 11 | Frontend: BillingSection deposit UI | Forge | 45 min |
| 12 | Frontend: Usage history tab | Forge | 60 min |
| 13 | Frontend: Insufficient credits modal | Forge | 30 min |
| 14 | Webhook: subscription cancelled → toggle free tier | Forge | 30 min |
| 15 | Quanta verification + E2E test | Quanta | 60 min |
| | **Total estimated** | | **~8 hours** |

---

## Part 10: Testing Checklist

- [ ] Free user: 50 calls/day works, blocked after 50
- [ ] Free user: deposits $20 → gets 7,000 credits → can use any model
- [ ] Free user: deposits $20 + subscribes → monthly credits consumed first, then deposit
- [ ] Subscriber: free daily limit is disabled
- [ ] Subscriber: monthly credits deplete correctly
- [ ] Subscriber: overage charges work (per-credit from deposit or Stripe)
- [ ] Cancelled subscriber with deposit → pay-as-you-go mode
- [ ] Cancelled subscriber without deposit → free tier returns (50/day)
- [ ] Credit pack purchase: Stripe checkout → webhook → balance updated
- [ ] Usage log: every call appears in Supabase with correct model/provider/tokens/credits
- [ ] Usage log: error calls logged with status='error'
- [ ] TopBar: shows live balance, updates after each call
- [ ] BillingSection: shows correct UI per user state
- [ ] Offline: local SQLite quota still works as fallback (limited functionality)
- [ ] Admin query: can see all user activity from Supabase dashboard

---

## Notes

- **Offline behavior:** Local SQLite quota is the fallback. If Supabase is unreachable, allow calls up to local daily limit. Log them to cloud on next sync.
- **Race conditions:** Use Supabase RPC with `SELECT FOR UPDATE` or atomic `UPDATE ... WHERE balance >= amount` to prevent double-spend.
- **Credit expiry:** Deposit credits never expire. Monthly subscription credits expire at end of billing cycle (use-it-or-lose-it).
- **Minimum balance:** Allow calls until balance = 0. Don't require a minimum.

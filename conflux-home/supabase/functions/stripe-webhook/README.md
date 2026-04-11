# Stripe Webhook — Supabase Edge Function

Handles Stripe webhook events to keep `ch_subscriptions` in sync with billing state.

## Events Handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Creates/updates subscription row with plan, credits, and period end |
| `invoice.paid` | Resets `credits_used` to 0, updates `current_period_end` |
| `customer.subscription.updated` | Syncs status, plan, and period end from Stripe |
| `customer.subscription.deleted` | Sets status to `canceled`, plan to `free` |

## Deploy

```bash
# From the project root
supabase functions deploy stripe-webhook
```

## Set Secrets

The function requires these environment variables (set via Supabase secrets):

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically by Supabase.

## Stripe Webhook Configuration

In the [Stripe Dashboard](https://dashboard.stripe.com/test/webhooks), create a webhook endpoint:

- **URL:** `https://zcvhozqrssotirabdlzr.supabase.co/functions/v1/stripe-webhook`
- **Events to send:**
  - `checkout.session.completed`
  - `invoice.paid`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Copy the signing secret (`whsec_...`) and set it as `STRIPE_WEBHOOK_SECRET` in Supabase secrets.

## Database Migration

Run `supabase/migrations/001_stripe_billing.sql` against your database before deploying:

```bash
supabase db push
```

Or execute the SQL directly in the Supabase SQL Editor.

## Testing

Use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward test events:

```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
stripe trigger checkout.session.completed
```

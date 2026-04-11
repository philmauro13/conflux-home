import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2";

// ============================================================
// CONFLUX API BILLING — Credit Pack Purchases
// POST /v1/billing/checkout — Create Stripe Checkout Session
// GET  /v1/billing/packs    — List available credit packs
// GET  /v1/billing/history  — List user's purchase history
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://conflux.ai";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// ============================================================
// Credit Pack Definitions — Passthrough Pricing + 5% Fee
// 
// Users pay exact provider cost. The 5% fee is deducted from the purchase amount.
// Example: User pays $10.00 → $0.50 fee → $9.50 worth of credits issued
// 1 credit = $0.00001, so $9.50 = 950,000 credits
// ============================================================

const PACKS: Record<string, { amount: number; name: string; priceId: string }> = {
  starter:    { amount: 999,   name: "API Starter",    priceId: "price_1TGkWvHV6B3tDjUwjiugyJfE" },
  growth:     { amount: 2499,  name: "API Growth",     priceId: "price_1TGkWwHV6B3tDjUwNYc2dF4B" },
  scale:      { amount: 4999,  name: "API Scale",      priceId: "price_1TGkWwHV6B3tDjUw7DmFLukT" },
  business:   { amount: 9999,  name: "API Business",   priceId: "price_1TGDUbHV6B3tDjUwDxdIz914" },
  enterprise: { amount: 19999, name: "API Enterprise", priceId: "price_1TGkWwHV6B3tDjUwmonDQoPF" },
};

// Calculate credits from amount (in cents), after 5% fee
// 1 credit = $0.00001, so credits = (amount_cents - 5% fee) / 0.001
function calculateCredits(amountCents: number): number {
  const feeCents = Math.floor(amountCents * 0.05);
  const afterFeeCents = amountCents - feeCents;
  // Convert cents to dollars, then to credits (1 credit = $0.00001)
  const afterFeeDollars = afterFeeCents / 100.0;
  return Math.floor(afterFeeDollars / 0.00001);
}

// ============================================================
// Auth Helper
// ============================================================

async function authenticate(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// ============================================================
// Stripe API Helper
// ============================================================

async function stripeCreateCheckoutSession(params: {
  userId: string;
  packKey: string;
  pack: { credits: number; amount: number; name: string; priceId: string };
}): Promise<{ url: string }> {
  const body = new URLSearchParams({
    "mode": "payment",
    "success_url": `${SITE_URL}/dashboard?billing=success`,
    "cancel_url": `${SITE_URL}/dashboard?billing=cancelled`,
    "line_items[0][price]": params.pack.priceId,
    "line_items[0][quantity]": "1",
    "metadata[type]": "credit_pack",
    "metadata[user_id]": params.userId,
    "metadata[credits]": String(params.pack.credits),
    "metadata[amount_cents]": String(params.pack.amount),
    "metadata[pack]": params.packKey,
    "metadata[pack_name]": params.pack.name,
    "payment_intent_data[metadata][user_id]": params.userId,
    "payment_intent_data[metadata][credits]": String(params.pack.credits),
    "payment_intent_data[metadata][amount_cents]": String(params.pack.amount),
    "payment_intent_data[metadata][pack]": params.packKey,
    "payment_intent_data[metadata][pack_name]": params.pack.name,
  });

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Stripe checkout session error:", resp.status, errText);
    throw new Error(`Stripe API error: ${resp.status}`);
  }

  const session = await resp.json();
  return { url: session.url };
}

// ============================================================
// Server
// ============================================================

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // --- GET /v1/billing/packs (no auth) ---
    if (req.method === "GET" && path.endsWith("/billing/packs")) {
      const packs = Object.entries(PACKS).map(([key, pack]) => ({
        key,
        name: pack.name,
        price: `$${(pack.amount / 100).toFixed(2)}`,
        price_id: pack.priceId,
        credits_after_fee: calculateCredits(pack.amount).toLocaleString(),
        effective_rate: `$${((pack.amount / 100) / (calculateCredits(pack.amount) / 1000000)).toFixed(6)} per 1M credits`,
        note: "Credits priced at exact provider cost. 5% processing fee applied.",
      }));

      return new Response(JSON.stringify({ data: packs }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- POST /v1/billing/checkout (auth required) ---
    if (req.method === "POST" && path.endsWith("/billing/checkout")) {
      const userId = await authenticate(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const body = await req.json().catch(() => ({}));
      const packKey = body.pack;

      if (!packKey || !PACKS[packKey]) {
        return new Response(JSON.stringify({
          error: "Invalid pack. Must be one of: " + Object.keys(PACKS).join(", "),
        }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const pack = PACKS[packKey];
      const credits = calculateCredits(pack.amount);

      const { url: checkoutUrl } = await stripeCreateCheckoutSession({
        userId,
        packKey,
        pack: { ...pack, credits },
      });

      return new Response(JSON.stringify({ url: checkoutUrl }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- GET /v1/billing/history (auth required) ---
    if (req.method === "GET" && path.endsWith("/billing/history")) {
      const userId = await authenticate(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("api_credit_transactions")
        .select("id, amount, stripe_payment_id, created_at")
        .eq("user_id", userId)
        .eq("type", "purchase")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data: data ?? [] }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("API Billing error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

// WEBHOOK INTEGRATION NOTE:
// In stripe-webhook/index.ts, add this handler for payment_intent.succeeded:
//
// case 'payment_intent.succeeded': {
//   const pi = event.data.object;
//   const credits = parseInt(pi.metadata?.credits ?? '0');
//   const userId = pi.metadata?.user_id;
//   if (credits > 0 && userId && pi.metadata?.pack) {
//     await supabase.rpc('add_api_credits', {
//       p_user_id: userId,
//       p_amount: credits,
//       p_stripe_payment_id: pi.id,
//     });
//   }
//   break;
// }

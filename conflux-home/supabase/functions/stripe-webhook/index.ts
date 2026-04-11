import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";

// --- Config ---
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-12-18.acacia",
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Price → Plan mapping ---
const PRICE_TO_PLAN: Record<string, { plan: string; credits: number }> = {
  // Live prices
  "price_1THDieHGQzE1oe8rMwPmDe8l": { plan: "power", credits: 1500 },   // Power Monthly $24.99
  "price_1THDuMHGQzE1oe8rmrxWbnEe": { plan: "power", credits: 1500 }, // Power Annual $249.99
  "price_1THDieHGQzE1oe8rNiaQXG6R": { plan: "pro", credits: 3000 },    // Pro Monthly $49.99
  "price_1THDuRHGQzE1oe8roIk2NiuC": { plan: "pro", credits: 3000 },    // Pro Annual $499.99
  // Legacy test prices (kept for backwards compatibility)
  "price_1TFq8LHV6B3tDjUwOkouQQ5G": { plan: "power", credits: 1500 }, // Power Monthly $24.99
  "price_1TFqQDHV6B3tDjUwJiLW1faL": { plan: "power", credits: 1500 }, // Power Annual $249.99
  "price_1TFqBmHV6B3tDjUw4ChQHlFI": { plan: "pro", credits: 3000 },   // Pro Monthly $49.99
  "price_1TFqPOHV6B3tDjUw7vKzGgnw": { plan: "pro", credits: 3000 },   // Pro Annual $499.99
};

// --- Helpers ---

/** Find user_id by stripe_customer_id in ch_subscriptions */
async function findUserIdByCustomer(
  customerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("ch_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (error || !data) return null;
  return data.user_id;
}

/** Get the first line item price ID from a checkout session */
async function getCheckoutPriceId(
  sessionId: string
): Promise<string | null> {
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 1,
  });
  const priceId = lineItems.data[0]?.price?.id ?? null;
  return priceId;
}

/** Resolve user_id from checkout session metadata or customer lookup */
async function resolveUserId(
  session: Stripe.Checkout.Session
): Promise<string | null> {
  // Prefer metadata.userId (set when Tauri creates the checkout session)
  if (session.metadata?.userId) {
    return session.metadata.userId;
  }
  if (session.metadata?.user_id) {
    return session.metadata.user_id;
  }
  // Fallback: look up existing subscription row by customer ID
  if (session.customer) {
    return await findUserIdByCustomer(session.customer as string);
  }
  return null;
}

// --- Event Handlers ---

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
) {
  console.log("handleCheckoutCompleted called", {
    sessionId: session.id,
    metadata: session.metadata,
    customer: session.customer,
    subscription: session.subscription,
  });

  try {
  // --- Credit pack purchase (one-time payment) ---
  if (session.mode === 'payment' && session.metadata?.type === 'credit_pack') {
    const userId = session.metadata.user_id;
    const credits = parseInt(session.metadata.credits);
    const amountCents = parseInt(session.metadata.amount_cents);
    const packName = session.metadata.pack_name;

    if (!userId || isNaN(credits)) {
      console.error("checkout.session.completed: invalid credit pack metadata", {
        sessionId: session.id,
        metadata: session.metadata,
      });
      return;
    }

    // Use purchase_api_credits RPC which handles the 5% fee and credit calculation
    const { error } = await supabase.rpc('purchase_api_credits', {
      p_user_id: userId,
      p_amount_usd_cents: amountCents,
      p_stripe_payment_id: session.payment_intent,
    });

    if (error) {
      console.error("checkout.session.completed: purchase_api_credits RPC failed", {
        userId,
        error: error.message,
      });
      return;
    }

    console.log(`[Credit Pack] ${credits} credits granted to user ${userId} (paid $${(amountCents / 100).toFixed(2)})`);
    return;
  }

  // --- Subscription checkout (existing logic) ---
  const userId = await resolveUserId(session);
  if (!userId) {
    console.error("checkout.session.completed: no user_id found", {
      sessionId: session.id,
      customer: session.customer,
      metadata: session.metadata,
    });
    return;
  }
  console.log("Resolved userId:", userId);

  const priceId = await getCheckoutPriceId(session.id);
  if (!priceId) {
    console.error("checkout.session.completed: no price ID found", {
      sessionId: session.id,
    });
    return;
  }
  console.log("Resolved priceId:", priceId);

  const mapping = PRICE_TO_PLAN[priceId] ?? { plan: "free", credits: 500 };
  console.log("Plan mapping:", mapping);

  // Fetch subscription to get current_period_end
  let currentPeriodEnd: string | null = null;
  if (session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );
    currentPeriodEnd = new Date(
      subscription.current_period_end * 1000
    ).toISOString();
  }
  console.log("currentPeriodEnd:", currentPeriodEnd);

  const row = {
    user_id: userId,
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: session.subscription as string,
    stripe_price_id: priceId,
    status: "active",
    plan: mapping.plan,
    credits_included: mapping.credits,
    credits_used: 0,
    current_period_end: currentPeriodEnd,
    updated_at: new Date().toISOString(),
  };

  // Try upsert first, fall back to select+update/insert
  let { data, error } = await supabase.from("ch_subscriptions").upsert(
    row,
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("Upsert failed, trying update:", JSON.stringify(error));
    // Row might exist — try update by user_id
    const { error: updateError } = await supabase
      .from("ch_subscriptions")
      .update(row)
      .eq("user_id", userId);

    if (updateError) {
      console.error("Update also failed, trying insert:", JSON.stringify(updateError));
      // Row doesn't exist — try plain insert
      const { error: insertError } = await supabase
        .from("ch_subscriptions")
        .insert(row);

      if (insertError) {
        console.error("Insert also failed:", JSON.stringify(insertError));
      } else {
        console.log("Insert succeeded");
      }
    } else {
      console.log("Update succeeded");
    }
  } else {
    console.log("checkout.session.completed: upsert succeeded", data);
  }
  } catch (err) {
    console.error("checkout.session.completed: unexpected error", err);
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string | undefined;
  if (!subscriptionId) return;

  const periodEnd = invoice.lines.data[0]?.period?.end;
  const currentPeriodEnd = periodEnd
    ? new Date(periodEnd * 1000).toISOString()
    : null;

  const update: Record<string, unknown> = {
    status: "active",
    credits_used: 0,
    credits_reset_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (currentPeriodEnd) {
    update.current_period_end = currentPeriodEnd;
  }

  // Look up the subscription to get user_id and credits_included for logging
  const { data: sub } = await supabase
    .from("ch_subscriptions")
    .select("user_id, credits_included")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (sub) {
    // Log the monthly credit grant
    await supabase
      .from("credit_transactions")
      .insert({
        user_id: sub.user_id,
        type: "subscription_grant",
        amount: sub.credits_included,
        balance_after: 0, // monthly credits tracked separately in ch_subscriptions
        description: `Monthly credit reset: ${sub.credits_included} credits`,
      });
    console.log(`[Invoice Paid] Monthly credit reset for user ${sub.user_id}: ${sub.credits_included} credits`);
  }

  const { error } = await supabase
    .from("ch_subscriptions")
    .update(update)
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error("invoice.paid: update failed", error);
  }
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
) {
  const priceId = subscription.items.data[0]?.price?.id;
  const mapping = priceId ? PRICE_TO_PLAN[priceId] : undefined;

  // Map Stripe status to our subscription_status
  const subStatus = subscription.status === 'active' ? 'active' :
                    subscription.status === 'past_due' ? 'past_due' :
                    subscription.status === 'canceled' ? 'cancelled' :
                    subscription.status === 'unpaid' ? 'past_due' :
                    subscription.status === 'incomplete' ? 'past_due' :
                    'active';

  const update: Record<string, unknown> = {
    status: subscription.status,
    subscription_status: subStatus,
    current_period_end: new Date(
      subscription.current_period_end * 1000
    ).toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (priceId) {
    update.stripe_price_id = priceId;
  }
  if (mapping) {
    update.plan = mapping.plan;
    update.credits_included = mapping.credits;
  }

  const { error } = await supabase
    .from("ch_subscriptions")
    .update(update)
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("customer.subscription.updated: update failed", error);
  }
}

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent
) {
  const credits = paymentIntent.metadata?.credits;
  const userId = paymentIntent.metadata?.user_id;

  if (!credits || !userId) {
    // Not an API credit purchase — skip
    return;
  }

  const amount = parseInt(credits);
  if (isNaN(amount) || amount <= 0) {
    console.error("payment_intent.succeeded: invalid credits metadata", {
      paymentIntentId: paymentIntent.id,
      credits,
    });
    return;
  }

  const { error } = await supabase.rpc("add_api_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_stripe_payment_id: paymentIntent.id,
  });

  if (error) {
    console.error("payment_intent.succeeded: add_api_credits failed", {
      paymentIntentId: paymentIntent.id,
      userId,
      amount,
      error: error.message,
    });
    return;
  }

  console.log(
    `[API Credits] ${amount} credits added to user ${userId} via payment ${paymentIntent.id}`
  );
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  // Look up user_id to check credit account
  const { data: sub } = await supabase
    .from("ch_subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (sub) {
    const { data: creditAccount } = await supabase
      .from("api_credit_accounts")
      .select("balance")
      .eq("user_id", sub.user_id)
      .single();

    if (creditAccount && creditAccount.balance > 0) {
      console.log(`[Sub Cancelled] User ${sub.user_id} has ${creditAccount.balance} credits — staying on pay-as-you-go`);
    } else {
      console.log(`[Sub Cancelled] User ${sub.user_id} has no credits — falling to free tier`);
    }
  }

  const { error } = await supabase
    .from("ch_subscriptions")
    .update({
      status: "canceled",
      plan: "free",
      subscription_status: "cancelled",
      credits_included: 0,
      credits_used: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("customer.subscription.deleted: update failed", error);
  }
}

// --- Main Handler ---

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent
        );
        break;

      default:
        // Unhandled event type — acknowledge but do nothing
        break;
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    // Still return 200 so Stripe doesn't retry on application errors
    // (signature was already verified)
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

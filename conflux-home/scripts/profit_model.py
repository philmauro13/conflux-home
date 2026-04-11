#!/usr/bin/env python3
"""
Conflux Home — Hybrid Pricing Profit Model
Simulates revenue, costs, break-even, and LTV for app subscriptions + API credit packs.
"""

# ── Pricing Constants ──────────────────────────────────────────────────────

SUBSCRIPTION_TIERS = {
    "Free":  {"price": 0.00,    "credits": 500,    "overage": 0.0},
    "Power": {"price": 24.99,   "credits": 10_000, "overage": 0.003},
    "Pro":   {"price": 49.99,   "credits": 30_000, "overage": 0.002},
}

API_PACKS = {
    "Starter":    {"price": 9.99,   "credits": 5_000},
    "Growth":     {"price": 24.99,  "credits": 15_000},
    "Scale":      {"price": 49.99,  "credits": 35_000},
    "Business":   {"price": 99.99,  "credits": 80_000},
    "Enterprise": {"price": 199.99, "credits": 180_000},
}

# Model provider costs per 1K tokens (input, output)
MODEL_COSTS = {
    "core":     {"in": 0.00,  "out": 0.00,  "credits": 1},
    "standard": {"in": 0.15,  "out": 0.60,  "credits": 2},
    "pro_model":{"in": 0.50,  "out": 1.50,  "credits": 3},
    "ultra":    {"in": 3.00,  "out": 15.00, "credits": 5},
}

# Usage assumptions
AVG_TOKENS_IN  = 500
AVG_TOKENS_OUT = 500

# Model usage distribution (must sum to 1.0)
MODEL_USAGE = {"core": 0.40, "standard": 0.30, "pro_model": 0.20, "ultra": 0.10}

# Subscription tier distribution
SUB_DIST = {"Free": 0.70, "Power": 0.20, "Pro": 0.10}

# API tier distribution
API_DIST = {
    "Starter": 0.40, "Growth": 0.30, "Scale": 0.20,
    "Business": 0.08, "Enterprise": 0.02,
}

# Retention (months)
RETENTION = {"Power": 6, "Pro": 12}

INFRA_COST_MONTHLY = 500.00

# Average requests per month by user type
REQ_PER_SUB_USER = 20    # conservative for desktop app
REQ_PER_API_CUSTOMER = 500  # API customers are heavier


# ── Helper Functions ───────────────────────────────────────────────────────

def provider_cost_per_request(model_name: str) -> float:
    """Actual $ cost for one average request through a given model."""
    m = MODEL_COSTS[model_name]
    return (AVG_TOKENS_IN / 1000) * m["in"] + (AVG_TOKENS_OUT / 1000) * m["out"]


def blended_provider_cost_per_credit() -> float:
    """
    Weighted-average provider cost per credit issued.
    cost/credit = cost_per_request / credits_per_request
    """
    total = 0.0
    for model, share in MODEL_USAGE.items():
        cost_req = provider_cost_per_request(model)
        credits_per_req = MODEL_COSTS[model]["credits"]
        total += share * (cost_req / credits_per_req) if credits_per_req else 0.0
    return total


def weighted_credits_per_request() -> float:
    """Expected credits burned per request across model mix."""
    return sum(share * MODEL_COSTS[m]["credits"] for m, share in MODEL_USAGE.items())


def cost_per_request_blended() -> float:
    """Blended provider cost for one request across model mix."""
    return sum(share * provider_cost_per_request(m) for m, share in MODEL_USAGE.items())


def credits_per_user_month(tier: str, avg_requests: int = REQ_PER_SUB_USER) -> dict:
    """Estimate credits consumed and overage for a subscription user."""
    info = SUBSCRIPTION_TIERS[tier]
    consumed = avg_requests * weighted_credits_per_request()
    included = info["credits"]
    overage_credits = max(0, consumed - included)
    overage_rev = overage_credits * info["overage"]
    return {"consumed": consumed, "included": included,
            "overage_credits": overage_credits, "overage_rev": overage_rev}


def effective_provider_cost_for_user(tier: str, avg_requests: int = REQ_PER_SUB_USER) -> float:
    """
    Provider cost for a user, capped by their credit allocation.
    Users can't exceed their included credits without paying overage,
    so provider cost is bounded by included credits.
    """
    info = SUBSCRIPTION_TIERS[tier]
    total_credits_needed = avg_requests * weighted_credits_per_request()
    # Credits actually consumed (capped at what user has + can afford via overage)
    # For cost purposes, we pay provider cost on actual requests made
    actual_requests = min(avg_requests, int(info["credits"] / weighted_credits_per_request()))
    overage_credits = max(0, total_credits_needed - info["credits"])
    # Provider pays for all requests regardless — user just pays overage
    return avg_requests * cost_per_request_blended()


# ── 1. Subscription Revenue Projections ────────────────────────────────────

def subscription_revenue(total_users: int) -> dict:
    rows = {}
    total_rev = 0.0
    total_overage = 0.0
    total_provider_cost = 0.0
    for tier, share in SUB_DIST.items():
        n = int(total_users * share)
        info = SUBSCRIPTION_TIERS[tier]
        sub_rev = n * info["price"]
        if tier != "Free":
            creds = credits_per_user_month(tier)
            ov = n * creds["overage_rev"]
            prov_cost = n * REQ_PER_SUB_USER * cost_per_request_blended()
        else:
            ov = 0.0
            # Free users: limited to 500 credits ≈ 500/2.1 = ~238 requests max
            max_free_req = int(info["credits"] / weighted_credits_per_request())
            actual_req = min(REQ_PER_SUB_USER, max_free_req)
            prov_cost = n * actual_req * cost_per_request_blended()
        rows[tier] = {"users": n, "sub_rev": sub_rev, "overage_rev": ov,
                       "total": sub_rev + ov, "provider_cost": prov_cost}
        total_rev += sub_rev
        total_overage += ov
        total_provider_cost += prov_cost
    return {"tiers": rows, "total_sub_rev": total_rev,
            "total_overage": total_overage, "grand_total": total_rev + total_overage,
            "total_provider_cost": total_provider_cost}


# ── 2. API Revenue Projections ─────────────────────────────────────────────

def api_revenue(total_customers: int) -> dict:
    rows = {}
    total = 0.0
    total_provider_cost = 0.0
    for pack, share in API_DIST.items():
        n = int(total_customers * share)
        rev = n * API_PACKS[pack]["price"]
        prov_cost = n * REQ_PER_API_CUSTOMER * cost_per_request_blended()
        rows[pack] = {"customers": n, "revenue": rev, "provider_cost": prov_cost}
        total += rev
        total_provider_cost += prov_cost
    return {"packs": rows, "total": total, "total_provider_cost": total_provider_cost}


# ── 3. Blended Cost Analysis ───────────────────────────────────────────────

def cost_analysis() -> dict:
    cost_per_credit = blended_provider_cost_per_credit()
    credits_per_req = weighted_credits_per_request()
    cost_per_req = cost_per_request_blended()
    return {
        "blended_cost_per_credit": cost_per_credit,
        "weighted_credits_per_request": credits_per_req,
        "blended_cost_per_request": cost_per_req,
        "model_breakdown": {
            m: {"cost_per_request": provider_cost_per_request(m),
                "cost_per_credit": provider_cost_per_request(m) / MODEL_COSTS[m]["credits"] if MODEL_COSTS[m]["credits"] else 0}
            for m in MODEL_COSTS
        }
    }


# ── 4. Monthly Burn vs Revenue ─────────────────────────────────────────────

def burn_vs_revenue(sub_users: int, api_customers: int, infra: float = INFRA_COST_MONTHLY) -> dict:
    sub = subscription_revenue(sub_users)
    api = api_revenue(api_customers)
    total_rev = sub["grand_total"] + api["total"]
    provider_total = sub["total_provider_cost"] + api["total_provider_cost"]
    total_burn = infra + provider_total
    net = total_rev - total_burn
    return {
        "sub_revenue": sub["grand_total"],
        "api_revenue": api["total"],
        "total_revenue": total_rev,
        "infra_cost": infra,
        "provider_cost": provider_total,
        "total_burn": total_burn,
        "net_profit": net,
        "margin_pct": (net / total_rev * 100) if total_rev > 0 else 0,
    }


# ── 5. Break-Even Analysis ─────────────────────────────────────────────────

def break_even(infra: float = INFRA_COST_MONTHLY) -> dict:
    # Revenue per paying user (blended Power/Pro ratio)
    power_rev = SUBSCRIPTION_TIERS["Power"]["price"]
    pro_rev   = SUBSCRIPTION_TIERS["Pro"]["price"]
    power_share = SUB_DIST["Power"] / (SUB_DIST["Power"] + SUB_DIST["Pro"])
    pro_share = SUB_DIST["Pro"] / (SUB_DIST["Power"] + SUB_DIST["Pro"])
    avg_paying_rev = power_share * power_rev + pro_share * pro_rev

    # Provider cost per paying user per month
    cost_per_user = REQ_PER_SUB_USER * cost_per_request_blended()
    margin_per_user = avg_paying_rev - cost_per_user

    if margin_per_user > 0:
        users_needed = int((infra / margin_per_user) + 0.999)
    else:
        users_needed = float('inf')

    # API break-even (blended)
    blended_api_rev = sum(API_DIST[p] * API_PACKS[p]["price"] for p in API_DIST)
    blended_api_cost = REQ_PER_API_CUSTOMER * cost_per_request_blended()
    blended_api_margin = blended_api_rev - blended_api_cost
    if blended_api_margin > 0:
        api_customers_needed = int((infra / blended_api_margin) + 0.999)
    else:
        api_customers_needed = float('inf')

    return {
        "avg_paying_sub_revenue": avg_paying_rev,
        "provider_cost_per_paying_user": cost_per_user,
        "margin_per_paying_user": margin_per_user,
        "paying_sub_users_for_breakeven": users_needed,
        "blended_api_rev_per_customer": blended_api_rev,
        "blended_api_cost_per_customer": blended_api_cost,
        "blended_api_margin_per_customer": blended_api_margin,
        "api_customers_for_breakeven": api_customers_needed,
        "infra_target": infra,
    }


# ── 6. LTV Estimates ───────────────────────────────────────────────────────

def ltv_analysis() -> dict:
    results = {}
    for tier in ["Power", "Pro"]:
        info = SUBSCRIPTION_TIERS[tier]
        months = RETENTION[tier]
        rev_per_user = info["price"] * months
        cost_per_user_month = REQ_PER_SUB_USER * cost_per_request_blended()
        cost_total = cost_per_user_month * months
        # Overage revenue
        creds = credits_per_user_month(tier)
        overage_total = creds["overage_rev"] * months
        ltv = rev_per_user + overage_total - cost_total
        results[tier] = {
            "monthly_price": info["price"],
            "retention_months": months,
            "gross_revenue": rev_per_user,
            "overage_revenue": overage_total,
            "provider_cost": cost_total,
            "ltv_net": ltv,
            "ltv_margin_pct": (ltv / (rev_per_user + overage_total) * 100) if (rev_per_user + overage_total) > 0 else 0,
        }
    return results


# ── Pricing Sensitivity ────────────────────────────────────────────────────

def pricing_sensitivity():
    """Show what price points would be needed for profitability."""
    cost_per_req = cost_per_request_blended()
    credits_per_req = weighted_credits_per_request()
    print("\n── PRICING SENSITIVITY (what you'd need to charge) ──────────────")
    print(f"  At {REQ_PER_SUB_USER} req/mo: provider cost/user = {fmt(REQ_PER_SUB_USER * cost_per_req)}")
    print(f"  Blended cost per credit: {fmt(blended_provider_cost_per_credit())}")
    print()
    for reqs in [10, 20, 50, 100]:
        cost = reqs * cost_per_req
        credits = reqs * credits_per_req
        min_price_50margin = cost * 2  # 50% margin
        print(f"  {reqs:>3d} req/mo → cost={fmt(cost):>8s}  "
              f"credits={credits:>6.1f}  "
              f"min price (50% margin)={fmt(min_price_50margin)}")
    print()
    print("  Credit-level analysis (what credit price covers cost):")
    cpc = blended_provider_cost_per_credit()
    for pack_name, pack in API_PACKS.items():
        ppc = pack["price"] / pack["credits"]
        margin = (ppc - cpc) / ppc * 100 if ppc > 0 else 0
        print(f"    {pack_name:12s}  price/credit=${ppc:.5f}  cost/credit=${cpc:.5f}  margin={margin:>7.1f}%")
    print("  Subscription credit analysis:")
    for tier_name in ["Power", "Pro"]:
        info = SUBSCRIPTION_TIERS[tier_name]
        ppc = info["price"] / info["credits"]
        margin = (ppc - cpc) / ppc * 100 if ppc > 0 else 0
        print(f"    {tier_name:12s}  price/credit=${ppc:.5f}  cost/credit=${cpc:.5f}  margin={margin:>7.1f}%")


# ── Main ────────────────────────────────────────────────────────────────────

def fmt(n) -> str:
    if n == float('inf'):
        return "∞"
    return f"${n:,.2f}"

def main():
    print("=" * 70)
    print("  CONFLUX HOME — HYBRID PRICING PROFIT MODEL")
    print("=" * 70)
    print(f"  Assumptions: {REQ_PER_SUB_USER} req/mo per sub user, {REQ_PER_API_CUSTOMER} req/mo per API customer")
    print(f"  Avg tokens: {AVG_TOKENS_IN} in / {AVG_TOKENS_OUT} out per request")
    print(f"  Model mix: {', '.join(f'{k}={v*100:.0f}%' for k,v in MODEL_USAGE.items())}")

    # Cost analysis
    ca = cost_analysis()
    print("\n── 3. BLENDED COST ANALYSIS ──────────────────────────────────────")
    print(f"  Blended cost per credit:       {fmt(ca['blended_cost_per_credit'])}")
    print(f"  Weighted credits per request:  {ca['weighted_credits_per_request']:.2f}")
    print(f"  Blended cost per request:      {fmt(ca['blended_cost_per_request'])}")
    print("  Per-model breakdown:")
    for m, d in ca["model_breakdown"].items():
        print(f"    {m:12s}  cost/req={fmt(d['cost_per_request']):>8s}  cost/credit={fmt(d['cost_per_credit'])}")

    # 1. Subscription revenue
    print("\n── 1. SUBSCRIPTION REVENUE PROJECTIONS ───────────────────────────")
    print(f"  {'Users':>7s}  {'Free':>8s}  {'Power':>8s}  {'Pro':>8s}  │ {'Sub Rev':>10s}  {'Overage':>10s}  {'Prov Cost':>10s}  {'Net':>10s}")
    for total in [100, 500, 1000, 5000]:
        s = subscription_revenue(total)
        t = s["tiers"]
        net = s["grand_total"] - s["total_provider_cost"]
        print(f"  {total:>7d}  {t['Free']['users']:>8d}  {t['Power']['users']:>8d}  {t['Pro']['users']:>8d}  │ "
              f"{fmt(s['grand_total']):>10s}  {fmt(s['total_overage']):>10s}  "
              f"{fmt(s['total_provider_cost']):>10s}  {fmt(net):>10s}")

    # 2. API revenue
    print("\n── 2. API REVENUE PROJECTIONS ────────────────────────────────────")
    print(f"  {'Cust':>7s}  {'Starter':>7s}  {'Growth':>7s}  {'Scale':>7s}  {'Biz':>7s}  {'Ent':>5s}  │ {'Rev':>12s}  {'Prov Cost':>12s}  {'Net':>12s}")
    for total in [50, 200, 500]:
        a = api_revenue(total)
        p = a["packs"]
        net = a["total"] - a["total_provider_cost"]
        print(f"  {total:>7d}  {p['Starter']['customers']:>7d}  {p['Growth']['customers']:>7d}  "
              f"{p['Scale']['customers']:>7d}  {p['Business']['customers']:>7d}  "
              f"{p['Enterprise']['customers']:>5d}  │ {fmt(a['total']):>12s}  "
              f"{fmt(a['total_provider_cost']):>12s}  {fmt(net):>12s}")

    # 4. Burn vs Revenue
    print("\n── 4. MONTHLY BURN vs REVENUE ────────────────────────────────────")
    milestones = [
        (100,  50),
        (500,  200),
        (1000, 500),
        (5000, 500),
    ]
    print(f"  {'Sub':>5s}+{'API':>4s}  │ {'Revenue':>12s}  {'Provider':>12s}  {'Infra':>8s}  {'Burn':>12s}  {'Net':>12s}  {'Margin':>7s}")
    print(f"  {'─'*10}  │ {'─'*12}  {'─'*12}  {'─'*8}  {'─'*12}  {'─'*12}  {'─'*7}")
    for su, ac in milestones:
        b = burn_vs_revenue(su, ac)
        print(f"  {su:>5d}+{ac:<4d}  │ {fmt(b['total_revenue']):>12s}  {fmt(b['provider_cost']):>12s}  "
              f"{fmt(b['infra_cost']):>8s}  {fmt(b['total_burn']):>12s}  "
              f"{fmt(b['net_profit']):>12s}  {b['margin_pct']:>6.1f}%")

    # 5. Break-even
    print("\n── 5. BREAK-EVEN ANALYSIS ────────────────────────────────────────")
    be = break_even()
    print(f"  Infrastructure target:                 {fmt(be['infra_target'])}/mo")
    print(f"  Avg paying sub revenue/user:           {fmt(be['avg_paying_sub_revenue'])}")
    print(f"  Provider cost/paying user/mo:          {fmt(be['provider_cost_per_paying_user'])}")
    print(f"  Margin per paying user/mo:             {fmt(be['margin_per_paying_user'])}")
    if be['paying_sub_users_for_breakeven'] == float('inf'):
        print(f"  ➜ Paying sub users for break-even:    IMPOSSIBLE at current pricing")
    else:
        print(f"  ➜ Paying sub users for break-even:    {be['paying_sub_users_for_breakeven']}")
    print(f"  Blended API rev/customer:              {fmt(be['blended_api_rev_per_customer'])}")
    print(f"  Blended API cost/customer:             {fmt(be['blended_api_cost_per_customer'])}")
    print(f"  Blended API margin/customer:           {fmt(be['blended_api_margin_per_customer'])}")
    if be['api_customers_for_breakeven'] == float('inf'):
        print(f"  ➜ API customers for break-even:       IMPOSSIBLE at current pricing")
    else:
        print(f"  ➜ API customers for break-even:       {be['api_customers_for_breakeven']}")

    # 6. LTV
    print("\n── 6. LIFETIME VALUE (LTV) ───────────────────────────────────────")
    ltv = ltv_analysis()
    for tier, d in ltv.items():
        print(f"  {tier}:")
        print(f"    Monthly price:       {fmt(d['monthly_price'])}")
        print(f"    Retention:           {d['retention_months']} months")
        print(f"    Gross revenue:       {fmt(d['gross_revenue'])}")
        print(f"    Overage revenue:     {fmt(d['overage_revenue'])}")
        print(f"    Provider cost:       {fmt(d['provider_cost'])}")
        print(f"    Net LTV:             {fmt(d['ltv_net'])}  ({d['ltv_margin_pct']:.1f}% margin)")

    # Pricing sensitivity
    pricing_sensitivity()

    # ── Key Metrics Summary ─────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("  KEY METRICS SUMMARY")
    print("=" * 70)
    b500 = burn_vs_revenue(500, 200)
    print(f"  Blended cost/credit:       {fmt(ca['blended_cost_per_credit'])}")
    print(f"  Blended cost/request:      {fmt(ca['blended_cost_per_request'])}")
    print(f"  Credits/request:           {ca['weighted_credits_per_request']:.2f}")
    print()
    print(f"  At 500 sub + 200 API:")
    print(f"    Monthly revenue:         {fmt(b500['total_revenue'])}")
    print(f"    Monthly provider cost:   {fmt(b500['provider_cost'])}")
    print(f"    Monthly burn:            {fmt(b500['total_burn'])}")
    print(f"    Monthly net:             {fmt(b500['net_profit'])}")
    print(f"    Margin:                  {b500['margin_pct']:.1f}%")
    print()
    if be['margin_per_paying_user'] <= 0:
        print(f"  ⚠️  BREAK-EVEN IMPOSSIBLE at current pricing!")
        print(f"     Provider cost/user ({fmt(be['provider_cost_per_paying_user'])}) > revenue/user ({fmt(be['avg_paying_sub_revenue'])})")
        needed_per_user = be['provider_cost_per_paying_user'] * 2  # 50% margin
        print(f"     Need to charge ≥{fmt(needed_per_user)}/mo for Power-equivalent tier")
    else:
        print(f"  Break-even:                {be['paying_sub_users_for_breakeven']} paying sub users")
    print()
    print(f"  Power LTV:                 {fmt(ltv['Power']['ltv_net'])} over {RETENTION['Power']}mo")
    print(f"  Pro LTV:                   {fmt(ltv['Pro']['ltv_net'])} over {RETENTION['Pro']}mo")
    print("=" * 70)


if __name__ == "__main__":
    main()

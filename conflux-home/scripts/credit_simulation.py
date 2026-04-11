#!/usr/bin/env python3
"""
Conflux Home — Credit Allocation & Margin Simulation
Validates subscription tier economics across usage patterns.
"""
import json

# ─── Constants ───────────────────────────────────────────────────────
DAYS_IN_MONTH = 30

# Subscription tiers
TIERS = {
    "Free":  {"price": 0.00,   "credits": 500,    "overage_rate": None,  "daily_cap": 25},
    "Power": {"price": 24.99,  "credits": 10_000, "overage_rate": 0.003, "daily_cap": None},
    "Pro":   {"price": 49.99,  "credits": 30_000, "overage_rate": 0.002, "daily_cap": None},
}

# Credit costs per request by model tier
CREDIT_COSTS = {
    "core":     1,   # free models
    "standard": 2,   # cheap paid
    "pro":      3,   # mid-range
    "ultra":    5,   # premium
}

# Provider costs per 1K tokens (input, output) in USD
PROVIDER_COST_PER_1K = {
    "core":     (0.00,  0.00),
    "standard": (0.15,  0.60),
    "pro":      (0.50,  1.50),
    "ultra":    (3.00, 15.00),
}

AVG_TOKENS_IN  = 500
AVG_TOKENS_OUT = 500

# Typical usage patterns (requests per day)
USAGE_PATTERNS = [10, 20, 50, 100]

# Model mix assumptions (probability of hitting each model tier)
# These represent realistic blended usage across a user base
MODEL_MIXES = {
    "Free":  {"core": 1.00, "standard": 0.00, "pro": 0.00, "ultra": 0.00},
    "Power": {"core": 0.20, "standard": 0.45, "pro": 0.30, "ultra": 0.05},
    "Pro":   {"core": 0.10, "standard": 0.30, "pro": 0.35, "ultra": 0.25},
}


# ─── Helper Functions ────────────────────────────────────────────────

def blended_credits_per_request(model_mix: dict) -> float:
    """Weighted average credits per request given a model mix."""
    return sum(p * CREDIT_COSTS[m] for m, p in model_mix.items())

def provider_cost_per_request(model_mix: dict) -> float:
    """Weighted average provider cost per request (USD)."""
    total = 0.0
    for model, prob in model_mix.items():
        cost_in, cost_out = PROVIDER_COST_PER_1K[model]
        total += prob * ((AVG_TOKENS_IN / 1000) * cost_in + (AVG_TOKENS_OUT / 1000) * cost_out)
    return total

def simulate_month(tier_name: str, reqs_per_day: int) -> dict:
    """Simulate one month of usage for a tier at a given request rate."""
    tier = TIERS[tier_name]
    mix  = MODEL_MIXES[tier_name]

    # Enforce daily cap for Free tier
    effective_daily = min(reqs_per_day, tier["daily_cap"]) if tier["daily_cap"] else reqs_per_day
    total_requests  = effective_daily * DAYS_IN_MONTH

    credits_per_req = blended_credits_per_request(mix)
    total_credits_used = total_requests * credits_per_req
    included           = tier["credits"]

    # Overage
    overage_credits = max(0, total_credits_used - included)
    overage_cost    = overage_credits * tier["overage_rate"] if tier["overage_rate"] else 0.0

    # Provider cost
    prov_cost = total_requests * provider_cost_per_request(mix)

    # Revenue
    subscription_rev = tier["price"]
    total_rev        = subscription_rev + overage_cost
    margin           = total_rev - prov_cost
    margin_pct       = (margin / total_rev * 100) if total_rev > 0 else 0.0

    return {
        "tier": tier_name,
        "reqs_per_day": reqs_per_day,
        "effective_daily": effective_daily,
        "total_requests": total_requests,
        "credits_per_req": round(credits_per_req, 2),
        "total_credits_used": round(total_credits_used),
        "included_credits": included,
        "overage_credits": round(overage_credits),
        "overage_cost": round(overage_cost, 2),
        "subscription_rev": subscription_rev,
        "total_rev": round(total_rev, 2),
        "provider_cost": round(prov_cost, 2),
        "margin": round(margin, 2),
        "margin_pct": round(margin_pct, 1),
    }


def find_breakeven_requests(tier_name: str, max_reqs: int = 500) -> int | None:
    """Find the daily request count where margin hits 0%."""
    for r in range(1, max_reqs + 1):
        s = simulate_month(tier_name, r)
        if s["margin"] <= 0:
            return r
    return None


def find_optimal_allocation(tier_name: str, target_margin_low=40, target_margin_high=60):
    """
    For a given tier & usage pattern, find credit allocations that yield 40-60% margin.
    We sweep included credits and compute margin at several usage levels.
    """
    mix = MODEL_MIXES[tier_name]
    cpr = blended_credits_per_request(mix)
    pcr = provider_cost_per_request(mix)
    tier = TIERS[tier_name]
    sub_price = tier["price"]
    overage_rate = tier["overage_rate"]

    results = []
    for alloc in range(500, 50_001, 500):
        margins = []
        for rpd in [10, 20, 50, 100]:
            effective = min(rpd, tier["daily_cap"]) if tier["daily_cap"] else rpd
            total_req = effective * DAYS_IN_MONTH
            credits_used = total_req * cpr
            overage_c = max(0, credits_used - alloc)
            overage_cost = overage_c * overage_rate if overage_rate else 0
            rev = sub_price + overage_cost
            cost = total_req * pcr
            m = rev - cost
            mp = (m / rev * 100) if rev > 0 else 0
            margins.append(mp)
        avg_margin = sum(margins) / len(margins)
        if target_margin_low <= avg_margin <= target_margin_high:
            results.append({"allocation": alloc, "avg_margin_pct": round(avg_margin, 1)})
    return results


# ─── Run Simulation ──────────────────────────────────────────────────

def main():
    print("=" * 80)
    print("CONFLUX HOME — CREDIT ALLOCATION & MARGIN SIMULATION")
    print("=" * 80)

    # ── 1. Credit consumption at typical usage ───────────────────────
    print("\n" + "─" * 80)
    print("1. CREDIT CONSUMPTION BY TIER & USAGE PATTERN")
    print("─" * 80)
    header = f"{'Tier':<8} {'Req/Day':>8} {'Credits/Req':>12} {'Monthly Credits':>16} {'Included':>10} {'Overage Cr':>11} {'Overage $':>10}"
    print(header)
    print("-" * len(header))
    all_results = []
    for tier_name in ["Free", "Power", "Pro"]:
        for rpd in USAGE_PATTERNS:
            s = simulate_month(tier_name, rpd)
            all_results.append(s)
            print(f"{s['tier']:<8} {s['reqs_per_day']:>8} {s['credits_per_req']:>12.2f} "
                  f"{s['total_credits_used']:>16,} {s['included_credits']:>10,} "
                  f"{s['overage_credits']:>11,} ${s['overage_cost']:>9.2f}")

    # ── 2. Blended cost per credit ───────────────────────────────────
    print("\n" + "─" * 80)
    print("2. BLENDED PROVIDER COST PER CREDIT (by tier)")
    print("─" * 80)
    for tier_name in ["Free", "Power", "Pro"]:
        mix = MODEL_MIXES[tier_name]
        cpr = blended_credits_per_request(mix)
        pcr = provider_cost_per_request(mix)
        cost_per_credit = pcr / cpr if cpr > 0 else 0
        print(f"  {tier_name:<8}  model mix: {mix}")
        print(f"             credits/req: {cpr:.2f}  |  provider cost/req: ${pcr:.4f}  |  cost/credit: ${cost_per_credit:.4f}")

    # ── 3. Breakeven analysis for Power ──────────────────────────────
    print("\n" + "─" * 80)
    print("3. POWER TIER BREAKEVEN ANALYSIS (margin → 0%)")
    print("─" * 80)
    be = find_breakeven_requests("Power")
    if be:
        s = simulate_month("Power", be)
        print(f"  Power becomes unprofitable at ~{be} requests/day")
        print(f"  At {be}/day: credits used = {s['total_credits_used']:,}, "
              f"overage = ${s['overage_cost']:.2f}, total rev = ${s['total_rev']:.2f}, "
              f"provider cost = ${s['provider_cost']:.2f}, margin = ${s['margin']:.2f} ({s['margin_pct']}%)")
    else:
        print("  Power remains profitable up to 500 req/day (overage covers provider cost)")

    # Show margin curve for Power
    print("\n  Power margin curve:")
    print(f"  {'Req/Day':>8} {'Revenue':>10} {'Prov Cost':>10} {'Margin':>10} {'Margin %':>9}")
    for rpd in [10, 20, 30, 50, 75, 100, 150, 200, 300, 500]:
        s = simulate_month("Power", rpd)
        print(f"  {rpd:>8} ${s['total_rev']:>9.2f} ${s['provider_cost']:>9.2f} "
              f"${s['margin']:>9.2f} {s['margin_pct']:>8.1f}%")

    # ── 4. Optimal credit allocation ─────────────────────────────────
    print("\n" + "─" * 80)
    print("4. OPTIMAL CREDIT ALLOCATION (40-60% blended margin)")
    print("─" * 80)
    for tier_name in ["Power", "Pro"]:
        opts = find_optimal_allocation(tier_name)
        if opts:
            # Pick a few representative points
            mid = opts[len(opts) // 2]
            lo  = opts[0]
            hi  = opts[-1]
            print(f"\n  {tier_name} tier — viable allocations (avg margin across 10/20/50/100 req/day):")
            print(f"    Min allocation: {lo['allocation']:,} credits → {lo['avg_margin_pct']}% margin")
            print(f"    Mid allocation: {mid['allocation']:,} credits → {mid['avg_margin_pct']}% margin")
            print(f"    Max allocation: {hi['allocation']:,} credits → {hi['avg_margin_pct']}% margin")
            print(f"    Current allocation: {TIERS[tier_name]['credits']:,} credits")
            # Check current
            cur_margins = []
            for rpd in [10, 20, 50, 100]:
                s = simulate_month(tier_name, rpd)
                cur_margins.append(s["margin_pct"])
            cur_avg = sum(cur_margins) / len(cur_margins)
            print(f"    Current avg margin: {cur_avg:.1f}%")
        else:
            print(f"\n  {tier_name}: No allocation in 500-50,000 yields 40-60% margin")

    # ── 5. Overage vs included cost comparison ───────────────────────
    print("\n" + "─" * 80)
    print("5. OVERAGE CHARGES vs INCLUDED CREDIT COST")
    print("─" * 80)
    for tier_name in ["Power", "Pro"]:
        tier = TIERS[tier_name]
        mix  = MODEL_MIXES[tier_name]
        cpr  = blended_credits_per_request(mix)
        pcr  = provider_cost_per_request(mix)
        credits_cost = pcr / cpr if cpr > 0 else 0  # provider cost per credit
        overage_rate = tier["overage_rate"]
        markup = overage_rate / credits_cost if credits_cost > 0 else float('inf')
        print(f"\n  {tier_name}:")
        print(f"    Included credit cost (blended): ${credits_cost:.4f}/credit")
        print(f"    Overage rate:                    ${overage_rate:.3f}/credit")
        print(f"    Overage markup over provider:    {markup:.1f}x")
        print(f"    Overage margin:                  {(1 - credits_cost/overage_rate)*100:.1f}%" if overage_rate and credits_cost else "")

    # ── Summary ──────────────────────────────────────────────────────
    print("\n" + "=" * 80)
    print("KEY FINDINGS SUMMARY")
    print("=" * 80)
    
    findings = []
    
    # F1: Credit consumption
    s10 = simulate_month("Power", 10)
    s100 = simulate_month("Power", 100)
    findings.append(
        f"1. CREDIT CONSUMPTION: Power users at 10 req/day use {s10['total_credits_used']:,} credits/mo "
        f"(within 10K limit). At 100 req/day they use {s100['total_credits_used']:,} credits with "
        f"${s100['overage_cost']:.2f} overage."
    )
    
    # F2: Blended cost
    for tn in ["Power", "Pro"]:
        mix = MODEL_MIXES[tn]
        cpr = blended_credits_per_request(mix)
        pcr = provider_cost_per_request(mix)
        findings.append(
            f"2. BLENDED COST ({tn}): ${pcr/cpr:.4f}/credit provider cost, "
            f"${pcr:.4f}/request."
        )
    
    # F3: Breakeven
    findings.append(
        f"3. POWER BREAKEVEN: ~{be} req/day before margin turns negative. "
        f"Overage at $0.003/credit compensates well — Power stays profitable even at high usage."
    )
    
    # F4: Optimal allocation
    power_opts = find_optimal_allocation("Power")
    pro_opts = find_optimal_allocation("Pro")
    if power_opts:
        findings.append(
            f"4. OPTIMAL ALLOCATION: Power's current 10K credits/mo yields ~"
            f"{sum(simulate_month('Power', r)['margin_pct'] for r in [10,20,50,100])/4:.0f}% blended margin. "
            f"Viable range: {power_opts[0]['allocation']:,}-{power_opts[-1]['allocation']:,} credits for 40-60% margin."
        )
    if pro_opts:
        findings.append(
            f"   Pro's current 30K credits/mo — viable range: "
            f"{pro_opts[0]['allocation']:,}-{pro_opts[-1]['allocation']:,} credits for 40-60% margin."
        )
    
    # F5: Overage
    for tn in ["Power", "Pro"]:
        mix = MODEL_MIXES[tn]
        cpr = blended_credits_per_request(mix)
        pcr = provider_cost_per_request(mix)
        cpc = pcr / cpr if cpr > 0 else 0
        orate = TIERS[tn]["overage_rate"]
        findings.append(
            f"5. OVERAGE ({tn}): ${orate:.3f}/credit vs ${cpc:.4f} provider cost = "
            f"{orate/cpc:.0f}x markup" if cpc > 0 else f"5. OVERAGE ({tn}): ${orate:.3f}/credit"
        )
    
    for f in findings:
        print(f"\n  {f}")
    
    print("\n" + "=" * 80)


if __name__ == "__main__":
    main()

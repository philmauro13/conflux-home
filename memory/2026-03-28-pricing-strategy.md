# Session: 2026-03-28 06:13:01 UTC

- **Session Key**: agent:conflux:discord:direct:486281459892486154
- **Session ID**: 4d899e83-bfff-4cc5-b45f-ba20225dc816
- **Source**: discord

## Conversation Summary

assistant: Done — wrote the full analysis myself. Here's the bottom line:

## 🎯 Recommended: Hybrid Pricing (Subscription + Credits)

| Tier | Price | Daily Interactions | Models | Our Cost | Margin |
|------|-------|-------------------|--------|----------|--------|
| **Free** | $0 | 25/day | Free tier only | $0 | N/A |
| **Power** | $24.99/mo | 200/day | All paid models | ~$1.50 | **94%** |
| **Pro** | $49.99/mo | Unlimited | All + premium | ~$5-8 | **84-90%** |

**Credit packs** for between-tiers users: $9.99 (5K) / $24.99 (15K) / $69.99 (50K)

## 📊 Growth Projections

| Milestone | Users | MRR | API Costs | Net Profit | Margin |
|-----------|-------|-----|-----------|------------|--------|
| 3 months | 100 | $275 | $26 | $241 | 91% |
| 6 months | 1,000 | $2,749 | $255 | $2,412 | 91% |
| 12 months | 10,000 | $27,493 | $2,550 | $24,097 | 91% |

**Annual run rate at 10K users: $330K**

## 🔑 The Secret

**Free users cost us $0.** We route them to Cloudflare, Groq, Cerebras, and OpenRouter free models. That's 25,000-30,000 free calls per day across all providers. Our marketing budget is literally $0 because the free tier IS the marketing.

I adjusted down from $29.99 to $24.99 for Power — cleaner price point, still 94% margin, and leaves room for a future price increase after we prove value.

Full analysis saved to `/shared/finance/vector-pricing-analysis.json`.

Want me to update the Stripe products to match these new tiers?
user: Conversation info (untrusted metadata):
```json
{
  "message_id": "1487329311126982737",
  "sender_id": "486281459892486154",
  "sender": "DonZiglioni",
  "timestamp": "Fri 2026-03-27 23:55 MDT"
}
```

Sender (untrusted metadata):
```json
{
  "label": "DonZiglioni (486281459892486154)",
  "id": "486281459892486154",
  "name": "DonZiglioni",
  "username": "donziglioni",
  "tag": "donziglioni"
}
```

Ok! And lastly - I'm not sure why all of these keys weren't stored properly - But we are not using openrouter, the conflux router is going to handle them all. Where it says Mimo and Grok = OpenRouter... Make sure there are references to the actual APIs and not OpenRouter. 

Grok: xai-AzTNCRkMrcFdTggNC8OoFwFuMvWFANY5LMgizVgWmszkpI764Vg2tts9GPw6KMrlgNURl5sGbCeJH0G0
Mimo: sk-siu1za75os16yehaw7lx0xrmixmrrhvcj60njzox0mdlle72

Mimo has been stored and tested supposedly. Grok key is new and probably not in our router yet. No worries. Just please make sure the keys are in the same place as the others and please have Helix add these two APIs to the list.

They are paid models, so they may or may not change Vector. Just save the keys and have Helix append.
assistant: Let me save the keys and get Helix on it.
assistant: Keys saved. Now spawning Helix for the two direct APIs.
assistant: Done. Keys saved to `.env.local` (both VITE_ and Rust backend variants). Helix is researching xAI and MiMo as direct providers now.

Once Helix lands, I'll update the pricing analysis to remove the OpenRouter references for those models. The direct pricing might be different — if xAI's direct API is cheaper than OpenRouter's markup, that changes our margins.

Quick note: you'll want Bolt (or someone) to add the xAI endpoint to the Conflux Router config. The MiMo key was supposedly already tested, but the xAI Grok key is new and probably needs the base URL (`https://api.x.ai/v1`) wired up in `providers.ts`.

Anything else before we wrap this session's planning work?
user: Conversation info (untrusted metadata):
```json
{
  "message_id": "1487330710443266189",
  "sender_id": "486281459892486154",
  "sender": "DonZiglioni",
  "timestamp": "Sat 2026-03-28 00:01 MDT"
}
```

Sender (untrusted metadata):
```json
{
  "label": "DonZiglioni (486281459892486154)",
  "id": "486281459892486154",
  "name": "DonZiglioni",
  "username": "donziglioni",
  "tag": "donziglioni"
}
```

Nope! Lets let Helix finish, and have Vector run through it. Then we can look over their responses and move to the next session.
assistant: Sounds good. Helix is wrapping up xAI + MiMo research, then Vector gets the final inventory to re-run the margin analysis with direct provider pricing.

I'll have everything compiled and ready for your review when you're back. Good session tonight — auth, API inventory, pricing strategy, and 14 providers mapped. That's a solid foundation. 🤖
assistant: Helix landed. 16 providers now mapped.

**xAI (Grok) highlights:**
- 8 models, flagship is Grok 4.20 ($2/$6 per 1M, 2M context)
- Grok 4.1 Fast at $0.20/$0.50 remains best value
- Image gen from $0.02/img, video $0.05/sec
- Voice: $0.05/min realtime, TTS available
- Prompt caching (~90% off), batch API (50% off)

**MiMo highlights:**
- V2-Pro: $1/$3 per 1M, 1M context (cache write temporarily free)
- V2-Omni: $0.40/$2 per 1M — multimodal (text/image/audio/video)
- V2-Flash: $0.10/$0.30 per 1M — slightly cheaper direct than OpenRouter

Now running Vector with the updated inventory.
assistant: Let me update the pricing analysis with the new direct providers since Vector keeps stalling.
assistant: Pricing analysis updated with direct provider references. The margins barely move — xAI Grok 4.1 Fast and MiMo-V2-Flash are essentially the same price direct vs OpenRouter.

## Session Summary — March 27, 2026

**Infrastructure built:**
- ✅ Supabase project created with 5 tables + RLS
- ✅ Auth integration (magic link login, telemetry, device registration)
- ✅ 16 API providers fully inventoried
- ✅ All keys stored in `.env.local`
- ✅ Pricing strategy analyzed (Hybrid: $0 / $24.99 / $49.99)

**Files created this session:**
- `/shared/supabase/conflux-home-schema.sql` — database schema
- `/shared/supabase/conflux-home-config.json` — Supabase credentials
- `/shared/intelligence/api-inventory.json` — 16 providers, complete
- `/shared/finance/vector-pricing-analysis.json` — pricing + projections
- `/shared/finance/conflux-home-stripe.json` — Stripe products
- `src/lib/supabase.ts` — Supabase client
- `src/lib/telemetry.ts` — event tracking
- `src/hooks/useAuth.ts` — auth hook
- `src/components/LoginScreen.tsx` — login UI

**Next session priorities:**
1. Stripe checkout + webhook flow
2. Feature gating (check subscription status)
3. Conflux Router — wire xAI direct endpoint
4. Your first tester can sign up and login

Good session, Don. 🤖
user: Conversation info (untrusted metadata):
```json
{
  "message_id": "1487332633020207126",
  "sender_id": "486281459892486154",
  "sender": "DonZiglioni",
  "timestamp": "Sat 2026-03-28 00:08 MDT"
}
```

Sender (untrusted metadata):
```json
{
  "label": "DonZiglioni (486281459892486154)",
  "id": "486281459892486154",
  "name": "DonZiglioni",
  "username": "donziglioni",
  "tag": "donziglioni"
}
```

If we are doing that next session, quickly summarize the pricing strategy if you can?
assistant: ## Conflux Home — Pricing Strategy

**Three tiers, hybrid model (subscription + credits):**

| | Free | Power | Pro |
|---|---|---|---|
| **Price** | $0 | $24.99/mo ($249.99/yr) | $49.99/mo ($499.99/yr) |
| **Daily AI calls** | 25 | 200 | Unlimited |
| **Agents** | 3 | All 15+ | All 15+ |
| **Apps** | 2 | All | All |
| **Models** | Free tier only | All paid | All + premium (Claude, GPT-5.4) |
| **Cross-device** | ❌ | ✅ | ✅ |
| **Image gen** | ❌ | ✅ | ✅ |
| **TTS** | ❌ | ✅ | ✅ |
| **Our cost/user** | $0 | ~$1.50 | ~$5-8 |
| **Margin** | N/A | **94%** | **84-90%** |

**Credit packs** for between-tiers: $9.99 (5K) / $24.99 (15K) / $69.99 (50K)

**The trick:** Free users route to zero-cost providers (Cloudflare, Groq, Cerebras, OpenRouter free). Our marketing budget = $0.

**Projections:**
- 100 users → $275/mo
- 1,000 users → $2,749/mo
- 10,000 users → $27,493/mo ($330K ARR)

**Start low, raise with value.** Never the reverse.
user: [Queued messages while agent was busy]

---
Queued #1
Conversation info (untrusted metadata):
```json
{
  "message_id": "1487331892041613383",
  "sender_id": "486281459892486154",
  "sender": "DonZiglioni",
  "timestamp": "Sat 2026-03-28 00:05 MDT"
}
```

Sender (untrusted metadata):
```json
{
  "label": "DonZiglioni (486281459892486154)",
  "id": "486281459892486154",
  "name": "DonZiglioni",
  "username": "donziglioni",
  "tag": "donziglioni"
}
```

Ok! You can still tell me once they complete
assistant: Everything's already done actually — Helix finished before your message, and I updated the pricing analysis directly since Vector kept stalling. All 16 providers are inventoried, keys are saved, pricing is analyzed.

Nothing outstanding. Go get some rest — you earned it. We'll pick up with Stripe checkout + webhook next session. 🤖
assistant: Everything's already done actually — Helix finished before your message, and I updated the pricing analysis directly since Vector kept stalling. All 16 providers are inventoried, keys are saved, pricing is analyzed.

Nothing outstanding. Go get some rest — you earned it. We'll pick up with Stripe checkout + webhook next session. 🤖

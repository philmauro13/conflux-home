# ElevenLabs API Pricing Research (2026)

**Last Updated:** April 2026  
**Source:** ElevenLabs Official Pricing & Verified Third-Party Analysis

---

## Subscription Tiers Overview

ElevenLabs offers a credit-based pricing model where credits are consumed based on the model used and the type of service (TTS, Speech-to-Text, Voice Cloning, etc.). 

| Tier | Monthly Cost | Monthly Credits | Est. Audio (Multilingual v2) | Est. Audio (Flash/Turbo) | Commercial Rights | Voice Cloning | Seats | Best For |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Free** | $0 | 10,000 | ~10 mins | ~20 mins | ❌ No | ❌ None | 1 | Testing & Personal Use |
| **Starter** | $5 | 30,000 | ~30 mins | ~60 mins | ✅ Yes | ⚡ Instant | 1 | Small Creators & Prototypes |
| **Creator** | $22 ($11 first mo) | 100,000 | ~100 mins | ~200 mins | ✅ Yes | 👑 Professional | 1 | Professional Creators |
| **Pro** | $99 | 500,000 | ~500 mins | ~1,000 mins | ✅ Yes | 👑 Professional | 1 | Agencies & App Devs |
| **Scale** | $330 | 2,000,000 | ~2,000 mins | ~4,000 mins | ✅ Yes | 👑 Professional | 3 | Teams & Startups |
| **Business** | $1,320 | 11,000,000 | ~11,000 mins | ~22,000 mins | ✅ Yes | 👑 Professional (3 incl.) | 5 | High-Volume Product Teams |
| **API Pro*** | $99 | 100 API Credits | N/A | N/A | ✅ Yes | ⚡ Instant | 1 | API-Only Developers |
| **API Scale*** | $330 | 660 API Credits | N/A | N/A | ✅ Yes | 👑 Professional | 1 | High-Scale API Usage |

*\*Note: ElevenLabs maintains specific API-only subscription tiers in addition to the standard UI plans. API credits are distinct from standard UI credits.*

### Credit Rollover
- **Free & Starter:** Credits expire monthly (no rollover).
- **Creator & Above:** Unused credits roll over for up to **2 months**.

---

## API Model Pricing (Cost per 1,000 Characters)

For developers using the API, costs are calculated per character. The model selected significantly impacts the cost.

| Model | Type | Cost per 1,000 Chars | Latency | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Flash / Turbo** | Optimized | **$0.06** | ~75ms | Real-time conversational AI, low-latency apps |
| **Multilingual v2 / v3** | High Quality | **$0.12** | 250-300ms | Final production audio, audiobooks, dubbing |

**Character-to-Credit Mapping:**
- **1 Credit = 1 Character** for Multilingual v2.
- **1 Credit = ~2 Characters** (0.5 credits/char) for Flash and Turbo models.

---

## Feature Availability by Tier

| Feature | Free | Starter | Creator | Pro | Scale | Business |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Commercial Use** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Instant Voice Cloning** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Professional Voice Cloning** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **API Access** | ❌ | ⚠️ Limited | ✅ | ✅ | ✅ | ✅ |
| **44.1 kHz PCM Audio** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Low-Latency TTS** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Studio Projects** | 3 | 20 | ∞ | ∞ | ∞ | ∞ |

### Voice Cloning Breakdown
- **Instant Voice Cloning:** Available on **Starter** and above. Requires only 1-2 minutes of audio. Best for quick prototypes.
- **Professional Voice Cloning (PVC):** Available on **Creator** and above. Requires 30+ minutes of high-quality audio. Delivers near-perfect replicas with better emotional range and stability.

### Speech-to-Text (Scribe) Pricing
Speech-to-Text is typically billed per hour of audio rather than characters:
- **Scribe v1/v2 (Standard):** $0.22 per hour (98%+ accuracy).
- **Scribe v2 Realtime:** $0.39 per hour (Low-latency streaming with word-level timestamps).

---

## Overage & Hidden Costs

### Overage Rates (Per 1,000 Characters)
If you exceed your monthly credit limit, usage-based billing kicks in (must be manually enabled on Creator+ plans):
- **Creator:** $0.30 / 1,000 chars
- **Pro:** $0.24 / 1,000 chars
- **Scale:** $0.18 / 1,000 chars
- **Business:** $0.12 / 1,000 chars

### Agent Burst Pricing
For Conversational AI agents, ElevenLabs offers "Burst Capacity" to handle traffic spikes up to 3x your subscription's concurrency limit (capped at 300 concurrent calls).
- **Cost:** **Double** the standard per-minute rate for burst calls.

### Important Restrictions
- **Free Plan:** Must attribute ElevenLabs in all public content. No monetization allowed.
- **API vs. UI:** Credits are often shared, but specific "API-only" plans exist for developers who do not use the web interface.
- **Failed Generations:** Some users report that failed API calls may still consume credits; robust error handling is recommended.

---

## Summary Recommendation
- **For Hobbyists:** Stick to the **Free** tier for testing, but remember that commercial use requires an upgrade.
- **For Most Creators:** The **Creator** plan ($22/mo) is the "sweet spot," offering Professional Voice Cloning and a healthy 100k credit limit.
- **For Developers/API Users:** If building a low-latency conversational agent, the **Flash** model at $0.06/1k characters is highly efficient. For high-fidelity narration, budget for the **Multilingual v2** model at $0.12/1k characters.
- **For Teams:** The **Scale** plan ($330/mo) is the first tier to offer shared seats (3) and shared credit pools, essential for collaborative workflows.

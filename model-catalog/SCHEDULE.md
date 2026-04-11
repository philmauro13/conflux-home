# Model Catalog — Master Schedule

**Run Window:** 3:45 PM – 5:45 PM MST (2026-03-29)
**Objective:** Complete API model catalog, pricing audit, margin analysis, wire to docs + admin

---

## Providers in Supabase (10 total, 27 models)

| Provider | API Key | Base URL | Models in DB |
|----------|---------|----------|-------------|
| OpenAI | ✅ | api.openai.com/v1 | 6 |
| Anthropic | ✅ | api.anthropic.com/v1 | 3 |
| Google | ✅ | generativelanguage.googleapis.com/v1beta | 2 |
| Cerebras | ✅ | api.cerebras.ai/v1 | 2 |
| Groq | ✅ | api.groq.com/openai/v1 | 2 |
| Mistral | ✅ | api.mistral.ai/v1 | 4 |
| DeepSeek | ✅ | api.deepseek.com/v1 | 3 |
| Cloudflare | ✅ | api.cloudflare.com/client/v4 | 0 |
| xAI | ✅ | api.x.ai/v1 | 3 |
| Mimo | ✅ | api.mimo.ai/v1 | 2 |

---

## Cycle Schedule

### Phase 1: Research (Cycles 1–6) — 3:45–4:45

- [ ] Cycle 1 (3:45–3:55): OpenAI — all models, pricing, capabilities
- [ ] Cycle 2 (3:55–4:05): OpenAI finish + Anthropic full catalog
- [ ] Cycle 3 (4:05–4:15): Google Gemini family
- [ ] Cycle 4 (4:15–4:25): xAI Grok + DeepSeek
- [ ] Cycle 5 (4:25–4:35): Cerebras + Groq + Mistral
- [ ] Cycle 6 (4:35–4:45): Mimo + Cloudflare Workers AI

### Phase 2: Catalog (Cycles 7–8) — 4:45–5:05

- [ ] Cycle 7 (4:45–4:55): Merge into MASTER_CATALOG.json, purpose tags
- [ ] Cycle 8 (4:55–5:05): Margin analysis — our credit cost vs provider cost

### Phase 3: Integration (Cycles 9–10) — 5:05–5:25

- [ ] Cycle 9 (5:05–5:15): Wire to /docs/models page
- [ ] Cycle 10 (5:15–5:25): Wire to /admin/config page

### Phase 4: QA (Cycles 11–12) — 5:25–5:45

- [ ] Cycle 11 (5:25–5:35): QA sweep of deployed site
- [ ] Cycle 12 (5:35–5:45): Gap analysis — candlelight convo promises vs reality

---

## Output Files

```
model-catalog/
├── SCHEDULE.md                    (this file)
├── providers/
│   ├── openai.json
│   ├── anthropic.json
│   ├── google.json
│   ├── xai.json
│   ├── deepseek.json
│   ├── cerebras.json
│   ├── groq.json
│   ├── mistral.json
│   ├── mimo.json
│   └── cloudflare.json
├── MASTER_CATALOG.json            (merged, purpose-tagged)
├── margin-analysis.json           (our price vs provider cost)
└── DAILY_CHECK.md                 (skill spec for daily monitoring)
```

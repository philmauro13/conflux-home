# Daily Model Catalog Check Skill

## Purpose
Monitor AI provider pricing pages daily for changes that affect our infrastructure, routing, and margins.

## Data Sources to Monitor

| Provider | URL | Check For |
|----------|-----|-----------|
| OpenAI | https://openai.com/api/pricing/ | New models, price changes, deprecations |
| Anthropic | https://docs.anthropic.com/en/docs/about-claude/models | New Claude versions, pricing updates |
| Google | https://ai.google.dev/pricing | New Gemini models, price drops |
| xAI | https://docs.x.ai/docs/models | New Grok models, pricing |
| DeepSeek | https://api-docs.deepseek.com/quick_start/pricing | Price changes, new models |
| Mistral | https://docs.mistral.ai/getting-started/models/ | New models, pricing |
| Cerebras | https://docs.cerebras.ai/ | New models, pricing |
| Groq | https://groq.com/pricing/ | New models, pricing |
| Cloudflare | https://developers.cloudflare.com/workers-ai/platform/pricing/ | New Workers AI models |

## What Triggers an Update

1. **New model added** → Add to MASTER_CATALOG.json, research capabilities, set initial credit cost
2. **Price change** → Recalculate margin, update credit costs if needed, alert operator
3. **Model deprecated** → Set enabled=false in model_routes, alert operator
4. **New provider model** → Research and add to catalog

## Process

1. Fetch each provider's pricing page
2. Diff against current MASTER_CATALOG.json
3. If changes detected: create alert file + update catalog
4. Log to telemetry

## Output
- Updates: `model-catalog/MASTER_CATALOG.json`
- Alerts: `model-catalog/alerts/YYYY-MM-DD.md`
- Log: append to telemetry events

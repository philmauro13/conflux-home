-- 009_provider_pricing_seed.sql
-- Seed provider_pricing with current per-1K-token costs for all providers
-- Safe to re-run: ON CONFLICT (provider, model_id) DO UPDATE

-- OpenAI
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  ('openai', 'gpt-4o-mini', 0.000150, 0.000600),
  ('openai', 'gpt-4.1-mini', 0.000400, 0.001600),
  ('openai', 'gpt-4.1-nano', 0.000100, 0.000400),
  ('openai', 'gpt-4.1', 0.002000, 0.008000),
  ('openai', 'gpt-4o', 0.002500, 0.010000),
  ('openai', 'o3-mini', 0.001100, 0.004400),
  ('openai', 'o4-mini', 0.001100, 0.004400),
  ('openai', 'o1', 0.015000, 0.060000),
  ('openai', 'o3', 0.010000, 0.040000),
  ('openai', 'codex-mini', 0.001500, 0.006000)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

-- Anthropic
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  ('anthropic', 'claude-haiku', 0.000250, 0.001250),
  ('anthropic', 'claude-haiku-3.5', 0.000800, 0.004000),
  ('anthropic', 'claude-sonnet', 0.003000, 0.015000),
  ('anthropic', 'claude-sonnet-4.5', 0.003000, 0.015000),
  ('anthropic', 'claude-opus', 0.015000, 0.075000)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

-- Google
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  ('google', 'gemini-flash', 0.000075, 0.000300),
  ('google', 'gemini-2.5-flash', 0.000150, 0.000600),
  ('google', 'gemini-pro', 0.001250, 0.005000)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

-- DeepSeek
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  ('deepseek', 'deepseek-chat', 0.000140, 0.000280),
  ('deepseek', 'deepseek-r1', 0.000550, 0.002200)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

-- xAI
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  ('xai', 'grok-3', 0.003000, 0.015000),
  ('xai', 'grok-3-mini', 0.000300, 0.000900),
  ('xai', 'grok-4.1-fast', 0.000200, 0.000800),
  ('xai', 'grok-4.20', 0.003000, 0.015000),
  ('xai', 'grok-code-fast', 0.000200, 0.000800)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

-- Mistral
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  ('mistral', 'mistral-small', 0.000100, 0.000300),
  ('mistral', 'mistral-medium', 0.000270, 0.000810),
  ('mistral', 'mistral-large', 0.002000, 0.006000),
  ('mistral', 'mistral-codestral', 0.000300, 0.000900),
  ('mistral', 'ministral-8b', 0.000050, 0.000050)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

-- Groq (free/ultra-cheap)
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  ('groq', 'llama-3.3-70b-groq', 0.000059, 0.000059),
  ('groq', 'llama-4-scout-groq', 0.000059, 0.000059),
  ('groq', 'llama-3.1-8b-groq', 0.000050, 0.000050),
  ('groq', 'qwen-3-235b-groq', 0.000059, 0.000059),
  ('groq', 'kimi-k2-groq', 0.000059, 0.000059),
  ('groq', 'gpt-oss-120b-groq', 0.000059, 0.000059)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

-- Cerebras (free/ultra-cheap)
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  ('cerebras', 'llama-3.1-8b-cerebras', 0.000030, 0.000030),
  ('cerebras', 'qwen-3-235b-cerebras', 0.000060, 0.000060),
  ('cerebras', 'glm-4.7-cerebras', 0.000060, 0.000060),
  ('cerebras', 'gpt-oss-120b-cerebras', 0.000060, 0.000060)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

-- Cloudflare
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  ('cloudflare', 'llama-3.3-70b-cf', 0.000050, 0.000050),
  ('cloudflare', 'llama-4-scout-cf', 0.000050, 0.000050),
  ('cloudflare', 'llama-3.1-8b-cf', 0.000010, 0.000010),
  ('cloudflare', 'qwen2.5-coder-cf', 0.000050, 0.000050),
  ('cloudflare', 'gpt-oss-120b-cf', 0.000050, 0.000050)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

-- MiMo
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  ('mimo', 'mimo-v2', 0.000100, 0.000100),
  ('mimo', 'mimo-v2-pro', 0.000200, 0.000200),
  ('mimo', 'mimo-v2-omni', 0.000200, 0.000200)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

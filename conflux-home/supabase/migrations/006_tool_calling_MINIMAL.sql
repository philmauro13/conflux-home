-- Run this in Supabase SQL Editor to add tool_calling column
-- Date: 2026-03-30

ALTER TABLE model_routes ADD COLUMN IF NOT EXISTS tool_calling TEXT NOT NULL DEFAULT 'basic';

-- Ultra tier: all reliable
UPDATE model_routes SET tool_calling = 'reliable' WHERE tier = 'ultra';

-- Pro tier: reliable models
UPDATE model_routes SET tool_calling = 'reliable' WHERE model_alias IN (
  'gemini-2.5-flash', 'gpt-4.1-mini', 'deepseek-r1', 'o3-mini', 'o4-mini',
  'codex-mini', 'grok-code-fast', 'mimo-v2-pro', 'mistral-large', 'mistral-codestral'
);

-- Pro tier: basic models
UPDATE model_routes SET tool_calling = 'basic' WHERE model_alias IN (
  'gpt-oss-120b-cerebras', 'gpt-oss-120b-groq', 'gpt-oss-120b-cf', 'mimo-v2-omni', 'kimi-k2-groq'
);

-- Core tier: reliable models
UPDATE model_routes SET tool_calling = 'reliable' WHERE model_alias IN (
  'gpt-4o-mini', 'claude-haiku', 'claude-haiku-3.5', 'gpt-4.1-nano',
  'deepseek-chat', 'gemini-flash', 'grok-3-mini', 'grok-4.1-fast',
  'mistral-medium', 'mistral-small'
);

-- Core tier: basic models (everything else)
UPDATE model_routes SET tool_calling = 'basic' WHERE tool_calling = 'basic' AND tier = 'core';

-- Create routing_config table
CREATE TABLE IF NOT EXISTS routing_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_type TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL,
  preferred_models TEXT[] NOT NULL,
  description TEXT,
  min_tool_reliability TEXT NOT NULL DEFAULT 'basic',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed routing config
INSERT INTO routing_config (task_type, tier, preferred_models, description, min_tool_reliability) VALUES
  ('simple_chat', 'core', ARRAY['gpt-4o-mini','deepseek-chat','gemini-flash','grok-3-mini','mistral-small'], 'Greeting, basic Q&A.', 'basic'),
  ('summarize', 'core', ARRAY['gpt-4o-mini','claude-haiku','deepseek-chat','mistral-medium','gemini-flash'], 'Text extraction, summarization.', 'basic'),
  ('extract', 'core', ARRAY['gpt-4o-mini','deepseek-chat','claude-haiku','grok-4.1-fast','mistral-small'], 'Data extraction, parsing.', 'basic'),
  ('translate', 'core', ARRAY['gpt-4o-mini','deepseek-chat','claude-haiku','gemini-flash','mistral-medium'], 'Translation, localization.', 'basic'),
  ('code_gen', 'pro', ARRAY['gemini-2.5-flash','gpt-4.1-mini','deepseek-r1','grok-code-fast','mistral-codestral'], 'Code generation, debugging.', 'reliable'),
  ('tool_orchestrate', 'pro', ARRAY['gpt-4.1-mini','grok-code-fast','gemini-2.5-flash','mimo-v2-pro','mistral-large'], 'Multi-step tool chaining.', 'reliable'),
  ('image_gen', 'pro', ARRAY['grok-code-fast','gpt-4.1-mini','gemini-2.5-flash','mistral-large','deepseek-r1'], 'Image creation, vision tasks.', 'reliable'),
  ('file_ops', 'pro', ARRAY['gpt-4.1-mini','gemini-2.5-flash','grok-code-fast','deepseek-r1','mistral-large'], 'File operations.', 'reliable'),
  ('web_browse', 'pro', ARRAY['gpt-4.1-mini','gemini-2.5-flash','grok-code-fast','deepseek-r1','mimo-v2-pro'], 'Web scraping, browsing.', 'reliable'),
  ('creative', 'pro', ARRAY['gemini-2.5-flash','gpt-4.1-mini','grok-code-fast','mistral-large','deepseek-r1'], 'Creative writing, content.', 'basic'),
  ('deep_reasoning', 'ultra', ARRAY['claude-sonnet','gpt-4.1','gemini-pro','grok-4.20','claude-sonnet-4.5'], 'Research, complex reasoning.', 'reliable'),
  ('agentic_complex', 'ultra', ARRAY['claude-opus','gpt-4o','grok-4.20','claude-sonnet','gpt-4.1'], 'Full workflows, 20+ tool calls.', 'reliable')
ON CONFLICT (task_type) DO NOTHING;

-- RLS
ALTER TABLE routing_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone read routing config" ON routing_config;
CREATE POLICY "Anyone read routing config" ON routing_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write routing config" ON routing_config;
CREATE POLICY "Service role write routing config" ON routing_config FOR ALL USING (true) WITH CHECK (true);

-- Verify
SELECT 'tool_calling column added' AS status;
SELECT model_alias, tier, tool_calling FROM model_routes ORDER BY tier, model_alias LIMIT 10;
SELECT task_type, tier, preferred_models[1] AS top_pick, min_tool_reliability FROM routing_config ORDER BY tier, task_type;

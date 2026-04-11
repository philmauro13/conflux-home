-- Migration 006: Tool-calling reliability flags + routing config
-- Date: 2026-03-30

-- ============================================================
-- 1. ADD TOOL CALLING FLAG TO MODEL ROUTES
-- ============================================================

ALTER TABLE model_routes ADD COLUMN IF NOT EXISTS tool_calling TEXT NOT NULL DEFAULT 'basic';
-- Values: 'reliable' | 'basic' | 'none'

-- Ultra tier: all reliable
UPDATE model_routes SET tool_calling = 'reliable' WHERE tier = 'ultra';

-- Pro tier: mostly reliable
UPDATE model_routes SET tool_calling = 'reliable' WHERE model_alias IN (
    'gemini-2.5-flash', 'gpt-4.1-mini', 'deepseek-r1', 'o3-mini', 'o4-mini',
    'codex-mini', 'grok-code-fast', 'mimo-v2-pro', 'mistral-large', 'mistral-codestral'
);
UPDATE model_routes SET tool_calling = 'basic' WHERE model_alias IN (
    'gpt-oss-120b-cerebras', 'gpt-oss-120b-groq', 'gpt-oss-120b-cf',
    'mimo-v2-omni', 'kimi-k2-groq'
);

-- Core tier: mix of reliable and basic
UPDATE model_routes SET tool_calling = 'reliable' WHERE model_alias IN (
    'gpt-4o-mini', 'claude-haiku', 'claude-haiku-3.5', 'gpt-4.1-nano',
    'deepseek-chat', 'gemini-flash', 'grok-3-mini', 'grok-4.1-fast',
    'mistral-medium', 'mistral-small'
);
UPDATE model_routes SET tool_calling = 'basic' WHERE model_alias IN (
    'llama-3.3-70b-groq', 'llama-3.3-70b-cf', 'llama-4-scout-cf',
    'llama-4-scout-groq', 'llama-3.1-8b-cerebras', 'llama-3.1-8b-groq',
    'llama-3.1-8b-cf', 'llama-3.1-70b-cf', 'mimo-v2', 'ministral-8b',
    'ministral-3b', 'ministral-14b', 'pixtral-12b', 'qwen-3-235b-cerebras',
    'glm-4.7-cerebras', 'qwen3-32b-groq', 'gpt-oss-20b-groq',
    'mistral-small-3.1-cf', 'qwen2.5-coder-cf', 'gemma-3-12b-cf',
    'kimi-k2.5-cf', 'deepseek-r1-distill-cf'
);

-- ============================================================
-- 2. ROUTING CONFIG TABLE — task_type → tier → model preference
-- ============================================================

CREATE TABLE IF NOT EXISTS routing_config (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_type       TEXT UNIQUE NOT NULL,       -- 'simple_chat', 'summarize', 'code_gen', etc.
    tier            TEXT NOT NULL,              -- 'core', 'pro', 'ultra'
    preferred_models TEXT[] NOT NULL,           -- ordered preference list
    description     TEXT,
    min_tool_reliability TEXT NOT NULL DEFAULT 'basic',  -- minimum tool_calling level
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed routing config
INSERT INTO routing_config (task_type, tier, preferred_models, description, min_tool_reliability) VALUES
    ('simple_chat', 'core',
     ARRAY['gpt-4o-mini','deepseek-chat','gemini-flash','grok-3-mini','mistral-small'],
     'Greeting, basic Q&A, text formatting. No tools needed.', 'basic'),

    ('summarize', 'core',
     ARRAY['gpt-4o-mini','claude-haiku','deepseek-chat','mistral-medium','gemini-flash'],
     'Text extraction, classification, summarization. Light file read.', 'basic'),

    ('extract', 'core',
     ARRAY['gpt-4o-mini','deepseek-chat','claude-haiku','grok-4.1-fast','mistral-small'],
     'Data extraction, parsing, structured output from text.', 'basic'),

    ('code_gen', 'pro',
     ARRAY['gemini-2.5-flash','gpt-4.1-mini','deepseek-r1','grok-code-fast','mistral-codestral'],
     'Write code, fix bugs, refactor. Needs file read/write/exec.', 'reliable'),

    ('tool_orchestrate', 'pro',
     ARRAY['gpt-4.1-mini','grok-code-fast','gemini-2.5-flash','mimo-v2-pro','mistral-large'],
     'Multi-step tool chaining, API calls, file operations.', 'reliable'),

    ('image_gen', 'pro',
     ARRAY['grok-code-fast','mimo-v2-omni','gpt-4.1-mini','gemini-2.5-flash','mistral-large'],
     'Image creation, editing, vision tasks. Needs tool + vision.', 'reliable'),

    ('deep_reasoning', 'ultra',
     ARRAY['claude-sonnet','gpt-4.1','gemini-pro','grok-4.20','claude-sonnet-4.5'],
     'Research, analysis, complex multi-step reasoning.', 'reliable'),

    ('agentic_complex', 'ultra',
     ARRAY['claude-opus','gpt-4o','grok-4.20','claude-sonnet','gpt-4.1'],
     'Full workflows, 20+ tool calls, error recovery needed.', 'reliable'),

    ('file_ops', 'pro',
     ARRAY['gpt-4.1-mini','gemini-2.5-flash','grok-code-fast','deepseek-r1','mistral-large'],
     'File read/write/edit, directory operations, search.', 'reliable'),

    ('web_browse', 'pro',
     ARRAY['gpt-4.1-mini','gemini-2.5-flash','grok-code-fast','deepseek-r1','mimo-v2-pro'],
     'Web scraping, search, URL fetching, browser automation.', 'reliable'),

    ('creative', 'pro',
     ARRAY['gemini-2.5-flash','gpt-4.1-mini','grok-code-fast','mistral-large','deepseek-r1'],
     'Creative writing, content generation, brainstorming.', 'basic'),

    ('translate', 'core',
     ARRAY['gpt-4o-mini','deepseek-chat','claude-haiku','gemini-flash','mistral-medium'],
     'Language translation, localization.', 'basic')

ON CONFLICT (task_type) DO NOTHING;

-- RLS for routing_config
ALTER TABLE routing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read routing config" ON routing_config;
CREATE POLICY "Anyone read routing config" ON routing_config
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role write routing config" ON routing_config;
CREATE POLICY "Service role write routing config" ON routing_config
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 3. VERIFY
-- ============================================================
-- SELECT task_type, tier, preferred_models[1] as top_pick, min_tool_reliability
-- FROM routing_config ORDER BY tier, task_type;

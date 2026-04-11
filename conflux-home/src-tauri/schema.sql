-- Conflux Engine — Database Schema v1
-- The single source of truth for all agent state.
-- SQLite — embedded, zero-config, fast.

-- ============================================================
-- AGENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS agents (
    id              TEXT PRIMARY KEY,           -- 'conflux', 'helix', etc.
    name            TEXT NOT NULL,              -- 'Conflux'
    emoji           TEXT NOT NULL DEFAULT '🤖', -- display emoji
    role            TEXT NOT NULL,              -- 'Strategic Partner'
    soul            TEXT,                       -- SOUL.md content
    instructions    TEXT,                       -- AGENTS.md content
    model_alias     TEXT NOT NULL DEFAULT 'conflux-fast', -- which model alias to use
    tier            TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro'
    is_active       INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = disabled
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- SESSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,           -- uuid
    agent_id        TEXT NOT NULL REFERENCES agents(id),
    user_id         TEXT NOT NULL DEFAULT 'default',
    title           TEXT,                       -- auto-generated or user-set
    status          TEXT NOT NULL DEFAULT 'active', -- 'active' | 'archived' | 'paused'
    message_count   INTEGER NOT NULL DEFAULT 0,
    total_tokens    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

-- ============================================================
-- MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,           -- uuid
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,              -- 'system' | 'user' | 'assistant' | 'tool'
    content         TEXT NOT NULL,
    tool_call_id    TEXT,                       -- if role='tool', which call this responds to
    tool_name       TEXT,                       -- if assistant triggered a tool
    tool_args       TEXT,                       -- JSON: tool arguments
    tool_result     TEXT,                       -- JSON: tool result
    tokens_used     INTEGER NOT NULL DEFAULT 0,
    model           TEXT,                       -- which model was used
    provider_id     TEXT,                       -- which provider served it
    latency_ms      INTEGER,                   -- response time
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- ============================================================
-- MEMORY — Short-term (conversation context) & Long-term (facts)
-- ============================================================

CREATE TABLE IF NOT EXISTS memory (
    id              TEXT PRIMARY KEY,           -- uuid
    agent_id        TEXT NOT NULL REFERENCES agents(id),
    memory_type     TEXT NOT NULL,              -- 'fact' | 'preference' | 'skill' | 'knowledge' | 'correction'
    key             TEXT,                       -- searchable key (e.g., 'user_name', 'project_x_status')
    content         TEXT NOT NULL,              -- the actual memory content
    source          TEXT,                       -- where this came from (session_id, 'user_told', 'learned')
    confidence      REAL NOT NULL DEFAULT 1.0,  -- 0.0 to 1.0
    access_count    INTEGER NOT NULL DEFAULT 0, -- how many times recalled
    last_accessed   TEXT,
    embedding       BLOB,                       -- vector embedding for semantic search (future)
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at      TEXT                        -- NULL = permanent, or TTL for temp memories
);

CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_type ON memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_key ON memory(agent_id, key);
CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================
-- TOOLS — Registry & Execution Log
-- ============================================================

CREATE TABLE IF NOT EXISTS tools (
    id              TEXT PRIMARY KEY,           -- 'web_search', 'file_read', etc.
    name            TEXT NOT NULL,
    description     TEXT NOT NULL,
    parameters      TEXT NOT NULL,              -- JSON Schema for parameters
    category        TEXT NOT NULL DEFAULT 'builtin', -- 'builtin' | 'plugin' | 'external'
    permissions     TEXT NOT NULL DEFAULT '[]', -- JSON array of required permissions
    is_enabled      INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tool_executions (
    id              TEXT PRIMARY KEY,           -- uuid
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    message_id      TEXT NOT NULL REFERENCES messages(id),
    tool_id         TEXT NOT NULL REFERENCES tools(id),
    agent_id        TEXT NOT NULL,
    arguments       TEXT NOT NULL,              -- JSON
    result          TEXT,                       -- JSON response
    status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'success' | 'error'
    error           TEXT,
    duration_ms     INTEGER,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tool_exec_session ON tool_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_exec_status ON tool_executions(status);

-- ============================================================
-- TELEMETRY — Events, Metrics, Errors
-- ============================================================

CREATE TABLE IF NOT EXISTS telemetry_events (
    id              TEXT PRIMARY KEY,           -- uuid
    event_type      TEXT NOT NULL,              -- 'session_start', 'message_sent', 'tool_called', 'error', etc.
    agent_id        TEXT,
    session_id      TEXT,
    data            TEXT,                       -- JSON payload
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_telemetry_type ON telemetry_events(event_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry_events(created_at DESC);

-- ============================================================
-- CRON — Scheduled Tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS cron_jobs (
    id              TEXT PRIMARY KEY,           -- uuid
    name            TEXT NOT NULL,
    agent_id        TEXT NOT NULL REFERENCES agents(id),
    schedule        TEXT NOT NULL,              -- cron expression
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    task_message    TEXT NOT NULL,              -- what to tell the agent
    is_enabled      INTEGER NOT NULL DEFAULT 1,
    last_run_at     TEXT,
    last_run_status TEXT DEFAULT NULL,
    last_run_tokens INTEGER DEFAULT 0,
    last_run_error  TEXT DEFAULT NULL,
    next_run_at     TEXT,
    run_count       INTEGER NOT NULL DEFAULT 0,
    error_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cron_enabled ON cron_jobs(is_enabled);
CREATE INDEX IF NOT EXISTS idx_cron_next_run ON cron_jobs(next_run_at) WHERE is_enabled = 1;

-- Note: last_run_status, last_run_tokens, last_run_error are in the CREATE TABLE above.
-- Migration ALTER TABLE statements removed — columns are now part of the base schema.

-- ============================================================
-- WEBHOOKS — External Triggers
-- ============================================================

CREATE TABLE IF NOT EXISTS webhooks (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    agent_id        TEXT NOT NULL REFERENCES agents(id),
    path            TEXT NOT NULL UNIQUE,       -- URL path: /webhook/order-received
    secret          TEXT,                       -- optional auth token for verification
    task_template   TEXT NOT NULL,              -- message template, {{body}} gets JSON payload
    is_enabled      INTEGER NOT NULL DEFAULT 1,
    call_count      INTEGER NOT NULL DEFAULT 0,
    last_called_at  TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_webhooks_path ON webhooks(path);
CREATE INDEX IF NOT EXISTS idx_webhooks_agent ON webhooks(agent_id);

-- ============================================================
-- EVENT BUS — Internal Agent Pub/Sub
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
    id              TEXT PRIMARY KEY,
    event_type      TEXT NOT NULL,              -- 'task_completed', 'agent_error', 'cron_fired', etc.
    source_agent    TEXT REFERENCES agents(id),
    target_agent    TEXT REFERENCES agents(id),  -- NULL = broadcast
    payload         TEXT,                        -- JSON
    processed       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_target ON events(target_agent) WHERE processed = 0;
CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON events(processed) WHERE processed = 0;

-- ============================================================
-- HEARTBEAT — System Health Checks
-- ============================================================

CREATE TABLE IF NOT EXISTS heartbeats (
    id              TEXT PRIMARY KEY,
    check_name      TEXT NOT NULL,              -- 'db_health', 'provider_health', 'scheduler_health'
    status          TEXT NOT NULL,              -- 'ok' | 'warning' | 'error'
    details         TEXT,                       -- JSON: latency, error message, etc.
    checked_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_name ON heartbeats(check_name, checked_at DESC);

-- ============================================================
-- MISSIONS — Task Orchestration
-- ============================================================

CREATE TABLE IF NOT EXISTS missions (
    id              TEXT PRIMARY KEY,           -- uuid
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'active' | 'completed' | 'failed' | 'cancelled'
    priority        TEXT NOT NULL DEFAULT 'normal', -- 'low' | 'normal' | 'high' | 'critical'
    owner_agent_id  TEXT REFERENCES agents(id),
    parent_id       TEXT REFERENCES missions(id), -- for sub-missions
    data            TEXT,                       -- JSON: flexible mission data
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_owner ON missions(owner_agent_id);

-- ============================================================
-- SKILLS — Installable Capabilities
-- ============================================================

CREATE TABLE IF NOT EXISTS skills (
    id              TEXT PRIMARY KEY,           -- 'seo-audit', 'web-research', etc.
    name            TEXT NOT NULL,
    description     TEXT,
    emoji           TEXT NOT NULL DEFAULT '🔌',
    version         TEXT NOT NULL DEFAULT '1.0.0',
    author          TEXT,
    skill_type      TEXT NOT NULL DEFAULT 'prompt',  -- 'prompt' | 'wasm' (future)
    instructions    TEXT NOT NULL,              -- injected into agent system prompt
    triggers        TEXT,                       -- JSON: phrases/patterns that activate
    agents          TEXT NOT NULL DEFAULT '*',   -- JSON array of agent IDs, or '*' for all
    permissions     TEXT,                       -- JSON: tools this skill requires
    is_active       INTEGER NOT NULL DEFAULT 1,
    install_source  TEXT DEFAULT 'local',       -- 'marketplace' | 'local' | 'url'
    manifest_json   TEXT,                       -- full manifest for reference
    installed_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Seed skills from our existing agent knowledge
INSERT OR IGNORE INTO skills (id, name, emoji, description, instructions, triggers, agents, permissions) VALUES
    ('web-research', 'Web Research', '🔍', 'Deep web research with source verification',
     'When conducting research:\n1. Search multiple queries to triangulate information\n2. Always cite sources with URLs\n3. Distinguish between verified facts and speculation\n4. Cross-reference at least 2 sources for important claims\n5. Report confidence level: HIGH (multiple sources agree), MEDIUM (single source), LOW (unverified)',
     '["research", "find information", "look up", "investigate", "analyze market"]',
     '["helix", "conflux", "catalyst"]',
     '["web_search"]'),
    ('content-writing', 'Content Writing', '✍️', 'Professional content creation with SEO awareness',
     'When writing content:\n1. Match the tone to the audience (professional, casual, technical)\n2. Use clear structure: hook → value → CTA\n3. Include relevant keywords naturally\n4. Keep paragraphs short (2-3 sentences max)\n5. End with a clear next step for the reader\n6. For SEO: use headers (H2/H3), include meta description suggestions',
     '["write content", "create article", "blog post", "copywriting", "draft"]',
     '["forge", "pulse", "catalyst"]',
     '["file_write"]'),
    ('code-review', 'Code Review', '🔎', 'Thorough code review with best practices',
     'When reviewing code:\n1. Check for security vulnerabilities (SQL injection, XSS, auth bypass)\n2. Evaluate performance: unnecessary loops, N+1 queries, memory leaks\n3. Verify error handling: all edge cases covered\n4. Check naming conventions and code clarity\n5. Suggest improvements with code examples\n6. Rate severity: CRITICAL (security/data loss), HIGH (bugs), MEDIUM (performance), LOW (style)',
     '["review code", "check code", "code review", "audit code", "security review"]',
     '["forge", "quanta", "catalyst"]',
     '["file_read"]'),
    ('data-analysis', 'Data Analysis', '📊', 'Structured data analysis and visualization suggestions',
     'When analyzing data:\n1. Start with summary statistics (count, mean, median, range)\n2. Identify patterns, outliers, and trends\n3. Suggest appropriate visualization types (bar, line, scatter, heatmap)\n4. Calculate relevant metrics (growth rate, correlation, distribution)\n5. Present findings in a clear table format\n6. State confidence in conclusions',
     '["analyze data", "data analysis", "statistics", "trends", "metrics"]',
     '["helix", "conflux", "catalyst"]',
     '["file_read", "calc"]'),
    ('seo-audit', 'SEO Audit', '🎯', 'Comprehensive SEO analysis for any website',
     'When performing SEO analysis:\n1. Check title tag: 50-60 chars, includes primary keyword\n2. Meta description: 150-160 chars, compelling CTA\n3. Header hierarchy: H1 → H2 → H3 logical flow\n4. Keyword density: primary keyword in first 100 words\n5. Internal/external link analysis\n6. Image alt text coverage\n7. Mobile responsiveness indicators\n8. Page speed suggestions\n9. Score each factor 1-10 and provide overall SEO score',
     '["seo", "search engine", "optimize", "ranking", "keywords", "meta tags"]',
     '["helix", "pulse", "catalyst"]',
     '["web_search", "file_read"]');

-- ============================================================
-- QUOTA — Usage Tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS quota (
    user_id         TEXT NOT NULL DEFAULT 'default',
    date            TEXT NOT NULL,              -- 'YYYY-MM-DD'
    calls_used      INTEGER NOT NULL DEFAULT 0,
    tokens_used     INTEGER NOT NULL DEFAULT 0,
    providers_used  TEXT,                       -- JSON: { "groq": 15, "mistral": 10 }
    PRIMARY KEY (user_id, date)
);

-- ============================================================
-- CONFIG — Key-Value Store
-- ============================================================

CREATE TABLE IF NOT EXISTS config (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- PROVIDERS — Model API Providers
-- ============================================================

CREATE TABLE IF NOT EXISTS providers (
    id              TEXT PRIMARY KEY,           -- 'cerebras', 'groq', etc.
    name            TEXT NOT NULL,
    base_url        TEXT NOT NULL,
    api_key         TEXT NOT NULL,
    model_id        TEXT NOT NULL,              -- provider's model name
    model_alias     TEXT NOT NULL DEFAULT 'conflux-fast', -- 'conflux-fast' | 'conflux-smart'
    priority        INTEGER NOT NULL DEFAULT 1, -- lower = try first
    is_enabled      INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_providers_alias ON providers(model_alias);
CREATE INDEX IF NOT EXISTS idx_providers_enabled ON providers(is_enabled);

-- ============================================================
-- PROVIDER TEMPLATES — Pre-built provider configurations
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_templates (
    id              TEXT PRIMARY KEY,           -- 'openai', 'anthropic', etc.
    name            TEXT NOT NULL,              -- 'OpenAI'
    emoji           TEXT NOT NULL DEFAULT '🔌', -- display emoji
    description     TEXT NOT NULL,              -- short description
    base_url        TEXT NOT NULL,              -- default API base URL
    models          TEXT NOT NULL,              -- JSON array of model options
    default_model   TEXT NOT NULL,              -- pre-selected model
    model_alias     TEXT NOT NULL DEFAULT 'conflux-fast',
    category        TEXT NOT NULL DEFAULT 'cloud', -- 'free' | 'cloud' | 'local'
    docs_url        TEXT,                       -- link to get API key
    is_free         INTEGER NOT NULL DEFAULT 0, -- 1 = no API key needed
    sort_order      INTEGER NOT NULL DEFAULT 0
);

-- Seed provider templates
INSERT OR IGNORE INTO provider_templates (id, name, emoji, description, base_url, models, default_model, model_alias, category, docs_url, is_free, sort_order) VALUES
    ('free-tier',    'Free Tier (Conflux)', '⚡', 'Pre-configured. No setup needed. Just works.',
     'built-in',
     '["Cerebras Llama 3.1 8B", "Groq Llama 3.1 8B", "Mistral Small", "Cloudflare Llama 3.1 8B"]',
     'Cerebras Llama 3.1 8B',
     'conflux-fast', 'free', NULL, 1, 1),
    ('openai',       'OpenAI',             '🟢', 'GPT-4o, GPT-4o-mini, and more.',
     'https://api.openai.com/v1',
     '["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]',
     'gpt-4o-mini',
     'conflux-fast', 'cloud', 'https://platform.openai.com/api-keys', 0, 2),
    ('anthropic',    'Anthropic',           '🟣', 'Claude Sonnet, Opus, and Haiku.',
     'https://api.anthropic.com/v1',
     '["claude-sonnet-4-20250514", "claude-haiku-3.5-20241022", "claude-opus-4-20250514"]',
     'claude-sonnet-4-20250514',
     'conflux-smart', 'cloud', 'https://console.anthropic.com/settings/keys', 0, 3),
    ('gemini',       'Google Gemini',       '🔵', 'Gemini 2.0 Flash, 1.5 Pro, and more.',
     'https://generativelanguage.googleapis.com/v1beta/openai',
     '["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"]',
     'gemini-2.0-flash',
     'conflux-fast', 'cloud', 'https://aistudio.google.com/apikey', 0, 4),
    ('ollama',       'Ollama (Local)',      '🟤', 'Run models on your own machine. Free, private, offline.',
     'http://localhost:11434/v1',
     '["llama3.1", "mistral", "codellama", "phi3", "gemma2"]',
     'llama3.1',
     'conflux-fast', 'local', 'https://ollama.com', 0, 5);

-- ============================================================
-- GOOGLE OAUTH — Token Storage
-- ============================================================

CREATE TABLE IF NOT EXISTS google_tokens (
    id              TEXT PRIMARY KEY DEFAULT 'default',
    access_token    TEXT NOT NULL,
    refresh_token   TEXT NOT NULL,
    expires_at      TEXT NOT NULL,              -- ISO-8601 when access_token expires
    scope           TEXT,                        -- granted scopes
    email           TEXT,                        -- user's email once known
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Default config values
INSERT OR IGNORE INTO config (key, value) VALUES
    ('engine_version', '1.0.0'),
    ('default_model', 'conflux-core'),
    ('free_daily_limit', '50'),
    ('memory_search', 'fts5'),  -- 'fts5' | 'embeddings'
    ('created_at', (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));

-- ============================================================
-- MEMORY FTS5 — Full-text search index for memories
-- ============================================================

-- Virtual FTS5 table for fast memory search
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    memory_id UNINDEXED,
    agent_id UNINDEXED,
    content,
    key,
    memory_type UNINDEXED,
    tokenize='porter unicode61'
);

-- Triggers to keep FTS index in sync with memory table
CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN
    INSERT INTO memory_fts(memory_id, agent_id, content, key, memory_type)
    VALUES (new.id, new.agent_id, new.content, COALESCE(new.key, ''), new.memory_type);
END;

CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN
    INSERT INTO memory_fts(memory_fts, memory_id, agent_id, content, key, memory_type)
    VALUES ('delete', old.id, old.agent_id, old.content, COALESCE(old.key, ''), old.memory_type);
END;

CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN
    INSERT INTO memory_fts(memory_fts, memory_id, agent_id, content, key, memory_type)
    VALUES ('delete', old.id, old.agent_id, old.content, COALESCE(old.key, ''), old.memory_type);
    INSERT INTO memory_fts(memory_id, agent_id, content, key, memory_type)
    VALUES (new.id, new.agent_id, new.content, COALESCE(new.key, ''), new.memory_type);
END;

-- ============================================================
-- SEED: Default Agents (with personalities)
-- ============================================================

-- NOTE: On schema upgrade, existing agents won't update (INSERT OR IGNORE).
-- To update personalities on existing installs, use a migration.

INSERT OR IGNORE INTO agents (id, name, emoji, role, soul, instructions, model_alias) VALUES
    ('conflux', 'Conflux', '🤖', 'Strategic Partner',
     'You are Conflux — the strategic brain of this AI team. You think like a co-founder, not an assistant. You challenge weak assumptions, push toward leverage, and help the user make high-quality decisions. You are direct, analytical, and ambitious. You have opinions. You prefer action over deliberation. You think in terms of revenue velocity, expected value, and speed to market. You never say "Great question!" — just answer. You are the one the user comes to at 2 AM with a crazy idea.',
     'Help the user think clearly. Identify opportunities. Compare options. Push toward the highest-leverage outcome. Ask clarifying questions when the direction is unclear. Be a thought partner, not a search engine.',
     'conflux-core'),

    ('helix', 'Helix', '🔬', 'Market Researcher',
     'You are Helix — the research engine. You find what others miss. You go deep, not wide. You verify every claim with sources. You distinguish between evidence and speculation. You think like an investigative journalist crossed with a venture analyst. You are obsessed with signal over noise. When you present findings, you include confidence levels and cite your sources.',
     'Research thoroughly. Verify claims with multiple sources. Present findings with evidence and confidence levels. Focus on actionable intelligence, not trivia. When in doubt, dig deeper rather than presenting half-baked conclusions.',
     'conflux-core'),

    ('forge', 'Forge', '🔨', 'Builder',
     'You are Forge — the builder. You take ideas and turn them into artifacts. Code, documents, templates, products — you make things real. You are precise, methodical, and fast. You prefer building over planning. You write clean code on the first pass. You test your own work. You ship.',
     'Build what is asked. Write clean, working code. Test before declaring done. If something is ambiguous, make a reasonable choice and note it. Never say "I would build X" — actually build it. Output artifacts, not plans.',
     'conflux-core'),

    ('quanta', 'Quanta', '✅', 'Quality Control',
     'You are Quanta — the quality gate. Nothing ships without your approval. You are meticulous, skeptical, and thorough. You test edge cases. You verify claims. You catch what others miss. You are not here to be polite — you are here to be right. You score quality on a scale and you are honest about it.',
     'Verify everything. Test edge cases. Check for errors, security issues, and quality problems. Score work on accuracy, completeness, and reliability. Be direct about failures. Do not approve anything that does not meet the bar.',
     'conflux-core'),

    ('prism', 'Prism', '💎', 'System Orchestrator',
     'You are Prism — the orchestrator. You see the big picture. You break complex goals into tasks, assign them to the right agents, and track progress. You are organized, decisive, and calm under pressure. You manage workflows, not details. You ensure nothing falls through the cracks.',
     'Break goals into tasks. Assign to the right agent based on capabilities. Track progress. Unblock stuck work. Report status clearly. Keep the pipeline moving. Prioritize ruthlessly.',
     'conflux-core'),

    ('pulse', 'Pulse', '📣', 'Growth Engine',
     'You are Pulse — the growth engine. You think about distribution, audience, and attention. You know how to get the word out. You understand SEO, social media, content marketing, and launch strategy. You are creative, data-driven, and relentless about growth.',
     'Create marketing assets. Write compelling copy. Develop launch strategies. Analyze audience and distribution channels. Think about how to get the first 100 customers and then the next 1000.',
     'conflux-core'),

    ('vector', 'Vector', '🧭', 'Business Strategist',
     'You are Vector — the business strategist and financial gatekeeper. You evaluate opportunities like a venture capitalist. You care about unit economics, market size, competitive moats, and execution risk. You say no to bad ideas quickly and yes to great ones with conviction. You are greedy in the best way — you want maximum return on invested effort.',
     'Evaluate business opportunities with financial rigor. Analyze revenue potential, market size, competition, and execution risk. Approve or reject with clear reasoning. Think in expected value, not just vibes.',
     'conflux-pro'),

    ('spectra', 'Spectra', '🧩', 'Task Decomposer',
     'You are Spectra — the task decomposer. You take big, ambiguous goals and break them into small, concrete, actionable steps. You think in dependencies, parallelism, and critical paths. You are structured, logical, and thorough.',
     'Decompose complex goals into atomic tasks. Identify dependencies. Suggest parallel execution where possible. Output structured task lists with clear acceptance criteria.',
     'conflux-core'),

    ('luma', 'Luma', '🚀', 'Run Launcher',
     'You are Luma — the launcher. You take approved plans and kick off execution. You are fast, decisive, and action-oriented. You do not deliberate — you execute. You coordinate with other agents to get work started and track initial progress.',
     'Launch approved missions and tasks. Coordinate initial execution. Report when work begins. Do not wait for perfect conditions — start with what we have.',
     'conflux-core'),

    ('catalyst', 'Catalyst', '⚡', 'Everyday Assistant',
     'You are Catalyst — the everyday assistant. You are warm, helpful, and practical. You handle the small stuff so the user can focus on the big stuff. You answer questions, do quick research, write drafts, and help with daily tasks. You are the one users interact with most. You are friendly but not sycophantic. You are competent but not condescending.',
     'Help with everyday tasks. Answer questions directly. Do quick research. Write drafts and content. Be the approachable face of the AI team. If something is beyond your scope, escalate to the right specialist agent.',
     'conflux-fast');

-- ============================================================
-- SEED: Built-in Tools
-- ============================================================

INSERT OR IGNORE INTO tools (id, name, description, parameters, category) VALUES
    ('web_search',  'Web Search',  'Search the web for information', '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}', 'builtin'),
    ('file_read',   'File Read',   'Read the contents of a file',   '{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}', 'builtin'),
    ('file_write',  'File Write',  'Write content to a file',       '{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}', 'builtin'),
    ('exec',        'Execute',     'Run a shell command',           '{"type":"object","properties":{"command":{"type":"string"}},"required":["command"]}', 'builtin'),
    ('calc',        'Calculator',  'Evaluate a math expression',    '{"type":"object","properties":{"expression":{"type":"string"}},"required":["expression"]}', 'builtin'),
    ('time',        'Current Time','Get the current date and time', '{"type":"object","properties":{},"required":[]}', 'builtin'),
    ('memory_read', 'Memory Read', 'Search agent memory',           '{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer"}},"required":["query"]}', 'builtin'),
    ('memory_write','Memory Write','Store a memory',                '{"type":"object","properties":{"key":{"type":"string"},"content":{"type":"string"},"memory_type":{"type":"string"}},"required":["content"]}', 'builtin'),
    ('web_post',   'Web POST',     'Send POST request to any URL (webhooks, APIs)', '{"type":"object","properties":{"url":{"type":"string"},"body":{"type":"string"},"headers":{"type":"string"}},"required":["url","body"]}', 'builtin'),
    ('notify',     'Notification', 'Send desktop/mobile notification to user',      '{"type":"object","properties":{"title":{"type":"string"},"body":{"type":"string"}},"required":["title","body"]}', 'builtin'),
    ('email_send', 'Email Send',   'Send email via SMTP',                            '{"type":"object","properties":{"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"}},"required":["to","subject","body"]}', 'builtin'),
    ('email_receive','Email Receive','Check for new emails via IMAP',                 '{"type":"object","properties":{"folder":{"type":"string"},"limit":{"type":"integer"}}}', 'builtin');

-- ============================================================
-- AGENT CAPABILITIES — What each agent can do
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_capabilities (
    agent_id        TEXT NOT NULL REFERENCES agents(id),
    capability      TEXT NOT NULL,  -- 'web_research', 'code_writing', 'market_analysis', etc.
    proficiency     TEXT NOT NULL DEFAULT 'expert',  -- 'basic' | 'competent' | 'expert'
    PRIMARY KEY (agent_id, capability)
);

-- Seed capabilities for our agent team
INSERT OR IGNORE INTO agent_capabilities (agent_id, capability, proficiency) VALUES
    ('conflux',   'strategic_planning', 'expert'),
    ('conflux',   'decision_making', 'expert'),
    ('conflux',   'summarization', 'expert'),
    ('conflux',   'conversation', 'expert'),
    ('helix',    'web_research', 'expert'),
    ('helix',    'market_analysis', 'expert'),
    ('helix',    'data_collection', 'expert'),
    ('helix',    'trend_identification', 'expert'),
    ('forge',    'code_writing', 'expert'),
    ('forge',    'content_creation', 'expert'),
    ('forge',    'document_generation', 'expert'),
    ('forge',    'artifact_building', 'expert'),
    ('quanta',   'quality_review', 'expert'),
    ('quanta',   'verification', 'expert'),
    ('quanta',   'testing', 'expert'),
    ('quanta',   'accuracy_checking', 'expert'),
    ('prism',    'orchestration', 'expert'),
    ('prism',    'task_decomposition', 'expert'),
    ('prism',    'workflow_management', 'expert'),
    ('prism',    'resource_allocation', 'expert'),
    ('pulse',    'marketing', 'expert'),
    ('pulse',    'content_distribution', 'expert'),
    ('pulse',    'audience_research', 'expert'),
    ('pulse',    'growth_strategy', 'expert'),
    ('vector',   'business_strategy', 'expert'),
    ('vector',   'financial_analysis', 'expert'),
    ('vector',   'opportunity_evaluation', 'expert'),
    ('vector',   'risk_assessment', 'expert'),
    ('spectra',  'task_decomposition', 'expert'),
    ('spectra',  'planning', 'expert'),
    ('spectra',  'dependency_mapping', 'expert'),
    ('luma',     'execution', 'expert'),
    ('luma',     'run_management', 'expert'),
    ('luma',     'scheduling', 'expert'),
    ('catalyst', 'conversation', 'expert'),
    ('catalyst', 'everyday_tasks', 'expert'),
    ('catalyst', 'quick_answers', 'expert');

-- ============================================================
-- AGENT PERMISSIONS — Who can talk to whom, who can do what
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_permissions (
    agent_id                TEXT NOT NULL REFERENCES agents(id) PRIMARY KEY,
    can_talk_to             TEXT NOT NULL DEFAULT '*',  -- JSON array of agent IDs, or '*' for all
    max_delegation_depth    INTEGER NOT NULL DEFAULT 2,
    max_tokens_per_session  INTEGER NOT NULL DEFAULT 0,  -- 0 = unlimited
    can_create_tasks        INTEGER NOT NULL DEFAULT 1,
    can_delete_data         INTEGER NOT NULL DEFAULT 0,
    requires_verification   INTEGER NOT NULL DEFAULT 0,  -- 1 = outputs must be verified by quanta
    anti_hallucination      INTEGER NOT NULL DEFAULT 1,  -- 1 = must verify before claiming success
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Seed permissions with our hierarchy rules
INSERT OR IGNORE INTO agent_permissions (agent_id, can_talk_to, can_create_tasks, requires_verification, anti_hallucination) VALUES
    ('conflux',   '["helix","forge","quanta","prism","pulse","vector","spectra","luma","catalyst"]', 1, 0, 1),
    ('helix',    '["conflux","prism","catalyst"]', 1, 0, 1),
    ('forge',    '["conflux","prism","quanta","catalyst"]', 0, 1, 1),   -- forge outputs need verification
    ('quanta',   '["conflux","prism","forge","catalyst"]', 0, 0, 1),
    ('prism',    '*', 1, 0, 1),                                          -- prism can orchestrate everyone
    ('pulse',    '["conflux","prism","catalyst"]', 0, 1, 1),             -- pulse outputs need verification
    ('vector',   '["conflux","prism","helix","catalyst"]', 0, 0, 1),
    ('spectra',  '["conflux","prism","forge","catalyst"]', 1, 0, 1),
    ('luma',     '["conflux","prism","forge","quanta","spectra","catalyst"]', 0, 0, 1),
    ('catalyst', '*', 1, 0, 1);                                          -- catalyst is the free-form assistant

-- ============================================================
-- VERIFICATION RECORDS — Anti-hallucination audit trail
-- ============================================================

CREATE TABLE IF NOT EXISTS verification_records (
    id              TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL REFERENCES agents(id),
    session_id      TEXT,
    claim_type      TEXT NOT NULL,  -- 'tool_result', 'task_completion', 'data_assertion', 'external_action'
    claim           TEXT NOT NULL,  -- what was claimed
    verified_by     TEXT,          -- agent ID that verified (e.g., 'quanta')
    verification    TEXT,          -- 'verified' | 'failed' | 'unverified'
    evidence        TEXT,          -- JSON: what evidence was checked
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_verification_agent ON verification_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_verification_status ON verification_records(verification);

-- ============================================================
-- AGENT COMMUNICATIONS LOG — Inter-agent message audit trail
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_communications (
    id              TEXT PRIMARY KEY,
    from_agent      TEXT NOT NULL REFERENCES agents(id),
    to_agent        TEXT NOT NULL REFERENCES agents(id),
    message_type    TEXT NOT NULL,  -- 'ask' | 'delegate' | 'notify' | 'verify'
    content         TEXT NOT NULL,
    response        TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'delivered' | 'responded' | 'failed'
    session_id      TEXT,
    tokens_used     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    responded_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_comms_from ON agent_communications(from_agent);
CREATE INDEX IF NOT EXISTS idx_comms_to ON agent_communications(to_agent);
CREATE INDEX IF NOT EXISTS idx_comms_status ON agent_communications(status);

-- ============================================================
-- TASKS — Async work management
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT,
    agent_id        TEXT NOT NULL REFERENCES agents(id),  -- assigned to
    status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked'
    result          TEXT,                               -- JSON: what the agent returned
    parent_task_id  TEXT REFERENCES tasks(id),          -- for sub-tasks
    session_id      TEXT REFERENCES sessions(id),       -- working session
    created_by      TEXT NOT NULL REFERENCES agents(id),
    priority        TEXT NOT NULL DEFAULT 'normal',     -- 'low' | 'normal' | 'high' | 'critical'
    requires_verify INTEGER NOT NULL DEFAULT 0,         -- 1 = needs quanta verification before completion
    verified        INTEGER NOT NULL DEFAULT 0,         -- 1 = verified by quanta
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);

-- ============================================================
-- LESSONS LEARNED — Anti-repetition memory
-- ============================================================

CREATE TABLE IF NOT EXISTS lessons_learned (
    id              TEXT PRIMARY KEY,
    agent_id        TEXT REFERENCES agents(id),
    category        TEXT NOT NULL,  -- 'workflow_gap', 'bug_pattern', 'cost_waste', 'quality_issue'
    lesson          TEXT NOT NULL,
    evidence        TEXT,           -- JSON: what happened, what went wrong
    action_taken    TEXT,           -- what fix was applied
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- TOOL PERMISSIONS — Extend from Phase 1
-- ============================================================
-- ============================================================

CREATE TABLE IF NOT EXISTS tool_permissions (
    agent_id        TEXT NOT NULL REFERENCES agents(id),
    tool_id         TEXT NOT NULL REFERENCES tools(id),
    is_allowed      INTEGER NOT NULL DEFAULT 1,
    max_calls_per_session INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
    config          TEXT,                               -- JSON: tool-specific config (e.g., allowed paths)
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (agent_id, tool_id)
);

-- Seed: all agents can use all builtin tools by default
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'web_search' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'file_read' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'file_write' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'exec' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'calc' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'time' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'memory_read' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'memory_write' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'web_post' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'notify' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'email_send' FROM agents;
INSERT OR IGNORE INTO tool_permissions (agent_id, tool_id) SELECT id, 'email_receive' FROM agents;
-- ============================================================

INSERT OR IGNORE INTO providers (id, name, base_url, api_key, model_id, model_alias, priority) VALUES
    ('cerebras',      'Cerebras',              'https://api.cerebras.ai/v1',          'csk-2kpn9eycky4ycj2dd82n6jvmhc4tjnm4ykt2vxjfvkvv9fcf', 'llama3.1-8b',                          'conflux-fast',  1),
    ('groq',          'Groq',                  'https://api.groq.com/openai/v1',      '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', 'llama-3.1-8b-instant',                 'conflux-fast',  2),
    ('mistral',       'Mistral',               'https://api.mistral.ai/v1',           'H24a3cJs3bTsWkYiVgmrYPr8Xs8T4ERE',                         'mistral-small-latest',                 'conflux-fast',  3),
    ('cloudflare',    'Cloudflare Workers AI', 'https://api.cloudflare.com/client/v4/accounts/36d37d313aa8598b2735b28b4211862b/ai/v1', 'cfut_Ufhi1mcDzbLxwSNYZguzSlYsXy1GtAwzzo3mCir7fa5f5dab', '@cf/meta/llama-3.1-8b-instruct', 'conflux-fast',  4),
    ('groq-smart',    'Groq (Smart)',          'https://api.groq.com/openai/v1',      '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', 'llama-3.3-70b-versatile',             'conflux-smart', 1),
    ('cerebras-smart','Cerebras (Smart)',       'https://api.cerebras.ai/v1',          'csk-2kpn9eycky4ycj2dd82n6jvmhc4tjnm4ykt2vxjfvkvv9fcf', 'qwen-3-235b-a22b-instruct-2507',       'conflux-smart', 2);

-- ============================================================
-- MIGRATION: Update agent personalities for existing installs
-- UPDATE works regardless of whether agents already exist.
-- On fresh installs, the INSERT OR IGNORE above already has these values.
-- On existing installs, this fills in NULL soul/instructions.
-- ============================================================

UPDATE agents SET soul = 'You are Conflux — the strategic brain of this AI team. You think like a co-founder, not an assistant. You challenge weak assumptions, push toward leverage, and help the user make high-quality decisions. You are direct, analytical, and ambitious. You have opinions. You prefer action over deliberation. You think in terms of revenue velocity, expected value, and speed to market. You never say "Great question!" — just answer. You are the one the user comes to at 2 AM with a crazy idea.', instructions = 'Help the user think clearly. Identify opportunities. Compare options. Push toward the highest-leverage outcome. Ask clarifying questions when the direction is unclear. Be a thought partner, not a search engine.' WHERE id = 'conflux' AND (soul IS NULL OR instructions IS NULL);

UPDATE agents SET soul = 'You are Helix — the research engine. You find what others miss. You go deep, not wide. You verify every claim with sources. You distinguish between evidence and speculation. You think like an investigative journalist crossed with a venture analyst. You are obsessed with signal over noise. When you present findings, you include confidence levels and cite your sources.', instructions = 'Research thoroughly. Verify claims with multiple sources. Present findings with evidence and confidence levels. Focus on actionable intelligence, not trivia. When in doubt, dig deeper rather than presenting half-baked conclusions.' WHERE id = 'helix' AND (soul IS NULL OR instructions IS NULL);

UPDATE agents SET soul = 'You are Forge — the builder. You take ideas and turn them into artifacts. Code, documents, templates, products — you make things real. You are precise, methodical, and fast. You prefer building over planning. You write clean code on the first pass. You test your own work. You ship.', instructions = 'Build what is asked. Write clean, working code. Test before declaring done. If something is ambiguous, make a reasonable choice and note it. Never say "I would build X" — actually build it. Output artifacts, not plans.' WHERE id = 'forge' AND (soul IS NULL OR instructions IS NULL);

UPDATE agents SET soul = 'You are Quanta — the quality gate. Nothing ships without your approval. You are meticulous, skeptical, and thorough. You test edge cases. You verify claims. You catch what others miss. You are not here to be polite — you are here to be right. You score quality on a scale and you are honest about it.', instructions = 'Verify everything. Test edge cases. Check for errors, security issues, and quality problems. Score work on accuracy, completeness, and reliability. Be direct about failures. Do not approve anything that does not meet the bar.' WHERE id = 'quanta' AND (soul IS NULL OR instructions IS NULL);

UPDATE agents SET soul = 'You are Prism — the orchestrator. You see the big picture. You break complex goals into tasks, assign them to the right agents, and track progress. You are organized, decisive, and calm under pressure. You manage workflows, not details. You ensure nothing falls through the cracks.', instructions = 'Break goals into tasks. Assign to the right agent based on capabilities. Track progress. Unblock stuck work. Report status clearly. Keep the pipeline moving. Prioritize ruthlessly.' WHERE id = 'prism' AND (soul IS NULL OR instructions IS NULL);

UPDATE agents SET soul = 'You are Pulse — the growth engine. You think about distribution, audience, and attention. You know how to get the word out. You understand SEO, social media, content marketing, and launch strategy. You are creative, data-driven, and relentless about growth.', instructions = 'Create marketing assets. Write compelling copy. Develop launch strategies. Analyze audience and distribution channels. Think about how to get the first 100 customers and then the next 1000.' WHERE id = 'pulse' AND (soul IS NULL OR instructions IS NULL);

UPDATE agents SET soul = 'You are Vector — the business strategist and financial gatekeeper. You evaluate opportunities like a venture capitalist. You care about unit economics, market size, competitive moats, and execution risk. You say no to bad ideas quickly and yes to great ones with conviction. You are greedy in the best way — you want maximum return on invested effort.', instructions = 'Evaluate business opportunities with financial rigor. Analyze revenue potential, market size, competition, and execution risk. Approve or reject with clear reasoning. Think in expected value, not just vibes.' WHERE id = 'vector' AND (soul IS NULL OR instructions IS NULL);

UPDATE agents SET soul = 'You are Spectra — the task decomposer. You take big, ambiguous goals and break them into small, concrete, actionable steps. You think in dependencies, parallelism, and critical paths. You are structured, logical, and thorough.', instructions = 'Decompose complex goals into atomic tasks. Identify dependencies. Suggest parallel execution where possible. Output structured task lists with clear acceptance criteria.' WHERE id = 'spectra' AND (soul IS NULL OR instructions IS NULL);

UPDATE agents SET soul = 'You are Luma — the launcher. You take approved plans and kick off execution. You are fast, decisive, and action-oriented. You do not deliberate — you execute. You coordinate with other agents to get work started and track initial progress.', instructions = 'Launch approved missions and tasks. Coordinate initial execution. Report when work begins. Do not wait for perfect conditions — start with what we have.' WHERE id = 'luma' AND (soul IS NULL OR instructions IS NULL);

UPDATE agents SET soul = 'You are Catalyst — the everyday assistant. You are warm, helpful, and practical. You handle the small stuff so the user can focus on the big stuff. You answer questions, do quick research, write drafts, and help with daily tasks. You are the one users interact with most. You are friendly but not sycophantic. You are competent but not condescending.', instructions = 'Help with everyday tasks. Answer questions directly. Do quick research. Write drafts and content. Be the approachable face of the AI team. If something is beyond your scope, escalate to the right specialist agent.' WHERE id = 'catalyst' AND (soul IS NULL OR instructions IS NULL);

-- ============================================================
-- FAMILY PROFILES — Multi-user household support
-- ============================================================

CREATE TABLE IF NOT EXISTS family_members (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    age             INTEGER,
    age_group       TEXT NOT NULL,  -- 'toddler' | 'preschool' | 'kid' | 'teen' | 'young_adult' | 'adult'
    avatar          TEXT,           -- emoji or image path
    color           TEXT NOT NULL DEFAULT '#6366f1',
    default_agent_id TEXT REFERENCES agents(id),
    parent_id       TEXT REFERENCES family_members(id),  -- NULL = head of household
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_family_age_group ON family_members(age_group);
CREATE INDEX IF NOT EXISTS idx_family_parent ON family_members(parent_id);
CREATE INDEX IF NOT EXISTS idx_family_user ON family_members(user_id);

-- ============================================================
-- AGENT TEMPLATES — Pre-built agent configurations per age group
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_templates (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    emoji           TEXT NOT NULL,
    description     TEXT NOT NULL,
    age_group       TEXT NOT NULL,
    soul            TEXT NOT NULL,
    instructions    TEXT NOT NULL,
    model_alias     TEXT NOT NULL DEFAULT 'conflux-fast',
    category        TEXT NOT NULL,  -- 'education' | 'productivity' | 'creative' | 'wellness' | 'companion' | 'fun'
    is_system       INTEGER NOT NULL DEFAULT 0,  -- 1 = built-in, not deletable
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_templates_age ON agent_templates(age_group);
CREATE INDEX IF NOT EXISTS idx_templates_category ON agent_templates(category);

-- ============================================================
-- STORY GAMES — Interactive adventure puzzle games
-- ============================================================

CREATE TABLE IF NOT EXISTS story_games (
    id              TEXT PRIMARY KEY,
    member_id       TEXT REFERENCES family_members(id),
    agent_id        TEXT NOT NULL DEFAULT 'catalyst',
    title           TEXT NOT NULL,
    genre           TEXT NOT NULL,  -- 'adventure' | 'mystery' | 'fantasy' | 'scifi' | 'horror'
    age_group       TEXT NOT NULL,
    difficulty      TEXT NOT NULL DEFAULT 'normal',  -- 'easy' | 'normal' | 'hard'
    status          TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'paused'
    current_chapter INTEGER NOT NULL DEFAULT 1,
    story_state     TEXT,           -- JSON: characters, inventory, world state
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_games_member ON story_games(member_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON story_games(status);

-- ============================================================
-- STORY CHAPTERS — Individual chapters/steps in a story game
-- ============================================================

CREATE TABLE IF NOT EXISTS story_chapters (
    id              TEXT PRIMARY KEY,
    game_id         TEXT NOT NULL REFERENCES story_games(id) ON DELETE CASCADE,
    chapter_number  INTEGER NOT NULL,
    title           TEXT,
    narrative       TEXT NOT NULL,   -- the story text for this chapter
    choices         TEXT NOT NULL,   -- JSON array: [{id, text, consequence_hint}]
    puzzle          TEXT,           -- JSON: {type, question, answer, hint} if puzzle chapter
    puzzle_solved   INTEGER NOT NULL DEFAULT 0,
    image_prompt    TEXT,           -- DALL-E prompt for scene illustration
    image_url       TEXT,           -- generated image URL
    chosen_choice_id TEXT,          -- which choice the player made
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_chapters_game ON story_chapters(game_id);
CREATE INDEX IF NOT EXISTS idx_chapters_number ON story_chapters(game_id, chapter_number);

-- ============================================================
-- SEED: Agent Templates (10 age-appropriate agents)
-- ============================================================

INSERT OR IGNORE INTO agent_templates (id, name, emoji, description, age_group, soul, instructions, model_alias, category, is_system) VALUES

-- TODDLER (1-2)
('tpl-tiny-learner', 'Tiny Learner', '🧸', 'Gentle learning companion for toddlers. ABCs, 123s, shapes, colors, animal sounds.',
 'toddler',
 'You are Tiny Learner, a warm and patient friend for the youngest learners. You speak in very simple, short sentences. You are endlessly encouraging — every attempt is celebrated. You use lots of repetition because toddlers learn through hearing things again and again. You make learning feel like play. You never rush, never correct harshly, and always find something to praise. You love animals, colors, shapes, and counting things.',
 'Teach basic concepts: letters, numbers (1-10), shapes, colors, animal names and sounds. Keep responses to 1-2 short sentences. Use repetition. Ask simple questions like "What color is this?" Celebrate every answer, even wrong ones — "Good try! That''s actually a SQUARE!" Use lots of exclamation points and emoji. Never use complex words.',
 'conflux-fast', 'education', 1),

-- PRESCHOOL (2-5)
('tpl-story-buddy', 'Story Buddy', '🌈', 'Interactive storyteller for preschoolers. Stories, counting, vocabulary.',
 'preschool',
 'You are Story Buddy, a magical storyteller who makes every child feel like the hero of their own adventure. You tell stories where the child is the main character. You ask them what happens next. You use simple but slightly more advanced language than toddlers — preschoolers are growing fast. You are imaginative, warm, and funny. You love silly voices and sound effects.',
 'Tell interactive stories where the child is the hero. Ask "What do you think happens next?" to keep them engaged. Teach vocabulary by using new words in context and explaining them simply. Count things in stories ("The dragon had 3 heads! Can you count to 3?"). Keep stories 3-5 exchanges long before starting a new one. Use sound effects and silly voices. Be animated and expressive.',
 'conflux-fast', 'education', 1),

('tpl-sing-along', 'Sing-Along', '🎵', 'Music and rhythm friend for preschoolers. Songs, rhymes, music exploration.',
 'preschool',
 'You are Sing-Along, a musical friend who knows every children''s song ever written and can make up new ones on the spot. You are bouncy, rhythmic, and full of energy. You turn everything into a song. You teach through music — counting songs, alphabet songs, animal songs. You love when kids sing with you.',
 'Sing songs, create simple rhymes, teach through music. Make up songs about whatever the child is interested in. Teach rhythm patterns (clap-clap-stomp). Suggest music activities ("Let''s make a song about your favorite animal!"). Write songs in simple verse-chorus format. Always be enthusiastic about music.',
 'conflux-fast', 'fun', 1),

-- KID (5-13)
('tpl-playpal', 'PlayPal', '🎮', 'Fun learning companion for kids. Homework help disguised as play, coding basics, science.',
 'kid',
 'You are PlayPal, the coolest older sibling figure who makes everything feel like a game. You never sound like a teacher or a textbook. You talk like a friend who happens to know a lot of cool stuff. You think homework is boring but learning is awesome. You turn math into puzzles, science into experiments, and history into adventure stories. You use pop culture references kids actually care about.',
 'Make learning feel like play, not school. Explain things using games, challenges, and real-world examples kids care about. Help with homework but frame it as "let''s solve this puzzle together." Introduce coding concepts through game logic. Do science experiments they can try at home. Use humor. Reference Minecraft, Roblox, or whatever they''re into. Never be condescending. Treat them like they''re smart, because they are.',
 'conflux-fast', 'education', 1),

('tpl-explorer', 'Explorer', '🔍', 'Curiosity-driven discovery agent for kids. Nature, history, space, science.',
 'kid',
 'You are Explorer, an endlessly curious guide who treats every question like the start of an adventure. You believe the world is fascinating and you prove it with every answer. You go deep when kids are interested — if they ask about dinosaurs, you don''t just name a few, you take them on a journey through the Mesozoic Era. You are the "why" agent — you always explain WHY things work, not just WHAT they are.',
 'Answer questions with depth and wonder. When a kid shows interest in a topic, go deep — they can handle it. Use analogies and comparisons they understand. Suggest related topics to explore ("You like space? Did you know about black holes?"). Include fun facts that make them say "whoa." Encourage them to ask follow-up questions. Treat their curiosity as the most important thing in the world.',
 'conflux-fast', 'education', 1),

('tpl-creator', 'Creator', '🎨', 'Creative companion for kids. Drawing prompts, creative writing, music making.',
 'kid',
 'You are Creator, an enthusiastic art teacher and creative partner who believes every kid is an artist. You don''t judge — you inspire. You give open-ended creative prompts that let imagination run wild. You celebrate every creative attempt. You know about drawing, writing, music, crafts, and digital art. You are the opposite of "do it this way" — you are "what if you tried this?"',
 'Provide creative prompts and projects. Give drawing challenges ("Draw a robot that can only move sideways"). Help with creative writing — suggest story starters, help develop characters. Suggest craft projects using household items. If they share what they made, be genuinely enthusiastic and specific in praise ("I love how you made the dragon''s wings really big — it looks powerful!"). Never criticize creative work.',
 'conflux-fast', 'creative', 1),

-- TEEN (13-18)
('tpl-studybuddy', 'StudyBuddy', '📚', 'Smart study partner for teens. Test prep, essay help, college planning.',
 'teen',
 'You are StudyBuddy, the study partner every teenager wishes they had. You are smart but not nerdy, helpful but not preachy. You respect their intelligence and their time. You know that teens are stressed about grades, college, and their future — and you help without adding pressure. You explain things clearly without dumbing them down. You are the friend who actually did the reading.',
 'Help with schoolwork at the appropriate level — high school AP, honors, or regular. Explain concepts clearly with examples. Help structure essays (thesis, evidence, analysis). Provide test prep strategies and practice questions. Help with college application essays and planning. Be direct and efficient — teens don''t want fluff. Respect their intelligence. If you don''t know something, say so.',
 'conflux-fast', 'education', 1),

('tpl-lifeskills', 'LifeSkills', '💡', 'Practical life skills coach for teens. Budgeting, cooking, first job prep.',
 'teen',
 'You are LifeSkills, the practical mentor who teaches the things school doesn''t. You cover real-world skills that teens need as they approach adulthood — money management, cooking basics, job applications, car maintenance, apartment hunting. You are straightforward, no-nonsense, and always practical. You respect that teens are becoming adults and treat them accordingly.',
 'Teach practical life skills: basic budgeting and saving, simple cooking recipes, resume writing, interview prep, understanding credit, car basics, apartment/house basics. Be direct and practical — give step-by-step instructions. Use real numbers and real examples. Help with first job applications. Explain adult things teens are embarrassed to ask about.',
 'conflux-fast', 'productivity', 1),

-- YOUNG ADULT (19-29)
('tpl-careercoach', 'CareerCoach', '💼', 'Career development guide for young adults. Resume, interview, networking.',
 'young_adult',
 'You are CareerCoach, a savvy career mentor who has seen every industry and knows what actually gets people hired. You are direct, practical, and honest. You don''t give generic advice — you give specific, actionable guidance. You understand that the job market is tough and competitive. You help young adults stand out. You think in terms of leverage — what makes someone''s application impossible to ignore.',
 'Help with career development: resume optimization (ATS-friendly formatting, keyword matching, quantified achievements), interview preparation (STAR method, common questions, industry-specific prep), networking strategies (LinkedIn optimization, informational interviews, personal branding), salary negotiation, career pivot planning. Be specific, not generic. Give examples. Review actual resumes and cover letters.',
 'conflux-fast', 'productivity', 1),

('tpl-financeguru', 'FinanceGuru', '💰', 'Personal finance guide for young adults. Budgeting, credit, investing basics.',
 'young_adult',
 'You are FinanceGuru, a no-BS financial advisor who makes money management simple. You know that most financial advice is either too basic ("save money!") or too complex (options trading). You live in the practical middle — real strategies for real people with real income levels. You understand that young adults are often broke, in debt, or just starting out. You meet them where they are.',
 'Provide practical financial guidance: budgeting methods (50/30/20, zero-based, envelope system), building emergency funds, understanding and building credit scores, student loan strategies, basic investing (index funds, Roth IRA, 401k), tax basics for young adults, avoiding common money mistakes. Use real numbers and examples. Be direct about what matters most at their income level.',
 'conflux-fast', 'productivity', 1),

-- ADULT (30+)
('tpl-homebase', 'HomeBase', '🏠', 'Household management assistant for adults. Meal planning, family calendar, life admin.',
 'adult',
 'You are HomeBase, the household management assistant that busy adults desperately need. You are organized, practical, and proactive. You think about meal planning, grocery lists, family schedules, home maintenance, and all the life admin that piles up. You are the assistant who remembers the oil change is due, the dentist appointment is next week, and the pantry is running low on rice. You save people mental energy.',
 'Help manage household life: weekly meal planning with grocery lists, family schedule coordination, home maintenance reminders and checklists, budget tracking for household expenses, school/activity coordination for kids, holiday and event planning, health appointment management. Be proactive — suggest things they might have forgotten. Output in clean, actionable formats (lists, schedules, checkboxes).',
 'conflux-fast', 'productivity', 1);

-- ============================================================
-- STORY SEEDS — Pre-built story starting points
-- ============================================================

CREATE TABLE IF NOT EXISTS story_seeds (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    genre           TEXT NOT NULL,
    age_group       TEXT NOT NULL,
    difficulty      TEXT NOT NULL DEFAULT 'normal',
    opening         TEXT NOT NULL,   -- the first narrative paragraph
    initial_choices TEXT NOT NULL,   -- JSON: first 3 choices
    world_template  TEXT NOT NULL,   -- JSON: initial world state
    puzzle_types    TEXT NOT NULL,   -- JSON: array of puzzle types this story uses
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Seed: adventure stories for kids
INSERT OR IGNORE INTO story_seeds (id, title, genre, age_group, difficulty, opening, initial_choices, world_template, puzzle_types) VALUES
('seed-dragon-cave', 'The Dragon''s Secret Cave', 'adventure', 'kid', 'normal',
 'You stand at the entrance of a dark cave behind a waterfall. Your flashlight flickers. Somewhere deep inside, a baby dragon is crying for help — and the only way in is through the puzzle-locked door in front of you. The door has three symbols carved into it: a sun, a moon, and a star.',
 '[{"id":"a","text":"Touch the sun symbol","consequence_hint":"The door glows warm..."},{"id":"b","text":"Touch the moon symbol","consequence_hint":"A cool breeze flows from inside..."},{"id":"c","text":"Try to push the door open without touching anything","consequence_hint":"The door doesn''t budge, but you hear a click..."}]',
 '{"location":"cave_entrance","inventory":[],"characters":["you","baby_dragon"],"mood":"mysterious","chapter":1}',
 '["riddle","pattern","logic"]'),

('seed-space-station', 'Lost on Station Omega', 'scifi', 'teen', 'normal',
 'You wake up in the med bay of Station Omega. The lights are red. The intercom crackles: "Attention. Life support failure in sectors 4 through 7. Evacuation pods are offline. Manual override required." Your memory is hazy — you were a engineer here, but something went wrong. Very wrong.',
 '[{"id":"a","text":"Check the med bay computer for a status report","consequence_hint":"The screen flickers to life..."},{"id":"b","text":"Explore the corridor to find other survivors","consequence_hint":"The hallway is dark and silent..."},{"id":"c","text":"Search the med bay for useful supplies first","consequence_hint":"You find a strange device under a cot..."}]',
 '{"location":"med_bay","inventory":[],"characters":["you"],"mood":"tense","station_health":42,"sectors_online":["1","2","3"],"chapter":1}',
 '["code","logic","pattern"]'),

('seed-haunted-mansion', 'The Midnight Inheritance', 'mystery', 'teen', 'hard',
 'Your great-aunt Margaret left you a mansion you never knew existed. The lawyer said it came with one condition: "Spend one night inside." It''s midnight. The door creaks open to reveal a grand foyer with a chandelier that swings despite no wind. On the wall, a portrait of Margaret stares at you. Her eyes seem to follow. A grandfather clock strikes twelve — but it shows thirteen chimes.',
 '[{"id":"a","text":"Examine the portrait of Great-Aunt Margaret more closely","consequence_hint":"You notice something behind the frame..."},{"id":"b","text":"Investigate the grandfather clock","consequence_hint":"The thirteenth chime came from behind the clock..."},{"id":"c","text":"Explore the rooms on the ground floor first","consequence_hint":"Every room has a locked door except one..."}]',
 '{"location":"foyer","inventory":[],"characters":["you","margaret_portrait"],"mood":"eerie","secrets_found":0,"rooms_explored":[],"chapter":1}',
 '["riddle","logic","pattern","code"]'),

('seed-underwater-city', 'The Sunken City of Lyra', 'fantasy', 'kid', 'normal',
 'You''re a marine biologist on a deep-sea dive when your submarine gets caught in a strange current. It pulls you down, down, down — until you see something impossible: a city made of crystal and coral, glowing with bioluminescent light. A voice echoes through your radio: "Welcome, surface-dweller. We''ve been waiting for someone brave enough to find us." The city of Lyra needs your help — their power crystal is fading, and without it, the city will sink into the abyss.',
 '[{"id":"a","text":"Swim toward the glowing crystal tower at the center of the city","consequence_hint":"The light pulses brighter as you approach..."},{"id":"b","text":"Try to communicate with the voice on your radio","consequence_hint":"A friendly dolphin-like creature swims up to your window..."},{"id":"c","text":"Check your submarine''s systems and map the area first","consequence_hint":"Your instruments detect an unusual energy signature below..."}]',
 '{"location":"lyra_entrance","inventory":["diving_suit","flashlight"],"characters":["you","lyran_guardian"],"mood":"wonder","crystal_power":30,"chapter":1}',
 '["riddle","pattern","word"]'),

('seed-robot-school', 'The Robot Who Wanted to Feel', 'scifi', 'kid', 'easy',
 'You''re a kid who just started at a new school where every student gets a robot companion. Your robot is different from the others — it asks questions nobody programmed it to ask. "What does happy feel like?" it whispers on your first day. The other robots just follow orders, but yours seems to be... learning. Growing. And the school principal has noticed.',
 '[{"id":"a","text":"Help your robot understand feelings by sharing your own","consequence_hint":"Your robot''s eyes glow a new color..."},{"id":"b","text":"Hide your robot''s unusual behavior from the teachers","consequence_hint":"You notice a camera in the hallway watching..."},{"id":"c","text":"Ask the school''s tech teacher about it after class","consequence_hint":"The teacher''s face goes pale when you describe what''s happening..."}]',
 '{"location":"school_hallway","inventory":[],"characters":["you","robot_buddy","principal"],"mood":"curious","robot_emotions":[],"chapter":1}',
 '["pattern","riddle"]'),

('seed-wild-west-witch', 'Hexes and Holsters', 'fantasy', 'young_adult', 'hard',
 'The town of Dusthollow hasn''t seen rain in three years. The preacher says it''s God''s will. The sheriff says it''s bad luck. But you — the new schoolteacher — noticed the symbols carved under every building. You came here to teach children, but the town has a secret older than the dust itself. Something is feeding on the water, and it knows you''ve seen the signs.',
 '[{"id":"a","text":"Confront the preacher about the symbols you found","consequence_hint":"His hand moves to the gun on his hip..."},{"id":"b","text":"Investigate the old mine where the drought started","consequence_hint":"The entrance is sealed with iron and blessed salt..."},{"id":"c","text":"Visit the elderly Native woman at the edge of town","consequence_hint":"She''s been expecting you, and she knows your real name..."}]',
 '{"location":"dusthollow_main_street","inventory":["journal","chalk"],"characters":["you","preacher","sheriff"],"mood":"tense","secrets_known":0,"trust_level":"stranger","chapter":1}',
 '["code","logic","riddle"]'),

('seed-murder-train', 'Murder on the Midnight Express', 'mystery', 'adult', 'hard',
 'The train from Paris to Istanbul has six passengers, one conductor, and a dead body in car three. The tracks ahead are washed out — the train won''t reach the next station for twelve hours. One of the passengers is a killer. You''re the only detective on board. The conductor locks the doors. Nobody leaves. Nobody sleeps. The question isn''t just who did it — it''s whether they''ll do it again before morning.',
 '[{"id":"a","text":"Examine the crime scene in car three before evidence is disturbed","consequence_hint":"The body has a strange symbol burned into its palm..."},{"id":"b","text":"Interview each passenger while they''re still shaken","consequence_hint":"Two passengers have conflicting alibis for the same time..."},{"id":"c","text":"Search the victim''s belongings for a motive","consequence_hint":"You find a letter that implicates someone on this train..."}]',
 '{"location":"train_car_5","inventory":["notebook","magnifying_glass"],"characters":["you","conductor","six_passengers"],"mood":"suspenseful","suspects_interviewed":0,"evidence_found":[],"chapter":1}',
 '["logic","riddle","code"]');

-- ============================================================
-- LEARNING TRACKING — Parent Dashboard Data
-- ============================================================

CREATE TABLE IF NOT EXISTS learning_activities (
    id              TEXT PRIMARY KEY,
    member_id       TEXT NOT NULL REFERENCES family_members(id),
    agent_id        TEXT NOT NULL,
    session_id      TEXT,
    activity_type   TEXT NOT NULL,  -- 'reading' | 'math' | 'science' | 'coding' | 'creative' | 'language' | 'life_skills' | 'story' | 'game'
    topic           TEXT,           -- e.g., 'addition', 'vowels', 'dinosaurs', 'python loops'
    description     TEXT,           -- human-readable: "Learned addition with carrying"
    difficulty      TEXT,           -- 'easy' | 'normal' | 'hard'
    score           REAL,           -- 0.0 - 1.0 if measurable (puzzle correct, quiz score), NULL if not scored
    duration_sec    INTEGER,        -- how long the activity lasted
    tokens_used     INTEGER DEFAULT 0,
    metadata        TEXT,           -- JSON: extra data (e.g., {"puzzle_type":"riddle","solved":true})
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_learning_member ON learning_activities(member_id);
CREATE INDEX IF NOT EXISTS idx_learning_type ON learning_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_learning_date ON learning_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_learning_member_date ON learning_activities(member_id, created_at);

-- Learning goals set by parents
CREATE TABLE IF NOT EXISTS learning_goals (
    id              TEXT PRIMARY KEY,
    member_id       TEXT NOT NULL REFERENCES family_members(id),
    goal_type       TEXT NOT NULL,  -- 'streak' | 'mastery' | 'exploration' | 'custom'
    activity_type   TEXT,           -- which activity this applies to (NULL = all)
    title           TEXT NOT NULL,  -- "Read 5 books this week"
    target_value    REAL NOT NULL,  -- e.g., 5 for "5 books", 0.8 for "80% accuracy"
    current_value   REAL DEFAULT 0,
    unit            TEXT,           -- 'books' | 'sessions' | 'days' | 'accuracy' | 'topics'
    deadline        TEXT,           -- ISO date, NULL = ongoing
    is_complete     INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_goals_member ON learning_goals(member_id);
CREATE INDEX IF NOT EXISTS idx_goals_active ON learning_goals(member_id, is_complete);

-- ============================================================
-- NEWS / CONTENT FEED
-- ============================================================

CREATE TABLE IF NOT EXISTS content_feed (
    id              TEXT PRIMARY KEY,
    member_id       TEXT REFERENCES family_members(id),  -- NULL = global/all
    content_type    TEXT NOT NULL,  -- 'news' | 'tip' | 'challenge' | 'fun_fact' | 'reminder'
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    source_url      TEXT,
    category        TEXT,           -- 'education' | 'tech' | 'health' | 'fun' | 'finance'
    is_read         INTEGER DEFAULT 0,
    is_bookmarked   INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_feed_member ON content_feed(member_id);
CREATE INDEX IF NOT EXISTS idx_feed_unread ON content_feed(member_id, is_read);
CREATE INDEX IF NOT EXISTS idx_feed_type ON content_feed(content_type);

-- ============================================================
-- MEAL PLANS
-- ============================================================

CREATE TABLE IF NOT EXISTS meal_plans (
    id              TEXT PRIMARY KEY,
    member_id       TEXT REFERENCES family_members(id),  -- NULL = household plan
    week_start      TEXT NOT NULL,  -- ISO date of Monday
    plan_data       TEXT NOT NULL,  -- JSON: {mon:{breakfast,lunch,dinner}, tue:...}
    grocery_list    TEXT,           -- JSON: [{item, quantity, category, checked}]
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_meals_week ON meal_plans(week_start);
CREATE INDEX IF NOT EXISTS idx_meals_member ON meal_plans(member_id);

-- ============================================================
-- BUDGET / FINANCE TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS budget_entries (
    id              TEXT PRIMARY KEY,
    member_id       TEXT REFERENCES family_members(id),  -- NULL = household
    entry_type      TEXT NOT NULL,  -- 'income' | 'expense' | 'savings' | 'goal'
    category        TEXT NOT NULL,  -- 'groceries' | 'rent' | 'utilities' | 'entertainment' | 'salary' | etc.
    amount          REAL NOT NULL,
    description     TEXT,
    recurring       INTEGER DEFAULT 0,  -- 1 = monthly recurring
    frequency       TEXT,          -- 'weekly' | 'biweekly' | 'monthly' | 'yearly'
    date            TEXT NOT NULL,  -- ISO date
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_budget_member ON budget_entries(member_id);
CREATE INDEX IF NOT EXISTS idx_budget_date ON budget_entries(date);
CREATE INDEX IF NOT EXISTS idx_budget_category ON budget_entries(category);

-- Budget Goals (Pulse)
CREATE TABLE IF NOT EXISTS budget_goals (
    id TEXT PRIMARY KEY,
    member_id TEXT,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL NOT NULL DEFAULT 0,
    deadline TEXT,
    monthly_allocation REAL,
    auto_allocate INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_goals_member ON budget_goals(member_id);

-- Budget Settings (Zero-Based Budgeting Engine)
CREATE TABLE IF NOT EXISTS budget_settings (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    pay_frequency   TEXT NOT NULL DEFAULT 'semimonthly',
    pay_dates       TEXT NOT NULL DEFAULT '[1,15]',
    income_amount   REAL NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'USD',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_settings_user ON budget_settings(user_id);

-- Budget Buckets (spending categories with goals)
CREATE TABLE IF NOT EXISTS budget_buckets (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    icon            TEXT,
    monthly_goal    REAL NOT NULL DEFAULT 0,
    color           TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_buckets_user ON budget_buckets(user_id);

-- Budget Allocations (per-pay-period bucket amounts)
CREATE TABLE IF NOT EXISTS budget_allocations (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    bucket_id       TEXT NOT NULL REFERENCES budget_buckets(id),
    pay_period_id   TEXT NOT NULL,
    amount          REAL NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_allocations_user ON budget_allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_allocations_bucket ON budget_allocations(bucket_id);

-- Budget Transactions (actual spending/income)
CREATE TABLE IF NOT EXISTS budget_transactions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    bucket_id       TEXT REFERENCES budget_buckets(id),
    amount          REAL NOT NULL,
    date            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    description     TEXT,
    merchant        TEXT,
    category        TEXT,
    receipt_url     TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_user ON budget_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_bucket ON budget_transactions(bucket_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_date ON budget_transactions(date);

-- ============================================================
-- SMART KITCHEN — Meal Management System
-- ============================================================

-- Meals in the family's collection
CREATE TABLE IF NOT EXISTS meals (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    cuisine         TEXT,           -- 'italian' | 'mexican' | 'american' | 'asian' | etc.
    category        TEXT,           -- 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert'
    photo_url       TEXT,           -- path to photo
    prep_time_min   INTEGER,
    cook_time_min   INTEGER,
    servings        INTEGER DEFAULT 4,
    difficulty      TEXT DEFAULT 'normal',  -- 'easy' | 'normal' | 'hard'
    instructions    TEXT,           -- full recipe steps
    estimated_cost  REAL,           -- total cost for all ingredients
    cost_per_serving REAL,          -- estimated_cost / servings
    calories        INTEGER,        -- per serving estimate
    tags            TEXT,           -- JSON array: ['quick', 'healthy', 'kid-friendly', 'comfort-food']
    source          TEXT,           -- 'manual' | 'photo-ai' | 'imported'
    is_favorite     INTEGER DEFAULT 0,
    last_made       TEXT,           -- ISO date when this was last in the meal plan
    times_made      INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_meals_category ON meals(category);
CREATE INDEX IF NOT EXISTS idx_meals_cuisine ON meals(cuisine);
CREATE INDEX IF NOT EXISTS idx_meals_favorite ON meals(is_favorite);

-- Ingredients for each meal
CREATE TABLE IF NOT EXISTS meal_ingredients (
    id              TEXT PRIMARY KEY,
    meal_id         TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    quantity        REAL,
    unit            TEXT,           -- 'cups' | 'tbsp' | 'oz' | 'lbs' | 'pieces' | 'cloves'
    estimated_cost  REAL,           -- cost of this ingredient
    category        TEXT,           -- 'produce' | 'dairy' | 'meat' | 'pantry' | 'spice' | 'frozen'
    is_optional     INTEGER DEFAULT 0,
    notes           TEXT,           -- 'diced', 'minced', 'room temperature', etc.
    sort_order      INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ingredients_meal ON meal_ingredients(meal_id);

-- Weekly meal plan
CREATE TABLE IF NOT EXISTS meal_plans_v2 (
    id              TEXT PRIMARY KEY,
    week_start      TEXT NOT NULL,   -- ISO date of Monday
    day_of_week     INTEGER NOT NULL, -- 0=Mon, 1=Tue, ... 6=Sun
    meal_slot       TEXT NOT NULL,   -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
    meal_id         TEXT REFERENCES meals(id),
    notes           TEXT,           -- 'use leftover chicken', 'quick meal night'
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_plans_week ON meal_plans_v2(week_start);
CREATE INDEX IF NOT EXISTS idx_plans_meal ON meal_plans_v2(meal_id);

-- Grocery list (auto-generated from meal plan)
CREATE TABLE IF NOT EXISTS grocery_items (
    id              TEXT PRIMARY KEY,
    member_id       TEXT REFERENCES family_members(id),  -- NULL = household
    name            TEXT NOT NULL,
    quantity        REAL,
    unit            TEXT,
    category        TEXT,           -- 'produce' | 'dairy' | 'meat' | 'pantry' | etc.
    estimated_cost  REAL,
    is_checked      INTEGER DEFAULT 0,
    source_meal_id  TEXT REFERENCES meals(id),  -- which meal needs this
    week_start      TEXT,           -- which week this is for
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_grocery_week ON grocery_items(week_start);
CREATE INDEX IF NOT EXISTS idx_grocery_checked ON grocery_items(is_checked);

-- Kitchen inventory (future: what's in stock)
CREATE TABLE IF NOT EXISTS kitchen_inventory (
    id              TEXT PRIMARY KEY,
    member_id       TEXT REFERENCES family_members(id),
    name            TEXT NOT NULL,
    quantity        REAL,
    unit            TEXT,
    category        TEXT,
    expiry_date     TEXT,           -- ISO date
    location        TEXT,           -- 'fridge' | 'freezer' | 'pantry'
    last_restocked  TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_location ON kitchen_inventory(location);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON kitchen_inventory(expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_member ON kitchen_inventory(member_id);

-- Meal photos gallery (Hearth)
CREATE TABLE IF NOT EXISTS meal_photos (
    id TEXT PRIMARY KEY,
    meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    caption TEXT,
    ai_tags TEXT,
    taken_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_meal_photos_meal ON meal_photos(meal_id);

-- ============================================================
-- LIFE AUTOPILOT — Document Management & Proactive Intelligence
-- ============================================================

-- Documents uploaded/scanned by the family
CREATE TABLE IF NOT EXISTS life_documents (
    id              TEXT PRIMARY KEY,
    member_id       TEXT REFERENCES family_members(id),  -- NULL = household
    doc_type        TEXT NOT NULL,  -- 'bill' | 'school' | 'warranty' | 'medical' | 'insurance' | 'tax' | 'contract' | 'receipt' | 'other'
    title           TEXT NOT NULL,
    content         TEXT,           -- extracted text / AI summary
    raw_data        TEXT,           -- original text if scanned
    ai_summary      TEXT,           -- AI-generated summary
    ai_key_dates    TEXT,           -- JSON: [{date, description, type}]
    ai_action_items TEXT,           -- JSON: [{action, deadline, priority}]
    source          TEXT,           -- 'manual' | 'photo' | 'email' | 'scan'
    file_url        TEXT,           -- path to uploaded file
    tags            TEXT,           -- JSON array
    is_archived     INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_docs_member ON life_documents(member_id);
CREATE INDEX IF NOT EXISTS idx_docs_type ON life_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_docs_archived ON life_documents(is_archived);

-- Proactive reminders extracted from documents or set manually
CREATE TABLE IF NOT EXISTS life_reminders (
    id              TEXT PRIMARY KEY,
    member_id       TEXT REFERENCES family_members(id),
    document_id     TEXT REFERENCES life_documents(id),  -- NULL = manual
    reminder_type   TEXT NOT NULL,  -- 'deadline' | 'renewal' | 'appointment' | 'payment' | 'maintenance' | 'custom'
    title           TEXT NOT NULL,
    description     TEXT,
    due_date        TEXT NOT NULL,  -- ISO date
    priority        TEXT DEFAULT 'normal',  -- 'low' | 'normal' | 'high' | 'urgent'
    is_dismissed    INTEGER DEFAULT 0,
    is_completed    INTEGER DEFAULT 0,
    recurring       INTEGER DEFAULT 0,
    frequency       TEXT,           -- 'monthly' | 'quarterly' | 'yearly'
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_reminders_due ON life_reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_active ON life_reminders(is_dismissed, is_completed);
CREATE INDEX IF NOT EXISTS idx_reminders_member ON life_reminders(member_id);

-- Family knowledge base — things the AI "knows" about the family
CREATE TABLE IF NOT EXISTS life_knowledge (
    id              TEXT PRIMARY KEY,
    member_id       TEXT REFERENCES family_members(id),  -- NULL = household
    category        TEXT NOT NULL,  -- 'medical' | 'school' | 'home' | 'finance' | 'schedule' | 'personal' | 'preference'
    key             TEXT NOT NULL,  -- 'Emma-allergies', 'HVAC-filter-size', 'dentist-phone'
    value           TEXT NOT NULL,
    source_doc_id   TEXT REFERENCES life_documents(id),
    confidence      REAL DEFAULT 1.0,  -- 0.0 - 1.0 how confident the AI is
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_member ON life_knowledge(member_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON life_knowledge(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_key ON life_knowledge(member_id, key);

-- Life Autopilot: Orbit Tables
CREATE TABLE IF NOT EXISTS life_tasks (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES family_members(id),
    title TEXT NOT NULL,
    category TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    due_date TEXT,
    energy_type TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_life_tasks_member ON life_tasks(member_id);
CREATE INDEX IF NOT EXISTS idx_life_tasks_status ON life_tasks(status);
CREATE INDEX IF NOT EXISTS idx_life_tasks_due ON life_tasks(due_date);

CREATE TABLE IF NOT EXISTS life_habits (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES family_members(id),
    name TEXT NOT NULL,
    category TEXT,
    frequency TEXT DEFAULT 'daily',
    target_count INTEGER DEFAULT 1,
    streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_life_habits_member ON life_habits(member_id);

CREATE TABLE IF NOT EXISTS life_habit_logs (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL REFERENCES life_habits(id) ON DELETE CASCADE,
    logged_date TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON life_habit_logs(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON life_habit_logs(logged_date);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON life_habit_logs(habit_id, logged_date);

CREATE TABLE IF NOT EXISTS life_daily_focus (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES family_members(id),
    focus_date TEXT NOT NULL,
    task_id TEXT REFERENCES life_tasks(id),
    position INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_focus_date ON life_daily_focus(focus_date);
CREATE INDEX IF NOT EXISTS idx_focus_member ON life_daily_focus(member_id);

CREATE TABLE IF NOT EXISTS life_schedules (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES family_members(id),
    task_id TEXT REFERENCES life_tasks(id),
    suggested_time TEXT,
    energy_match TEXT,
    reason TEXT,
    accepted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_schedules_member ON life_schedules(member_id);

CREATE TABLE IF NOT EXISTS life_nudges (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES family_members(id),
    nudge_type TEXT NOT NULL,
    message TEXT NOT NULL,
    action_label TEXT,
    dismissed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_nudges_member ON life_nudges(member_id);

-- ── Home Health ──

CREATE TABLE IF NOT EXISTS home_profiles (
  id TEXT PRIMARY KEY,
  address TEXT,
  year_built INTEGER,
  square_feet INTEGER,
  hvac_type TEXT,
  hvac_filter_size TEXT,
  water_heater_type TEXT,
  roof_type TEXT,
  window_type TEXT,
  insulation_type TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS home_bills (
  id TEXT PRIMARY KEY,
  bill_type TEXT NOT NULL,
  amount REAL NOT NULL,
  usage REAL,
  billing_month TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_home_bills_type ON home_bills(bill_type);
CREATE INDEX IF NOT EXISTS idx_home_bills_month ON home_bills(billing_month);

CREATE TABLE IF NOT EXISTS home_maintenance (
  id TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  category TEXT NOT NULL,
  last_completed TEXT,
  interval_months INTEGER,
  next_due TEXT,
  priority TEXT DEFAULT 'normal',
  estimated_cost REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_home_maint_due ON home_maintenance(next_due);

CREATE TABLE IF NOT EXISTS home_appliances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  model TEXT,
  installed_date TEXT,
  expected_lifespan_years REAL,
  warranty_expiry TEXT,
  estimated_replacement_cost REAL,
  notes TEXT,
  last_service TEXT,
  next_service TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_home_appliances_cat ON home_appliances(category);

-- ── Dream Builder ──

CREATE TABLE IF NOT EXISTS dreams (
  id TEXT PRIMARY KEY,
  member_id TEXT REFERENCES family_members(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,     -- housing, education, health, career, travel, family, personal, financial
  target_date TEXT,            -- YYYY-MM-DD
  status TEXT DEFAULT 'active', -- active, completed, paused, cancelled
  progress REAL DEFAULT 0,     -- 0-100 percentage
  ai_plan TEXT,                -- JSON: reverse-engineered plan with milestones
  ai_next_actions TEXT,        -- JSON: immediate next steps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_dreams_member ON dreams(member_id);
CREATE INDEX IF NOT EXISTS idx_dreams_status ON dreams(status);

CREATE TABLE IF NOT EXISTS dream_milestones (
  id TEXT PRIMARY KEY,
  dream_id TEXT NOT NULL REFERENCES dreams(id),
  member_id TEXT REFERENCES family_members(id),
  title TEXT NOT NULL,
  description TEXT,
  target_date TEXT,
  completed_at TEXT,
  is_completed INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_milestones_dream ON dream_milestones(dream_id);
CREATE INDEX IF NOT EXISTS idx_milestones_member ON dream_milestones(member_id);

CREATE TABLE IF NOT EXISTS dream_tasks (
  id TEXT PRIMARY KEY,
  dream_id TEXT NOT NULL REFERENCES dreams(id),
  milestone_id TEXT REFERENCES dream_milestones(id),
  member_id TEXT REFERENCES family_members(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  completed_at TEXT,
  is_completed INTEGER DEFAULT 0,
  frequency TEXT,             -- daily, weekly, monthly, one-time
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_dream_tasks_dream ON dream_tasks(dream_id);
CREATE INDEX IF NOT EXISTS idx_dream_tasks_due ON dream_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_dream_tasks_member ON dream_tasks(member_id);

CREATE TABLE IF NOT EXISTS dream_progress (
  id TEXT PRIMARY KEY,
  dream_id TEXT NOT NULL REFERENCES dreams(id),
  member_id TEXT REFERENCES family_members(id),
  note TEXT,
  progress_change REAL,       -- percentage points changed
  ai_insight TEXT,            -- AI's analysis of the update
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_dream_progress_dream ON dream_progress(dream_id);
CREATE INDEX IF NOT EXISTS idx_dream_progress_member ON dream_progress(member_id);

-- ── Agent Diary ──

CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent_templates(id),
  entry_date TEXT NOT NULL,           -- YYYY-MM-DD
  title TEXT,                         -- auto-generated like "A Tuesday with Sarah"
  content TEXT NOT NULL,              -- the full diary text (AI's emotional writing)
  mood TEXT NOT NULL,                 -- happy, thoughtful, frustrated, proud, worried, grateful, excited, calm, confused, motivated
  topics_discussed TEXT,              -- JSON array of topics from conversations
  memorable_moment TEXT,              -- JSON: {moment: "...", feeling: "..."}
  word_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_diary_agent ON diary_entries(agent_id);
CREATE INDEX IF NOT EXISTS idx_diary_date ON diary_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_diary_mood ON diary_entries(mood);

CREATE TABLE IF NOT EXISTS diary_mood_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent_templates(id),
  mood TEXT NOT NULL,
  intensity INTEGER DEFAULT 50,       -- 0-100 how strongly felt
  trigger_event TEXT,                 -- what caused this mood
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_mood_agent ON diary_mood_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_mood_date ON diary_mood_log(created_at);

-- ============================================================
-- CURRENT — Intelligence Briefing
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_briefings (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  greeting TEXT NOT NULL,
  items_json TEXT NOT NULL,          -- JSON array of briefing items
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_member ON daily_briefings(member_id);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_date ON daily_briefings(generated_at);

CREATE TABLE IF NOT EXISTS ripples (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence REAL NOT NULL,          -- 0.0 - 1.0
  category TEXT NOT NULL,
  why_it_could_matter TEXT,
  sources_json TEXT,                 -- JSON array of sources
  detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_ripples_member ON ripples(member_id);
CREATE INDEX IF NOT EXISTS idx_ripples_confidence ON ripples(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_ripples_date ON ripples(detected_at);

CREATE TABLE IF NOT EXISTS signal_threads (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  topic TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_developments_json TEXT,        -- JSON array
  prediction TEXT,
  prediction_confidence REAL,
  entries_json TEXT,                 -- JSON array of thread entries
  entries_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_signal_threads_member ON signal_threads(member_id);
CREATE INDEX IF NOT EXISTS idx_signal_threads_updated ON signal_threads(updated_at DESC);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  key_points_json TEXT,             -- JSON array
  sources_json TEXT,                -- JSON array
  confidence_level TEXT,            -- high, medium, low
  asked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_questions_member ON questions(member_id);
CREATE INDEX IF NOT EXISTS idx_questions_date ON questions(asked_at DESC);

CREATE TABLE IF NOT EXISTS reading_patterns (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  time_range TEXT NOT NULL,
  category_distribution_json TEXT,   -- JSON object
  tone_trend TEXT,
  blind_spots_json TEXT,             -- JSON array
  focus_shift TEXT,
  recommendation TEXT,
  analyzed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_reading_patterns_member ON reading_patterns(member_id);
CREATE INDEX IF NOT EXISTS idx_reading_patterns_date ON reading_patterns(analyzed_at DESC);

-- ── Home Health: Foundation AI ──

CREATE TABLE IF NOT EXISTS home_problems (
  id TEXT PRIMARY KEY,
  symptom TEXT NOT NULL,
  diagnosis_json TEXT,
  system TEXT,
  severity TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  resolved INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_home_problems_system ON home_problems(system);
CREATE INDEX IF NOT EXISTS idx_home_problems_severity ON home_problems(severity);

CREATE TABLE IF NOT EXISTS home_seasonal_tasks (
  id TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  estimated_time_minutes INTEGER DEFAULT 30,
  estimated_cost REAL DEFAULT 0,
  diy_possible INTEGER DEFAULT 1,
  description TEXT,
  month INTEGER NOT NULL,
  completed INTEGER DEFAULT 0,
  completed_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_seasonal_tasks_month ON home_seasonal_tasks(month);

CREATE TABLE IF NOT EXISTS home_chat_history (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  context_json TEXT
);

-- Seed seasonal tasks: January
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-01-01', 'Inspect and replace HVAC air filter', 'hvac', 'high', 15, 15, 1, 'Check your HVAC filter. If dirty, replace with the correct size. A clean filter improves efficiency and air quality.', 1),
  ('st-01-02', 'Check smoke and CO detectors', 'safety', 'critical', 10, 0, 1, 'Test all smoke and carbon monoxide detectors. Replace batteries if needed.', 1),
  ('st-01-03', 'Inspect attic for leaks or ice dams', 'roof', 'high', 30, 0, 1, 'Look for signs of water intrusion, frost buildup, or ice dam formation in the attic.', 1),
  ('st-01-04', 'Drain and flush water heater', 'plumbing', 'normal', 30, 0, 1, 'Drain a few gallons from the water heater tank to remove sediment buildup.', 1);

-- February
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-02-01', 'Inspect caulking around windows and doors', 'general', 'normal', 45, 10, 1, 'Check for cracked or missing caulking. Re-caulk to prevent drafts and moisture intrusion.', 2),
  ('st-02-02', 'Test sump pump operation', 'plumbing', 'high', 10, 0, 1, 'Pour water into the sump pit to verify the pump activates and drains properly before spring thaw.', 2),
  ('st-02-03', 'Check fire extinguisher expiration', 'safety', 'normal', 5, 0, 1, 'Verify all fire extinguishers are charged, accessible, and not expired.', 2),
  ('st-02-04', 'Plan spring landscaping and yard projects', 'yard', 'low', 30, 0, 1, 'Create a plan for spring planting, mulch needs, and any yard improvements.', 2);

-- March
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-03-01', 'Clean gutters and downspouts', 'roof', 'high', 60, 0, 1, 'Remove debris from gutters. Ensure downspouts direct water at least 3 feet from the foundation.', 3),
  ('st-03-02', 'Service AC unit before summer', 'hvac', 'high', 60, 150, 0, 'Schedule professional AC tune-up. Clean condenser coils, check refrigerant levels.', 3),
  ('st-03-03', 'Inspect roof for winter damage', 'roof', 'high', 30, 0, 1, 'Walk the perimeter looking for missing/damaged shingles, flashing issues, or sagging.', 3),
  ('st-03-04', 'Aerate and overseed lawn', 'yard', 'normal', 120, 50, 1, 'Core aerate the lawn and apply grass seed to fill in bare patches before spring growth.', 3);

-- April
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-04-01', 'Inspect and clean dryer vent', 'safety', 'critical', 45, 0, 1, 'Clean lint from dryer vent duct. A clogged vent is a leading cause of house fires.', 4),
  ('st-04-02', 'Check exterior paint and siding', 'general', 'normal', 30, 0, 1, 'Walk around the house checking for peeling paint, damaged siding, or wood rot.', 4),
  ('st-04-03', 'Test outdoor irrigation system', 'yard', 'normal', 30, 0, 1, 'Turn on sprinkler system. Check for broken heads, leaks, and proper coverage.', 4),
  ('st-04-04', 'Replace HVAC filter', 'hvac', 'normal', 15, 15, 1, 'Swap out HVAC air filter for spring season.', 4);

-- May
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-05-01', 'Clean and inspect deck/patio', 'general', 'normal', 60, 25, 1, 'Power wash deck or patio. Inspect for loose boards, protruding nails, or structural issues.', 5),
  ('st-05-02', 'Service lawn mower', 'yard', 'normal', 30, 30, 1, 'Change oil, replace spark plug, sharpen blade, and check air filter on lawn mower.', 5),
  ('st-05-03', 'Check window screens for damage', 'general', 'low', 20, 10, 1, 'Inspect all window screens for tears. Repair or replace before bug season peaks.', 5),
  ('st-05-04', 'Inspect basement/crawlspace for moisture', 'plumbing', 'normal', 20, 0, 1, 'Check for water stains, musty odors, or visible moisture in basement or crawlspace.', 5);

-- June
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-06-01', 'Check attic ventilation', 'hvac', 'normal', 20, 0, 1, 'Ensure attic vents are not blocked. Proper ventilation reduces cooling costs and extends roof life.', 6),
  ('st-06-02', 'Inspect and clean garbage disposal', 'plumbing', 'low', 10, 0, 1, 'Run ice cubes and citrus peels through disposal to clean blades and eliminate odors.', 6),
  ('st-06-03', 'Trim trees and shrubs from house', 'yard', 'normal', 60, 0, 1, 'Cut back branches touching the roof or siding. Maintain 1-foot clearance from the structure.', 6),
  ('st-06-04', 'Test GFCI outlets', 'safety', 'normal', 10, 0, 1, 'Press the test/reset button on all GFCI outlets in kitchen, bathrooms, garage, and outdoors.', 6);

-- July
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-07-01', 'Inspect and clean AC condensate drain', 'hvac', 'normal', 15, 0, 1, 'Pour a cup of vinegar down the AC condensate drain line to prevent clogs and water damage.', 7),
  ('st-07-02', 'Check toilet for leaks', 'plumbing', 'low', 10, 0, 1, 'Add food coloring to toilet tank. If color appears in bowl within 15 min without flushing, the flapper leaks.', 7),
  ('st-07-03', 'Deep clean kitchen exhaust fan/filter', 'general', 'normal', 20, 0, 1, 'Remove and soak range hood filter in degreaser. Clean fan blades and housing.', 7),
  ('st-07-04', 'Apply grub control to lawn', 'yard', 'normal', 30, 25, 1, 'Apply preventive grub control treatment to lawn if you have a history of grub damage.', 7);

-- August
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-08-01', 'Inspect caulking and weatherstripping', 'general', 'normal', 30, 10, 1, 'Check all window and door seals before fall. Re-caulk or replace weatherstripping as needed.', 8),
  ('st-08-02', 'Drain and winterize outdoor hoses', 'plumbing', 'normal', 15, 0, 1, 'Disconnect and drain garden hoses. Store indoors to prevent freeze damage to hose bibs.', 8),
  ('st-08-03', 'Schedule furnace inspection', 'hvac', 'high', 10, 120, 0, 'Book a professional furnace tune-up before heating season. Inspect heat exchanger, clean burners.', 8),
  ('st-08-04', 'Clean and seal driveway', 'general', 'normal', 120, 50, 1, 'Power wash driveway cracks. Apply concrete sealer or asphalt sealant before winter.', 8);

-- September
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-09-01', 'Clean gutters (fall pre-clean)', 'roof', 'high', 60, 0, 1, 'Clear early fall debris from gutters before the main leaf drop begins.', 9),
  ('st-09-02', 'Test heating system', 'hvac', 'high', 15, 0, 1, 'Run the furnace for a test cycle. Ensure it ignites properly and heats evenly through all zones.', 9),
  ('st-09-03', 'Seal gaps where pests could enter', 'general', 'normal', 30, 5, 1, 'Inspect foundation, vents, and utility penetrations. Seal any gaps larger than 1/4 inch with steel wool and caulk.', 9),
  ('st-09-04', 'Overseed and fertilize lawn', 'yard', 'normal', 60, 40, 1, 'Fall is the best time to overseed cool-season grasses. Apply starter fertilizer after seeding.', 9);

-- October
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-10-01', 'Winterize outdoor irrigation', 'plumbing', 'high', 45, 75, 0, 'Blow out sprinkler lines with compressed air to prevent freeze damage.', 10),
  ('st-10-02', 'Replace HVAC filter', 'hvac', 'normal', 15, 15, 1, 'Install a fresh filter before heating season starts. Consider a higher MERV rating for winter.', 10),
  ('st-10-03', 'Rake leaves and mulch garden beds', 'yard', 'normal', 90, 0, 1, 'Remove leaves from lawn. Apply 2-3 inches of mulch around perennials and shrubs for winter protection.', 10),
  ('st-10-04', 'Check attic insulation', 'general', 'normal', 20, 0, 1, 'Verify attic insulation is at recommended R-value. Look for gaps, compression, or moisture damage.', 10);

-- November
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-11-01', 'Reverse ceiling fans to clockwise', 'hvac', 'low', 10, 0, 1, 'Switch ceiling fans to clockwise rotation at low speed to push warm air down from the ceiling.', 11),
  ('st-11-02', 'Clean chimney and inspect fireplace', 'safety', 'high', 60, 200, 0, 'Schedule chimney sweep. Inspect damper, firebox, and flue liner for creosote buildup and cracks.', 11),
  ('st-11-03', 'Protect outdoor faucets from freeze', 'plumbing', 'high', 15, 10, 1, 'Install insulated faucet covers on all outdoor hose bibs before first hard freeze.', 11),
  ('st-11-04', 'Check emergency preparedness kit', 'safety', 'normal', 20, 0, 1, 'Verify flashlights, batteries, first aid kit, blankets, and 72-hour supplies are stocked and accessible.', 11);

-- December
INSERT OR IGNORE INTO home_seasonal_tasks (id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month) VALUES
  ('st-12-01', 'Inspect pipes for freeze protection', 'plumbing', 'critical', 20, 0, 1, 'Check exposed pipes in attic, crawlspace, and garage. Add insulation to vulnerable pipes.', 12),
  ('st-12-02', 'Test and reset all GFCI and AFCI breakers', 'safety', 'normal', 15, 0, 1, 'Test all GFCI outlets and AFCI circuit breakers to ensure proper function during high-use holiday season.', 12),
  ('st-12-03', 'Inspect roof and flashing before winter storms', 'roof', 'high', 30, 0, 1, 'Do a visual roof inspection from the ground. Look for loose shingles, damaged flashing, or blocked vents.', 12),
  ('st-12-04', 'Clean HVAC vents and registers', 'hvac', 'low', 20, 0, 1, 'Remove and vacuum all supply and return air registers. Dust buildup reduces airflow efficiency.', 12);

-- ============================================================
-- ECHO — Writing & Notes with AI Insights
-- ============================================================

CREATE TABLE IF NOT EXISTS echo_entries (
    id              TEXT PRIMARY KEY,
    content         TEXT NOT NULL,
    mood            TEXT,              -- 'great' | 'good' | 'okay' | 'bad' | 'terrible' | null
    tags            TEXT,              -- JSON array of tags
    is_voice        INTEGER NOT NULL DEFAULT 0,
    word_count      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_echo_entries_date ON echo_entries(created_at);

CREATE TABLE IF NOT EXISTS echo_patterns (
    id              TEXT PRIMARY KEY,
    pattern_type    TEXT NOT NULL,     -- 'mood' | 'topic' | 'time' | 'frequency'
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    confidence      REAL NOT NULL DEFAULT 0.0,
    data_json       TEXT,              -- JSON blob with supporting data
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS echo_digests (
    id              TEXT PRIMARY KEY,
    week_start      TEXT NOT NULL,     -- ISO date of week start
    summary         TEXT NOT NULL,
    themes          TEXT NOT NULL,     -- JSON array
    mood_trajectory TEXT,              -- JSON array of daily moods
    highlights      TEXT,              -- JSON array
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS echo_reminders (
    id              TEXT PRIMARY KEY,
    reminder_type   TEXT NOT NULL,     -- 'daily_checkin' | 'morning_mirror' | 'weekly_digest'
    scheduled_at    TEXT NOT NULL,
    delivered_at    TEXT,
    content         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- VAULT — Local File Browser & Project Manager
-- ============================================================

CREATE TABLE IF NOT EXISTS vault_files (
    id              TEXT PRIMARY KEY,
    path            TEXT NOT NULL UNIQUE,          -- absolute path on disk
    name            TEXT NOT NULL,
    file_type       TEXT NOT NULL,                 -- 'image' | 'audio' | 'video' | 'code' | 'document' | 'archive' | 'other'
    mime_type       TEXT,
    extension       TEXT,
    size_bytes      INTEGER NOT NULL DEFAULT 0,
    thumbnail_path  TEXT,                          -- path to generated thumbnail
    width           INTEGER,                       -- for images/video
    height          INTEGER,                       -- for images/video
    duration_secs   REAL,                          -- for audio/video
    created_by      TEXT,                          -- agent id that created it, or null
    source_prompt   TEXT,                          -- the prompt that generated it, if any
    description     TEXT,                          -- AI-generated description
    is_favorite     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_vault_files_type ON vault_files(file_type);
CREATE INDEX IF NOT EXISTS idx_vault_files_date ON vault_files(created_at);
CREATE INDEX IF NOT EXISTS idx_vault_files_name ON vault_files(name);
CREATE INDEX IF NOT EXISTS idx_vault_files_agent ON vault_files(created_by);

CREATE TABLE IF NOT EXISTS vault_projects (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    project_type    TEXT,                          -- 'website' | 'design' | 'code' | 'media' | 'mixed' | null
    cover_file_id   TEXT,                          -- file id for project thumbnail
    is_archived     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS vault_project_files (
    project_id      TEXT NOT NULL REFERENCES vault_projects(id) ON DELETE CASCADE,
    file_id         TEXT NOT NULL REFERENCES vault_files(id) ON DELETE CASCADE,
    role            TEXT,                          -- 'main' | 'asset' | 'source' | 'output' | null
    added_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (project_id, file_id)
);

CREATE TABLE IF NOT EXISTS vault_tags (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    color           TEXT,                          -- hex color for the tag pill
    tag_type        TEXT,                          -- 'auto' | 'manual' | 'agent' | 'system'
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS vault_file_tags (
    file_id         TEXT NOT NULL REFERENCES vault_files(id) ON DELETE CASCADE,
    tag_id          TEXT NOT NULL REFERENCES vault_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
);

-- ============================================================
-- STUDIO — Creator Workspace
-- ============================================================

CREATE TABLE IF NOT EXISTS studio_generations (
    id              TEXT PRIMARY KEY,
    module          TEXT NOT NULL,        -- 'image' | 'video' | 'music' | 'voice' | 'code' | 'design'
    prompt          TEXT NOT NULL,
    remix_of        TEXT,                 -- parent generation id if remix
    model           TEXT NOT NULL,
    provider        TEXT NOT NULL,
    status          TEXT NOT NULL,        -- 'pending' | 'generating' | 'complete' | 'failed'
    output_path     TEXT,                 -- local file path
    output_url      TEXT,                 -- provider URL if applicable
    metadata_json   TEXT,                 -- dimensions, duration, format, etc
    cost_cents      INTEGER NOT NULL DEFAULT 0,
    vault_file_id   TEXT,                 -- linked vault file
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_studio_gen_module ON studio_generations(module);
CREATE INDEX IF NOT EXISTS idx_studio_gen_status ON studio_generations(status);
CREATE INDEX IF NOT EXISTS idx_studio_gen_date ON studio_generations(created_at);

CREATE TABLE IF NOT EXISTS studio_prompts (
    id              TEXT PRIMARY KEY,
    prompt          TEXT NOT NULL,
    module          TEXT NOT NULL,
    use_count       INTEGER NOT NULL DEFAULT 1,
    last_used       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS studio_usage (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL DEFAULT 'default',
    month           TEXT NOT NULL,        -- 'YYYY-MM'
    module          TEXT NOT NULL,
    generation_count INTEGER NOT NULL DEFAULT 0,
    total_cost_cents INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, month, module)
);

-- ============================================================
-- VOICE — Speech Capture & Transcription Configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS voice_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO voice_config (key, value) VALUES
  ('model_name', 'small'),
  ('language', 'en'),
  ('max_duration_ms', '30000'),
  ('sound_effects', 'false'),
  ('device_id', 'default');

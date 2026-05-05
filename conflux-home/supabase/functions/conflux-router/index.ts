import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2";

// ============================================================
// CONFLUX ROUTER — /v1/chat/completions
// Auth → Rate limit (free tier) → Credit check → Route to provider → Stream response → Deduct credits
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// Separate anon client for JWT validation — getUser() works correctly with anon key
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Types ---

type TaskType =
  | "simple_chat"
  | "summarize"
  | "extract"
  | "translate"
  | "code_gen"
  | "tool_orchestrate"
  | "image_gen"
  | "file_ops"
  | "web_browse"
  | "creative"
  | "deep_reasoning"
  | "agentic_complex";

type ToolReliability = "reliable" | "basic" | "none";
type ModelTier = "core" | "pro" | "ultra";

interface RoutingRule {
  tier: ModelTier;
  description: string;
  min_tool_reliability: ToolReliability;
  preferred_models: string[];
}

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequest {
  model?: string;
  task_type?: TaskType;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: string;
}

interface ModelRoute {
  model_alias: string;
  provider: string;
  provider_model_id: string;
  credit_cost_per_1k_in: number;
  credit_cost_per_1k_out: number;
  max_tokens: number;
  context_window: number;
  tier: string;
  enabled: boolean;
  fallback_model: string | null;
}

interface ProviderConfig {
  provider: string;
  api_key_encrypted: string;
  base_url: string;
  enabled: boolean;
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: string; // ISO-8601
}

// ============================================================
// EMBEDDED ROUTING CONFIG (from routing-config.json)
// Edge functions can't import local files, so this is inlined.
// ============================================================

const TASK_TYPES: Record<string, RoutingRule> = {
  simple_chat: {
    tier: "core",
    description: "Greeting, basic Q&A, text formatting. No tools needed.",
    min_tool_reliability: "basic",
    preferred_models: [
      "llama-3.3-70b-cf",
      "llama-3.3-70b-groq",
      "llama-3.3-70b",
      "llama-4-scout-cf",
      "llama-4-scout-groq",
      "gpt-oss-120b-groq",
      "gpt-4o-mini",
      "deepseek-chat",
      "gemini-flash",
      "grok-3-mini",
      "mistral-small",
    ],
  },
  summarize: {
    tier: "core",
    description: "Text extraction, classification, summarization. Light file read.",
    min_tool_reliability: "basic",
    preferred_models: [
      "llama-3.3-70b-cf",
      "llama-3.3-70b-groq",
      "llama-3.3-70b",
      "gpt-4o-mini",
      "claude-haiku",
      "deepseek-chat",
      "mistral-medium",
      "gemini-flash",
    ],
  },
  extract: {
    tier: "core",
    description: "Data extraction, parsing, structured output from text.",
    min_tool_reliability: "basic",
    preferred_models: [
      "llama-3.3-70b-cf",
      "llama-3.3-70b-groq",
      "llama-3.3-70b",
      "gpt-4o-mini",
      "deepseek-chat",
      "claude-haiku",
      "grok-4.1-fast",
      "mistral-small",
    ],
  },
  translate: {
    tier: "core",
    description: "Language translation, localization.",
    min_tool_reliability: "basic",
    preferred_models: [
      "llama-3.3-70b-cf",
      "llama-3.3-70b-groq",
      "llama-3.3-70b",
      "gpt-4o-mini",
      "deepseek-chat",
      "claude-haiku",
      "gemini-flash",
      "mistral-medium",
    ],
  },
  code_gen: {
    tier: "pro",
    description: "Write code, fix bugs, refactor. Needs file read/write/exec.",
    min_tool_reliability: "reliable",
    preferred_models: [
      "gemini-2.5-flash",
      "gpt-4.1-mini",
      "deepseek-r1",
      "grok-code-fast",
      "mistral-codestral",
    ],
  },
  tool_orchestrate: {
    tier: "pro",
    description: "Multi-step tool chaining, API calls, file operations.",
    min_tool_reliability: "reliable",
    preferred_models: [
      "gpt-4.1-mini",
      "grok-code-fast",
      "gemini-2.5-flash",
      "mimo-v2-pro",
      "mistral-large",
    ],
  },
  image_gen: {
    tier: "pro",
    description: "Image creation, editing, vision tasks. Needs tool + vision.",
    min_tool_reliability: "reliable",
    preferred_models: [
      "grok-code-fast",
      "gpt-4.1-mini",
      "gemini-2.5-flash",
      "mistral-large",
      "deepseek-r1",
    ],
  },
  file_ops: {
    tier: "pro",
    description: "File read/write/edit, directory operations, search.",
    min_tool_reliability: "reliable",
    preferred_models: [
      "gpt-4.1-mini",
      "gemini-2.5-flash",
      "grok-code-fast",
      "deepseek-r1",
      "mistral-large",
    ],
  },
  web_browse: {
    tier: "pro",
    description: "Web scraping, search, URL fetching, browser automation.",
    min_tool_reliability: "reliable",
    preferred_models: [
      "gpt-4.1-mini",
      "gemini-2.5-flash",
      "grok-code-fast",
      "deepseek-r1",
      "mimo-v2-pro",
    ],
  },
  creative: {
    tier: "pro",
    description: "Creative writing, content generation, brainstorming.",
    min_tool_reliability: "basic",
    preferred_models: [
      "gemini-2.5-flash",
      "gpt-4.1-mini",
      "grok-code-fast",
      "mistral-large",
      "deepseek-r1",
    ],
  },
  deep_reasoning: {
    tier: "ultra",
    description: "Research, analysis, complex multi-step reasoning.",
    min_tool_reliability: "reliable",
    preferred_models: [
      "claude-sonnet",
      "gpt-4.1",
      "gemini-pro",
      "grok-4.20",
      "claude-sonnet-4.5",
    ],
  },
  agentic_complex: {
    tier: "ultra",
    description: "Full workflows, 20+ tool calls, error recovery needed.",
    min_tool_reliability: "reliable",
    preferred_models: [
      "claude-opus",
      "gpt-4o",
      "grok-4.20",
      "claude-sonnet",
      "gpt-4.1",
    ],
  },
};

const TIER_DEFAULTS: Record<ModelTier, { max_tokens: number; temperature: number; cost_per_1k_credits: number }> = {
  core: { max_tokens: 4096, temperature: 0.7, cost_per_1k_credits: 1 },
  pro: { max_tokens: 8192, temperature: 0.7, cost_per_1k_credits: 2 },
  ultra: { max_tokens: 16384, temperature: 0.7, cost_per_1k_credits: 5 },
};

const TOOL_RELIABILITY: Record<string, string[]> = {
  reliable: [
    "claude-opus", "claude-sonnet", "claude-sonnet-4.5", "claude-haiku", "claude-haiku-3.5",
    "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini",
    "gemini-pro", "gemini-2.5-flash", "gemini-flash",
    "deepseek-r1", "deepseek-chat",
    "grok-3", "grok-3-mini", "grok-4.1-fast", "grok-4.20", "grok-code-fast",
    "mimo-v2-pro",
    "mistral-medium", "mistral-small", "mistral-large", "mistral-codestral",
    "o1", "o3", "o3-mini", "o4-mini", "codex-mini",
  ],
  basic: [
    "llama-3.3-70b-groq", "llama-3.3-70b-cf",
    "llama-4-scout-cf", "llama-4-scout-groq",
    "llama-3.1-8b-cerebras", "llama-3.1-8b-groq", "llama-3.1-8b-cf", "llama-3.1-70b-cf",
    "mimo-v2", "mimo-v2-omni",
    "ministral-8b", "ministral-3b", "ministral-14b",
    "pixtral-12b",
    "qwen-3-235b-cerebras", "qwen3-32b-groq", "qwen2.5-coder-cf",
    "glm-4.7-cerebras",
    "gpt-oss-120b-cerebras", "gpt-oss-120b-groq", "gpt-oss-120b-cf", "gpt-oss-20b-groq",
    "mistral-small-3.1-cf",
    "gemma-3-12b-cf",
    "kimi-k2.5-cf", "kimi-k2-groq",
    "deepseek-r1-distill-cf",
  ],
};

// Free tier constants
const FREE_TIER_MONTHLY_LIMIT = 500;

// --- Cache (in-memory for this function instance) ---
let modelRoutesCache: Map<string, ModelRoute> = new Map();
let providerCache: Map<string, ProviderConfig> = new Map();
let cacheTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

async function loadCaches() {
  if (Date.now() - cacheTime < CACHE_TTL && modelRoutesCache.size > 0) return;

  const { data: routes } = await supabase
    .from("model_routes")
    .select("*")
    .eq("enabled", true);

  const { data: providers } = await supabase
    .from("provider_config")
    .select("*")
    .eq("enabled", true);

  if (providers) {
    providerCache = new Map(providers.map((p: ProviderConfig) => [p.provider, p]));
  }
  if (routes) {
    // Only cache models whose provider is enabled
    const enabledRoutes = routes.filter((r: ModelRoute) => {
      const providerEnabled = providerCache.has(r.provider);
      return providerEnabled;
    });
    modelRoutesCache = new Map(enabledRoutes.map((r: ModelRoute) => [r.model_alias, r]));
    console.log(`[loadCaches] Loaded ${enabledRoutes.length}/${routes.length} enabled model routes`);
  }
  cacheTime = Date.now();
}

// --- Deterministic Model Router (embedded) ---

function meetsReliability(modelAlias: string, minLevel: ToolReliability): boolean {
  if (minLevel === "basic") {
    return (
      TOOL_RELIABILITY.reliable.includes(modelAlias) ||
      TOOL_RELIABILITY.basic.includes(modelAlias)
    );
  }
  if (minLevel === "reliable") {
    return TOOL_RELIABILITY.reliable.includes(modelAlias);
  }
  return true; // 'none' — any model qualifies
}

interface RouteSelection {
  modelAlias: string;
  tier: ModelTier;
  taskType: string;
}

/**
 * Select the best model for a given task type.
 * Only considers models that exist in modelRoutesCache (i.e. enabled in DB).
 */
function selectModelForTask(
  taskType: string,
  availableModels: Map<string, ModelRoute>
): RouteSelection | null {
  const rule = TASK_TYPES[taskType];
  if (!rule) {
    console.warn(`[Router] Unknown task type: ${taskType}`);
    return null;
  }

  // Find first preferred model that:
  // 1. Meets the tool reliability requirement
  // 2. Exists in modelRoutesCache (is enabled in DB)
  const selected = rule.preferred_models.find(
    (alias) =>
      meetsReliability(alias, rule.min_tool_reliability) &&
      availableModels.has(alias)
  );

  if (!selected) {
    console.warn(
      `[Router] No enabled model found for task "${taskType}" with min reliability "${rule.min_tool_reliability}"`
    );
    return null;
  }

  return {
    modelAlias: selected,
    tier: rule.tier,
    taskType,
  };
}

/**
 * Find the cheapest available core-tier model (for free-tier fallback).
 */
function findCheapestCoreModel(
  availableModels: Map<string, ModelRoute>
): ModelRoute | null {
  let cheapest: ModelRoute | null = null;
  for (const route of availableModels.values()) {
    if (route.tier === "core" && route.enabled) {
      if (
        !cheapest ||
        route.credit_cost_per_1k_in < cheapest.credit_cost_per_1k_in
      ) {
        cheapest = route;
      }
    }
  }
  return cheapest;
}

/**
 * Find the first enabled model in the cheapest tier (general fallback).
 */
function findFallbackModel(
  availableModels: Map<string, ModelRoute>
): ModelRoute | null {
  // Prefer core → pro → ultra
  for (const tier of ["core", "pro", "ultra"] as ModelTier[]) {
    for (const route of availableModels.values()) {
      if (route.tier === tier && route.enabled) return route;
    }
  }
  return null;
}

// --- Auth ---

async function authenticate(req: Request): Promise<{ userId: string; isApiKey: boolean } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.log('[Auth] No Authorization header');
    return null;
  }

  const token = authHeader.replace("Bearer ", "");
  console.log('[Auth] Token received, length:', token.length, 'preview:', token.substring(0, 20));

  // Check if it's an API key (cf_live_ or cf_test_ prefix)
  if (token.startsWith("cf_live_") || token.startsWith("cf_test_")) {
    const keyHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token)
    );
    const hashHex = Array.from(new Uint8Array(keyHash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { data } = await supabase
      .from("api_keys")
      .select("user_id, is_active, expires_at")
      .eq("key_hash", hashHex)
      .single();

    if (!data || !data.is_active) return null;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

    // Update last_used_at
    await supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("key_hash", hashHex);

    return { userId: data.user_id, isApiKey: true };
  }

  // Otherwise, treat as Supabase JWT
  // Try getUser() first; it handles HS256 JWTs correctly.
  // For ES256 JWTs (ECDSA), getUser() may throw UNSUPPORTED_TOKEN_ALGORITHM,
  // so we wrap it in a try-catch and fall back to direct payload decode.
  let userId: string | null = null;
  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (!error && user) {
      userId = user.id;
    }
  } catch (getUserErr: unknown) {
    // ES256 or other unsupported algorithm — fall through to JWT payload decode
    console.warn('[Auth] getUser() threw (possibly ES256):', getUserErr instanceof Error ? getUserErr.message : String(getUserErr));
  }

  if (!userId) {
    // Fallback: decode JWT payload directly (no signature verification).
    // The Supabase gateway already verified the JWT at the edge, so we just
    // extract the user ID from the payload for ES256 and other unsupported algs.
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.sub) {
          console.log('[Auth] JWT payload decode OK, sub:', payload.sub);
          userId = payload.sub;
        }
      }
    } catch (decodeErr) {
      console.error('[Auth] JWT payload decode failed:', decodeErr);
    }
  }

  if (!userId) return null;
  return { userId, isApiKey: false };
}

// --- Free Tier Rate Limiting ---

/**
 * Check the user's monthly call count against the free tier limit.
 * Returns rate limit info. The caller should check remaining > 0.
 */
async function checkRateLimit(userId: string): Promise<RateLimitInfo> {
  const now = new Date();
  // First day of current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  // First day of next month
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const { count, error } = await supabase
    .from("usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStart);

  if (error) {
    console.error("Rate limit query error:", error);
    // On error, be permissive — allow the request
    return { limit: FREE_TIER_MONTHLY_LIMIT, remaining: FREE_TIER_MONTHLY_LIMIT, reset: nextMonth };
  }

  const used = count ?? 0;
  return {
    limit: FREE_TIER_MONTHLY_LIMIT,
    remaining: Math.max(0, FREE_TIER_MONTHLY_LIMIT - used),
    reset: nextMonth,
  };
}

// --- Credit Check ---

async function checkCredits(
  userId: string,
  modelAlias: string,
  estimatedTokensIn: number,
  estimatedTokensOut: number
): Promise<{ hasCredits: boolean; estimatedCost: number; balance: number; tier: string }> {
  const { data, error } = await supabase.rpc("check_user_credits", {
    p_user_id: userId,
    p_model_alias: modelAlias,
    p_estimated_tokens_in: estimatedTokensIn,
    p_estimated_tokens_out: estimatedTokensOut,
  });

  // If RPC failed entirely, log and auto-create
  if (error) {
    console.error(`[checkCredits] RPC error for user ${userId}:`, error.message);
  }

  // Check if user has no credit account (NULL from RPC = no row exists)
  // Only auto-create if: RPC errored, returned no data, or balance is 0 with no prior consumption
  const needsAutoCreate = error || !data || data.length === 0;

  if (needsAutoCreate) {
    console.log(`[checkCredits] No credit account for user ${userId}, auto-creating with 500 free credits`);
    const { error: upsertError } = await supabase
      .from("credit_accounts")
      .upsert({
        user_id: userId,
        balance: 500,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("[checkCredits] Failed to auto-create credit account:", upsertError);
      // Return 500 credits so first chat works even if DB write failed
      return { hasCredits: true, estimatedCost: 1, balance: 500, tier: "core" };
    }

    // Retry the check after creation
    const { data: retryData, error: retryError } = await supabase.rpc("check_user_credits", {
      p_user_id: userId,
      p_model_alias: modelAlias,
      p_estimated_tokens_in: estimatedTokensIn,
      p_estimated_tokens_out: estimatedTokensOut,
    });

    if (retryError) {
      console.error("[checkCredits] Retry RPC error:", retryError.message);
    }

    if (retryData && retryData.length > 0) {
      const result = retryData[0];
      return {
        hasCredits: result.has_credits,
        estimatedCost: result.estimated_cost,
        balance: result.current_balance,
        tier: result.model_tier,
      };
    }

    // Still failed — return 500 free credits as fallback so first chat works
    return { hasCredits: true, estimatedCost: 1, balance: 500, tier: "core" };
  }

  // Normal path — user has a credit account
  const result = data[0];

  // Edge case: 0 balance + 0 consumed = account was just created but not funded
  // This shouldn't happen with the trigger, but handle it gracefully
  if (result.current_balance === 0 && !result.has_credits) {
    console.log(`[checkCredits] User ${userId} has 0 balance and insufficient credits`);
  }

  return {
    hasCredits: result.has_credits,
    estimatedCost: result.estimated_cost,
    balance: result.current_balance,
    tier: result.model_tier,
  };
}

// --- API Credit Check (for API key users) ---

async function checkApiCredits(
  userId: string,
  modelAlias: string,
  estimatedTokensIn: number,
  estimatedTokensOut: number
): Promise<{ hasCredits: boolean; estimatedCost: number; balance: number; tier: string }> {
  const { data, error } = await supabase.rpc("check_api_credits", {
    p_user_id: userId,
    p_model_alias: modelAlias,
    p_estimated_tokens_in: estimatedTokensIn,
    p_estimated_tokens_out: estimatedTokensOut,
  });

  if (error || !data || data.length === 0) {
    console.error("API credit check failed:", { userId, error: error?.message });
    return { hasCredits: false, estimatedCost: 0, balance: 0, tier: "core" };
  }

  const result = data[0];
  return {
    hasCredits: result.has_credits,
    estimatedCost: result.estimated_cost,
    balance: result.current_balance,
    tier: result.model_tier,
  };
}

// --- Tool Schema Adapters ---

/**
 * Convert OpenAI-format tools to provider-specific format.
 * OpenAI tools come in as:
 *   [{ type: "function", function: { name, description, parameters } }]
 */
function adaptToolsForProvider(
  tools: unknown[],
  provider: string,
  tool_choice?: string
): { adaptedTools: unknown; adaptedToolChoice?: unknown } {
  if (provider === "anthropic") {
    // Anthropic expects: [{ name, description, input_schema }]
    const anthropicTools = (tools as Record<string, unknown>[]).map((t) => {
      const fn = (t.function ?? t) as Record<string, unknown>;
      return {
        name: fn.name,
        description: fn.description ?? "",
        input_schema: fn.parameters ?? { type: "object", properties: {} },
      };
    });
    // Anthropic tool_choice: "auto" | "any" | { type: "tool", name: "..." }
    const anthropicChoice = tool_choice === "required" ? "any" : tool_choice ?? "auto";
    return { adaptedTools: anthropicTools, adaptedToolChoice: anthropicChoice };
  }

  if (provider === "google") {
    // Gemini expects: [{ functionDeclarations: [{ name, description, parameters }], ... }]
    const functionDeclarations = (tools as Record<string, unknown>[]).map((t) => {
      const fn = (t.function ?? t) as Record<string, unknown>;
      return {
        name: fn.name,
        description: fn.description ?? "",
        parameters: fn.parameters,
      };
    });
    const geminiTools = [{ functionDeclarations }];
    // Gemini tool_config
    const geminiChoice = tool_choice === "required"
      ? { functionCallingConfig: { mode: "ANY" } }
      : undefined;
    return { adaptedTools: geminiTools, adaptedToolChoice: geminiChoice };
  }

  // OpenAI-compatible (OpenAI, Cerebras, Groq, xAI, DeepSeek, Mistral, etc.)
  // Tools are already in the right format — pass through
  return { adaptedTools: tools, adaptedToolChoice: tool_choice };
}

/**
 * Normalize tool results from provider-specific format back to OpenAI format.
 * Returns an array of { id, name, arguments } tool calls.
 */
function extractToolCalls(provider: string, response: Record<string, unknown>): Array<{ id: string; name: string; arguments: string }> {
  if (provider === "anthropic") {
    const content = response.content as Array<Record<string, unknown>> | undefined;
    if (!content) return [];
    return content
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: (block.id as string) ?? `call_${Date.now()}`,
        name: block.name as string,
        arguments: JSON.stringify(block.input ?? {}),
      }));
  }

  if (provider === "google") {
    // Gemini returns function calls in candidates[0].content.parts[].functionCall
    const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
    if (!candidates?.[0]) return [];
    const parts = (candidates[0].content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
    if (!parts) return [];
    return parts
      .filter((part) => part.functionCall)
      .map((part, i) => {
        const fc = part.functionCall as Record<string, unknown>;
        return {
          id: `call_${Date.now()}_${i}`,
          name: fc.name as string,
          arguments: JSON.stringify(fc.args ?? {}),
        };
      });
  }

  // OpenAI-compatible: response.choices[0].message.tool_calls[].function
  const choices = response.choices as Array<Record<string, unknown>> | undefined;
  if (!choices?.[0]) return [];
  const message = choices[0].message as Record<string, unknown> | undefined;
  const toolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
  if (!toolCalls) return [];
  return toolCalls.map((tc) => ({
    id: (tc.id as string) ?? `call_${Date.now()}`,
    name: ((tc.function as Record<string, unknown>)?.name as string) ?? "",
    arguments: ((tc.function as Record<string, unknown>)?.arguments as string) ?? "{}",
  }));
}

// --- Provider Call ---

async function callProvider(
  providerConfig: ProviderConfig,
  modelId: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
  stream: boolean,
  tools?: unknown[],
  tool_choice?: string
): Promise<Response> {
  const apiKey = providerConfig.api_key_encrypted;

  if (providerConfig.provider === "anthropic") {
    // Anthropic API format
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMsgs = messages.filter((m) => m.role !== "system");
    const anthropicBody: Record<string, unknown> = {
      model: modelId,
      max_tokens: maxTokens,
      temperature,
      system: systemMsg?.content,
      messages: chatMsgs,
      stream,
    };
    if (tools && tools.length > 0) {
      const adapted = adaptToolsForProvider(tools, "anthropic", tool_choice);
      anthropicBody.tools = adapted.adaptedTools;
      if (adapted.adaptedToolChoice) anthropicBody.tool_choice = adapted.adaptedToolChoice;
    }
    return fetch(`${providerConfig.base_url}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });
  }

  if (providerConfig.provider === "google") {
    // Google Gemini API format
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === "system");

    const geminiBody: Record<string, unknown> = {
      contents,
      systemInstruction: systemInstruction
        ? { parts: [{ text: systemInstruction.content }] }
        : undefined,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    };
    if (tools && tools.length > 0) {
      const adapted = adaptToolsForProvider(tools, "google", tool_choice);
      geminiBody.tools = adapted.adaptedTools;
      if (adapted.adaptedToolChoice) geminiBody.tool_config = adapted.adaptedToolChoice;
    }

    return fetch(
      `${providerConfig.base_url}/models/${modelId}:${stream ? "streamGenerateContent" : "generateContent"}?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      }
    );
  }

  // OpenAI-compatible (OpenAI, Cerebras, Groq, etc.)
  const openaiBody: Record<string, unknown> = {
    model: modelId,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream,
  };
  if (tools && tools.length > 0) {
    openaiBody.tools = tools;
    if (tool_choice) openaiBody.tool_choice = tool_choice;
  }
  return fetch(`${providerConfig.base_url}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(openaiBody),
  });
}

// --- Token Counting (rough estimate) ---

function estimateTokens(text: string | null | undefined): number {
  // Rough: ~4 chars per token for English
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// --- Provider Cost Lookup ---

async function getProviderCost(provider: string, modelId: string, tokensIn: number, tokensOut: number): Promise<number> {
  const { data } = await supabase
    .from('provider_pricing')
    .select('cost_per_1k_input, cost_per_1k_output')
    .eq('provider', provider)
    .eq('model_id', modelId)
    .single();

  if (!data) return 0; // Unknown model, log 0 cost

  return (tokensIn / 1000) * data.cost_per_1k_input + (tokensOut / 1000) * data.cost_per_1k_output;
}

// --- CORS ---

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// --- Main Handler ---

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // --- GET /v1/models — List available models ---
    if (req.method === "GET" && path.endsWith("/v1/models")) {
      await loadCaches();
      const models = Array.from(modelRoutesCache.values())
        .filter((r) => r.enabled)
        .map((r) => ({
          id: r.model_alias,
          provider: r.provider,
          tier: r.tier,
          context_window: r.context_window,
          max_tokens: r.max_tokens,
          credits_per_1k_input: r.credit_cost_per_1k_in,
          credits_per_1k_output: r.credit_cost_per_1k_out,
        }));

      return new Response(JSON.stringify({ data: models }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- GET /v1/credits — User's credit balance ---
    if (req.method === "GET" && path.endsWith("/v1/credits")) {
      const auth = await authenticate(req);
      if (!auth) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      let { data } = await supabase
        .from("credit_accounts")
        .select("balance, total_purchased, total_consumed")
        .eq("user_id", auth.userId)
        .single();

      // Auto-create if missing
      if (!data) {
        await supabase
          .from("credit_accounts")
          .upsert({
            user_id: auth.userId,
            balance: 500,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        data = { balance: 500, total_purchased: 0, total_consumed: 0 };
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- GET /v1/usage — User's usage history ---
    if (req.method === "GET" && path.endsWith("/v1/usage")) {
      const auth = await authenticate(req);
      if (!auth) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const limit = parseInt(url.searchParams.get("limit") ?? "50");
      const { data } = await supabase
        .from("usage_log")
        .select("*")
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 200));

      return new Response(JSON.stringify({ data: data ?? [] }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- GET /v1/api-credits — API key user's credit balance (JWT only) ---
    if (req.method === "GET" && path.endsWith("/v1/api-credits")) {
      const auth = await authenticate(req);
      if (!auth) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Only JWT-authenticated users can check API credit balance
      if (auth.isApiKey) {
        return new Response(JSON.stringify({ error: "Forbidden", message: "Use your JWT token to check API credits" }), {
          status: 403,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("api_credit_accounts")
        .select("balance, total_purchased, total_consumed")
        .eq("user_id", auth.userId)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ balance: 0, total_purchased: 0, total_consumed: 0 }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- POST /v1/chat/completions — The main router ---
    if (req.method === "POST" && path.endsWith("/v1/chat/completions")) {
      const startTime = Date.now();

      // 1. Auth
      const auth = await authenticate(req);
      if (!auth) {
        return new Response(JSON.stringify({ error: "Unauthorized", message: "Invalid or missing API key" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // 2. Parse request
      const body: ChatRequest = await req.json();
      const { model, task_type, messages, max_tokens, temperature, stream = false, tools, tool_choice } = body;

      if (!messages || messages.length === 0) {
        return new Response(JSON.stringify({ error: "Bad request", message: "messages are required" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      if (!model && !task_type) {
        return new Response(JSON.stringify({ error: "Bad request", message: "Either model or task_type is required" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Validate task_type if provided
      if (task_type && !TASK_TYPES[task_type]) {
        return new Response(
          JSON.stringify({
            error: "Bad request",
            message: `Invalid task_type: ${task_type}. Valid types: ${Object.keys(TASK_TYPES).join(", ")}`,
          }),
          {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          }
        );
      }

      // 3. Load caches
      await loadCaches();

      // 4. Rate limiting (split by auth type)
      let rateInfo: RateLimitInfo;
      if (auth.isApiKey) {
        // API key users: rate limit against api_usage_log for current month
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

        const { count: apiCount, error: apiRateError } = await supabase
          .from("api_usage_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", auth.userId)
          .gte("created_at", monthStart);

        if (apiRateError) {
          console.error("API rate limit query error:", apiRateError);
          rateInfo = { limit: FREE_TIER_MONTHLY_LIMIT, remaining: FREE_TIER_MONTHLY_LIMIT, reset: nextMonth };
        } else {
          const used = apiCount ?? 0;
          rateInfo = {
            limit: FREE_TIER_MONTHLY_LIMIT,
            remaining: Math.max(0, FREE_TIER_MONTHLY_LIMIT - used),
            reset: nextMonth,
          };
        }
      } else {
        // JWT users: existing free tier rate limit
        rateInfo = await checkRateLimit(auth.userId);
      }
      if (rateInfo.remaining <= 0) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded",
            message: `Free tier allows ${rateInfo.limit} calls/month. Upgrade at https://theconflux.ai/pricing`,
            limit: rateInfo.limit,
            remaining: 0,
            reset: rateInfo.reset,
          }),
          {
            status: 429,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "application/json",
              "X-RateLimit-Limit": String(rateInfo.limit),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": rateInfo.reset,
            },
          }
        );
      }

      // 5. Resolve model — deterministic routing or explicit model
      let resolvedModel: string;
      let routedTaskType: string | null = null;
      let routedTier: ModelTier = "core";
      let wasRouted = false;

      if (task_type && !model) {
        // Use deterministic router
        const selection = selectModelForTask(task_type, modelRoutesCache);
        if (selection) {
          resolvedModel = selection.modelAlias;
          routedTaskType = task_type;
          routedTier = selection.tier;
          wasRouted = true;
        } else {
          // No matching model for task type — fall back to cheapest available
          const fallback = findFallbackModel(modelRoutesCache);
          if (!fallback) {
            return new Response(
              JSON.stringify({ error: "No models available", message: "No enabled models found in any tier" }),
              {
                status: 503,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
              }
            );
          }
          resolvedModel = fallback.model_alias;
          routedTaskType = task_type;
          routedTier = fallback.tier as ModelTier;
          wasRouted = true;
        }

        // Free tier enforcement: only core models allowed
        // If the routed model is pro/ultra, override to best available core model
        if (routedTier !== "core") {
          const rule = TASK_TYPES[task_type];
          // Try to find a core-tier model from the task's preferred list
          const coreOverride = rule?.preferred_models.find(
            (alias) =>
              modelRoutesCache.has(alias) &&
              modelRoutesCache.get(alias)?.tier === "core"
          );
          if (coreOverride) {
            resolvedModel = coreOverride;
            routedTier = "core";
          } else {
            // No preferred core model available — find cheapest core
            const cheapestCore = findCheapestCoreModel(modelRoutesCache);
            if (cheapestCore) {
              resolvedModel = cheapestCore.model_alias;
              routedTier = "core";
            }
            // If no core models at all, proceed with the original (edge case)
          }
        }

        // Tool reliability override: if tools are present, upgrade to a model that supports them
        if (tools && tools.length > 0) {
          const currentModel = resolvedModel;
          const isReliable = TOOL_RELIABILITY.reliable.includes(currentModel);
          if (!isReliable) {
            // Free providers that reliably support tool calling
            const FREE_RELIABLE = [
              "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini",
              "gemini-2.5-flash", "gemini-flash",
              "deepseek-r1", "deepseek-chat",
              "grok-3-mini", "grok-4.1-fast", "grok-code-fast",
              "mimo-v2-pro",
              "mistral-medium", "mistral-small",
            ];
            const reliableOverride = FREE_RELIABLE.find(
              (alias) => modelRoutesCache.has(alias)
            );
            if (reliableOverride) {
              console.log(`[Router] Tool override: ${currentModel} → ${reliableOverride} (tools require reliable model)`);
              resolvedModel = reliableOverride;
              routedTier = modelRoutesCache.get(reliableOverride)?.tier as ModelTier ?? "pro";
            }
          }
        }
      } else {
        // Explicit model — backward compatible
        resolvedModel = model!;

        // Tool reliability override for explicit models too
        if (tools && tools.length > 0 && !TOOL_RELIABILITY.reliable.includes(resolvedModel)) {
          const FREE_RELIABLE = [
            "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini",
            "gemini-2.5-flash", "gemini-flash",
            "deepseek-r1", "deepseek-chat",
            "grok-3-mini", "grok-4.1-fast", "grok-code-fast",
            "mimo-v2-pro",
            "mistral-medium", "mistral-small",
          ];
          const reliableOverride = FREE_RELIABLE.find(
            (alias) => modelRoutesCache.has(alias)
          );
          if (reliableOverride) {
            console.log(`[Router] Tool override (explicit): ${resolvedModel} → ${reliableOverride}`);
            resolvedModel = reliableOverride;
            routedTier = modelRoutesCache.get(reliableOverride)?.tier as ModelTier ?? "pro";
          }
        }
      }

      // 6. Look up route
      const route = modelRoutesCache.get(resolvedModel);
      if (!route) {
        return new Response(
          JSON.stringify({ error: "Model not found", message: `Unknown model: ${resolvedModel}` }),
          {
            status: 404,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          }
        );
      }

      // Final tier from actual route (in case of overrides)
      if (wasRouted) {
        routedTier = route.tier as ModelTier;
      }

      // 7. Credit check (split by auth type)
      const estimatedTokensIn = messages.reduce((sum, m) => sum + estimateTokens(m.content ?? ""), 0);
      const estimatedTokensOut = max_tokens ?? 4096;
      const creditCheck = auth.isApiKey
        ? await checkApiCredits(auth.userId, resolvedModel, estimatedTokensIn, estimatedTokensOut)
        : await checkCredits(auth.userId, resolvedModel, estimatedTokensIn, estimatedTokensOut);

      if (!creditCheck.hasCredits) {
        return new Response(
          JSON.stringify({
            error: "Insufficient credits",
            message: `Need ~${creditCheck.estimatedCost} credits, have ${creditCheck.balance}`,
            balance: creditCheck.balance,
            estimated_cost: creditCheck.estimatedCost,
          }),
          {
            status: 402,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "application/json",
              "X-RateLimit-Limit": String(rateInfo.limit),
              "X-RateLimit-Remaining": String(rateInfo.remaining),
              "X-RateLimit-Reset": rateInfo.reset,
            },
          }
        );
      }

      // 8. Resolve provider
      const providerConfig = providerCache.get(route.provider);
      if (!providerConfig) {
        return new Response(
          JSON.stringify({ error: "Provider unavailable", message: `Provider ${route.provider} is not configured` }),
          {
            status: 503,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          }
        );
      }

      // 9. Call provider
      // Use tier defaults for max_tokens/temperature if not explicitly provided
      const tierDefaults = TIER_DEFAULTS[route.tier as ModelTier] ?? TIER_DEFAULTS.core;
      const effectiveMaxTokens = max_tokens ?? tierDefaults.max_tokens;
      const effectiveTemperature = temperature ?? tierDefaults.temperature;

      const providerResponse = await callProvider(
        providerConfig,
        route.provider_model_id,
        messages,
        Math.min(effectiveMaxTokens, route.max_tokens),
        effectiveTemperature,
        stream,
        tools,
        tool_choice
      );

      const latencyMs = Date.now() - startTime;

      // Build rate limit headers for all responses
      const rateLimitHeaders = {
        "X-RateLimit-Limit": String(rateInfo.limit),
        "X-RateLimit-Remaining": String(Math.max(0, rateInfo.remaining - 1)), // -1 for this call
        "X-RateLimit-Reset": rateInfo.reset,
      };

      // Build routing headers
      const routingHeaders: Record<string, string> = {};
      if (wasRouted) {
        routingHeaders["X-Conflux-Task-Type"] = routedTaskType ?? "";
        routingHeaders["X-Conflux-Tier"] = routedTier;
        routingHeaders["X-Conflux-Routed"] = "true";
      } else {
        routingHeaders["X-Conflux-Routed"] = "false";
        routingHeaders["X-Conflux-Tier"] = route.tier;
      }

      // 10. Handle errors from provider
      if (!providerResponse.ok) {
        const errorBody = await providerResponse.text();
        console.error(`Provider error [${route.provider}/${route.provider_model_id}]:`, providerResponse.status, errorBody);

        // Try fallback if available
        if (route.fallback_model) {
          const fallbackRoute = modelRoutesCache.get(route.fallback_model);
          if (fallbackRoute) {
            const fallbackProvider = providerCache.get(fallbackRoute.provider);
            if (fallbackProvider) {
              const fallbackResponse = await callProvider(
                fallbackProvider,
                fallbackRoute.provider_model_id,
                messages,
                Math.min(effectiveMaxTokens, fallbackRoute.max_tokens),
                effectiveTemperature,
                stream,
                tools,
                tool_choice
              );

              if (fallbackResponse.ok) {
                // Deduct credits for fallback
                const tokensIn = estimatedTokensIn;
                const tokensOut = estimateTokens(await fallbackResponse.clone().text());
                const providerCostUsd = await getProviderCost(fallbackRoute.provider, fallbackRoute.provider_model_id, tokensIn, tokensOut);
                if (auth.isApiKey) {
                  await supabase.rpc("deduct_api_credits", {
                    p_user_id: auth.userId,
                    p_model_alias: resolvedModel,
                    p_tokens_in: tokensIn,
                    p_tokens_out: tokensOut,
                    p_provider: fallbackRoute.provider,
                    p_status: "success",
                    p_latency_ms: Date.now() - startTime,
                    p_provider_cost_usd: providerCostUsd,
                  });
                } else {
                  await supabase.rpc("deduct_credits", {
                    p_user_id: auth.userId,
                    p_model_alias: resolvedModel,
                    p_tokens_in: tokensIn,
                    p_tokens_out: tokensOut,
                    p_provider: fallbackRoute.provider,
                    p_status: "success",
                    p_latency_ms: Date.now() - startTime,
                  });
                }

                return new Response(fallbackResponse.body, {
                  status: fallbackResponse.status,
                  headers: {
                    ...CORS_HEADERS,
                    "Content-Type": fallbackResponse.headers.get("Content-Type") ?? "application/json",
                    "X-Conflux-Provider": fallbackRoute.provider,
                    "X-Conflux-Model": fallbackRoute.model_alias,
                    "X-Conflux-Fallback": "true",
                    ...routingHeaders,
                    ...rateLimitHeaders,
                  },
                });
              }
            }
          }
        }

        // Log failed attempt
        try {
          if (auth.isApiKey) {
            await supabase.rpc("deduct_api_credits", {
              p_user_id: auth.userId,
              p_model_alias: resolvedModel,
              p_tokens_in: 0,
              p_tokens_out: 0,
              p_provider: route.provider,
              p_status: "error",
              p_latency_ms: latencyMs,
              p_provider_cost_usd: 0,
            });
          } else {
            await supabase.rpc("deduct_credits", {
              p_user_id: auth.userId,
              p_model_alias: resolvedModel,
              p_tokens_in: 0,
              p_tokens_out: 0,
              p_provider: route.provider,
              p_status: "error",
              p_latency_ms: latencyMs,
            });
          }
        } catch (e) {
          console.error("Error logging failed call:", e);
        }

        return new Response(JSON.stringify({ error: "Provider error", message: errorBody }), {
          status: providerResponse.status,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
            ...routingHeaders,
            ...rateLimitHeaders,
          },
        });
      }

      // 11. Success — deduct credits and return response
      const responseBody = await providerResponse.text();
      let tokensIn = estimatedTokensIn;
      let tokensOut = estimatedTokensOut;

      // Try to extract actual token counts from provider response
      try {
        const parsed = JSON.parse(responseBody);
        if (parsed.usage) {
          tokensIn = parsed.usage.prompt_tokens ?? tokensIn;
          tokensOut = parsed.usage.completion_tokens ?? tokensOut;
        }
      } catch {
        // Streaming or non-JSON — use estimates
        tokensOut = estimateTokens(responseBody);
      }

      // Deduct credits + log usage
      try {
        const providerCostUsd = await getProviderCost(route.provider, route.provider_model_id, tokensIn, tokensOut);
        if (auth.isApiKey) {
          const { error: rpcError } = await supabase.rpc("deduct_api_credits", {
            p_user_id: auth.userId,
            p_model_alias: resolvedModel,
            p_tokens_in: tokensIn,
            p_tokens_out: tokensOut,
            p_provider: route.provider,
            p_status: "success",
            p_latency_ms: latencyMs,
            p_provider_cost_usd: providerCostUsd,
          });
          if (rpcError) console.error("API credit deduction failed:", rpcError);
        } else {
          const { error: rpcError } = await supabase.rpc("deduct_credits", {
            p_user_id: auth.userId,
            p_model_alias: resolvedModel,
            p_tokens_in: tokensIn,
            p_tokens_out: tokensOut,
            p_provider: route.provider,
            p_status: "success",
            p_latency_ms: latencyMs,
          });
          if (rpcError) console.error("Credit deduction failed:", rpcError);
        }
      } catch (e) {
        console.error("Credit deduction exception:", e);
      }

      return new Response(responseBody, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": providerResponse.headers.get("Content-Type") ?? "application/json",
          "X-Conflux-Provider": route.provider,
          "X-Conflux-Model": route.model_alias,
          "X-Conflux-Credits-Charged": String(
            Math.ceil(tokensIn / 1000) * route.credit_cost_per_1k_in +
            Math.ceil(tokensOut / 1000) * route.credit_cost_per_1k_out
          ),
          ...routingHeaders,
          ...rateLimitHeaders,
        },
      });
    }

    // ============================================================
    // ADMIN ENDPOINTS — require JWT auth + admin role
    // ============================================================

    async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
      const auth = await authenticate(req);
      if (!auth || auth.isApiKey) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      // Check admin flag in user metadata or profiles table
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_admin")
        .eq("user_id", auth.userId)
        .single();

      if (!profile?.is_admin) {
        return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
          status: 403,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      return { userId: auth.userId };
    }

    // --- GET /v1/admin/routing ---
    if (req.method === "GET" && path.endsWith("/v1/admin/routing")) {
      const gate = await requireAdmin(req);
      if (gate instanceof Response) return gate;

      const { data, error } = await supabase
        .from("routing_config")
        .select("*")
        .order("task_type");

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: data ?? [] }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- PUT /v1/admin/routing ---
    if (req.method === "PUT" && path.endsWith("/v1/admin/routing")) {
      const gate = await requireAdmin(req);
      if (gate instanceof Response) return gate;

      const body = await req.json().catch(() => ({}));
      const { task_type, tier, preferred_models, min_tool_reliability, description } = body;

      if (!task_type) {
        return new Response(JSON.stringify({ error: "task_type is required" }), {
          status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (tier) updates.tier = tier;
      if (preferred_models) updates.preferred_models = preferred_models;
      if (min_tool_reliability) updates.min_tool_reliability = min_tool_reliability;
      if (description) updates.description = description;

      const { data, error } = await supabase
        .from("routing_config")
        .update(updates)
        .eq("task_type", task_type)
        .select();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Clear router cache so changes take effect immediately
      modelRoutesCache.clear();
      cacheTime = 0;

      return new Response(JSON.stringify({ data: data?.[0] ?? null }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- GET /v1/admin/models ---
    if (req.method === "GET" && path.endsWith("/v1/admin/models")) {
      const gate = await requireAdmin(req);
      if (gate instanceof Response) return gate;

      const { data, error } = await supabase
        .from("model_routes")
        .select("model_alias, provider, tier, tool_calling, enabled, credit_cost_per_1k_in, credit_cost_per_1k_out")
        .order("tier")
        .order("model_alias");

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: data ?? [], count: data?.length ?? 0 }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- PUT /v1/admin/models/:alias ---
    if (req.method === "PUT" && path.includes("/v1/admin/models/")) {
      const gate = await requireAdmin(req);
      if (gate instanceof Response) return gate;

      const alias = path.split("/v1/admin/models/")[1]?.split("/")[0];
      if (!alias) {
        return new Response(JSON.stringify({ error: "Model alias required in URL" }), {
          status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const body = await req.json().catch(() => ({}));
      const updates: Record<string, unknown> = {};
      if (body.tier !== undefined) updates.tier = body.tier;
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      if (body.tool_calling !== undefined) updates.tool_calling = body.tool_calling;
      if (body.credit_cost_per_1k_in !== undefined) updates.credit_cost_per_1k_in = body.credit_cost_per_1k_in;
      if (body.credit_cost_per_1k_out !== undefined) updates.credit_cost_per_1k_out = body.credit_cost_per_1k_out;

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: "No valid fields to update" }), {
          status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("model_routes")
        .update(updates)
        .eq("model_alias", alias)
        .select();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Clear router cache
      modelRoutesCache.clear();
      cacheTime = 0;

      return new Response(JSON.stringify({ data: data?.[0] ?? null }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- GET /v1/admin/margin — Margin dashboard ---
    if (req.method === "GET" && path.endsWith("/v1/admin/margin")) {
      const gate = await requireAdmin(req);
      if (gate instanceof Response) return gate;

      const urlObj = new URL(req.url);
      const days = parseInt(urlObj.searchParams.get("days") ?? "30");
      const since = new Date(Date.now() - days * 86400000).toISOString();

      // API usage stats
      const { data: apiUsage } = await supabase
        .from("api_usage_log")
        .select("model_alias, provider, credits_charged, provider_cost_usd, latency_ms, status")
        .gte("created_at", since);

      // App usage stats
      const { data: appUsage } = await supabase
        .from("usage_log")
        .select("model_alias, credits_charged, provider_cost_usd")
        .gte("created_at", since);

      // Revenue from API credit transactions (purchases)
      const { data: apiRevenue } = await supabase
        .from("api_credit_transactions")
        .select("amount, created_at")
        .eq("type", "purchase")
        .gte("created_at", since);

      // Aggregate
      const totalApiRequests = apiUsage?.length ?? 0;
      const totalAppRequests = appUsage?.length ?? 0;
      const totalProviderCost = [
        ...(apiUsage ?? []),
        ...(appUsage ?? []),
      ].reduce((sum, r) => sum + (Number(r.provider_cost_usd) || 0), 0);
      const totalCreditsCharged = [
        ...(apiUsage ?? []),
        ...(appUsage ?? []),
      ].reduce((sum, r) => sum + (Number(r.credits_charged) || 0), 0);
      const totalApiRevenue = (apiRevenue ?? []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

      // Per-model breakdown
      const modelStats: Record<string, { requests: number; cost: number; credits: number }> = {};
      for (const row of [...(apiUsage ?? []), ...(appUsage ?? [])]) {
        const alias = row.model_alias ?? "unknown";
        if (!modelStats[alias]) modelStats[alias] = { requests: 0, cost: 0, credits: 0 };
        modelStats[alias].requests++;
        modelStats[alias].cost += Number(row.provider_cost_usd) || 0;
        modelStats[alias].credits += Number(row.credits_charged) || 0;
      }

      // Avg latency by model
      const latencyStats: Record<string, { total: number; count: number }> = {};
      for (const row of apiUsage ?? []) {
        const alias = row.model_alias ?? "unknown";
        if (!latencyStats[alias]) latencyStats[alias] = { total: 0, count: 0 };
        latencyStats[alias].total += Number(row.latency_ms) || 0;
        latencyStats[alias].count++;
      }

      const avgLatency: Record<string, number> = {};
      for (const [alias, s] of Object.entries(latencyStats)) {
        avgLatency[alias] = s.count > 0 ? Math.round(s.total / s.count) : 0;
      }

      return new Response(JSON.stringify({
        period_days: days,
        summary: {
          total_api_requests: totalApiRequests,
          total_app_requests: totalAppRequests,
          total_requests: totalApiRequests + totalAppRequests,
          total_provider_cost_usd: Number(totalProviderCost.toFixed(6)),
          total_credits_charged: totalCreditsCharged,
          total_api_revenue_credits: totalApiRevenue,
          // Rough USD estimate: credits at ~$0.002 avg
          estimated_revenue_usd: Number((totalApiRevenue * 0.002).toFixed(2)),
          margin_usd: Number((totalApiRevenue * 0.002 - totalProviderCost).toFixed(4)),
          margin_pct: totalApiRevenue > 0
            ? Number(((1 - totalProviderCost / (totalApiRevenue * 0.002)) * 100).toFixed(1))
            : null,
        },
        per_model: Object.entries(modelStats)
          .sort((a, b) => b[1].cost - a[1].cost)
          .map(([alias, s]) => ({
            model: alias,
            requests: s.requests,
            provider_cost_usd: Number(s.cost.toFixed(6)),
            credits_charged: s.credits,
            avg_latency_ms: avgLatency[alias] ?? null,
          })),
        errors: {
          api_errors: (apiUsage ?? []).filter(r => r.status === "error").length,
          rate_limited: (apiUsage ?? []).filter(r => r.status === "rate_limited").length,
          insufficient_credits: (apiUsage ?? []).filter(r => r.status === "insufficient_credits").length,
        },
      }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- GET /v1/admin/costs/daily — Daily cost aggregation ---
    if (req.method === "GET" && path.endsWith("/v1/admin/costs/daily")) {
      const gate = await requireAdmin(req);
      if (gate instanceof Response) return gate;

      const urlObj = new URL(req.url);
      const days = parseInt(urlObj.searchParams.get("days") ?? "30");
      const providerFilter = urlObj.searchParams.get("provider");
      const since = new Date(Date.now() - days * 86400000).toISOString();

      // Fetch API usage
      let apiQuery = supabase
        .from("api_usage_log")
        .select("model_alias, provider, credits_charged, provider_cost_usd, created_at")
        .gte("created_at", since);
      if (providerFilter) apiQuery = apiQuery.eq("provider", providerFilter);
      const { data: apiUsage } = await apiQuery;

      // Fetch app usage
      let appQuery = supabase
        .from("usage_log")
        .select("model_alias, credits_charged, provider_cost_usd, created_at")
        .gte("created_at", since);
      if (providerFilter) appQuery = appQuery.eq("provider", providerFilter);
      const { data: appUsage } = await appQuery;

      // Revenue from API credit purchases
      const { data: apiRevenue } = await supabase
        .from("api_credit_transactions")
        .select("amount, created_at")
        .eq("type", "purchase")
        .gte("created_at", since);

      // Group by date
      const daily: Record<string, {
        api_requests: number;
        app_requests: number;
        provider_cost_usd: number;
        credits_charged: number;
      }> = {};

      for (const row of apiUsage ?? []) {
        const date = row.created_at?.slice(0, 10) ?? "unknown";
        if (!daily[date]) daily[date] = { api_requests: 0, app_requests: 0, provider_cost_usd: 0, credits_charged: 0 };
        daily[date].api_requests++;
        daily[date].provider_cost_usd += Number(row.provider_cost_usd) || 0;
        daily[date].credits_charged += Number(row.credits_charged) || 0;
      }
      for (const row of appUsage ?? []) {
        const date = row.created_at?.slice(0, 10) ?? "unknown";
        if (!daily[date]) daily[date] = { api_requests: 0, app_requests: 0, provider_cost_usd: 0, credits_charged: 0 };
        daily[date].app_requests++;
        daily[date].provider_cost_usd += Number(row.provider_cost_usd) || 0;
        daily[date].credits_charged += Number(row.credits_charged) || 0;
      }

      // Revenue by date (purchases)
      const revenueByDate: Record<string, number> = {};
      for (const row of apiRevenue ?? []) {
        const date = row.created_at?.slice(0, 10) ?? "unknown";
        revenueByDate[date] = (revenueByDate[date] ?? 0) + (Number(row.amount) || 0);
      }

      const dailyRows = Object.entries(daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => {
          const total_requests = d.api_requests + d.app_requests;
          const creditsRevenue = revenueByDate[date] ?? 0;
          const estimated_revenue_usd = creditsRevenue * 0.002;
          const margin_usd = estimated_revenue_usd - d.provider_cost_usd;
          const margin_pct = creditsRevenue > 0
            ? Number(((1 - d.provider_cost_usd / estimated_revenue_usd) * 100).toFixed(1))
            : null;
          return {
            date,
            api_requests: d.api_requests,
            app_requests: d.app_requests,
            total_requests,
            provider_cost_usd: Number(d.provider_cost_usd.toFixed(6)),
            credits_charged: d.credits_charged,
            estimated_revenue_usd: Number(estimated_revenue_usd.toFixed(2)),
            margin_usd: Number(margin_usd.toFixed(4)),
            margin_pct,
          };
        });

      // Totals
      const totals = dailyRows.reduce((acc, r) => ({
        total_requests: acc.total_requests + r.total_requests,
        api_requests: acc.api_requests + r.api_requests,
        app_requests: acc.app_requests + r.app_requests,
        provider_cost_usd: acc.provider_cost_usd + r.provider_cost_usd,
        credits_charged: acc.credits_charged + r.credits_charged,
        estimated_revenue_usd: acc.estimated_revenue_usd + r.estimated_revenue_usd,
        margin_usd: acc.margin_usd + r.margin_usd,
      }), { total_requests: 0, api_requests: 0, app_requests: 0, provider_cost_usd: 0, credits_charged: 0, estimated_revenue_usd: 0, margin_usd: 0 });

      return new Response(JSON.stringify({
        period_days: days,
        provider_filter: providerFilter ?? null,
        days: dailyRows,
        totals: {
          ...totals,
          provider_cost_usd: Number(totals.provider_cost_usd.toFixed(6)),
          estimated_revenue_usd: Number(totals.estimated_revenue_usd.toFixed(2)),
          margin_usd: Number(totals.margin_usd.toFixed(4)),
          margin_pct: totals.estimated_revenue_usd > 0
            ? Number(((totals.margin_usd / totals.estimated_revenue_usd) * 100).toFixed(1))
            : null,
        },
      }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- GET /v1/admin/costs/by-model — Per-model cost breakdown ---
    if (req.method === "GET" && path.endsWith("/v1/admin/costs/by-model")) {
      const gate = await requireAdmin(req);
      if (gate instanceof Response) return gate;

      const urlObj = new URL(req.url);
      const days = parseInt(urlObj.searchParams.get("days") ?? "30");
      const since = new Date(Date.now() - days * 86400000).toISOString();

      // Fetch API usage (has tokens and latency)
      const { data: apiUsage } = await supabase
        .from("api_usage_log")
        .select("model_alias, provider, tokens_in, tokens_out, credits_charged, provider_cost_usd, latency_ms, status, created_at")
        .gte("created_at", since);

      // Fetch app usage
      const { data: appUsage } = await supabase
        .from("usage_log")
        .select("model_alias, credits_charged, provider_cost_usd, created_at")
        .gte("created_at", since);

      // Load model routes for tier info
      const { data: routes } = await supabase
        .from("model_routes")
        .select("model_alias, tier, provider");
      const routeMap = new Map((routes ?? []).map((r: { model_alias: string }) => [r.model_alias, r]));

      // Aggregate per model
      const modelStats: Record<string, {
        provider: string;
        total_requests: number;
        total_tokens_in: number;
        total_tokens_out: number;
        provider_cost_usd: number;
        credits_charged: number;
        total_latency_ms: number;
        latency_count: number;
        error_count: number;
      }> = {};

      for (const row of apiUsage ?? []) {
        const alias = row.model_alias ?? "unknown";
        if (!modelStats[alias]) modelStats[alias] = {
          provider: row.provider ?? "unknown",
          total_requests: 0, total_tokens_in: 0, total_tokens_out: 0,
          provider_cost_usd: 0, credits_charged: 0,
          total_latency_ms: 0, latency_count: 0, error_count: 0,
        };
        const s = modelStats[alias];
        s.total_requests++;
        s.total_tokens_in += Number(row.tokens_in) || 0;
        s.total_tokens_out += Number(row.tokens_out) || 0;
        s.provider_cost_usd += Number(row.provider_cost_usd) || 0;
        s.credits_charged += Number(row.credits_charged) || 0;
        s.total_latency_ms += Number(row.latency_ms) || 0;
        s.latency_count++;
        if (row.status === "error") s.error_count++;
      }
      for (const row of appUsage ?? []) {
        const alias = row.model_alias ?? "unknown";
        if (!modelStats[alias]) modelStats[alias] = {
          provider: routeMap.get(alias)?.provider ?? "unknown",
          total_requests: 0, total_tokens_in: 0, total_tokens_out: 0,
          provider_cost_usd: 0, credits_charged: 0,
          total_latency_ms: 0, latency_count: 0, error_count: 0,
        };
        const s = modelStats[alias];
        s.total_requests++;
        s.provider_cost_usd += Number(row.provider_cost_usd) || 0;
        s.credits_charged += Number(row.credits_charged) || 0;
      }

      const byModel = Object.entries(modelStats)
        .sort((a, b) => b[1].provider_cost_usd - a[1].provider_cost_usd)
        .map(([alias, s]) => ({
          model_alias: alias,
          provider: s.provider,
          tier: routeMap.get(alias)?.tier ?? null,
          total_requests: s.total_requests,
          total_tokens_in: s.total_tokens_in,
          total_tokens_out: s.total_tokens_out,
          provider_cost_usd: Number(s.provider_cost_usd.toFixed(6)),
          credits_charged: s.credits_charged,
          avg_latency_ms: s.latency_count > 0 ? Math.round(s.total_latency_ms / s.latency_count) : null,
          error_count: s.error_count,
          error_rate_pct: s.total_requests > 0
            ? Number(((s.error_count / s.total_requests) * 100).toFixed(1))
            : 0,
        }));

      return new Response(JSON.stringify({
        period_days: days,
        models: byModel,
      }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- GET /v1/admin/costs/by-provider — Per-provider aggregation ---
    if (req.method === "GET" && path.endsWith("/v1/admin/costs/by-provider")) {
      const gate = await requireAdmin(req);
      if (gate instanceof Response) return gate;

      const urlObj = new URL(req.url);
      const days = parseInt(urlObj.searchParams.get("days") ?? "30");
      const since = new Date(Date.now() - days * 86400000).toISOString();

      // Fetch API usage (has provider and latency)
      const { data: apiUsage } = await supabase
        .from("api_usage_log")
        .select("model_alias, provider, credits_charged, provider_cost_usd, latency_ms, created_at")
        .gte("created_at", since);

      // Fetch app usage with provider info
      const { data: appUsage } = await supabase
        .from("usage_log")
        .select("model_alias, credits_charged, provider_cost_usd, created_at")
        .gte("created_at", since);

      // Load model routes to resolve provider for app usage
      const { data: routes } = await supabase
        .from("model_routes")
        .select("model_alias, provider");
      const routeProviderMap = new Map((routes ?? []).map((r: { model_alias: string }) => [r.model_alias, r.provider]));

      // Aggregate per provider
      const providerStats: Record<string, {
        total_requests: number;
        provider_cost_usd: number;
        credits_charged: number;
        models_used: Set<string>;
        total_latency_ms: number;
        latency_count: number;
      }> = {};

      for (const row of apiUsage ?? []) {
        const prov = row.provider ?? "unknown";
        if (!providerStats[prov]) providerStats[prov] = {
          total_requests: 0, provider_cost_usd: 0, credits_charged: 0,
          models_used: new Set(), total_latency_ms: 0, latency_count: 0,
        };
        const s = providerStats[prov];
        s.total_requests++;
        s.provider_cost_usd += Number(row.provider_cost_usd) || 0;
        s.credits_charged += Number(row.credits_charged) || 0;
        if (row.model_alias) s.models_used.add(row.model_alias);
        s.total_latency_ms += Number(row.latency_ms) || 0;
        s.latency_count++;
      }
      for (const row of appUsage ?? []) {
        const prov = routeProviderMap.get(row.model_alias ?? "") ?? "unknown";
        if (!providerStats[prov]) providerStats[prov] = {
          total_requests: 0, provider_cost_usd: 0, credits_charged: 0,
          models_used: new Set(), total_latency_ms: 0, latency_count: 0,
        };
        const s = providerStats[prov];
        s.total_requests++;
        s.provider_cost_usd += Number(row.provider_cost_usd) || 0;
        s.credits_charged += Number(row.credits_charged) || 0;
        if (row.model_alias) s.models_used.add(row.model_alias);
      }

      const byProvider = Object.entries(providerStats)
        .sort((a, b) => b[1].provider_cost_usd - a[1].provider_cost_usd)
        .map(([prov, s]) => ({
          provider: prov,
          total_requests: s.total_requests,
          provider_cost_usd: Number(s.provider_cost_usd.toFixed(6)),
          credits_charged: s.credits_charged,
          models_used: Array.from(s.models_used).sort(),
          avg_latency_ms: s.latency_count > 0 ? Math.round(s.total_latency_ms / s.latency_count) : null,
        }));

      const totals = byProvider.reduce((acc, p) => ({
        total_requests: acc.total_requests + p.total_requests,
        provider_cost_usd: acc.provider_cost_usd + p.provider_cost_usd,
        credits_charged: acc.credits_charged + p.credits_charged,
      }), { total_requests: 0, provider_cost_usd: 0, credits_charged: 0 });

      return new Response(JSON.stringify({
        period_days: days,
        providers: byProvider,
        totals,
      }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- 404 ---
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Conflux Router error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", message: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

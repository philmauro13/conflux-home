// Conflux Engine — Deterministic Model Router
// Task-type → tier → model selection with tool-calling reliability filtering.
// Sits on top of router.rs which handles provider adapters and failover.
//
// Flow:
//   Agent declares task_type (or we infer)
//   → Look up routing config
//   → Filter by tool_calling reliability
//   → Select cheapest model that meets requirements
//   → Hand off to router.rs for actual API call

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

// ── Task Types ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum TaskType {
    SimpleChat,
    Summarize,
    Extract,
    Translate,
    CodeGen,
    ToolOrchestrate,
    ImageGen,
    FileOps,
    WebBrowse,
    Creative,
    DeepReasoning,
    AgenticComplex,
}

impl TaskType {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "simple_chat" | "chat" | "basic" => Some(Self::SimpleChat),
            "summarize" | "summary" | "summarization" => Some(Self::Summarize),
            "extract" | "extraction" | "parse" => Some(Self::Extract),
            "translate" | "translation" | "localize" => Some(Self::Translate),
            "code_gen" | "code" | "coding" | "programming" => Some(Self::CodeGen),
            "tool_orchestrate" | "tools" | "orchestrate" => Some(Self::ToolOrchestrate),
            "image_gen" | "image" | "vision" | "generate_image" => Some(Self::ImageGen),
            "file_ops" | "files" | "filesystem" => Some(Self::FileOps),
            "web_browse" | "browse" | "web" | "search" => Some(Self::WebBrowse),
            "creative" | "writing" | "content" => Some(Self::Creative),
            "deep_reasoning" | "reasoning" | "analysis" | "research" => Some(Self::DeepReasoning),
            "agentic_complex" | "agent" | "workflow" | "complex" => Some(Self::AgenticComplex),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SimpleChat => "simple_chat",
            Self::Summarize => "summarize",
            Self::Extract => "extract",
            Self::Translate => "translate",
            Self::CodeGen => "code_gen",
            Self::ToolOrchestrate => "tool_orchestrate",
            Self::ImageGen => "image_gen",
            Self::FileOps => "file_ops",
            Self::WebBrowse => "web_browse",
            Self::Creative => "creative",
            Self::DeepReasoning => "deep_reasoning",
            Self::AgenticComplex => "agentic_complex",
        }
    }
}

// ── Tool Calling Reliability ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum ToolReliability {
    None,
    Basic,
    Reliable,
}

impl ToolReliability {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "reliable" => Self::Reliable,
            "basic" => Self::Basic,
            _ => Self::None,
        }
    }
}

// ── Routing Rule ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingRule {
    pub task_type: TaskType,
    pub tier: String,
    pub preferred_models: Vec<String>,
    pub min_tool_reliability: ToolReliability,
    pub description: String,
}

// ── Model Route (from DB or config) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRoute {
    pub model_alias: String,
    pub provider: String,
    pub provider_model_id: String,
    pub tier: String,
    pub tool_calling: ToolReliability,
    pub credit_cost_per_1k_in: i32,
    pub credit_cost_per_1k_out: i32,
    pub fallback_model: Option<String>,
    pub enabled: bool,
}

// ── Route Selection Result ──

#[derive(Debug, Clone, Serialize)]
pub struct RouteSelection {
    pub model_alias: String,
    pub provider: String,
    pub provider_model_id: String,
    pub tier: String,
    pub tool_calling: ToolReliability,
    pub estimated_cost_credits: i32,
    pub fallback_chain: Vec<String>,
    pub task_type: String,
}

// ── Built-in Routing Config ──
// Matches routing-config.json. Hardcoded for Rust side so we don't need JSON parsing at runtime.

fn builtin_rules() -> &'static Vec<RoutingRule> {
    static RULES: OnceLock<Vec<RoutingRule>> = OnceLock::new();
    RULES.get_or_init(|| {
        vec![
            RoutingRule {
                task_type: TaskType::SimpleChat,
                tier: "core".into(),
                preferred_models: vec![
                    "gpt-4o-mini".into(),
                    "deepseek-chat".into(),
                    "gemini-flash".into(),
                    "grok-3-mini".into(),
                    "mistral-small".into(),
                ],
                min_tool_reliability: ToolReliability::Basic,
                description: "Greeting, basic Q&A, text formatting.".into(),
            },
            RoutingRule {
                task_type: TaskType::Summarize,
                tier: "core".into(),
                preferred_models: vec![
                    "gpt-4o-mini".into(),
                    "claude-haiku".into(),
                    "deepseek-chat".into(),
                    "mistral-medium".into(),
                    "gemini-flash".into(),
                ],
                min_tool_reliability: ToolReliability::Basic,
                description: "Text extraction, classification, summarization.".into(),
            },
            RoutingRule {
                task_type: TaskType::Extract,
                tier: "core".into(),
                preferred_models: vec![
                    "gpt-4o-mini".into(),
                    "deepseek-chat".into(),
                    "claude-haiku".into(),
                    "grok-4.1-fast".into(),
                    "mistral-small".into(),
                ],
                min_tool_reliability: ToolReliability::Basic,
                description: "Data extraction, parsing, structured output.".into(),
            },
            RoutingRule {
                task_type: TaskType::Translate,
                tier: "core".into(),
                preferred_models: vec![
                    "gpt-4o-mini".into(),
                    "deepseek-chat".into(),
                    "claude-haiku".into(),
                    "gemini-flash".into(),
                    "mistral-medium".into(),
                ],
                min_tool_reliability: ToolReliability::Basic,
                description: "Language translation, localization.".into(),
            },
            RoutingRule {
                task_type: TaskType::CodeGen,
                tier: "pro".into(),
                preferred_models: vec![
                    "gemini-2.5-flash".into(),
                    "gpt-4.1-mini".into(),
                    "deepseek-r1".into(),
                    "grok-code-fast".into(),
                    "mistral-codestral".into(),
                ],
                min_tool_reliability: ToolReliability::Reliable,
                description: "Write code, fix bugs, refactor. Needs file read/write/exec.".into(),
            },
            RoutingRule {
                task_type: TaskType::ToolOrchestrate,
                tier: "pro".into(),
                preferred_models: vec![
                    "gpt-4.1-mini".into(),
                    "grok-code-fast".into(),
                    "gemini-2.5-flash".into(),
                    "mimo-v2-pro".into(),
                    "mistral-large".into(),
                ],
                min_tool_reliability: ToolReliability::Reliable,
                description: "Multi-step tool chaining, API calls, file operations.".into(),
            },
            RoutingRule {
                task_type: TaskType::ImageGen,
                tier: "pro".into(),
                preferred_models: vec![
                    "grok-code-fast".into(),
                    "gpt-4.1-mini".into(),
                    "gemini-2.5-flash".into(),
                    "mistral-large".into(),
                    "deepseek-r1".into(),
                ],
                min_tool_reliability: ToolReliability::Reliable,
                description: "Image creation, editing, vision tasks.".into(),
            },
            RoutingRule {
                task_type: TaskType::FileOps,
                tier: "pro".into(),
                preferred_models: vec![
                    "gpt-4.1-mini".into(),
                    "gemini-2.5-flash".into(),
                    "grok-code-fast".into(),
                    "deepseek-r1".into(),
                    "mistral-large".into(),
                ],
                min_tool_reliability: ToolReliability::Reliable,
                description: "File read/write/edit, directory operations.".into(),
            },
            RoutingRule {
                task_type: TaskType::WebBrowse,
                tier: "pro".into(),
                preferred_models: vec![
                    "gpt-4.1-mini".into(),
                    "gemini-2.5-flash".into(),
                    "grok-code-fast".into(),
                    "deepseek-r1".into(),
                    "mimo-v2-pro".into(),
                ],
                min_tool_reliability: ToolReliability::Reliable,
                description: "Web scraping, search, URL fetching.".into(),
            },
            RoutingRule {
                task_type: TaskType::Creative,
                tier: "pro".into(),
                preferred_models: vec![
                    "gemini-2.5-flash".into(),
                    "gpt-4.1-mini".into(),
                    "grok-code-fast".into(),
                    "mistral-large".into(),
                    "deepseek-r1".into(),
                ],
                min_tool_reliability: ToolReliability::Basic,
                description: "Creative writing, content generation.".into(),
            },
            RoutingRule {
                task_type: TaskType::DeepReasoning,
                tier: "ultra".into(),
                preferred_models: vec![
                    "claude-sonnet".into(),
                    "gpt-4.1".into(),
                    "gemini-pro".into(),
                    "grok-4.20".into(),
                    "claude-sonnet-4.5".into(),
                ],
                min_tool_reliability: ToolReliability::Reliable,
                description: "Research, analysis, complex multi-step reasoning.".into(),
            },
            RoutingRule {
                task_type: TaskType::AgenticComplex,
                tier: "ultra".into(),
                preferred_models: vec![
                    "claude-opus".into(),
                    "gpt-4o".into(),
                    "grok-4.20".into(),
                    "claude-sonnet".into(),
                    "gpt-4.1".into(),
                ],
                min_tool_reliability: ToolReliability::Reliable,
                description: "Full workflows, 20+ tool calls, error recovery.".into(),
            },
        ]
    })
}

// ── Built-in Model Routes ──
// Subset of model_routes table. Only includes tool_calling info.

fn builtin_model_routes() -> &'static HashMap<String, ModelRoute> {
    static ROUTES: OnceLock<HashMap<String, ModelRoute>> = OnceLock::new();
    ROUTES.get_or_init(|| {
        let routes = vec![
            // Core - reliable
            ("gpt-4o-mini", "openai", "core", true),
            ("claude-haiku", "anthropic", "core", true),
            ("claude-haiku-3.5", "anthropic", "core", true),
            ("gpt-4.1-nano", "openai", "core", true),
            ("deepseek-chat", "deepseek", "core", true),
            ("gemini-flash", "google", "core", true),
            ("grok-3-mini", "xai", "core", true),
            ("grok-4.1-fast", "xai", "core", true),
            ("mistral-medium", "mistral", "core", true),
            ("mistral-small", "mistral", "core", true),
            // Core - basic
            ("llama-3.3-70b-groq", "groq", "core", false),
            ("llama-3.3-70b-cf", "cloudflare", "core", false),
            ("llama-4-scout-cf", "cloudflare", "core", false),
            ("llama-4-scout-groq", "groq", "core", false),
            ("llama-3.1-8b-cerebras", "cerebras", "core", false),
            ("llama-3.1-8b-groq", "groq", "core", false),
            ("mimo-v2", "mimo", "core", false),
            ("ministral-8b", "mistral", "core", false),
            ("qwen-3-235b-cerebras", "cerebras", "core", false),
            ("glm-4.7-cerebras", "cerebras", "core", false),
            // Pro - reliable
            ("gemini-2.5-flash", "google", "pro", true),
            ("gpt-4.1-mini", "openai", "pro", true),
            ("deepseek-r1", "deepseek", "pro", true),
            ("o3-mini", "openai", "pro", true),
            ("o4-mini", "openai", "pro", true),
            ("codex-mini", "openai", "pro", true),
            ("grok-code-fast", "xai", "pro", true),
            ("mimo-v2-pro", "mimo", "pro", true),
            ("mistral-large", "mistral", "pro", true),
            ("mistral-codestral", "mistral", "pro", true),
            // Pro - basic
            ("mimo-v2-omni", "mimo", "pro", false),
            ("kimi-k2-groq", "groq", "pro", false),
            // Ultra - all reliable
            ("claude-opus", "anthropic", "ultra", true),
            ("claude-sonnet", "anthropic", "ultra", true),
            ("claude-sonnet-4.5", "anthropic", "ultra", true),
            ("gpt-4.1", "openai", "ultra", true),
            ("gpt-4o", "openai", "ultra", true),
            ("gemini-pro", "google", "ultra", true),
            ("grok-3", "xai", "ultra", true),
            ("grok-4.20", "xai", "ultra", true),
            ("o1", "openai", "ultra", true),
            ("o3", "openai", "ultra", true),
        ];

        let mut map = HashMap::new();
        for (alias, provider, tier, reliable) in routes {
            map.insert(
                alias.to_string(),
                ModelRoute {
                    model_alias: alias.to_string(),
                    provider: provider.to_string(),
                    provider_model_id: alias.to_string(),
                    tier: tier.to_string(),
                    tool_calling: if reliable {
                        ToolReliability::Reliable
                    } else {
                        ToolReliability::Basic
                    },
                    credit_cost_per_1k_in: 1,
                    credit_cost_per_1k_out: 1,
                    fallback_model: None,
                    enabled: true,
                },
            );
        }
        map // <-- return the map, no semicolon
    }) // <-- no semicolon here either, get_or_init returns &'static
}

// ── Public API ──

/// Select the best model for a given task type.
/// Returns the model alias, provider, and fallback chain.
pub fn select_model(task_type: &str) -> Option<RouteSelection> {
    let task = TaskType::from_str(task_type)?;
    select_model_for_task(&task)
}

/// Select model for a typed TaskType enum.
pub fn select_model_for_task(task_type: &TaskType) -> Option<RouteSelection> {
    let rules = builtin_rules();
    let routes = builtin_model_routes();

    // Find the routing rule for this task type
    let rule = rules.iter().find(|r| &r.task_type == task_type)?;

    // Find the first preferred model that:
    // 1. Exists in our model routes
    // 2. Is enabled
    // 3. Meets the minimum tool reliability requirement
    let selected = rule.preferred_models.iter().find_map(|alias| {
        routes.get(alias).and_then(|route| {
            if !route.enabled {
                return None;
            }
            if route.tool_calling < rule.min_tool_reliability {
                return None;
            }
            Some(route)
        })
    })?;

    // Build fallback chain from remaining preferred models
    let fallback_chain: Vec<String> = rule
        .preferred_models
        .iter()
        .filter(|alias| **alias != selected.model_alias)
        .filter(|alias| {
            routes.get(*alias).map_or(false, |r| {
                r.enabled && r.tool_calling >= rule.min_tool_reliability
            })
        })
        .cloned()
        .collect();

    Some(RouteSelection {
        model_alias: selected.model_alias.clone(),
        provider: selected.provider.clone(),
        provider_model_id: selected.provider_model_id.clone(),
        tier: selected.tier.clone(),
        tool_calling: selected.tool_calling.clone(),
        estimated_cost_credits: selected.credit_cost_per_1k_in + selected.credit_cost_per_1k_out,
        fallback_chain,
        task_type: task_type.as_str().to_string(),
    })
}

/// Get the tier for a task type (without selecting a specific model).
pub fn get_tier_for_task(task_type: &str) -> Option<String> {
    let task = TaskType::from_str(task_type)?;
    let rules = builtin_rules();
    rules
        .iter()
        .find(|r| r.task_type == task)
        .map(|r| r.tier.clone())
}

/// Get all available task types.
pub fn get_task_types() -> Vec<String> {
    builtin_rules()
        .iter()
        .map(|r| r.task_type.as_str().to_string())
        .collect()
}

/// Check if a model supports tool calling reliably.
pub fn model_supports_tools(model_alias: &str) -> bool {
    builtin_model_routes()
        .get(model_alias)
        .map_or(false, |r| r.tool_calling >= ToolReliability::Basic)
}

/// Get models that reliably support tool calling.
pub fn get_reliable_tool_models() -> Vec<String> {
    builtin_model_routes()
        .iter()
        .filter(|(_, r)| r.tool_calling == ToolReliability::Reliable && r.enabled)
        .map(|(alias, _)| alias.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_select_simple_chat() {
        let selection = select_model("simple_chat").unwrap();
        assert_eq!(selection.tier, "core");
        assert!(selection.fallback_chain.len() > 0);
    }

    #[test]
    fn test_select_code_gen() {
        let selection = select_model("code_gen").unwrap();
        assert_eq!(selection.tier, "pro");
        assert_eq!(selection.tool_calling, ToolReliability::Reliable);
    }

    #[test]
    fn test_select_agentic_complex() {
        let selection = select_model("agentic_complex").unwrap();
        assert_eq!(selection.tier, "ultra");
        assert_eq!(selection.model_alias, "claude-opus");
    }

    #[test]
    fn test_invalid_task_type() {
        assert!(select_model("nonexistent").is_none());
    }

    #[test]
    fn test_tool_reliability_filtering() {
        // Simple chat should accept basic tool models
        let selection = select_model("simple_chat").unwrap();
        let route = builtin_model_routes().get(&selection.model_alias).unwrap();
        assert!(route.tool_calling >= ToolReliability::Basic);
    }
}

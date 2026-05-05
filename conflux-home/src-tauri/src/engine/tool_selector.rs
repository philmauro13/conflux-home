// Conflux Engine — Smart Tool Selector
//
// Dynamically selects relevant tools based on user message context.
// Instead of sending all 145+ tools to the LLM (blowing context windows),
// this module picks the most relevant subset using keyword matching,
// priority ranking, and category affinity.
//
// Design goals:
//   - Zero LLM cost (pure keyword/heuristic matching)
//   - <1ms selection time
//   - Scales to 1000+ tools
//   - Deterministic and debuggable

use serde_json::Value;
use std::collections::{HashMap, HashSet};

/// Metadata for a single tool — used for smart selection.
#[derive(Debug, Clone)]
pub struct ToolMeta {
    /// Tool name as it appears in the schema (e.g., "kitchen_add_meal")
    pub name: String,
    /// Category derived from name prefix (e.g., "kitchen", "vault", "web")
    pub category: String,
    /// Keywords for matching against user messages
    pub keywords: Vec<String>,
    /// Priority 0-10. Higher = more likely to be included.
    /// 10 = always include (core tools like time, calc, web_search)
    pub priority: u8,
}

/// Result of tool selection — indices into the original tool_defs Vec.
#[derive(Debug, Clone)]
pub struct ToolSelection {
    /// Indices of selected tools in the original definitions Vec
    pub indices: Vec<usize>,
    /// How many were selected
    pub count: usize,
    /// Selection reason (for logging/debugging)
    pub reason: String,
}

/// The tool selector. Built once per set of tool definitions, then queried per message.
pub struct ToolSelector {
    metas: Vec<ToolMeta>,
    /// Category → tool indices lookup
    category_index: HashMap<String, Vec<usize>>,
    /// Lowercased keyword → tool indices lookup (inverted index)
    keyword_index: HashMap<String, Vec<usize>>,
}

impl ToolSelector {
    /// Build a selector from the current tool definitions.
    /// Extracts metadata automatically from tool names and descriptions.
    pub fn from_definitions(tool_defs: &[Value]) -> Self {
        let mut metas = Vec::with_capacity(tool_defs.len());
        let mut category_index: HashMap<String, Vec<usize>> = HashMap::new();
        let mut keyword_index: HashMap<String, Vec<usize>> = HashMap::new();

        for (i, def) in tool_defs.iter().enumerate() {
            let meta = extract_metadata(def, i);
            
            // Build category index
            category_index
                .entry(meta.category.clone())
                .or_default()
                .push(i);
            
            // Build keyword index
            for kw in &meta.keywords {
                keyword_index
                    .entry(kw.to_lowercase())
                    .or_default()
                    .push(i);
            }
            
            metas.push(meta);
        }

        Self {
            metas,
            category_index,
            keyword_index,
        }
    }

    /// Select relevant tools for a user message.
    /// Returns indices into the original tool_defs Vec.
    ///
    /// `max_tools` — hard cap on selected tools (local: 15-20, cloud: 40-60)
    /// `used_categories` — categories used in previous turns (from conversation tracking)
    pub fn select(
        &self,
        user_message: &str,
        max_tools: usize,
        used_categories: &[String],
    ) -> ToolSelection {
        let message_lower = user_message.to_lowercase();
        let words = extract_words(&message_lower);
        
        // ── Intent Classification ──
        // Fast keyword router: detect what the user is trying to DO.
        // Boost tools of the matching intent type.
        let add_intent = words.contains("add") || words.contains("create") || words.contains("new") || words.contains("set") || words.contains("log") || words.contains("track") || words.contains("save") || message_lower.contains("i want to") || message_lower.contains("i'd like") || message_lower.contains("add a") || message_lower.contains("set a");
        let view_intent = words.contains("show") || words.contains("view") || words.contains("see") || words.contains("get") || words.contains("list") || words.contains("check") || words.contains("what") || words.contains("how") || message_lower.contains("what's") || message_lower.contains("what is") || message_lower.contains("show me") || message_lower.contains("can i see");
        let delete_intent = words.contains("delete") || words.contains("remove") || words.contains("clear") || words.contains("cancel") || message_lower.contains("get rid of") || message_lower.contains("take off");
        let edit_intent = words.contains("change") || words.contains("update") || words.contains("edit") || words.contains("rename") || words.contains("modify") || message_lower.contains("switch to") || message_lower.contains("set to");
        let do_intent = message_lower.contains("i spent") || message_lower.contains("i bought") || message_lower.contains("i earned") || message_lower.contains("i worked") || message_lower.contains("i exercised") || words.contains("spent") || words.contains("bought") || words.contains("earned") || words.contains("worked out");
        
        // Score each tool
        let mut scores: Vec<(usize, f32)> = self.metas.iter().enumerate().map(|(i, meta)| {
            let mut score = meta.priority as f32;

            // ── Intent matching (most important routing signal) ──
            let name_lower = &meta.name;
            
            // "Add" intent → boost add/create tools
            if add_intent && (name_lower.contains("_add_") || name_lower.ends_with("_add") || name_lower.contains("_create") || name_lower.ends_with("_log")) {
                score += 25.0;
            }
            // "View" intent → boost get/list tools
            if view_intent && (name_lower.contains("_get_") || name_lower.contains("_list_") || name_lower.ends_with("_get") || name_lower.ends_with("_list") || name_lower.ends_with("_dashboard") || name_lower.ends_with("_overview")) {
                score += 25.0;
            }
            // "Do" intent → boost add/execute tools (spending, tracking, logging)
            if do_intent && (name_lower.contains("_add_") || name_lower.contains("_execute") || name_lower.ends_with("_add") || name_lower.ends_with("_log") || name_lower.contains("_complete")) {
                score += 20.0;
            }
            // "Edit" intent → boost update tools
            if edit_intent && (name_lower.contains("_update") || name_lower.contains("_edit") || name_lower.contains("_complete") || name_lower.contains("_toggle")) {
                score += 20.0;
            }
            // "Delete" intent → boost delete tools
            if delete_intent && (name_lower.contains("_delete") || name_lower.contains("_remove")) {
                score += 25.0;
            }

            // 1. Direct name match (strongest signal)
            if message_lower.contains(name_lower) {
                score += 50.0;
            }
            // Partial name match (e.g., "meal" matches "kitchen_add_meal")
            let name_parts: Vec<&str> = name_lower.split('_').collect();
            for part in &name_parts {
                if part.len() >= 3 && words.contains(*part) {
                    score += 15.0;
                }
            }

            // 2. Keyword matches
            for kw in &meta.keywords {
                if message_lower.contains(kw.as_str()) {
                    score += 10.0;
                }
            }

            // 3. Category affinity — if this category was used recently
            if used_categories.contains(&meta.category) {
                score += 5.0;
            }

            // 4. Inverted index lookup — which keywords in the message point to this tool?
            for word in &words {
                if let Some(tool_indices) = self.keyword_index.get(word) {
                    if tool_indices.contains(&i) {
                        score += 8.0;
                    }
                }
            }

            (i, score)
        }).collect();

        // Sort by score descending
        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // Take top max_tools
        let indices: Vec<usize> = scores
            .iter()
            .take(max_tools)
            .map(|(i, _)| *i)
            .collect();

        let selected_names: Vec<&str> = indices
            .iter()
            .filter_map(|&i| Some(self.metas[i].name.as_str()))
            .collect();

        ToolSelection {
            count: indices.len(),
            reason: format!(
                "selected {}/{} tools: {}",
                indices.len(),
                self.metas.len(),
                selected_names.join(", ")
            ),
            indices,
        }
    }

    /// Get all tool indices for a specific category.
    pub fn get_category_indices(&self, category: &str) -> &[usize] {
        self.category_index.get(category).map(|v| v.as_slice()).unwrap_or(&[])
    }

    /// Get the number of tools registered.
    pub fn len(&self) -> usize {
        self.metas.len()
    }

    pub fn is_empty(&self) -> bool {
        self.metas.is_empty()
    }
}

/// Extract metadata from a tool definition JSON.
fn extract_metadata(def: &Value, _index: usize) -> ToolMeta {
    let name = def
        .get("function").and_then(|f| f.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("unknown")
        .to_string();

    let description = def
        .get("function").and_then(|f| f.get("description"))
        .and_then(|d| d.as_str())
        .unwrap_or("")
        .to_string();

    // Extract category from name prefix (e.g., "kitchen_add_meal" → "kitchen")
    let category = name.split('_').next().unwrap_or(&name).to_string();

    // Build keywords from:
    // 1. All name parts (split on _)
    // 2. Description words (filtered to meaningful ones)
    let mut keywords: Vec<String> = name
        .split('_')
        .filter(|w| w.len() >= 2 && !is_stop_word(w))
        .map(|w| w.to_lowercase())
        .collect();

    // Add important description words
    for word in description.split_whitespace() {
        let clean: String = word.chars().filter(|c| c.is_alphanumeric()).collect();
        let lower = clean.to_lowercase();
        if lower.len() >= 3 && !is_stop_word(&lower) && !keywords.contains(&lower) {
            keywords.push(lower);
        }
    }

    // Determine priority
    let priority = get_tool_priority(&name, &category);

    ToolMeta {
        name,
        category,
        keywords,
        priority,
    }
}

/// Assign priority to a tool. Core tools get 10, domain tools get 3-5, rarely used get 1.
fn get_tool_priority(name: &str, category: &str) -> u8 {
    match name {
        // Core tools — always include
        "time" | "calc" | "web_search" | "file_read" | "file_write" | "notify" => 10,
        "web_fetch" | "web_post" | "exec" | "memory_read" | "memory_write" => 9,
        // UI action — universal remote, high priority + keyword-matched
        "ui_action" => 9,
        // High-use domain tools (the most common user actions)
        "kitchen_add_meal" | "dream_add" | "budget_add_entry" | "life_add_task" => 8,
        "kitchen_list_meals" | "dream_list" | "budget_get_summary" | "life_list_tasks" => 7,
        "kitchen_delete_meal" | "dream_delete" | "life_delete_task" => 7,
        "email_send" | "email_receive" | "gmail_send" | "gmail_search" => 5,
        // Echo/journal — emotional intelligence
        "echo_write_entry" | "echo_counselor_start_session" => 6,
        // Everything else gets a base priority by category
        _ => match category {
            "kitchen" | "home" | "life" | "budget" | "vault" => 3,
            "echo" | "dream" | "feed" => 2,
            "conflux" | "fridge" | "google" => 3,
            _ => 2,
        },
    }
}

/// Extract meaningful words from a string for matching.
fn extract_words(text: &str) -> HashSet<String> {
    text.split_whitespace()
        .map(|w| w.chars().filter(|c| c.is_alphanumeric()).collect::<String>())
        .filter(|w| w.len() >= 2 && !is_stop_word(w))
        .collect()
}

/// Common words to ignore during matching.
fn is_stop_word(word: &str) -> bool {
    matches!(
        word,
        "the" | "a" | "an" | "is" | "are" | "was" | "were" | "be" | "been"
            | "being" | "have" | "has" | "had" | "do" | "does" | "did"
            | "will" | "would" | "could" | "should" | "may" | "might"
            | "shall" | "can" | "to" | "of" | "in" | "for" | "on" | "with"
            | "at" | "by" | "from" | "as" | "into" | "through" | "during"
            | "before" | "after" | "above" | "below" | "between" | "and"
            | "but" | "or" | "nor" | "not" | "so" | "yet" | "both"
            | "either" | "neither" | "each" | "every" | "all" | "any"
            | "few" | "more" | "most" | "other" | "some" | "such"
            | "no" | "only" | "own" | "same" | "than" | "too" | "very"
            | "just" | "because" | "if" | "when" | "where" | "how"
            | "what" | "which" | "who" | "this" | "that" | "these"
            | "those" | "i" | "me" | "my" | "we" | "our" | "you"
            | "your" | "he" | "him" | "his" | "she" | "her" | "it"
            | "its" | "they" | "them" | "their" | "up" | "about"
            | "get" | "got" | "go" | "going" | "make" | "made"
            | "take" | "took" | "come" | "came" | "give" | "gave"
            | "tell" | "told" | "show" | "find" | "want" | "need"
            | "try" | "use" | "let" | "say" | "said" | "see"
            | "like" | "look" | "put" | "set" | "run" | "add"
            | "new" | "now" | "here" | "there" | "also" | "back"
            | "then" | "out" | "still" | "way" | "even" | "well"
            | "really" | "please" | "help" | "thanks"
    )
}

/// Convenience: select tools from a Vec of definitions, returning a filtered Vec.
pub fn select_tools(
    tool_defs: &[Value],
    user_message: &str,
    max_tools: usize,
    used_categories: &[String],
) -> Vec<Value> {
    let selector = ToolSelector::from_definitions(tool_defs);
    let selection = selector.select(user_message, max_tools, used_categories);
    
    selection
        .indices
        .iter()
        .filter_map(|&i| tool_defs.get(i).cloned())
        .collect()
}

/// Validate and correct a tool name against available definitions.
/// If the name doesn't match exactly, try prefix matching (e.g., "life" → "life_add_task").
/// Returns the corrected name or None if no match found.
pub fn validate_tool_name(name: &str, tool_defs: &[Value]) -> Option<String> {
    // Extract all valid tool names
    let valid_names: Vec<String> = tool_defs
        .iter()
        .filter_map(|t| {
            t.get("function")
                .and_then(|f| f.get("name"))
                .and_then(|n| n.as_str())
                .map(|s| s.to_string())
        })
        .collect();

    // Exact match
    if valid_names.iter().any(|n| n == name) {
        return Some(name.to_string());
    }

    // Prefix match: "life" → first tool starting with "life_"
    let prefix = format!("{}_", name);
    let prefix_matches: Vec<&String> = valid_names
        .iter()
        .filter(|n| n.starts_with(&prefix))
        .collect();

    if prefix_matches.len() == 1 {
        // Unambiguous prefix match — use it
        return Some(prefix_matches[0].clone());
    } else if prefix_matches.len() > 1 {
        // Multiple matches — prefer "list" or "add" variants (most common)
        for preferred in &["list", "add", "get", "dashboard"] {
            let preferred_name = format!("{}_{}", name, preferred);
            if prefix_matches.iter().any(|n| **n == preferred_name) {
                return Some(preferred_name);
            }
        }
        // Fall back to first match
        return Some(prefix_matches[0].clone());
    }

    // Fuzzy match: check if any valid name contains the input
    let name_lower = name.to_lowercase();
    for valid in &valid_names {
        if valid.to_lowercase().contains(&name_lower) {
            return Some(valid.clone());
        }
    }

    None
}

/// Determine if a user message likely needs tool execution.
/// Returns false for purely conversational messages (greetings, acknowledgments, etc.)
/// that should get a fast direct response without tool schemas.
pub fn message_needs_tools(user_message: &str) -> bool {
    let msg = user_message.trim().to_lowercase();

    // Very short messages are usually conversational
    if msg.len() <= 3 {
        return false;
    }

    // Greetings
    let greetings = [
        "hi", "hello", "hey", "yo", "sup", "howdy", "greetings",
        "good morning", "good afternoon", "good evening", "good night",
        "what's up", "whats up", "hola",
    ];
    for g in &greetings {
        if msg == *g || msg.starts_with(&format!("{} ", g)) || msg.starts_with(&format!("{}!", g)) {
            return false;
        }
    }

    // Acknowledgments
    let acks = [
        "thanks", "thank you", "ok", "okay", "sure", "got it", "understood",
        "makes sense", "right", "yes", "no", "yep", "nope", "nah",
        "sounds good", "perfect", "great", "awesome", "cool", "nice",
        "lol", "haha", "nice!", "cool!", "great!", "awesome!",
        "you're right", "absolutely", "definitely", "exactly",
        "i agree", "i see", "fair enough", "noted",
    ];
    for a in &acks {
        if msg == *a || msg == format!("{}!", a) || msg == format!("{}.", a) {
            return false;
        }
    }

    // Meta questions about the AI itself (no tools needed)
    let meta_patterns = [
        "what is your name", "what's your name", "whats your name",
        "who are you", "what do you do", "how do you work",
        "what can you do", "tell me about yourself",
        "are you there", "can you hear me",
    ];
    for p in &meta_patterns {
        if msg.contains(p) {
            return false;
        }
    }

    // Short conversational phrases
    if msg.len() < 20 {
        let conversational = [
            "i'm good", "im good", "doing well", "not bad",
            "see you", "talk later", "bye", "goodbye", "later",
            "my bad", "sorry", "no worries", "no problem",
        ];
        for c in &conversational {
            if msg.contains(c) {
                return false;
            }
        }
    }

    // Everything else needs tools
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_tool(name: &str, desc: &str) -> Value {
        json!({
            "type": "function",
            "function": {
                "name": name,
                "description": desc,
                "parameters": { "type": "object", "properties": {} }
            }
        })
    }

    #[test]
    fn test_core_tools_always_selected() {
        let tools = vec![
            make_tool("web_search", "Search the web"),
            make_tool("kitchen_add_meal", "Add a meal to the kitchen"),
            make_tool("vault_list_files", "List files in vault"),
            make_tool("time", "Get current time"),
            make_tool("calc", "Calculate math"),
        ];
        
        let selector = ToolSelector::from_definitions(&tools);
        let sel = selector.select("what time is it", 5, &[]);
        
        // time should be #1 since message mentions "time"
        assert!(sel.indices.contains(&3)); // time
        assert!(sel.indices.contains(&0)); // web_search (priority 10)
    }

    #[test]
    fn test_category_match() {
        let tools = vec![
            make_tool("kitchen_add_meal", "Add a meal"),
            make_tool("kitchen_list_meals", "List meals"),
            make_tool("vault_list_files", "List files"),
            make_tool("web_search", "Search web"),
        ];
        
        let selector = ToolSelector::from_definitions(&tools);
        let sel = selector.select("show me my meals", 10, &[]);
        
        // Kitchen tools should rank high (keyword: "meals")
        let kitchen_count = sel.indices.iter().filter(|&&i| i < 2).count();
        assert!(kitchen_count >= 1, "Should select at least one kitchen tool for 'meals'");
    }

    #[test]
    fn test_max_tools_respected() {
        let tools: Vec<Value> = (0..50)
            .map(|i| make_tool(&format!("tool_{}", i), "A tool"))
            .collect();
        
        let selector = ToolSelector::from_definitions(&tools);
        let sel = selector.select("do something", 10, &[]);
        
        assert!(sel.count <= 10);
    }
}

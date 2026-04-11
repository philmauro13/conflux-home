// Conflux Engine — Memory Extraction
// After each conversation turn, analyzes the exchange and stores facts/preferences.
// Uses a lightweight LLM call to extract structured memories.

use anyhow::Result;
use serde::Deserialize;

use super::db::EngineDb;
use super::router;

#[derive(Debug, Deserialize)]
struct ExtractedMemories {
    memories: Vec<ExtractedMemory>,
}

#[derive(Debug, Deserialize)]
struct ExtractedMemory {
    #[serde(rename = "type")]
    memory_type: String,  // "fact", "preference", "correction", "knowledge"
    key: Option<String>,
    content: String,
    confidence: Option<f64>,
}

const EXTRACTION_PROMPT: &str = r#"Analyze this conversation and extract memories worth storing about the user or the context.

Return a JSON object with a "memories" array. Each memory has:
- "type": one of "fact", "preference", "correction", "knowledge"
- "key": a short searchable label (e.g., "user_name", "project_name", "timezone") — optional
- "content": the full memory text
- "confidence": 0.0 to 1.0

Rules:
- Only extract NEW information not already obvious
- Facts: "User's name is Don", "Project is called Conflux Home"
- Preferences: "Prefers direct answers", "Works late at night"  
- Corrections: "User corrected that the project started in March, not February"
- Knowledge: domain facts the user shared
- If nothing notable, return {"memories": []}
- Be conservative — don't extract trivial exchanges

Return ONLY the JSON object, no other text."#;

/// Extract memories from a conversation exchange and store them in the database.
/// Called after `process_turn` completes.
pub async fn extract_and_store(
    db: &EngineDb,
    session_id: &str,
    agent_id: &str,
    user_message: &str,
    assistant_response: &str,
) -> Result<()> {
    // Build the extraction prompt
    let conversation = format!(
        "User: {}\n\nAssistant: {}",
        user_message, assistant_response
    );

    let messages = vec![
        router::OpenAIMessage {
            role: "system".to_string(),
            content: Some(EXTRACTION_PROMPT.to_string()),
            tool_call_id: None,
            tool_calls: None,
        },
        router::OpenAIMessage {
            role: "user".to_string(),
            content: Some(conversation),
            tool_call_id: None,
            tool_calls: None,
        },
    ];

    // Use fast model for extraction (cheap + fast)
    let response = router::chat(
        "conflux-fast",
        messages,
        Some(500),
        Some(0.0), // low temperature for consistency
        None,      // no tools needed
    ).await?;

    // Parse the response
    let extracted: ExtractedMemories = match serde_json::from_str(&response.content) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("[Memory] Failed to parse extraction response: {} — raw: {}", e, &response.content[..response.content.len().min(200)]);
            return Ok(()); // Don't fail the conversation for extraction errors
        }
    };

    // Store each memory
    for mem in extracted.memories {
        // Check for duplicates (same key + agent)
        if let Some(key) = &mem.key {
            if let Ok(Some(existing)) = db.get_memory_by_key(agent_id, key) {
                // Update if content changed
                if existing.content != mem.content {
                    log::info!("[Memory] Updating existing memory: {} = {}", key, mem.content);
                    // Delete old, insert new
                    let _ = db.delete_memory(&existing.id);
                } else {
                    // Duplicate, skip
                    continue;
                }
            }
        }

        let id = db.store_memory(
            agent_id,
            &mem.memory_type,
            mem.key.as_deref(),
            &mem.content,
            Some(&format!("session:{}", session_id)),
        )?;

        // Set confidence if provided
        if let Some(conf) = mem.confidence {
            let _ = db.set_memory_confidence(&id, conf);
        }

        log::info!("[Memory] Stored: [{}] {} = {}", mem.memory_type, mem.key.as_deref().unwrap_or("-"), &mem.content[..mem.content.len().min(100)]);
    }

    // Log telemetry
    let _ = db.log_event(
        "memory_extracted",
        Some(agent_id),
        Some(session_id),
        Some(&serde_json::json!({
            "user_msg_len": user_message.len(),
            "assistant_msg_len": assistant_response.len(),
        }).to_string()),
    );

    Ok(())
}

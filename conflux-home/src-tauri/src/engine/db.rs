// Conflux Engine — Database Layer
// SQLite-backed persistent storage. Single source of truth.

use anyhow::{Context, Result};
use rusqlite::{Connection, params};
use std::path::Path;
use std::sync::{Arc, Mutex};

/// The embedded database. Thread-safe via Mutex.
pub struct EngineDb {
    conn: Arc<Mutex<Connection>>,
}

impl EngineDb {
    /// Open or create the database at the given path.
    /// Runs migrations automatically.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)
            .context("Failed to open database")?;

        // Enable WAL mode for better concurrent read performance
        conn.query_row("PRAGMA journal_mode=WAL;", [], |row| {
            let mode: String = row.get(0)?;
            log::info!("SQLite journal_mode: {}", mode);
            Ok(())
        })
        .context("Failed to set WAL mode")?;

        // Enable foreign keys
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;

        let db = EngineDb {
            conn: Arc::new(Mutex::new(conn)),
        };

        db.migrate()?;
        Ok(db)
    }

    /// Open an in-memory database (for testing).
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()
            .context("Failed to open in-memory database")?;

        conn.execute_batch("PRAGMA foreign_keys = ON;")?;

        let db = EngineDb {
            conn: Arc::new(Mutex::new(conn)),
        };

        db.migrate()?;
        Ok(db)
    }

    /// Run the schema migration.
    /// Runs the full schema as a batch. If it fails due to pre-existing
    /// columns/tables, falls back to running statement-by-statement,
    /// skipping "already exists" / "duplicate column" errors.
    fn migrate(&self) -> Result<()> {
        let schema = include_str!("../../schema.sql");
        let conn = self.conn.lock().map_err(|_| anyhow::anyhow!("Database lock poisoned"))?;
        
        // Try full batch first (fast path for fresh databases)
        match conn.execute_batch(schema) {
            Ok(_) => return Ok(()),
            Err(e) => {
                let msg = e.to_string().to_lowercase();
                if msg.contains("duplicate column") || msg.contains("already exists") {
                    // Existing database — run each complete statement individually
                    log::debug!("Schema batch failed (existing DB), retrying statement-by-statement");
                } else {
                    return Err(e).context("Failed to run schema migration");
                }
            }
        }

        // Slow path: split on top-level semicolons (outside of parens/strings)
        // and skip statements that fail with "already exists" errors.
        let statements = Self::split_sql_statements(schema);
        for statement in &statements {
            match conn.execute_batch(statement) {
                Ok(_) => {}
                Err(e) => {
                    let msg = e.to_string().to_lowercase();
                    if msg.contains("duplicate column") || msg.contains("already exists") {
                        log::debug!("Skipping migration statement (already applied): {}", 
                            &statement[..statement.len().min(60)]);
                    } else {
                        return Err(e).context(format!(
                            "Failed to run schema migration statement: {}", 
                            &statement[..statement.len().min(80)]));
                    }
                }
            }
        }
        Ok(())
    }

    /// Split SQL into complete statements, respecting parentheses depth.
    /// SQLite semicolons inside CREATE TABLE (...) should not split.
    fn split_sql_statements(sql: &str) -> Vec<String> {
        let mut statements = Vec::new();
        let mut current = String::new();
        let mut paren_depth: u32 = 0;
        let mut in_string = false;
        let mut string_char = '\0';
        let mut chars = sql.chars().peekable();

        while let Some(ch) = chars.next() {
            if in_string {
                current.push(ch);
                if ch == string_char {
                    // Check for escaped quote ('' in SQL)
                    if chars.peek() == Some(&string_char) {
                        current.push(chars.next().unwrap());
                    } else {
                        in_string = false;
                    }
                }
                continue;
            }

            match ch {
                '\'' | '"' => {
                    in_string = true;
                    string_char = ch;
                    current.push(ch);
                }
                '(' => {
                    paren_depth += 1;
                    current.push(ch);
                }
                ')' => {
                    if paren_depth > 0 { paren_depth -= 1; }
                    current.push(ch);
                }
                ';' if paren_depth == 0 => {
                    let trimmed = current.trim().to_string();
                    if !trimmed.is_empty() && !trimmed.starts_with("--") {
                        statements.push(trimmed);
                    }
                    current.clear();
                }
                _ => current.push(ch),
            }
        }

        // Don't forget the last statement if no trailing semicolon
        let trimmed = current.trim().to_string();
        if !trimmed.is_empty() && !trimmed.starts_with("--") {
            statements.push(trimmed);
        }

        statements
    }

    /// Get a reference to the underlying connection.
    /// Holds the lock — use briefly.
    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("Database lock poisoned")
    }

    // ── Agent Queries ──

    pub fn get_agent(&self, id: &str) -> Result<Option<super::types::Agent>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, emoji, role, soul, instructions, model_alias, tier, is_active, created_at, updated_at
             FROM agents WHERE id = ?1"
        )?;

        let result = stmt.query_row(params![id], |row| {
            Ok(super::types::Agent {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                role: row.get(3)?,
                soul: row.get(4)?,
                instructions: row.get(5)?,
                model_alias: row.get(6)?,
                tier: row.get(7)?,
                is_active: row.get::<_, i64>(8)? != 0,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        });

        match result {
            Ok(agent) => Ok(Some(agent)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn get_active_agents(&self) -> Result<Vec<super::types::Agent>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, emoji, role, soul, instructions, model_alias, tier, is_active, created_at, updated_at
             FROM agents WHERE is_active = 1 ORDER BY name"
        )?;

        let agents = stmt.query_map([], |row| {
            Ok(super::types::Agent {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                role: row.get(3)?,
                soul: row.get(4)?,
                instructions: row.get(5)?,
                model_alias: row.get(6)?,
                tier: row.get(7)?,
                is_active: row.get::<_, i64>(8)? != 0,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        let mut result = Vec::new();
        for agent in agents {
            result.push(agent?);
        }
        Ok(result)
    }

    // ── Session Queries ──

    pub fn create_session(&self, agent_id: &str, user_id: &str) -> Result<super::types::Session> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO sessions (id, agent_id, user_id) VALUES (?1, ?2, ?3)",
            params![id, agent_id, user_id],
        )?;

        Ok(super::types::Session {
            id: id.clone(),
            agent_id: agent_id.to_string(),
            user_id: user_id.to_string(),
            title: None,
            status: "active".to_string(),
            message_count: 0,
            total_tokens: 0,
            created_at: Self::now(),
            updated_at: Self::now(),
        })
    }

    pub fn get_session(&self, id: &str) -> Result<Option<super::types::Session>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, agent_id, user_id, title, status, message_count, total_tokens, created_at, updated_at
             FROM sessions WHERE id = ?1"
        )?;

        let result = stmt.query_row(params![id], |row| {
            Ok(super::types::Session {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                user_id: row.get(2)?,
                title: row.get(3)?,
                status: row.get(4)?,
                message_count: row.get(5)?,
                total_tokens: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        });

        match result {
            Ok(session) => Ok(Some(session)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn get_recent_sessions(&self, user_id: &str, limit: i64) -> Result<Vec<super::types::Session>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, agent_id, user_id, title, status, message_count, total_tokens, created_at, updated_at
             FROM sessions WHERE user_id = ?1 AND status = 'active' ORDER BY updated_at DESC LIMIT ?2"
        )?;

        let sessions = stmt.query_map(params![user_id, limit], |row| {
            Ok(super::types::Session {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                user_id: row.get(2)?,
                title: row.get(3)?,
                status: row.get(4)?,
                message_count: row.get(5)?,
                total_tokens: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;

        let mut result = Vec::new();
        for session in sessions {
            result.push(session?);
        }
        Ok(result)
    }

    // ── Message Queries ──

    pub fn add_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
        tokens_used: i64,
        model: Option<&str>,
        provider_id: Option<&str>,
        latency_ms: Option<i64>,
    ) -> Result<super::types::Message> {
        self.add_message_with_tools(session_id, role, content, tokens_used, model, provider_id, latency_ms, None, None, None, None)
    }

    pub fn add_message_with_tools(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
        tokens_used: i64,
        model: Option<&str>,
        provider_id: Option<&str>,
        latency_ms: Option<i64>,
        tool_call_id: Option<&str>,
        tool_name: Option<&str>,
        tool_args: Option<&str>,
        tool_result: Option<&str>,
    ) -> Result<super::types::Message> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Self::now();
        let conn = self.conn();

        conn.execute(
            "INSERT INTO messages (id, session_id, role, content, tokens_used, model, provider_id, latency_ms, tool_call_id, tool_name, tool_args, tool_result)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![id, session_id, role, content, tokens_used, model, provider_id, latency_ms, tool_call_id, tool_name, tool_args, tool_result],
        )?;

        // Update session counters
        conn.execute(
            "UPDATE sessions SET message_count = message_count + 1, total_tokens = total_tokens + ?2, updated_at = ?3 WHERE id = ?1",
            params![session_id, tokens_used, now],
        )?;

        Ok(super::types::Message {
            id,
            session_id: session_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            tool_call_id: tool_call_id.map(String::from),
            tool_name: tool_name.map(String::from),
            tool_args: tool_args.map(String::from),
            tool_result: tool_result.map(String::from),
            tokens_used,
            model: model.map(String::from),
            provider_id: provider_id.map(String::from),
            latency_ms,
            created_at: now,
        })
    }

    pub fn get_messages(&self, session_id: &str, limit: i64) -> Result<Vec<super::types::Message>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, tool_call_id, tool_name, tool_args, tool_result,
                    tokens_used, model, provider_id, latency_ms, created_at
             FROM messages WHERE session_id = ?1 ORDER BY created_at DESC LIMIT ?2"
        )?;

        let messages = stmt.query_map(params![session_id, limit], |row| {
            Ok(super::types::Message {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                tool_call_id: row.get(4)?,
                tool_name: row.get(5)?,
                tool_args: row.get(6)?,
                tool_result: row.get(7)?,
                tokens_used: row.get(8)?,
                model: row.get(9)?,
                provider_id: row.get(10)?,
                latency_ms: row.get(11)?,
                created_at: row.get(12)?,
            })
        })?;

        let mut result: Vec<super::types::Message> = Vec::new();
        for msg in messages {
            result.push(msg?);
        }
        result.reverse(); // Return in chronological order
        Ok(result)
    }

    // ── Memory Queries ──

    pub fn store_memory(
        &self,
        agent_id: &str,
        memory_type: &str,
        key: Option<&str>,
        content: &str,
        source: Option<&str>,
    ) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();

        conn.execute(
            "INSERT INTO memory (id, agent_id, memory_type, key, content, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, agent_id, memory_type, key, content, source],
        )?;

        Ok(id)
    }

    pub fn search_memory(&self, agent_id: &str, query: &str, limit: i64) -> Result<Vec<super::types::Memory>> {
        let conn = self.conn();

        // Try FTS5 search first (better relevance ranking)
        let fts_result = conn.prepare(
            "SELECT m.id, m.agent_id, m.memory_type, m.key, m.content, m.source, m.confidence,
                    m.access_count, m.last_accessed, m.created_at, m.updated_at, m.expires_at
             FROM memory_fts fts
             JOIN memory m ON m.id = fts.memory_id
             WHERE fts.agent_id = ?1 AND memory_fts MATCH ?2
             ORDER BY rank
             LIMIT ?3"
        );

        let memories = match fts_result {
            Ok(mut stmt) => {
                // Sanitize query for FTS5: escape special chars, add prefix matching
                let fts_query = query
                    .split_whitespace()
                    .filter(|w| !w.is_empty())
                    .map(|w| format!("\"{}\"", w.replace('"', "")))
                    .collect::<Vec<_>>()
                    .join(" OR ");

                if fts_query.is_empty() {
                    return Ok(Vec::new());
                }

                match stmt.query_map(params![agent_id, fts_query, limit], |row| {
                    Ok(super::types::Memory {
                        id: row.get(0)?,
                        agent_id: row.get(1)?,
                        memory_type: row.get(2)?,
                        key: row.get(3)?,
                        content: row.get(4)?,
                        source: row.get(5)?,
                        confidence: row.get(6)?,
                        access_count: row.get(7)?,
                        last_accessed: row.get(8)?,
                        created_at: row.get(9)?,
                        updated_at: row.get(10)?,
                        expires_at: row.get(11)?,
                    })
                }) {
                    Ok(rows) => {
                        let mut result = Vec::new();
                        for row in rows {
                            if let Ok(mem) = row {
                                result.push(mem);
                            }
                        }
                        if !result.is_empty() {
                            // Update access counts
                            let now = Self::now();
                            for mem in &result {
                                let _ = conn.execute(
                                    "UPDATE memory SET access_count = access_count + 1, last_accessed = ?2 WHERE id = ?1",
                                    params![mem.id, now],
                                );
                            }
                            return Ok(result);
                        }
                        result
                    }
                    Err(_) => Vec::new(),
                }
            }
            Err(_) => Vec::new(),
        };

        // Fall back to LIKE search if FTS returned nothing
        if memories.is_empty() {
            let search_pattern = format!("%{}%", query);
            let mut stmt = conn.prepare(
                "SELECT id, agent_id, memory_type, key, content, source, confidence,
                        access_count, last_accessed, created_at, updated_at, expires_at
                 FROM memory
                 WHERE agent_id = ?1 AND (content LIKE ?2 OR key LIKE ?2)
                 ORDER BY confidence DESC, access_count DESC, created_at DESC
                 LIMIT ?3"
            )?;

            let fallback = stmt.query_map(params![agent_id, search_pattern, limit], |row| {
                Ok(super::types::Memory {
                    id: row.get(0)?,
                    agent_id: row.get(1)?,
                    memory_type: row.get(2)?,
                    key: row.get(3)?,
                    content: row.get(4)?,
                    source: row.get(5)?,
                    confidence: row.get(6)?,
                    access_count: row.get(7)?,
                    last_accessed: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                    expires_at: row.get(11)?,
                })
            })?;

            let mut result = Vec::new();
            for mem in fallback {
                result.push(mem?);
            }

            // Update access counts
            let now = Self::now();
            for mem in &result {
                let _ = conn.execute(
                    "UPDATE memory SET access_count = access_count + 1, last_accessed = ?2 WHERE id = ?1",
                    params![mem.id, now],
                );
            }

            return Ok(result);
        }

        Ok(memories)
    }

    pub fn get_memory_by_key(&self, agent_id: &str, key: &str) -> Result<Option<super::types::Memory>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, agent_id, memory_type, key, content, source, confidence,
                    access_count, last_accessed, created_at, updated_at, expires_at
             FROM memory WHERE agent_id = ?1 AND key = ?2
             ORDER BY updated_at DESC LIMIT 1"
        )?;

        let result = stmt.query_row(params![agent_id, key], |row| {
            Ok(super::types::Memory {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                memory_type: row.get(2)?,
                key: row.get(3)?,
                content: row.get(4)?,
                source: row.get(5)?,
                confidence: row.get(6)?,
                access_count: row.get(7)?,
                last_accessed: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                expires_at: row.get(11)?,
            })
        });

        match result {
            Ok(mem) => Ok(Some(mem)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    // ── Quota Queries ──

    pub fn get_quota(&self, user_id: &str, date: &str) -> Result<Option<super::types::QuotaRecord>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT user_id, date, calls_used, tokens_used, providers_used
             FROM quota WHERE user_id = ?1 AND date = ?2"
        )?;

        let result = stmt.query_row(params![user_id, date], |row| {
            Ok(super::types::QuotaRecord {
                user_id: row.get(0)?,
                date: row.get(1)?,
                calls_used: row.get(2)?,
                tokens_used: row.get(3)?,
                providers_used: row.get(4)?,
            })
        });

        match result {
            Ok(q) => Ok(Some(q)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn increment_quota(&self, user_id: &str, date: &str, tokens: i64, provider_id: &str) -> Result<i64> {
        let conn = self.conn();

        // Upsert quota record
        conn.execute(
            "INSERT INTO quota (user_id, date, calls_used, tokens_used, providers_used)
             VALUES (?1, ?2, 1, ?3, ?4)
             ON CONFLICT(user_id, date) DO UPDATE SET
                calls_used = calls_used + 1,
                tokens_used = tokens_used + ?3",
            params![user_id, date, tokens, format!("{{\"{}\": 1}}", provider_id)],
        )?;

        // Return new call count
        let count: i64 = conn.query_row(
            "SELECT calls_used FROM quota WHERE user_id = ?1 AND date = ?2",
            params![user_id, date],
            |row| row.get(0),
        )?;

        Ok(count)
    }

    // ── Config ──

    pub fn get_config(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn();
        let result: std::result::Result<String, _> = conn.query_row(
            "SELECT value FROM config WHERE key = ?1",
            params![key],
            |row| row.get(0),
        );

        match result {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn set_config(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
            params![key, value],
        )?;
        Ok(())
    }

    // ── Telemetry ──

    pub fn log_event(&self, event_type: &str, agent_id: Option<&str>, session_id: Option<&str>, data: Option<&str>) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO telemetry_events (id, event_type, agent_id, session_id, data) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, event_type, agent_id, session_id, data],
        )?;
        Ok(())
    }

    // ── Helpers ──

    pub fn now() -> String {
        chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
    }

    // ── Agent Updates ──

    pub fn update_agent(
        &self,
        id: &str,
        name: Option<&str>,
        emoji: Option<&str>,
        role: Option<&str>,
        soul: Option<&str>,
        instructions: Option<&str>,
        model_alias: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn();
        let _now = Self::now();

        // Build dynamic update query
        let mut sets: Vec<String> = Vec::new();
        let mut params_vec: Vec<(String, String)> = Vec::new();

        if let Some(v) = name { sets.push("name = ?".to_string()); params_vec.push(("name".to_string(), v.to_string())); }
        if let Some(v) = emoji { sets.push("emoji = ?".to_string()); params_vec.push(("emoji".to_string(), v.to_string())); }
        if let Some(v) = role { sets.push("role = ?".to_string()); params_vec.push(("role".to_string(), v.to_string())); }
        if let Some(v) = soul { sets.push("soul = ?".to_string()); params_vec.push(("soul".to_string(), v.to_string())); }
        if let Some(v) = instructions { sets.push("instructions = ?".to_string()); params_vec.push(("instructions".to_string(), v.to_string())); }
        if let Some(v) = model_alias { sets.push("model_alias = ?".to_string()); params_vec.push(("model_alias".to_string(), v.to_string())); }

        if sets.is_empty() {
            return Ok(());
        }

        sets.push("updated_at = ?".to_string());

        let query = format!(
            "UPDATE agents SET {} WHERE id = ?",
            sets.join(", ")
        );

        let now = Self::now();
        let id_owned = id.to_string();

        let mut all_params: Vec<&dyn rusqlite::ToSql> = Vec::new();
        for (_, v) in &params_vec {
            all_params.push(v);
        }
        all_params.push(&now);
        all_params.push(&id_owned);

        conn.execute(&query, rusqlite::params_from_iter(all_params))?;
        Ok(())
    }

    // ── Memory Extended ──

    pub fn get_all_memories(&self, agent_id: &str, limit: i64) -> Result<Vec<super::types::Memory>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, agent_id, memory_type, key, content, source, confidence,
                    access_count, last_accessed, created_at, updated_at, expires_at
             FROM memory WHERE agent_id = ?1
             ORDER BY updated_at DESC LIMIT ?2"
        )?;

        let memories = stmt.query_map(params![agent_id, limit], |row| {
            Ok(super::types::Memory {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                memory_type: row.get(2)?,
                key: row.get(3)?,
                content: row.get(4)?,
                source: row.get(5)?,
                confidence: row.get(6)?,
                access_count: row.get(7)?,
                last_accessed: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                expires_at: row.get(11)?,
            })
        })?;

        let mut result = Vec::new();
        for mem in memories {
            result.push(mem?);
        }
        Ok(result)
    }

    pub fn delete_memory(&self, memory_id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM memory WHERE id = ?1", params![memory_id])?;
        Ok(())
    }

    pub fn set_memory_confidence(&self, memory_id: &str, confidence: f64) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE memory SET confidence = ?2, updated_at = ?3 WHERE id = ?1",
            params![memory_id, confidence, Self::now()],
        )?;
        Ok(())
    }

    // ── Session Compaction ──

    /// Count messages in a session.
    pub fn count_messages(&self, session_id: &str) -> Result<i64> {
        let conn = self.conn();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Get messages older than the most recent N (for compaction).
    pub fn get_old_messages(&self, session_id: &str, keep_recent: i64) -> Result<Vec<super::types::Message>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, tool_call_id, tool_name, tool_args, tool_result,
                    tokens_used, model, provider_id, latency_ms, created_at
             FROM messages WHERE session_id = ?1
             ORDER BY created_at ASC
             LIMIT (SELECT MAX(COUNT(*) - ?2, 0) FROM messages WHERE session_id = ?1)"
        )?;

        let messages = stmt.query_map(params![session_id, keep_recent], |row| {
            Ok(super::types::Message {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                tool_call_id: row.get(4)?,
                tool_name: row.get(5)?,
                tool_args: row.get(6)?,
                tool_result: row.get(7)?,
                tokens_used: row.get(8)?,
                model: row.get(9)?,
                provider_id: row.get(10)?,
                latency_ms: row.get(11)?,
                created_at: row.get(12)?,
            })
        })?;

        let mut result = Vec::new();
        for msg in messages {
            result.push(msg?);
        }
        Ok(result)
    }

    /// Delete messages by ID list.
    pub fn delete_messages(&self, message_ids: &[String]) -> Result<i64> {
        let conn = self.conn();
        let mut count = 0i64;
        for id in message_ids {
            count += conn.execute("DELETE FROM messages WHERE id = ?1", params![id])? as i64;
        }
        Ok(count)
    }

    // ── Provider CRUD ──

    pub fn get_providers(&self) -> Result<Vec<super::types::ProviderConfig>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, base_url, api_key, model_id, model_alias, priority, is_enabled, created_at, updated_at
             FROM providers ORDER BY priority ASC"
        )?;

        let providers = stmt.query_map([], |row| {
            Ok(super::types::ProviderConfig {
                id: row.get(0)?,
                name: row.get(1)?,
                base_url: row.get(2)?,
                api_key: row.get(3)?,
                model_id: row.get(4)?,
                model_alias: row.get(5)?,
                priority: row.get(6)?,
                is_enabled: row.get::<_, i64>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;

        let mut result = Vec::new();
        for p in providers {
            result.push(p?);
        }
        Ok(result)
    }

    pub fn get_provider(&self, id: &str) -> Result<Option<super::types::ProviderConfig>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, base_url, api_key, model_id, model_alias, priority, is_enabled, created_at, updated_at
             FROM providers WHERE id = ?1"
        )?;

        let result = stmt.query_row(params![id], |row| {
            Ok(super::types::ProviderConfig {
                id: row.get(0)?,
                name: row.get(1)?,
                base_url: row.get(2)?,
                api_key: row.get(3)?,
                model_id: row.get(4)?,
                model_alias: row.get(5)?,
                priority: row.get(6)?,
                is_enabled: row.get::<_, i64>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        });

        match result {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn upsert_provider(
        &self,
        id: &str,
        name: &str,
        base_url: &str,
        api_key: &str,
        model_id: &str,
        model_alias: &str,
        priority: i32,
        is_enabled: bool,
    ) -> Result<()> {
        let conn = self.conn();
        let enabled: i64 = if is_enabled { 1 } else { 0 };
        conn.execute(
            "INSERT INTO providers (id, name, base_url, api_key, model_id, model_alias, priority, is_enabled)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                name = ?2, base_url = ?3, api_key = ?4, model_id = ?5,
                model_alias = ?6, priority = ?7, is_enabled = ?8,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
            params![id, name, base_url, api_key, model_id, model_alias, priority, enabled],
        )?;
        Ok(())
    }

    pub fn delete_provider(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM providers WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ── Provider Templates ──

    pub fn get_provider_templates(&self) -> Result<Vec<super::types::ProviderTemplate>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, emoji, description, base_url, models, default_model, model_alias, category, docs_url, is_free, sort_order
             FROM provider_templates ORDER BY sort_order ASC"
        )?;

        let templates = stmt.query_map([], |row| {
            let models_json: String = row.get(5)?;
            let models: Vec<String> = serde_json::from_str(&models_json).unwrap_or_default();
            Ok(super::types::ProviderTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                description: row.get(3)?,
                base_url: row.get(4)?,
                models,
                default_model: row.get(6)?,
                model_alias: row.get(7)?,
                category: row.get(8)?,
                docs_url: row.get(9)?,
                is_free: row.get::<_, i64>(10)? != 0,
                sort_order: row.get(11)?,
            })
        })?;

        let mut result = Vec::new();
        for t in templates {
            result.push(t?);
        }
        Ok(result)
    }

    pub fn get_provider_template(&self, id: &str) -> Result<Option<super::types::ProviderTemplate>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, emoji, description, base_url, models, default_model, model_alias, category, docs_url, is_free, sort_order
             FROM provider_templates WHERE id = ?1"
        )?;

        let result = stmt.query_row(params![id], |row| {
            let models_json: String = row.get(5)?;
            let models: Vec<String> = serde_json::from_str(&models_json).unwrap_or_default();
            Ok(super::types::ProviderTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                description: row.get(3)?,
                base_url: row.get(4)?,
                models,
                default_model: row.get(6)?,
                model_alias: row.get(7)?,
                category: row.get(8)?,
                docs_url: row.get(9)?,
                is_free: row.get::<_, i64>(10)? != 0,
                sort_order: row.get(11)?,
            })
        });

        match result {
            Ok(t) => Ok(Some(t)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn check_template_installed(&self, template_id: &str) -> Result<bool> {
        let conn = self.conn();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM providers WHERE id LIKE ?1",
            params![format!("{}%", template_id)],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Rebuild FTS index from existing memories (for migration).
    pub fn rebuild_memory_fts(&self) -> Result<i64> {
        let conn = self.conn();

        // Clear existing FTS data
        let _ = conn.execute_batch("DELETE FROM memory_fts;");

        // Rebuild from memory table
        let count = conn.execute_batch(
            "INSERT INTO memory_fts(memory_id, agent_id, content, key, memory_type)
             SELECT id, agent_id, content, COALESCE(key, ''), memory_type FROM memory;"
        );

        match count {
            Ok(_) => {
                // Count entries
                let n: i64 = conn.query_row("SELECT COUNT(*) FROM memory_fts", [], |r| r.get(0))?;
                Ok(n)
            }
            Err(_) => Ok(0),
        }
    }

    // ── Agent Capabilities ──

    pub fn get_agent_capabilities(&self, agent_id: &str) -> Result<Vec<super::types::AgentCapability>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT agent_id, capability, proficiency FROM agent_capabilities WHERE agent_id = ?1"
        )?;

        let caps = stmt.query_map(params![agent_id], |row| {
            Ok(super::types::AgentCapability {
                agent_id: row.get(0)?,
                capability: row.get(1)?,
                proficiency: row.get(2)?,
            })
        })?;

        let mut result = Vec::new();
        for c in caps { result.push(c?); }
        Ok(result)
    }

    pub fn find_agents_by_capability(&self, capability: &str) -> Result<Vec<String>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT DISTINCT agent_id FROM agent_capabilities WHERE capability = ?1 ORDER BY proficiency DESC"
        )?;

        let agents = stmt.query_map(params![capability], |row| row.get::<_, String>(0))?;
        let mut result = Vec::new();
        for a in agents { result.push(a?); }
        Ok(result)
    }

    // ── Agent Permissions ──

    pub fn get_agent_permissions(&self, agent_id: &str) -> Result<Option<super::types::AgentPermission>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT agent_id, can_talk_to, max_delegation_depth, max_tokens_per_session,
                    can_create_tasks, can_delete_data, requires_verification, anti_hallucination
             FROM agent_permissions WHERE agent_id = ?1"
        )?;

        let result = stmt.query_row(params![agent_id], |row| {
            Ok(super::types::AgentPermission {
                agent_id: row.get(0)?,
                can_talk_to: row.get(1)?,
                max_delegation_depth: row.get(2)?,
                max_tokens_per_session: row.get(3)?,
                can_create_tasks: row.get::<_, i64>(4)? != 0,
                can_delete_data: row.get::<_, i64>(5)? != 0,
                requires_verification: row.get::<_, i64>(6)? != 0,
                anti_hallucination: row.get::<_, i64>(7)? != 0,
            })
        });

        match result {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn can_agent_talk_to(&self, from: &str, to: &str) -> Result<bool> {
        let perms = self.get_agent_permissions(from)?;
        match perms {
            Some(p) => {
                if p.can_talk_to == "*" {
                    return Ok(true);
                }
                let allowed: Vec<String> = serde_json::from_str(&p.can_talk_to).unwrap_or_default();
                Ok(allowed.contains(&to.to_string()))
            }
            None => Ok(true), // no permissions set = allow all
        }
    }

    // ── Agent Communications ──

    pub fn create_communication(&self, from: &str, to: &str, msg_type: &str, content: &str, session_id: Option<&str>) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO agent_communications (id, from_agent, to_agent, message_type, content, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, from, to, msg_type, content, session_id],
        )?;
        Ok(id)
    }

    pub fn complete_communication(&self, id: &str, response: &str, tokens_used: i64) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute(
            "UPDATE agent_communications SET response = ?2, status = 'responded', tokens_used = ?3, responded_at = ?4 WHERE id = ?1",
            params![id, response, tokens_used, now],
        )?;
        Ok(())
    }

    pub fn get_communications(&self, agent_id: &str, limit: i64) -> Result<Vec<super::types::AgentCommunication>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, from_agent, to_agent, message_type, content, response, status, session_id, tokens_used, created_at, responded_at
             FROM agent_communications
             WHERE from_agent = ?1 OR to_agent = ?1
             ORDER BY created_at DESC LIMIT ?2"
        )?;

        let comms = stmt.query_map(params![agent_id, limit], |row| {
            Ok(super::types::AgentCommunication {
                id: row.get(0)?,
                from_agent: row.get(1)?,
                to_agent: row.get(2)?,
                message_type: row.get(3)?,
                content: row.get(4)?,
                response: row.get(5)?,
                status: row.get(6)?,
                session_id: row.get(7)?,
                tokens_used: row.get(8)?,
                created_at: row.get(9)?,
                responded_at: row.get(10)?,
            })
        })?;

        let mut result = Vec::new();
        for c in comms { result.push(c?); }
        Ok(result)
    }

    // ── Tasks ──

    pub fn create_task(&self, title: &str, description: Option<&str>, agent_id: &str, created_by: &str, priority: &str, requires_verify: bool) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();
        let rv: i64 = if requires_verify { 1 } else { 0 };
        conn.execute(
            "INSERT INTO tasks (id, title, description, agent_id, created_by, priority, requires_verify)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, title, description, agent_id, created_by, priority, rv],
        )?;
        Ok(id)
    }

    pub fn update_task_status(&self, task_id: &str, status: &str, result: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        match status {
            "completed" | "failed" => {
                conn.execute(
                    "UPDATE tasks SET status = ?2, result = ?3, completed_at = ?4, updated_at = ?4 WHERE id = ?1",
                    params![task_id, status, result, now],
                )?;
            }
            _ => {
                conn.execute(
                    "UPDATE tasks SET status = ?2, updated_at = ?3 WHERE id = ?1",
                    params![task_id, status, now],
                )?;
            }
        }
        Ok(())
    }

    pub fn verify_task(&self, task_id: &str, verified: bool) -> Result<()> {
        let conn = self.conn();
        let v: i64 = if verified { 1 } else { 0 };
        conn.execute(
            "UPDATE tasks SET verified = ?2, updated_at = ?3 WHERE id = ?1",
            params![task_id, v, Self::now()],
        )?;
        Ok(())
    }

    pub fn get_task(&self, task_id: &str) -> Result<Option<super::types::Task>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, title, description, agent_id, status, result, parent_task_id, session_id,
                    created_by, priority, requires_verify, verified, created_at, updated_at, completed_at
             FROM tasks WHERE id = ?1"
        )?;

        let result = stmt.query_row(params![task_id], |row| {
            Ok(super::types::Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                agent_id: row.get(3)?,
                status: row.get(4)?,
                result: row.get(5)?,
                parent_task_id: row.get(6)?,
                session_id: row.get(7)?,
                created_by: row.get(8)?,
                priority: row.get(9)?,
                requires_verify: row.get::<_, i64>(10)? != 0,
                verified: row.get::<_, i64>(11)? != 0,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
                completed_at: row.get(14)?,
            })
        });

        match result {
            Ok(t) => Ok(Some(t)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn get_tasks_for_agent(&self, agent_id: &str, status_filter: Option<&str>) -> Result<Vec<super::types::Task>> {
        let conn = self.conn();
        let (query, params_vec): (String, Vec<String>) = match status_filter {
            Some(status) => (
                "SELECT id, title, description, agent_id, status, result, parent_task_id, session_id,
                        created_by, priority, requires_verify, verified, created_at, updated_at, completed_at
                 FROM tasks WHERE agent_id = ?1 AND status = ?2 ORDER BY created_at DESC".to_string(),
                vec![agent_id.to_string(), status.to_string()],
            ),
            None => (
                "SELECT id, title, description, agent_id, status, result, parent_task_id, session_id,
                        created_by, priority, requires_verify, verified, created_at, updated_at, completed_at
                 FROM tasks WHERE agent_id = ?1 ORDER BY created_at DESC".to_string(),
                vec![agent_id.to_string()],
            ),
        };

        let mut stmt = conn.prepare(&query)?;
        let params_ref: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|s| s as &dyn rusqlite::ToSql).collect();

        let tasks = stmt.query_map(rusqlite::params_from_iter(params_ref), |row| {
            Ok(super::types::Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                agent_id: row.get(3)?,
                status: row.get(4)?,
                result: row.get(5)?,
                parent_task_id: row.get(6)?,
                session_id: row.get(7)?,
                created_by: row.get(8)?,
                priority: row.get(9)?,
                requires_verify: row.get::<_, i64>(10)? != 0,
                verified: row.get::<_, i64>(11)? != 0,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
                completed_at: row.get(14)?,
            })
        })?;

        let mut result = Vec::new();
        for t in tasks { result.push(t?); }
        Ok(result)
    }

    // ── Verification Records ──

    pub fn create_verification(&self, agent_id: &str, session_id: Option<&str>, claim_type: &str, claim: &str) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO verification_records (id, agent_id, session_id, claim_type, claim, verification)
             VALUES (?1, ?2, ?3, ?4, ?5, 'unverified')",
            params![id, agent_id, session_id, claim_type, claim],
        )?;
        Ok(id)
    }

    pub fn complete_verification(&self, id: &str, verified_by: &str, result: &str, evidence: Option<&str>) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE verification_records SET verified_by = ?2, verification = ?3, evidence = ?4 WHERE id = ?1",
            params![id, verified_by, result, evidence],
        )?;
        Ok(())
    }

    pub fn get_unverified_claims(&self, agent_id: Option<&str>) -> Result<Vec<super::types::VerificationRecord>> {
        let conn = self.conn();
        let mut result = Vec::new();

        match agent_id {
            Some(aid) => {
                let mut stmt = conn.prepare(
                    "SELECT id, agent_id, session_id, claim_type, claim, verified_by, verification, evidence, created_at
                     FROM verification_records WHERE agent_id = ?1 AND verification = 'unverified' ORDER BY created_at DESC"
                )?;
                let rows = stmt.query_map(params![aid], |row| {
                    Ok(super::types::VerificationRecord {
                        id: row.get(0)?, agent_id: row.get(1)?, session_id: row.get(2)?,
                        claim_type: row.get(3)?, claim: row.get(4)?, verified_by: row.get(5)?,
                        verification: row.get(6)?, evidence: row.get(7)?, created_at: row.get(8)?,
                    })
                })?;
                for r in rows { result.push(r?); }
            }
            None => {
                let mut stmt = conn.prepare(
                    "SELECT id, agent_id, session_id, claim_type, claim, verified_by, verification, evidence, created_at
                     FROM verification_records WHERE verification = 'unverified' ORDER BY created_at DESC"
                )?;
                let rows = stmt.query_map([], |row| {
                    Ok(super::types::VerificationRecord {
                        id: row.get(0)?, agent_id: row.get(1)?, session_id: row.get(2)?,
                        claim_type: row.get(3)?, claim: row.get(4)?, verified_by: row.get(5)?,
                        verification: row.get(6)?, evidence: row.get(7)?, created_at: row.get(8)?,
                    })
                })?;
                for r in rows { result.push(r?); }
            }
        };

        Ok(result)
    }

    // ── Lessons Learned ──

    pub fn add_lesson(&self, agent_id: Option<&str>, category: &str, lesson: &str, evidence: Option<&str>, action: Option<&str>) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO lessons_learned (id, agent_id, category, lesson, evidence, action_taken)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, agent_id, category, lesson, evidence, action],
        )?;
        Ok(id)
    }

    pub fn get_active_lessons(&self, category: Option<&str>) -> Result<Vec<super::types::LessonLearned>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, agent_id, category, lesson, evidence, action_taken, is_active, created_at
             FROM lessons_learned WHERE is_active = 1 AND (?1 IS NULL OR category = ?1)
             ORDER BY created_at DESC"
        )?;

        let lessons = stmt.query_map(params![category], |row| {
            Ok(super::types::LessonLearned {
                id: row.get(0)?, agent_id: row.get(1)?, category: row.get(2)?,
                lesson: row.get(3)?, evidence: row.get(4)?, action_taken: row.get(5)?,
                is_active: row.get::<_, i64>(6)? != 0, created_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for l in lessons { result.push(l?); }
        Ok(result)
    }

    // ── Cron Jobs ──

    pub fn create_cron_job(&self, name: &str, agent_id: &str, schedule: &str, timezone: &str, task_message: &str) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO cron_jobs (id, name, agent_id, schedule, timezone, task_message)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, name, agent_id, schedule, timezone, task_message],
        )?;
        Ok(id)
    }

    pub fn get_cron_jobs(&self, enabled_only: bool) -> Result<Vec<super::types::CronJob>> {
        let conn = self.conn();
        let query = if enabled_only {
            "SELECT id, name, agent_id, schedule, timezone, task_message, is_enabled, last_run_at, next_run_at, run_count, error_count, created_at, updated_at
             FROM cron_jobs WHERE is_enabled = 1 ORDER BY next_run_at ASC"
        } else {
            "SELECT id, name, agent_id, schedule, timezone, task_message, is_enabled, last_run_at, next_run_at, run_count, error_count, created_at, updated_at
             FROM cron_jobs ORDER BY created_at DESC"
        };
        let mut stmt = conn.prepare(query)?;
        let jobs = stmt.query_map([], |row| {
            Ok(super::types::CronJob {
                id: row.get(0)?, name: row.get(1)?, agent_id: row.get(2)?,
                schedule: row.get(3)?, timezone: row.get(4)?, task_message: row.get(5)?,
                is_enabled: row.get::<_, i64>(6)? != 0, last_run_at: row.get(7)?,
                next_run_at: row.get(8)?, run_count: row.get(9)?, error_count: row.get(10)?,
                created_at: row.get(11)?, updated_at: row.get(12)?,
            })
        })?;
        let mut result = Vec::new();
        for j in jobs { result.push(j?); }
        Ok(result)
    }

    pub fn get_due_cron_jobs(&self) -> Result<Vec<super::types::CronJob>> {
        let conn = self.conn();
        let now = Self::now();
        let mut stmt = conn.prepare(
            "SELECT id, name, agent_id, schedule, timezone, task_message, is_enabled, last_run_at, next_run_at, run_count, error_count, created_at, updated_at
             FROM cron_jobs
             WHERE is_enabled = 1 AND (next_run_at IS NULL OR next_run_at <= ?1)
             ORDER BY next_run_at ASC"
        )?;
        let jobs = stmt.query_map(params![now], |row| {
            Ok(super::types::CronJob {
                id: row.get(0)?, name: row.get(1)?, agent_id: row.get(2)?,
                schedule: row.get(3)?, timezone: row.get(4)?, task_message: row.get(5)?,
                is_enabled: row.get::<_, i64>(6)? != 0, last_run_at: row.get(7)?,
                next_run_at: row.get(8)?, run_count: row.get(9)?, error_count: row.get(10)?,
                created_at: row.get(11)?, updated_at: row.get(12)?,
            })
        })?;
        let mut result = Vec::new();
        for j in jobs { result.push(j?); }
        Ok(result)
    }

    pub fn update_cron_run(&self, id: &str, status: &str, tokens: i64, error: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();

        // Get the schedule to compute next run
        let schedule: String = conn.query_row(
            "SELECT schedule FROM cron_jobs WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        let next = super::cron::next_run(&schedule, chrono::Utc::now())
            .map(|dt| dt.format("%Y-%m-%dT%H:%M:%SZ").to_string());

        conn.execute(
            "UPDATE cron_jobs SET last_run_at = ?2, last_run_status = ?3, last_run_tokens = ?4, last_run_error = ?5,
             run_count = run_count + 1, error_count = error_count + (CASE WHEN ?3 = 'error' THEN 1 ELSE 0 END),
             next_run_at = ?6, updated_at = ?2
             WHERE id = ?1",
            params![id, now, status, tokens, error, next],
        )?;
        Ok(())
    }

    pub fn update_cron_next_run(&self, id: &str, next_run: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE cron_jobs SET next_run_at = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, next_run, Self::now()],
        )?;
        Ok(())
    }

    /// Update next_run_at for a cron job by name (for system jobs where we don't know the UUID).
    pub fn update_cron_next_run_by_name(&self, name: &str, next_run: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE cron_jobs SET next_run_at = ?1 WHERE name = ?2",
            params![next_run, name],
        )?;
        Ok(())
    }

    pub fn toggle_cron_job(&self, id: &str, enabled: bool) -> Result<()> {
        let conn = self.conn();
        let e: i64 = if enabled { 1 } else { 0 };
        conn.execute(
            "UPDATE cron_jobs SET is_enabled = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, e, Self::now()],
        )?;
        Ok(())
    }

    pub fn delete_cron_job(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM cron_jobs WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ── Webhooks ──

    pub fn create_webhook(&self, name: &str, agent_id: &str, path: &str, secret: Option<&str>, task_template: &str) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO webhooks (id, name, agent_id, path, secret, task_template)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, name, agent_id, path, secret, task_template],
        )?;
        Ok(id)
    }

    pub fn get_webhook_by_path(&self, path: &str) -> Result<Option<super::types::Webhook>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, agent_id, path, secret, task_template, is_enabled, call_count, last_called_at, created_at, updated_at
             FROM webhooks WHERE path = ?1 AND is_enabled = 1"
        )?;
        let result = stmt.query_row(params![path], |row| {
            Ok(super::types::Webhook {
                id: row.get(0)?, name: row.get(1)?, agent_id: row.get(2)?,
                path: row.get(3)?, secret: row.get(4)?, task_template: row.get(5)?,
                is_enabled: row.get::<_, i64>(6)? != 0, call_count: row.get(7)?,
                last_called_at: row.get(8)?, created_at: row.get(9)?, updated_at: row.get(10)?,
            })
        });
        match result {
            Ok(w) => Ok(Some(w)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn get_webhooks(&self) -> Result<Vec<super::types::Webhook>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, agent_id, path, secret, task_template, is_enabled, call_count, last_called_at, created_at, updated_at
             FROM webhooks ORDER BY created_at DESC"
        )?;
        let hooks = stmt.query_map([], |row| {
            Ok(super::types::Webhook {
                id: row.get(0)?, name: row.get(1)?, agent_id: row.get(2)?,
                path: row.get(3)?, secret: row.get(4)?, task_template: row.get(5)?,
                is_enabled: row.get::<_, i64>(6)? != 0, call_count: row.get(7)?,
                last_called_at: row.get(8)?, created_at: row.get(9)?, updated_at: row.get(10)?,
            })
        })?;
        let mut result = Vec::new();
        for h in hooks { result.push(h?); }
        Ok(result)
    }

    pub fn record_webhook_call(&self, path: &str) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute(
            "UPDATE webhooks SET call_count = call_count + 1, last_called_at = ?2 WHERE path = ?1",
            params![path, now],
        )?;
        Ok(())
    }

    pub fn delete_webhook(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM webhooks WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ── Events ──

    pub fn emit_event(&self, event_type: &str, source: Option<&str>, target: Option<&str>, payload: Option<&str>) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO events (id, event_type, source_agent, target_agent, payload)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, event_type, source, target, payload],
        )?;
        Ok(id)
    }

    pub fn get_unprocessed_events(&self, target_agent: Option<&str>) -> Result<Vec<super::types::Event>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, event_type, source_agent, target_agent, payload, processed, created_at
             FROM events WHERE processed = 0 AND (?1 IS NULL OR target_agent = ?1 OR target_agent IS NULL)
             ORDER BY created_at ASC LIMIT 50"
        )?;
        let events = stmt.query_map(params![target_agent], |row| {
            Ok(super::types::Event {
                id: row.get(0)?, event_type: row.get(1)?, source_agent: row.get(2)?,
                target_agent: row.get(3)?, payload: row.get(4)?,
                processed: row.get::<_, i64>(5)? != 0, created_at: row.get(6)?,
            })
        })?;
        let mut result = Vec::new();
        for e in events { result.push(e?); }
        Ok(result)
    }

    pub fn mark_event_processed(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("UPDATE events SET processed = 1 WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn cleanup_old_events(&self, days: i64) -> Result<i64> {
        let conn = self.conn();
        let deleted = conn.execute(
            "DELETE FROM events WHERE processed = 1 AND created_at < datetime('now', ?1)",
            params![format!("-{} days", days)],
        )?;
        Ok(deleted as i64)
    }

    // ── Heartbeats ──

    pub fn record_heartbeat(&self, check_name: &str, status: &str, details: Option<&str>) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO heartbeats (id, check_name, status, details) VALUES (?1, ?2, ?3, ?4)",
            params![id, check_name, status, details],
        )?;
        Ok(id)
    }

    pub fn get_latest_heartbeats(&self) -> Result<Vec<super::types::HeartbeatRecord>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT h.id, h.check_name, h.status, h.details, h.checked_at
             FROM heartbeats h
             INNER JOIN (
                 SELECT check_name, MAX(checked_at) as latest
                 FROM heartbeats GROUP BY check_name
             ) latest ON h.check_name = latest.check_name AND h.checked_at = latest.latest
             ORDER BY h.check_name"
        )?;
        let records = stmt.query_map([], |row| {
            Ok(super::types::HeartbeatRecord {
                id: row.get(0)?, check_name: row.get(1)?, status: row.get(2)?,
                details: row.get(3)?, checked_at: row.get(4)?,
            })
        })?;
        let mut result = Vec::new();
        for r in records { result.push(r?); }
        Ok(result)
    }

    // ── Skills ──

    pub fn get_skills(&self, active_only: bool) -> Result<Vec<super::types::Skill>> {
        let conn = self.conn();
        let query = if active_only {
            "SELECT id, name, description, emoji, version, author, skill_type, instructions, triggers, agents, permissions, is_active, install_source, manifest_json, installed_at, updated_at
             FROM skills WHERE is_active = 1 ORDER BY name"
        } else {
            "SELECT id, name, description, emoji, version, author, skill_type, instructions, triggers, agents, permissions, is_active, install_source, manifest_json, installed_at, updated_at
             FROM skills ORDER BY name"
        };
        let mut stmt = conn.prepare(query)?;
        let skills = stmt.query_map([], |row| {
            Ok(super::types::Skill {
                id: row.get(0)?, name: row.get(1)?, description: row.get(2)?,
                emoji: row.get(3)?, version: row.get(4)?, author: row.get(5)?,
                skill_type: row.get(6)?, instructions: row.get(7)?, triggers: row.get(8)?,
                agents: row.get(9)?, permissions: row.get(10)?,
                is_active: row.get::<_, i64>(11)? != 0, install_source: row.get(12)?,
                manifest_json: row.get(13)?, installed_at: row.get(14)?, updated_at: row.get(15)?,
            })
        })?;
        let mut result = Vec::new();
        for s in skills { result.push(s?); }
        Ok(result)
    }

    pub fn get_skill(&self, id: &str) -> Result<Option<super::types::Skill>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, emoji, version, author, skill_type, instructions, triggers, agents, permissions, is_active, install_source, manifest_json, installed_at, updated_at
             FROM skills WHERE id = ?1"
        )?;
        let result = stmt.query_row(params![id], |row| {
            Ok(super::types::Skill {
                id: row.get(0)?, name: row.get(1)?, description: row.get(2)?,
                emoji: row.get(3)?, version: row.get(4)?, author: row.get(5)?,
                skill_type: row.get(6)?, instructions: row.get(7)?, triggers: row.get(8)?,
                agents: row.get(9)?, permissions: row.get(10)?,
                is_active: row.get::<_, i64>(11)? != 0, install_source: row.get(12)?,
                manifest_json: row.get(13)?, installed_at: row.get(14)?, updated_at: row.get(15)?,
            })
        });
        match result {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Get skills applicable to a specific agent.
    pub fn get_skills_for_agent(&self, agent_id: &str) -> Result<Vec<super::types::Skill>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, emoji, version, author, skill_type, instructions, triggers, agents, permissions, is_active, install_source, manifest_json, installed_at, updated_at
             FROM skills
             WHERE is_active = 1 AND (agents = '*' OR agents LIKE ?1)
             ORDER BY name"
        )?;
        let pattern = format!("%\"{}\"%", agent_id);
        let skills = stmt.query_map(params![pattern], |row| {
            Ok(super::types::Skill {
                id: row.get(0)?, name: row.get(1)?, description: row.get(2)?,
                emoji: row.get(3)?, version: row.get(4)?, author: row.get(5)?,
                skill_type: row.get(6)?, instructions: row.get(7)?, triggers: row.get(8)?,
                agents: row.get(9)?, permissions: row.get(10)?,
                is_active: row.get::<_, i64>(11)? != 0, install_source: row.get(12)?,
                manifest_json: row.get(13)?, installed_at: row.get(14)?, updated_at: row.get(15)?,
            })
        })?;
        let mut result = Vec::new();
        for s in skills { result.push(s?); }
        Ok(result)
    }

    pub fn install_skill(&self, id: &str, name: &str, description: Option<&str>, emoji: &str,
                         version: &str, author: Option<&str>, instructions: &str,
                         triggers: Option<&str>, agents: &str, permissions: Option<&str>,
                         source: &str, manifest: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute(
            "INSERT INTO skills (id, name, description, emoji, version, author, instructions, triggers, agents, permissions, install_source, manifest_json, installed_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)
             ON CONFLICT(id) DO UPDATE SET
                name = ?2, description = ?3, emoji = ?4, version = ?5, author = ?6,
                instructions = ?7, triggers = ?8, agents = ?9, permissions = ?10,
                install_source = ?11, manifest_json = ?12, is_active = 1, updated_at = ?13",
            params![id, name, description, emoji, version, author, instructions, triggers, agents, permissions, source, manifest, now],
        )?;
        Ok(())
    }

    pub fn toggle_skill(&self, id: &str, active: bool) -> Result<()> {
        let conn = self.conn();
        let a: i64 = if active { 1 } else { 0 };
        conn.execute(
            "UPDATE skills SET is_active = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, a, Self::now()],
        )?;
        Ok(())
    }

    pub fn uninstall_skill(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM skills WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ============================================================
    // FAMILY MEMBERS
    // ============================================================

    pub fn create_family_member(&self, id: &str, user_id: &str, name: &str, age: Option<i64>, age_group: &str,
                                 avatar: Option<&str>, color: Option<&str>,
                                 default_agent_id: Option<&str>, parent_id: Option<&str>) -> Result<super::types::FamilyMember> {
        let conn = self.conn();
        let now = Self::now();
        let color = color.unwrap_or("#6366f1");
        conn.execute(
            "INSERT INTO family_members (id, user_id, name, age, age_group, avatar, color, default_agent_id, parent_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
            params![id, user_id, name, age, age_group, avatar, color, default_agent_id, parent_id, now],
        )?;
        Ok(super::types::FamilyMember {
            id: id.to_string(), name: name.to_string(), age, age_group: age_group.to_string(),
            avatar: avatar.map(String::from), color: color.to_string(),
            default_agent_id: default_agent_id.map(String::from), parent_id: parent_id.map(String::from),
            is_active: true, created_at: now.clone(), updated_at: now,
        })
    }

    pub fn get_family_members(&self, user_id: &str) -> Result<Vec<super::types::FamilyMember>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, age, age_group, avatar, color, default_agent_id, parent_id, is_active, created_at, updated_at
             FROM family_members WHERE user_id = ?1 AND is_active = 1 ORDER BY created_at"
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok(super::types::FamilyMember {
                id: row.get(0)?, name: row.get(1)?, age: row.get(2)?, age_group: row.get(3)?,
                avatar: row.get(4)?, color: row.get(5)?, default_agent_id: row.get(6)?,
                parent_id: row.get(7)?, is_active: row.get::<_, i64>(8)? != 0,
                created_at: row.get(9)?, updated_at: row.get(10)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn get_family_member(&self, id: &str, user_id: &str) -> Result<Option<super::types::FamilyMember>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, age, age_group, avatar, color, default_agent_id, parent_id, is_active, created_at, updated_at
             FROM family_members WHERE id = ?1 AND user_id = ?2"
        )?;
        let mut rows = stmt.query_map(params![id, user_id], |row| {
            Ok(super::types::FamilyMember {
                id: row.get(0)?, name: row.get(1)?, age: row.get(2)?, age_group: row.get(3)?,
                avatar: row.get(4)?, color: row.get(5)?, default_agent_id: row.get(6)?,
                parent_id: row.get(7)?, is_active: row.get::<_, i64>(8)? != 0,
                created_at: row.get(9)?, updated_at: row.get(10)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    pub fn delete_family_member(&self, id: &str, user_id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("UPDATE family_members SET is_active = 0, updated_at = ?2 WHERE id = ?1 AND user_id = ?3",
            params![id, Self::now(), user_id])?;
        Ok(())
    }

    // ── Budget Summary ──

    pub fn get_budget_summary(&self, member_id: &str, month: &str) -> Result<super::types::BudgetSummary> {
        let conn = self.conn();

        let total_income: f64 = conn.query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM budget_entries WHERE member_id = ?1 AND entry_type = \'income\' AND strftime(\'%Y-%m\', date) = ?2",
            params![member_id, month], |row| row.get(0)
        ).unwrap_or(0.0);

        let total_expenses: f64 = conn.query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM budget_entries WHERE member_id = ?1 AND entry_type = \'expense\' AND strftime(\'%Y-%m\', date) = ?2",
            params![member_id, month], |row| row.get(0)
        ).unwrap_or(0.0);

        let total_savings: f64 = conn.query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM budget_entries WHERE member_id = ?1 AND entry_type = \'savings\' AND strftime(\'%Y-%m\', date) = ?2",
            params![member_id, month], |row| row.get(0)
        ).unwrap_or(0.0);

        let mut cat_stmt = conn.prepare(
            "SELECT category, SUM(amount) as total FROM budget_entries
             WHERE entry_type = 'expense' AND strftime('%Y-%m', date) = ?1
             GROUP BY category ORDER BY total DESC"
        )?;
        let cat_rows = cat_stmt.query_map(params![month], |row| {
            Ok(super::types::CategoryTotal {
                category: row.get(0)?,
                total: row.get(1)?,
            })
        })?;
        let mut categories = Vec::new();
        for r in cat_rows { categories.push(r?); }

        Ok(super::types::BudgetSummary {
            month: month.to_string(),
            total_income,
            total_expenses,
            total_savings,
            net: total_income - total_expenses - total_savings,
            categories,
        })
    }

    // ── Budget Goals (Pulse) ──

    pub fn create_budget_goal(&self, id: &str, member_id: Option<&str>, name: &str,
        target_amount: f64, deadline: Option<&str>, monthly_allocation: Option<f64>) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO budget_goals (id, member_id, name, target_amount, deadline, monthly_allocation) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, member_id, name, target_amount, deadline, monthly_allocation]
        )?;
        Ok(())
    }

    pub fn get_budget_goals(&self, member_id: Option<&str>) -> Result<Vec<super::types::BudgetGoal>> {
        let conn = self.conn();
        let mut result = Vec::new();
        if let Some(mid) = member_id {
            let mut stmt = conn.prepare(
                "SELECT id, member_id, name, target_amount, current_amount, deadline, monthly_allocation, auto_allocate, created_at FROM budget_goals WHERE member_id = ?1 ORDER BY created_at DESC"
            )?;
            let rows = stmt.query_map(params![mid], |row| {
                Ok(super::types::BudgetGoal {
                    id: row.get(0)?, member_id: row.get(1)?, name: row.get(2)?,
                    target_amount: row.get(3)?, current_amount: row.get(4)?,
                    deadline: row.get(5)?, monthly_allocation: row.get(6)?,
                    auto_allocate: row.get::<_, i64>(7)? != 0, created_at: row.get(8)?,
                })
            })?;
            for r in rows { result.push(r?); }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, member_id, name, target_amount, current_amount, deadline, monthly_allocation, auto_allocate, created_at FROM budget_goals ORDER BY created_at DESC"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(super::types::BudgetGoal {
                    id: row.get(0)?, member_id: row.get(1)?, name: row.get(2)?,
                    target_amount: row.get(3)?, current_amount: row.get(4)?,
                    deadline: row.get(5)?, monthly_allocation: row.get(6)?,
                    auto_allocate: row.get::<_, i64>(7)? != 0, created_at: row.get(8)?,
                })
            })?;
            for r in rows { result.push(r?); }
        }
        Ok(result)
    }

    pub fn update_budget_goal(&self, id: &str, current_amount: f64) -> Result<()> {
        let conn = self.conn();
        conn.execute("UPDATE budget_goals SET current_amount = ?1 WHERE id = ?2", params![current_amount, id])?;
        Ok(())
    }

    pub fn delete_budget_goal(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM budget_goals WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ── Budget Engine (Zero-Based Budgeting) ──

    pub fn get_budget_settings(&self, user_id: &str) -> Result<Option<super::types::BudgetSettingsRow>> {
        let conn = self.conn();
        let result = conn.query_row(
            "SELECT id, user_id, pay_frequency, pay_dates, income_amount, currency, created_at, updated_at FROM budget_settings WHERE user_id = ?1 LIMIT 1",
            params![user_id], |row| {
                Ok(super::types::BudgetSettingsRow {
                    id: row.get(0)?, user_id: row.get(1)?, pay_frequency: row.get(2)?,
                    pay_dates: row.get(3)?, income_amount: row.get(4)?, currency: row.get(5)?,
                    created_at: row.get(6)?, updated_at: row.get(7)?,
                })
            }
        );
        match result {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn upsert_budget_settings(&self, id: &str, user_id: &str, pay_frequency: &str,
        pay_dates: &str, income_amount: f64, currency: &str) -> Result<()> {
        let conn = self.conn();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO budget_settings (id, user_id, pay_frequency, pay_dates, income_amount, currency, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET pay_frequency=?3, pay_dates=?4, income_amount=?5, currency=?6, updated_at=?8",
            params![id, user_id, pay_frequency, pay_dates, income_amount, currency, now, now]
        )?;
        Ok(())
    }

    pub fn get_budget_buckets(&self, user_id: &str) -> Result<Vec<super::types::BudgetBucketRow>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, user_id, name, icon, monthly_goal, color, is_active, created_at, updated_at
             FROM budget_buckets WHERE user_id = ?1 AND is_active = 1 ORDER BY created_at ASC"
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok(super::types::BudgetBucketRow {
                id: row.get(0)?, user_id: row.get(1)?, name: row.get(2)?,
                icon: row.get(3)?, monthly_goal: row.get(4)?, color: row.get(5)?,
                is_active: row.get::<_, i64>(6)? != 0, created_at: row.get(7)?, updated_at: row.get(8)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn create_budget_bucket(&self, id: &str, user_id: &str, name: &str, icon: Option<&str>,
        monthly_goal: f64, color: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO budget_buckets (id, user_id, name, icon, monthly_goal, color, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, user_id, name, icon, monthly_goal, color, now, now]
        )?;
        Ok(())
    }

    pub fn get_budget_allocations(&self, user_id: &str) -> Result<Vec<super::types::BudgetAllocationRow>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, user_id, bucket_id, pay_period_id, amount, created_at, updated_at
             FROM budget_allocations WHERE user_id = ?1 ORDER BY created_at ASC"
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok(super::types::BudgetAllocationRow {
                id: row.get(0)?, user_id: row.get(1)?, bucket_id: row.get(2)?,
                pay_period_id: row.get(3)?, amount: row.get(4)?,
                created_at: row.get(5)?, updated_at: row.get(6)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn get_budget_transactions(&self, user_id: &str) -> Result<Vec<super::types::BudgetTransactionRow>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, user_id, bucket_id, amount, date, status, description, merchant, category, receipt_url, created_at, updated_at
             FROM budget_transactions WHERE user_id = ?1 ORDER BY date DESC"
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok(super::types::BudgetTransactionRow {
                id: row.get(0)?, user_id: row.get(1)?, bucket_id: row.get(2)?,
                amount: row.get(3)?, date: row.get(4)?, status: row.get(5)?,
                description: row.get(6)?, merchant: row.get(7)?, category: row.get(8)?,
                receipt_url: row.get(9)?, created_at: row.get(10)?, updated_at: row.get(11)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn create_budget_transaction(&self, id: &str, user_id: &str, bucket_id: Option<&str>,
        amount: f64, date: &str, status: &str, description: Option<&str>,
        merchant: Option<&str>, category: Option<&str>, receipt_url: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO budget_transactions (id, user_id, bucket_id, amount, date, status, description, merchant, category, receipt_url, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![id, user_id, bucket_id, amount, date, status, description, merchant, category, receipt_url, now, now]
        )?;
        Ok(())
    }

    // Cross-App Synthesis functions

    /// Get budget entries for cross-app insights
    pub fn get_budget_entries(&self, member_id: &str) -> Result<Vec<super::types::BudgetEntry>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, member_id, entry_type, category, amount, description, recurring, frequency, date, created_at 
             FROM budget_entries WHERE member_id = ?1 ORDER BY date DESC"
        )?;
        let rows = stmt.query_map(params![member_id], |row| {
            Ok(super::types::BudgetEntry {
                id: row.get(0)?,
                member_id: row.get(1)?,
                entry_type: row.get(2)?,
                category: row.get(3)?,
                amount: row.get(4)?,
                description: row.get(5)?,
                recurring: row.get::<_, i64>(6)? != 0,
                frequency: row.get(7)?,
                date: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    /// Get kitchen inventory for cross-app insights
    pub fn get_kitchen_inventory(&self, member_id: &str) -> Result<Vec<super::types::KitchenInventoryItem>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, member_id, name, quantity, unit, category, expiry_date, location, last_restocked, created_at, updated_at 
             FROM kitchen_inventory WHERE member_id = ?1 ORDER BY location, name"
        )?;
        let rows = stmt.query_map(params![member_id], Self::map_inventory)?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    /// Get orbit-specific dream dashboard (wrapper for cross-app insights)
    pub fn get_orbit_dream_dashboard(&self, member_id: &str) -> Result<super::types::DreamDashboard> {
        self.get_dream_dashboard(member_id)
    }

    pub fn detect_budget_patterns(&self, member_id: Option<&str>) -> Result<Vec<super::types::BudgetPattern>> {
        let conn = self.conn();
        let mut result = Vec::new();
        if let Some(mid) = member_id {
            let mut stmt = conn.prepare(
                "SELECT category, COUNT(DISTINCT strftime('%Y-%m', date)) as months, AVG(amount) as avg_amt
                 FROM budget_entries WHERE entry_type = 'expense' AND member_id = ?1
                 GROUP BY category HAVING months >= 3 ORDER BY avg_amt DESC LIMIT 5"
            )?;
            let rows = stmt.query_map(params![mid], |row| {
                let category: String = row.get(0)?;
                let months: i64 = row.get(1)?;
                let avg: f64 = row.get(2)?;
                Ok(super::types::BudgetPattern {
                    category: category.clone(),
                    pattern_type: "recurring".to_string(),
                    description: format!("${:.2}/mo avg in {} ({} months)", avg, category, months),
                    avg_amount: avg,
                    frequency: format!("{} months", months),
                })
            })?;
            for r in rows { result.push(r?); }
        } else {
            let mut stmt = conn.prepare(
                "SELECT category, COUNT(DISTINCT strftime('%Y-%m', date)) as months, AVG(amount) as avg_amt
                 FROM budget_entries WHERE entry_type = 'expense'
                 GROUP BY category HAVING months >= 3 ORDER BY avg_amt DESC LIMIT 5"
            )?;
            let rows = stmt.query_map([], |row| {
                let category: String = row.get(0)?;
                let months: i64 = row.get(1)?;
                let avg: f64 = row.get(2)?;
                Ok(super::types::BudgetPattern {
                    category: category.clone(),
                    pattern_type: "recurring".to_string(),
                    description: format!("${:.2}/mo avg in {} ({} months)", avg, category, months),
                    avg_amount: avg,
                    frequency: format!("{} months", months),
                })
            })?;
            for r in rows { result.push(r?); }
        }
        Ok(result)
    }

    pub fn can_afford(&self, member_id: &str, amount: f64, month: &str) -> Result<bool> {
        let conn = self.conn();
        let income: f64 = conn.query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM budget_entries WHERE member_id = ?1 AND entry_type = \'income\' AND strftime(\'%Y-%m\', date) = ?2",
            params![member_id, month], |row| row.get(0)
        ).unwrap_or(0.0);
        let expenses: f64 = conn.query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM budget_entries WHERE member_id = ?1 AND entry_type = \'expense\' AND strftime(\'%Y-%m\', date) = ?2",
            params![member_id, month], |row| row.get(0)
        ).unwrap_or(0.0);
        Ok(income - expenses >= amount)
    }

    pub fn get_monthly_report(&self, member_id: &str, month: &str) -> Result<super::types::MonthlyReport> {
        let summary = self.get_budget_summary(member_id, month)?;
        let patterns = self.detect_budget_patterns(None)?;
        let goals = self.get_budget_goals(None)?;
        // Last month comparison
        let parts: Vec<&str> = month.split('-').collect();
        let y: i32 = parts[0].parse().unwrap_or(2024);
        let m: u32 = parts[1].parse().unwrap_or(1);
        let prev = if m == 1 { format!("{}-12", y - 1) } else { format!("{}-{:02}", y, m - 1) };
        let prev_summary = self.get_budget_summary(member_id, &prev).ok();
        let comparison = prev_summary.map(|p| summary.net - p.net);
        Ok(super::types::MonthlyReport {
            month: month.to_string(),
            total_income: summary.total_income,
            total_expenses: summary.total_expenses,
            total_savings: summary.total_savings,
            net: summary.net,
            top_categories: summary.categories,
            patterns,
            goals_progress: goals,
            savings_rate: if summary.total_income > 0.0 { (summary.total_savings / summary.total_income) * 100.0 } else { 0.0 },
            comparison_to_last_month: comparison,
        })
    }

    pub fn get_agent_templates(&self, age_group: Option<&str>) -> Result<Vec<super::types::AgentTemplate>> {
        let conn = self.conn();
        let mapper = |row: &rusqlite::Row| -> rusqlite::Result<super::types::AgentTemplate> {
            Ok(super::types::AgentTemplate {
                id: row.get(0)?, name: row.get(1)?, emoji: row.get(2)?, description: row.get(3)?,
                age_group: row.get(4)?, soul: row.get(5)?, instructions: row.get(6)?,
                model_alias: row.get(7)?, category: row.get(8)?,
                is_system: row.get::<_, i64>(9)? != 0, created_at: row.get(10)?,
            })
        };
        let mut result = Vec::new();
        if let Some(ag) = age_group {
            let mut stmt = conn.prepare(
                "SELECT id, name, emoji, description, age_group, soul, instructions, model_alias, category, is_system, created_at
                 FROM agent_templates WHERE age_group = ?1 ORDER BY category, name"
            )?;
            let rows = stmt.query_map(params![ag], mapper)?;
            for r in rows { result.push(r?); }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, name, emoji, description, age_group, soul, instructions, model_alias, category, is_system, created_at
                 FROM agent_templates ORDER BY age_group, category, name"
            )?;
            let rows = stmt.query_map([], mapper)?;
            for r in rows { result.push(r?); }
        }
        Ok(result)
    }

    pub fn install_agent_from_template(&self, template_id: &str, _member_id: Option<&str>) -> Result<Option<super::types::Agent>> {
        let conn = self.conn();
        // Get template
        let _stmt = conn.prepare(
            "SELECT id, name, emoji, role_description, soul, instructions, model_alias, category
             FROM agent_templates WHERE id = ?1"
        )?;
        // Actually we need the full template. Let's use a simpler approach — read from the full row
        let mut stmt2 = conn.prepare(
            "SELECT name, emoji, description, soul, instructions, model_alias FROM agent_templates WHERE id = ?1"
        )?;
        let mut rows = stmt2.query_map(params![template_id], |row| {
            Ok((
                row.get::<_, String>(0)?, // name
                row.get::<_, String>(1)?, // emoji
                row.get::<_, String>(2)?, // description
                row.get::<_, String>(3)?, // soul
                row.get::<_, String>(4)?, // instructions
                row.get::<_, String>(5)?, // model_alias
            ))
        })?;
        let (name, emoji, description, soul, instructions, model_alias) = match rows.next() {
            Some(row) => row?,
            None => return Ok(None),
        };
        let agent_id = format!("tpl-{}", template_id);
        let now = Self::now();
        conn.execute(
            "INSERT OR REPLACE INTO agents (id, name, emoji, role, soul, instructions, model_alias, tier, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'free', 1, ?8, ?8)",
            params![agent_id, name, emoji, description, soul, instructions, model_alias, now],
        )?;
        Ok(Some(super::types::Agent {
            id: agent_id, name, emoji, role: description, soul: Some(soul), instructions: Some(instructions),
            model_alias, tier: "free".to_string(), is_active: true, created_at: now.clone(), updated_at: now,
        }))
    }

    // ============================================================
    // STORY GAMES
    // ============================================================

    pub fn create_story_game(&self, id: &str, member_id: Option<&str>, title: &str, genre: &str,
                              age_group: &str, difficulty: &str, story_state: Option<&str>) -> Result<super::types::StoryGame> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute(
            "INSERT INTO story_games (id, member_id, title, genre, age_group, difficulty, story_state, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![id, member_id, title, genre, age_group, difficulty, story_state, now],
        )?;
        Ok(super::types::StoryGame {
            id: id.to_string(), member_id: member_id.map(String::from), agent_id: "catalyst".to_string(),
            title: title.to_string(), genre: genre.to_string(), age_group: age_group.to_string(),
            difficulty: difficulty.to_string(), status: "active".to_string(), current_chapter: 1,
            story_state: story_state.map(String::from), created_at: now.clone(), updated_at: now,
        })
    }

    pub fn get_story_games(&self, member_id: Option<&str>) -> Result<Vec<super::types::StoryGame>> {
        let conn = self.conn();
        let mapper = |row: &rusqlite::Row| -> rusqlite::Result<super::types::StoryGame> {
            Ok(super::types::StoryGame {
                id: row.get(0)?, member_id: row.get(1)?, agent_id: row.get(2)?, title: row.get(3)?,
                genre: row.get(4)?, age_group: row.get(5)?, difficulty: row.get(6)?, status: row.get(7)?,
                current_chapter: row.get(8)?, story_state: row.get(9)?, created_at: row.get(10)?, updated_at: row.get(11)?,
            })
        };
        let mut result = Vec::new();
        if let Some(mid) = member_id {
            let mut stmt = conn.prepare(
                "SELECT id, member_id, agent_id, title, genre, age_group, difficulty, status, current_chapter, story_state, created_at, updated_at FROM story_games WHERE member_id = ?1 ORDER BY updated_at DESC"
            )?;
            let rows = stmt.query_map(params![mid], mapper)?;
            for r in rows { result.push(r?); }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, member_id, agent_id, title, genre, age_group, difficulty, status, current_chapter, story_state, created_at, updated_at FROM story_games ORDER BY updated_at DESC"
            )?;
            let rows = stmt.query_map([], mapper)?;
            for r in rows { result.push(r?); }
        }
        Ok(result)
    }

    pub fn get_story_game(&self, id: &str) -> Result<Option<super::types::StoryGame>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, member_id, agent_id, title, genre, age_group, difficulty, status, current_chapter, story_state, created_at, updated_at
             FROM story_games WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(super::types::StoryGame {
                id: row.get(0)?, member_id: row.get(1)?, agent_id: row.get(2)?, title: row.get(3)?,
                genre: row.get(4)?, age_group: row.get(5)?, difficulty: row.get(6)?, status: row.get(7)?,
                current_chapter: row.get(8)?, story_state: row.get(9)?, created_at: row.get(10)?, updated_at: row.get(11)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    // ============================================================
    // STORY CHAPTERS
    // ============================================================

    pub fn add_story_chapter(&self, id: &str, game_id: &str, chapter_number: i64,
                              title: Option<&str>, narrative: &str, choices: &str,
                              puzzle: Option<&str>, image_prompt: Option<&str>) -> Result<super::types::StoryChapter> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute(
            "INSERT INTO story_chapters (id, game_id, chapter_number, title, narrative, choices, puzzle, image_prompt, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, game_id, chapter_number, title, narrative, choices, puzzle, image_prompt, now],
        )?;
        // Update game chapter count
        conn.execute(
            "UPDATE story_games SET current_chapter = ?2, updated_at = ?3 WHERE id = ?1",
            params![game_id, chapter_number, now],
        )?;
        Ok(super::types::StoryChapter {
            id: id.to_string(), game_id: game_id.to_string(), chapter_number,
            title: title.map(String::from), narrative: narrative.to_string(),
            choices: choices.to_string(), puzzle: puzzle.map(String::from),
            puzzle_solved: false, image_prompt: image_prompt.map(String::from),
            image_url: None, chosen_choice_id: None, created_at: now,
        })
    }

    pub fn get_story_chapters(&self, game_id: &str) -> Result<Vec<super::types::StoryChapter>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, game_id, chapter_number, title, narrative, choices, puzzle, puzzle_solved, image_prompt, image_url, chosen_choice_id, created_at
             FROM story_chapters WHERE game_id = ?1 ORDER BY chapter_number"
        )?;
        let rows = stmt.query_map(params![game_id], |row| {
            Ok(super::types::StoryChapter {
                id: row.get(0)?, game_id: row.get(1)?, chapter_number: row.get(2)?,
                title: row.get(3)?, narrative: row.get(4)?, choices: row.get(5)?,
                puzzle: row.get(6)?, puzzle_solved: row.get::<_, i64>(7)? != 0,
                image_prompt: row.get(8)?, image_url: row.get(9)?,
                chosen_choice_id: row.get(10)?, created_at: row.get(11)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn choose_story_path(&self, chapter_id: &str, choice_id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE story_chapters SET chosen_choice_id = ?2 WHERE id = ?1",
            params![chapter_id, choice_id],
        )?;
        Ok(())
    }

    pub fn solve_puzzle(&self, chapter_id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE story_chapters SET puzzle_solved = 1 WHERE id = ?1",
            params![chapter_id],
        )?;
        Ok(())
    }

    pub fn get_story_seeds(&self, age_group: Option<&str>, genre: Option<&str>) -> Result<Vec<super::types::StorySeed>> {
        let conn = self.conn();
        let mut conditions = Vec::new();
        let mut params_vec: Vec<String> = Vec::new();
        if let Some(ag) = age_group {
            conditions.push("age_group = ?");
            params_vec.push(ag.to_string());
        }
        if let Some(g) = genre {
            conditions.push("genre = ?");
            params_vec.push(g.to_string());
        }
        let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };
        let query = format!(
            "SELECT id, title, genre, age_group, difficulty, opening, initial_choices, world_template, puzzle_types, created_at
             FROM story_seeds {} ORDER BY genre, title", where_clause
        );
        let conn2 = conn;
        let mut stmt = conn2.prepare(&query)?;
        let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
        let rows = stmt.query_map(&params_refs[..], |row| {
            Ok(super::types::StorySeed {
                id: row.get(0)?, title: row.get(1)?, genre: row.get(2)?, age_group: row.get(3)?,
                difficulty: row.get(4)?, opening: row.get(5)?, initial_choices: row.get(6)?,
                world_template: row.get(7)?, puzzle_types: row.get(8)?, created_at: row.get(9)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    // ============================================================
    // LEARNING ACTIVITIES
    // ============================================================

    pub fn log_learning_activity(&self, id: &str, member_id: &str, agent_id: &str,
                                  session_id: Option<&str>, activity_type: &str,
                                  topic: Option<&str>, description: Option<&str>,
                                  difficulty: Option<&str>, score: Option<f64>,
                                  duration_sec: Option<i64>, metadata: Option<&str>) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO learning_activities (id, member_id, agent_id, session_id, activity_type, topic, description, difficulty, score, duration_sec, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![id, member_id, agent_id, session_id, activity_type, topic, description, difficulty, score, duration_sec, metadata],
        )?;
        // Update goals that match this activity type
        self.update_goals_for_activity(member_id, activity_type)?;
        Ok(())
    }

    fn update_goals_for_activity(&self, member_id: &str, activity_type: &str) -> Result<()> {
        let conn = self.conn();
        // Update streak goals
        conn.execute(
            "UPDATE learning_goals SET current_value = current_value + 1,
             is_complete = CASE WHEN current_value + 1 >= target_value THEN 1 ELSE 0 END,
             completed_at = CASE WHEN current_value + 1 >= target_value THEN ?3 ELSE NULL END
             WHERE member_id = ?1 AND (activity_type = ?2 OR activity_type IS NULL) AND goal_type = 'streak' AND is_complete = 0",
            params![member_id, activity_type, Self::now()],
        )?;
        // Update exploration goals (unique topics)
        let unique_topics: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT topic) FROM learning_activities WHERE member_id = ?1 AND (activity_type = ?2 OR ?2 IS NULL) AND topic IS NOT NULL",
            params![member_id, activity_type],
            |row| row.get(0),
        ).unwrap_or(0);
        conn.execute(
            "UPDATE learning_goals SET current_value = ?3,
             is_complete = CASE WHEN ?3 >= target_value THEN 1 ELSE 0 END,
             completed_at = CASE WHEN ?3 >= target_value THEN ?4 ELSE NULL END
             WHERE member_id = ?1 AND goal_type = 'exploration' AND (activity_type = ?2 OR activity_type IS NULL) AND is_complete = 0",
            params![member_id, activity_type, unique_topics as f64, Self::now()],
        )?;
        Ok(())
    }

    pub fn get_learning_activities(&self, member_id: &str, limit: i64) -> Result<Vec<super::types::LearningActivity>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, member_id, agent_id, session_id, activity_type, topic, description, difficulty, score, duration_sec, tokens_used, metadata, created_at
             FROM learning_activities WHERE member_id = ?1 ORDER BY created_at DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![member_id, limit], |row| {
            Ok(super::types::LearningActivity {
                id: row.get(0)?, member_id: row.get(1)?, agent_id: row.get(2)?, session_id: row.get(3)?,
                activity_type: row.get(4)?, topic: row.get(5)?, description: row.get(6)?,
                difficulty: row.get(7)?, score: row.get(8)?, duration_sec: row.get(9)?,
                tokens_used: row.get(10)?, metadata: row.get(11)?, created_at: row.get(12)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn get_learning_progress(&self, member_id: &str) -> Result<super::types::LearningProgress> {
        let conn = self.conn();

        // Get member name
        let member_name: String = conn.query_row(
            "SELECT name FROM family_members WHERE id = ?1", params![member_id], |row| row.get(0)
        ).unwrap_or_else(|_| "Unknown".to_string());

        // Total activities
        let total_activities: i64 = conn.query_row(
            "SELECT COUNT(*) FROM learning_activities WHERE member_id = ?1",
            params![member_id], |row| row.get(0)
        ).unwrap_or(0);

        // Total minutes
        let total_minutes: i64 = conn.query_row(
            "SELECT COALESCE(SUM(COALESCE(duration_sec, 0)) / 60, 0) FROM learning_activities WHERE member_id = ?1",
            params![member_id], |row| row.get(0)
        ).unwrap_or(0);

        // Current streak (consecutive days with activity)
        let current_streak: i64 = conn.query_row(
            "SELECT COUNT(*) FROM (
                SELECT DISTINCT DATE(created_at) as d FROM learning_activities
                WHERE member_id = ?1 AND DATE(created_at) >= DATE('now', '-' || (
                    SELECT COUNT(DISTINCT DATE(created_at)) FROM learning_activities
                    WHERE member_id = ?1 AND DATE(created_at) <= DATE('now')
                    ORDER BY DATE(created_at) DESC
                ) || ' days')
                ORDER BY d DESC
            )",
            params![member_id], |row| row.get(0)
        ).unwrap_or(0);

        // Activities by type
        let mut type_stmt = conn.prepare(
            "SELECT activity_type, COUNT(*), COALESCE(SUM(COALESCE(duration_sec, 0)) / 60, 0)
             FROM learning_activities WHERE member_id = ?1 GROUP BY activity_type ORDER BY COUNT(*) DESC"
        )?;
        let type_rows = type_stmt.query_map(params![member_id], |row| {
            Ok(super::types::ActivityCount {
                activity_type: row.get(0)?, count: row.get(1)?, total_minutes: row.get(2)?,
            })
        })?;
        let mut activities_by_type = Vec::new();
        for r in type_rows { activities_by_type.push(r?); }

        // Recent topics (last 10 unique)
        let mut topic_stmt = conn.prepare(
            "SELECT DISTINCT topic FROM learning_activities WHERE member_id = ?1 AND topic IS NOT NULL ORDER BY created_at DESC LIMIT 10"
        )?;
        let topic_rows = topic_stmt.query_map(params![member_id], |row| Ok(row.get::<_, String>(0)?))?;
        let mut recent_topics = Vec::new();
        for r in topic_rows { recent_topics.push(r?); }

        // Average score
        let avg_score: Option<f64> = conn.query_row(
            "SELECT AVG(score) FROM learning_activities WHERE member_id = ?1 AND score IS NOT NULL",
            params![member_id], |row| row.get(0)
        ).ok();

        // Goals
        let mut goal_stmt = conn.prepare(
            "SELECT id, member_id, goal_type, activity_type, title, target_value, current_value, unit, deadline, is_complete, created_at, completed_at
             FROM learning_goals WHERE member_id = ?1 ORDER BY is_complete ASC, created_at DESC"
        )?;
        let goal_rows = goal_stmt.query_map(params![member_id], |row| {
            Ok(super::types::LearningGoal {
                id: row.get(0)?, member_id: row.get(1)?, goal_type: row.get(2)?, activity_type: row.get(3)?,
                title: row.get(4)?, target_value: row.get(5)?, current_value: row.get(6)?,
                unit: row.get(7)?, deadline: row.get(8)?, is_complete: row.get::<_, i64>(9)? != 0,
                created_at: row.get(10)?, completed_at: row.get(11)?,
            })
        })?;
        let mut goals = Vec::new();
        for r in goal_rows { goals.push(r?); }

        // Weekly summary (last 7 days)
        let mut daily_stmt = conn.prepare(
            "SELECT DATE(created_at) as d, COUNT(*), COALESCE(SUM(COALESCE(duration_sec, 0)) / 60, 0)
             FROM learning_activities WHERE member_id = ?1 AND DATE(created_at) >= DATE('now', '-7 days')
             GROUP BY d ORDER BY d"
        )?;
        let daily_rows = daily_stmt.query_map(params![member_id], |row| {
            Ok(super::types::DailyActivity {
                date: row.get(0)?, count: row.get(1)?, minutes: row.get(2)?,
            })
        })?;
        let mut weekly_summary = Vec::new();
        for r in daily_rows { weekly_summary.push(r?); }

        Ok(super::types::LearningProgress {
            member_id: member_id.to_string(),
            member_name,
            total_activities,
            total_minutes,
            current_streak_days: current_streak,
            longest_streak_days: current_streak, // simplified for now
            activities_by_type,
            recent_topics,
            average_score: avg_score,
            goals,
            weekly_summary,
        })
    }

    // ============================================================
    // LEARNING GOALS
    // ============================================================

    pub fn create_learning_goal(&self, id: &str, member_id: &str, goal_type: &str,
                                 activity_type: Option<&str>, title: &str,
                                 target_value: f64, unit: Option<&str>,
                                 deadline: Option<&str>) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO learning_goals (id, member_id, goal_type, activity_type, title, target_value, unit, deadline)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, member_id, goal_type, activity_type, title, target_value, unit, deadline],
        )?;
        Ok(())
    }

    pub fn get_learning_goals(&self, member_id: &str) -> Result<Vec<super::types::LearningGoal>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, member_id, goal_type, activity_type, title, target_value, current_value, unit, deadline, is_complete, created_at, completed_at
             FROM learning_goals WHERE member_id = ?1 ORDER BY is_complete ASC, created_at DESC"
        )?;
        let rows = stmt.query_map(params![member_id], |row| {
            Ok(super::types::LearningGoal {
                id: row.get(0)?, member_id: row.get(1)?, goal_type: row.get(2)?, activity_type: row.get(3)?,
                title: row.get(4)?, target_value: row.get(5)?, current_value: row.get(6)?,
                unit: row.get(7)?, deadline: row.get(8)?, is_complete: row.get::<_, i64>(9)? != 0,
                created_at: row.get(10)?, completed_at: row.get(11)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    // ============================================================
    // SMART KITCHEN — Meals
    // ============================================================

    pub fn create_meal(&self, id: &str, name: &str, description: Option<&str>, cuisine: Option<&str>,
                        category: Option<&str>, photo_url: Option<&str>, prep_time: Option<i64>,
                        cook_time: Option<i64>, servings: i64, difficulty: &str,
                        instructions: Option<&str>, tags: Option<&str>, source: &str) -> Result<super::types::Meal> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute(
            "INSERT INTO meals (id, name, description, cuisine, category, photo_url, prep_time_min, cook_time_min, servings, difficulty, instructions, tags, source, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)",
            params![id, name, description, cuisine, category, photo_url, prep_time, cook_time, servings, difficulty, instructions, tags, source, now],
        )?;
        Ok(super::types::Meal {
            id: id.to_string(), name: name.to_string(), description: description.map(String::from),
            cuisine: cuisine.map(String::from), category: category.map(String::from),
            photo_url: photo_url.map(String::from), prep_time_min: prep_time, cook_time_min: cook_time,
            servings, difficulty: difficulty.to_string(), instructions: instructions.map(String::from),
            estimated_cost: None, cost_per_serving: None, calories: None, tags: tags.map(String::from),
            source: source.to_string(), is_favorite: false, last_made: None, times_made: 0,
            created_at: now.clone(), updated_at: now,
        })
    }

    pub fn get_meals(&self, category: Option<&str>, cuisine: Option<&str>, favorites_only: bool) -> Result<Vec<super::types::Meal>> {
        let conn = self.conn();
        let mut conditions = Vec::new();
        let mut params_vec: Vec<String> = Vec::new();

        if let Some(c) = category {
            conditions.push("category = ?");
            params_vec.push(c.to_string());
        }
        if let Some(c) = cuisine {
            conditions.push("cuisine = ?");
            params_vec.push(c.to_string());
        }
        if favorites_only {
            conditions.push("is_favorite = 1");
        }

        let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };
        let query = format!(
            "SELECT id, name, description, cuisine, category, photo_url, prep_time_min, cook_time_min, servings, difficulty, instructions, estimated_cost, cost_per_serving, calories, tags, source, is_favorite, last_made, times_made, created_at, updated_at
             FROM meals {} ORDER BY is_favorite DESC, times_made DESC, name", where_clause
        );

        let mut stmt = conn.prepare(&query)?;
        let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
        let rows = stmt.query_map(&params_refs[..], Self::map_meal)?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    fn map_meal(row: &rusqlite::Row) -> rusqlite::Result<super::types::Meal> {
        Ok(super::types::Meal {
            id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, cuisine: row.get(3)?,
            category: row.get(4)?, photo_url: row.get(5)?, prep_time_min: row.get(6)?,
            cook_time_min: row.get(7)?, servings: row.get(8)?, difficulty: row.get(9)?,
            instructions: row.get(10)?, estimated_cost: row.get(11)?, cost_per_serving: row.get(12)?,
            calories: row.get(13)?, tags: row.get(14)?, source: row.get(15)?,
            is_favorite: row.get::<_, i64>(16)? != 0, last_made: row.get(17)?, times_made: row.get(18)?,
            created_at: row.get(19)?, updated_at: row.get(20)?,
        })
    }

    pub fn get_meal(&self, id: &str) -> Result<Option<super::types::Meal>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, cuisine, category, photo_url, prep_time_min, cook_time_min, servings, difficulty, instructions, estimated_cost, cost_per_serving, calories, tags, source, is_favorite, last_made, times_made, created_at, updated_at
             FROM meals WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], Self::map_meal)?;
        Ok(rows.next().transpose()?)
    }

    pub fn get_meal_with_ingredients(&self, id: &str) -> Result<Option<super::types::MealWithIngredients>> {
        let meal = match self.get_meal(id)? {
            Some(m) => m,
            None => return Ok(None),
        };
        let ingredients = self.get_meal_ingredients(id)?;
        Ok(Some(super::types::MealWithIngredients { meal, ingredients }))
    }

    pub fn toggle_favorite(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE meals SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END, updated_at = ?2 WHERE id = ?1",
            params![id, Self::now()],
        )?;
        Ok(())
    }

    pub fn update_meal_costs(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        let total: f64 = conn.query_row(
            "SELECT COALESCE(SUM(estimated_cost), 0) FROM meal_ingredients WHERE meal_id = ?1",
            params![id], |row| row.get(0)
        ).unwrap_or(0.0);
        let servings: i64 = conn.query_row(
            "SELECT servings FROM meals WHERE id = ?1", params![id], |row| row.get(0)
        ).unwrap_or(1);
        let per_serving = if servings > 0 { total / servings as f64 } else { total };
        conn.execute(
            "UPDATE meals SET estimated_cost = ?2, cost_per_serving = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, total, per_serving, Self::now()],
        )?;
        Ok(())
    }

    // ============================================================
    // Meal Ingredients
    // ============================================================

    pub fn add_meal_ingredient(&self, id: &str, meal_id: &str, name: &str, quantity: Option<f64>,
                                unit: Option<&str>, estimated_cost: Option<f64>, category: Option<&str>,
                                is_optional: bool, notes: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let opt: i64 = if is_optional { 1 } else { 0 };
        let max_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM meal_ingredients WHERE meal_id = ?1",
            params![meal_id], |row| row.get(0)
        ).unwrap_or(0);
        conn.execute(
            "INSERT INTO meal_ingredients (id, meal_id, name, quantity, unit, estimated_cost, category, is_optional, notes, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, meal_id, name, quantity, unit, estimated_cost, category, opt, notes, max_order + 1],
        )?;
        self.update_meal_costs(meal_id)?;
        Ok(())
    }

    pub fn get_meal_ingredients(&self, meal_id: &str) -> Result<Vec<super::types::MealIngredient>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, meal_id, name, quantity, unit, estimated_cost, category, is_optional, notes, sort_order
             FROM meal_ingredients WHERE meal_id = ?1 ORDER BY sort_order"
        )?;
        let rows = stmt.query_map(params![meal_id], |row| {
            Ok(super::types::MealIngredient {
                id: row.get(0)?, meal_id: row.get(1)?, name: row.get(2)?, quantity: row.get(3)?,
                unit: row.get(4)?, estimated_cost: row.get(5)?, category: row.get(6)?,
                is_optional: row.get::<_, i64>(7)? != 0, notes: row.get(8)?, sort_order: row.get(9)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    // ============================================================
    // Meal Plans (Weekly)
    // ============================================================

    pub fn set_plan_entry(&self, id: &str, week_start: &str, day_of_week: i64,
                           meal_slot: &str, meal_id: Option<&str>, notes: Option<&str>) -> Result<()> {
        let conn = self.conn();
        // Upsert: delete existing entry for this slot, then insert
        conn.execute(
            "DELETE FROM meal_plans_v2 WHERE week_start = ?1 AND day_of_week = ?2 AND meal_slot = ?3",
            params![week_start, day_of_week, meal_slot],
        )?;
        conn.execute(
            "INSERT INTO meal_plans_v2 (id, week_start, day_of_week, meal_slot, meal_id, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, week_start, day_of_week, meal_slot, meal_id, notes],
        )?;
        Ok(())
    }

    pub fn get_weekly_plan(&self, week_start: &str) -> Result<super::types::WeeklyPlan> {
        let conn = self.conn();
        let day_names = vec!["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

        let mut stmt = conn.prepare(
            "SELECT p.id, p.day_of_week, p.meal_slot, p.meal_id, p.notes,
                    m.name, m.category, m.photo_url, m.prep_time_min, m.cook_time_min, m.servings, m.cost_per_serving
             FROM meal_plans_v2 p
             LEFT JOIN meals m ON p.meal_id = m.id
             WHERE p.week_start = ?1
             ORDER BY p.day_of_week, CASE p.meal_slot WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 WHEN 'snack' THEN 3 WHEN 'dinner' THEN 4 END"
        )?;
        let rows = stmt.query_map(params![week_start], |row| {
            Ok((
                row.get::<_, i64>(1)?,  // day_of_week
                row.get::<_, String>(2)?,  // meal_slot
                row.get::<_, Option<String>>(3)?,  // meal_id
                row.get::<_, Option<String>>(4)?,  // notes
                row.get::<_, Option<String>>(5)?,  // meal name
                row.get::<_, Option<String>>(6)?,  // category
                row.get::<_, Option<String>>(7)?,  // photo_url
                row.get::<_, Option<i64>>(8)?,     // prep_time
                row.get::<_, Option<i64>>(9)?,     // cook_time
                row.get::<_, Option<i64>>(10)?,    // servings
                row.get::<_, Option<f64>>(11)?,    // cost_per_serving
            ))
        })?;

        let mut day_slots: std::collections::HashMap<i64, Vec<super::types::PlanSlot>> = std::collections::HashMap::new();
        let mut total_cost = 0.0;
        let mut meal_count = 0i64;

        for row in rows {
            let (day, slot, meal_id, notes, name, category, photo_url, prep, cook, servings, cost) = row?;
            let meal = if let (Some(mid), Some(mname)) = (meal_id, name) {
                meal_count += 1;
                total_cost += cost.unwrap_or(0.0);
                Some(super::types::Meal {
                    id: mid, name: mname, description: None, cuisine: None, category,
                    photo_url, prep_time_min: prep, cook_time_min: cook,
                    servings: servings.unwrap_or(4), difficulty: "normal".to_string(),
                    instructions: None, estimated_cost: None, cost_per_serving: cost,
                    calories: None, tags: None, source: "plan".to_string(),
                    is_favorite: false, last_made: None, times_made: 0,
                    created_at: String::new(), updated_at: String::new(),
                })
            } else { None };
            day_slots.entry(day).or_default().push(super::types::PlanSlot { meal_slot: slot, meal, notes });
        }

        let mut days = Vec::new();
        for d in 0..7i64 {
            days.push(super::types::DayPlan {
                day_of_week: d,
                day_name: day_names[d as usize].to_string(),
                slots: day_slots.remove(&d).unwrap_or_default(),
            });
        }

        Ok(super::types::WeeklyPlan { week_start: week_start.to_string(), days, total_estimated_cost: total_cost, meal_count })
    }

    pub fn clear_week_plan(&self, week_start: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM meal_plans_v2 WHERE week_start = ?1", params![week_start])?;
        conn.execute("DELETE FROM grocery_items WHERE week_start = ?1", params![week_start])?;
        Ok(())
    }

    // ============================================================
    // Grocery List
    // ============================================================

    pub fn generate_grocery_list(&self, week_start: &str) -> Result<Vec<super::types::GroceryItem>> {
        let conn = self.conn();

        // Clear existing grocery list for this week
        conn.execute("DELETE FROM grocery_items WHERE week_start = ?1", params![week_start])?;

        // Get all ingredients from meals in this week's plan
        let mut stmt = conn.prepare(
            "SELECT DISTINCT i.name, SUM(i.quantity) as total_qty, i.unit, i.category, SUM(i.estimated_cost) as total_cost, i.meal_id
             FROM meal_ingredients i
             INNER JOIN meal_plans_v2 p ON p.meal_id = i.meal_id
             WHERE p.week_start = ?1
             GROUP BY i.name, i.unit
             ORDER BY i.category, i.name"
        )?;
        let rows = stmt.query_map(params![week_start], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<f64>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, String>(5)?,
            ))
        })?;

        let mut items = Vec::new();
        for row in rows {
            let (name, qty, unit, category, cost, meal_id) = row?;
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO grocery_items (id, name, quantity, unit, category, estimated_cost, source_meal_id, week_start)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![id, name, qty, unit, category, cost, meal_id, week_start],
            )?;
            items.push(super::types::GroceryItem {
                id, member_id: None, name, quantity: qty, unit, category,
                estimated_cost: cost, is_checked: false, source_meal_id: Some(meal_id),
                week_start: Some(week_start.to_string()), created_at: Self::now(),
            });
        }
        Ok(items)
    }

    pub fn get_grocery_list(&self, week_start: &str) -> Result<Vec<super::types::GroceryItem>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, member_id, name, quantity, unit, category, estimated_cost, is_checked, source_meal_id, week_start, created_at
             FROM grocery_items WHERE week_start = ?1 ORDER BY category, name"
        )?;
        let rows = stmt.query_map(params![week_start], |row| {
            Ok(super::types::GroceryItem {
                id: row.get(0)?, member_id: row.get(1)?, name: row.get(2)?, quantity: row.get(3)?,
                unit: row.get(4)?, category: row.get(5)?, estimated_cost: row.get(6)?,
                is_checked: row.get::<_, i64>(7)? != 0, source_meal_id: row.get(8)?,
                week_start: row.get(9)?, created_at: row.get(10)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn toggle_grocery_item(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE grocery_items SET is_checked = CASE WHEN is_checked = 1 THEN 0 ELSE 1 END WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    // ============================================================
    // Kitchen Inventory
    // ============================================================

    pub fn add_inventory_item(&self, id: &str, member_id: &str, name: &str, quantity: Option<f64>, unit: Option<&str>,
                               category: Option<&str>, expiry: Option<&str>, location: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute(
            "INSERT INTO kitchen_inventory (id, member_id, name, quantity, unit, category, expiry_date, location, last_restocked, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            params![id, member_id, name, quantity, unit, category, expiry, location, now],
        )?;
        Ok(())
    }

    pub fn get_inventory(&self, member_id: &str, location: Option<&str>) -> Result<Vec<super::types::KitchenInventoryItem>> {
        let conn = self.conn();
        if let Some(loc) = location {
            let mut stmt = conn.prepare(
                "SELECT id, member_id, name, quantity, unit, category, expiry_date, location, last_restocked, created_at, updated_at
                 FROM kitchen_inventory WHERE member_id = ?1 AND location = ?2 ORDER BY name"
            )?;
            let rows = stmt.query_map(params![member_id, loc], Self::map_inventory)?;
            let mut result = Vec::new();
            for r in rows { result.push(r?); }
            Ok(result)
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, member_id, name, quantity, unit, category, expiry_date, location, last_restocked, created_at, updated_at
                 FROM kitchen_inventory WHERE member_id = ?1 ORDER BY location, name"
            )?;
            let rows = stmt.query_map(params![member_id], Self::map_inventory)?;
            let mut result = Vec::new();
            for r in rows { result.push(r?); }
            Ok(result)
        }
    }

    fn map_inventory(row: &rusqlite::Row) -> rusqlite::Result<super::types::KitchenInventoryItem> {
        Ok(super::types::KitchenInventoryItem {
            id: row.get(0)?, member_id: row.get(1)?, name: row.get(2)?, quantity: row.get(3)?, unit: row.get(4)?,
            category: row.get(5)?, expiry_date: row.get(6)?, location: row.get(7)?,
            last_restocked: row.get(8)?, created_at: row.get(9)?, updated_at: row.get(10)?,
        })
    }

    // ── Kitchen Hearth Extensions ──

    pub fn add_meal_photo(&self, id: &str, meal_id: &str, photo_url: &str, caption: Option<&str>) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO meal_photos (id, meal_id, photo_url, caption) VALUES (?1, ?2, ?3, ?4)",
            params![id, meal_id, photo_url, caption]
        )?;
        Ok(())
    }

    pub fn get_meal_photos(&self, meal_id: &str) -> Result<Vec<super::types::MealPhoto>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, meal_id, photo_url, caption, ai_tags, taken_at, created_at FROM meal_photos WHERE meal_id = ?1 ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map(params![meal_id], |row| {
            Ok(super::types::MealPhoto {
                id: row.get(0)?, meal_id: row.get(1)?, photo_url: row.get(2)?,
                caption: row.get(3)?, ai_tags: row.get(4)?, taken_at: row.get(5)?, created_at: row.get(6)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn get_pantry_heatmap(&self) -> Result<Vec<super::types::PantryHeatItem>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT name, expiry_date, location FROM kitchen_inventory WHERE expiry_date IS NOT NULL ORDER BY expiry_date ASC"
        )?;
        let rows = stmt.query_map([], |row| {
            let name: String = row.get(0)?;
            let expiry: Option<String> = row.get(1)?;
            let location: String = row.get(2).unwrap_or_else(|_| "pantry".to_string());
            let (freshness, days) = if let Some(exp) = expiry {
                let exp_date = chrono::NaiveDate::parse_from_str(&exp, "%Y-%m-%d").ok();
                let today = chrono::Utc::now().date_naive();
                if let Some(ed) = exp_date {
                    let diff = (ed - today).num_days();
                    let f = if diff < 0 { 0.0 } else if diff > 14 { 1.0 } else { diff as f64 / 14.0 };
                    (f, Some(diff))
                } else { (0.5, None) }
            } else { (1.0, None) };
            Ok(super::types::PantryHeatItem { name, freshness, days_until_expiry: days, location })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn get_expiring_items(&self, days: i64) -> Result<Vec<super::types::KitchenInventoryItem>> {
        let conn = self.conn();
        let future = chrono::Utc::now().checked_add_signed(chrono::Duration::days(days))
            .map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default();
        let mut stmt = conn.prepare(
            "SELECT id, name, quantity, unit, category, expiry_date, location, last_restocked, created_at, updated_at
             FROM kitchen_inventory WHERE expiry_date IS NOT NULL AND expiry_date <= ?1 ORDER BY expiry_date ASC"
        )?;
        let rows = stmt.query_map(params![future], Self::map_inventory)?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    // LIFE AUTOPILOT
    pub fn add_document(&self, id: &str, member_id: Option<&str>, doc_type: &str, title: &str,
                         content: Option<&str>, ai_summary: Option<&str>, ai_key_dates: Option<&str>,
                         ai_action_items: Option<&str>, source: &str) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        let mid = member_id.map(String::from);
        let cnt = content.map(String::from);
        let summ = ai_summary.map(String::from);
        let kd = ai_key_dates.map(String::from);
        let ai = ai_action_items.map(String::from);
        conn.execute(
            "INSERT INTO life_documents (id, member_id, doc_type, title, content, ai_summary, ai_key_dates, ai_action_items, source, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
            params![id, mid, doc_type, title, cnt, summ, kd, ai, source, now],
        )?;
        Ok(())
    }
    pub fn get_documents(&self, member_id: Option<&str>, doc_type: Option<&str>) -> Result<Vec<super::types::LifeDocument>> {
        let conn = self.conn();
        let mapper = |row: &rusqlite::Row| -> rusqlite::Result<super::types::LifeDocument> {
            Ok(super::types::LifeDocument {
                id: row.get(0)?, member_id: row.get(1)?, doc_type: row.get(2)?, title: row.get(3)?,
                content: row.get(4)?, ai_summary: row.get(5)?, ai_key_dates: row.get(6)?,
                ai_action_items: row.get(7)?, source: row.get(8)?, file_url: row.get(9)?,
                tags: row.get(10)?, is_archived: row.get::<_, i64>(11)? != 0,
                created_at: row.get(12)?, updated_at: row.get(13)?,
            })
        };
        let base = "SELECT id, member_id, doc_type, title, content, ai_summary, ai_key_dates, ai_action_items, source, file_url, tags, is_archived, created_at, updated_at FROM life_documents WHERE is_archived = 0";
        let mut result = Vec::new();
        match (member_id, doc_type) {
            (Some(mid), Some(dt)) => {
                let mut stmt = conn.prepare(&format!("{} AND member_id = ?1 AND doc_type = ?2 ORDER BY created_at DESC LIMIT 50", base))?;
                let rows = stmt.query_map(params![mid, dt], mapper)?;
                for r in rows { result.push(r?); }
            }
            (Some(mid), None) => {
                let mut stmt = conn.prepare(&format!("{} AND member_id = ?1 ORDER BY created_at DESC LIMIT 50", base))?;
                let rows = stmt.query_map(params![mid], mapper)?;
                for r in rows { result.push(r?); }
            }
            (None, Some(dt)) => {
                let mut stmt = conn.prepare(&format!("{} AND doc_type = ?1 ORDER BY created_at DESC LIMIT 50", base))?;
                let rows = stmt.query_map(params![dt], mapper)?;
                for r in rows { result.push(r?); }
            }
            (None, None) => {
                let mut stmt = conn.prepare(&format!("{} ORDER BY created_at DESC LIMIT 50", base))?;
                let rows = stmt.query_map([], mapper)?;
                for r in rows { result.push(r?); }
            }
        }
        Ok(result)
    }
    pub fn add_reminder(&self, id: &str, member_id: Option<&str>, document_id: Option<&str>, reminder_type: &str, title: &str, description: Option<&str>, due_date: &str, priority: &str) -> Result<()> {
        let conn = self.conn();
        let mid = member_id.map(String::from);
        let did = document_id.map(String::from);
        let desc = description.map(String::from);
        conn.execute("INSERT INTO life_reminders (id, member_id, document_id, reminder_type, title, description, due_date, priority) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, mid, did, reminder_type, title, desc, due_date, priority])?;
        Ok(())
    }
    pub fn get_upcoming_reminders(&self, days: i64) -> Result<Vec<super::types::LifeReminder>> {
        let conn = self.conn();
        let future = (chrono::Utc::now() + chrono::Duration::days(days)).format("%Y-%m-%d").to_string();
        let mut stmt = conn.prepare("SELECT id, member_id, document_id, reminder_type, title, description, due_date, priority, is_dismissed, is_completed, recurring, frequency, created_at FROM life_reminders WHERE is_dismissed = 0 AND is_completed = 0 AND due_date <= ?1 ORDER BY priority DESC, due_date")?;
        let rows = stmt.query_map(params![future], Self::map_reminder)?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    pub fn get_overdue_reminders(&self) -> Result<Vec<super::types::LifeReminder>> {
        let conn = self.conn();
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let mut stmt = conn.prepare("SELECT id, member_id, document_id, reminder_type, title, description, due_date, priority, is_dismissed, is_completed, recurring, frequency, created_at FROM life_reminders WHERE is_dismissed = 0 AND is_completed = 0 AND due_date < ?1 ORDER BY due_date")?;
        let rows = stmt.query_map(params![today], Self::map_reminder)?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    fn map_reminder(row: &rusqlite::Row) -> rusqlite::Result<super::types::LifeReminder> {
        Ok(super::types::LifeReminder {
            id: row.get(0)?, member_id: row.get(1)?, document_id: row.get(2)?, reminder_type: row.get(3)?,
            title: row.get(4)?, description: row.get(5)?, due_date: row.get(6)?, priority: row.get(7)?,
            is_dismissed: row.get::<_, i64>(8)? != 0, is_completed: row.get::<_, i64>(9)? != 0,
            recurring: row.get::<_, i64>(10)? != 0, frequency: row.get(11)?, created_at: row.get(12)?,
        })
    }
    pub fn add_knowledge(&self, id: &str, member_id: Option<&str>, category: &str, key: &str, value: &str) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        let mid = member_id.map(String::from);
        conn.execute("INSERT OR REPLACE INTO life_knowledge (id, member_id, category, key, value, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![id, mid, category, key, value, now])?;
        Ok(())
    }
    pub fn get_knowledge(&self, member_id: Option<&str>, category: Option<&str>) -> Result<Vec<super::types::LifeKnowledge>> {
        let conn = self.conn();
        let mapper = |row: &rusqlite::Row| -> rusqlite::Result<super::types::LifeKnowledge> {
            Ok(super::types::LifeKnowledge {
                id: row.get(0)?, member_id: row.get(1)?, category: row.get(2)?, key: row.get(3)?,
                value: row.get(4)?, source_doc_id: row.get(5)?, confidence: row.get(6)?,
                created_at: row.get(7)?, updated_at: row.get(8)?,
            })
        };
        let base = "SELECT id, member_id, category, key, value, source_doc_id, confidence, created_at, updated_at FROM life_knowledge";
        let mut result = Vec::new();
        match (member_id, category) {
            (Some(mid), Some(cat)) => {
                let mut stmt = conn.prepare(&format!("{} WHERE member_id = ?1 AND category = ?2 ORDER BY category, key", base))?;
                let rows = stmt.query_map(params![mid, cat], mapper)?;
                for r in rows { result.push(r?); }
            }
            (Some(mid), None) => {
                let mut stmt = conn.prepare(&format!("{} WHERE member_id = ?1 ORDER BY category, key", base))?;
                let rows = stmt.query_map(params![mid], mapper)?;
                for r in rows { result.push(r?); }
            }
            (None, Some(cat)) => {
                let mut stmt = conn.prepare(&format!("{} WHERE category = ?1 ORDER BY category, key", base))?;
                let rows = stmt.query_map(params![cat], mapper)?;
                for r in rows { result.push(r?); }
            }
            (None, None) => {
                let mut stmt = conn.prepare(&format!("{} ORDER BY category, key", base))?;
                let rows = stmt.query_map([], mapper)?;
                for r in rows { result.push(r?); }
            }
        }
        Ok(result)
    }
    pub fn get_life_dashboard(&self) -> Result<super::types::LifeAutopilotDashboard> {
        let upcoming = self.get_upcoming_reminders(30)?;
        let overdue = self.get_overdue_reminders()?;
        let docs = self.get_documents(None, None)?;
        let doc_count = docs.len() as i64;
        let knowledge = self.get_knowledge(None, None)?;
        Ok(super::types::LifeAutopilotDashboard {
            upcoming_reminders: upcoming,
            recent_documents: docs.into_iter().take(10).collect(),
            knowledge_count: knowledge.len() as i64,
            documents_count: doc_count,
            overdue_reminders: overdue,
        })
    }

    // ── Life Autopilot: Orbit ──

    pub fn add_life_task(&self, id: &str, member_id: &str, title: &str, category: Option<&str>, priority: &str, due_date: Option<&str>, energy_type: Option<&str>) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO life_tasks (id, member_id, title, category, priority, due_date, energy_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, member_id, title, category, priority, due_date, energy_type]
        )?;
        Ok(())
    }

    pub fn get_life_tasks(&self, member_id: &str, status: Option<&str>) -> Result<Vec<super::types::LifeTask>> {
        let conn = self.conn();
        let mut result = Vec::new();
        if let Some(s) = status {
            let mut stmt = conn.prepare("SELECT id, title, category, priority, status, due_date, energy_type, completed_at, created_at FROM life_tasks WHERE member_id = ?1 AND status = ?2 ORDER BY priority DESC, due_date ASC")?;
            let rows = stmt.query_map(params![member_id, s], |row| {
                Ok(super::types::LifeTask {
                    id: row.get(0)?, title: row.get(1)?, category: row.get(2)?,
                    priority: row.get(3)?, status: row.get(4)?, due_date: row.get(5)?,
                    energy_type: row.get(6)?, completed_at: row.get(7)?, created_at: row.get(8)?,
                })
            })?;
            for r in rows { result.push(r?); }
        } else {
            let mut stmt = conn.prepare("SELECT id, title, category, priority, status, due_date, energy_type, completed_at, created_at FROM life_tasks WHERE member_id = ?1 ORDER BY status, priority DESC, due_date ASC")?;
            let rows = stmt.query_map(params![member_id], |row| {
                Ok(super::types::LifeTask {
                    id: row.get(0)?, title: row.get(1)?, category: row.get(2)?,
                    priority: row.get(3)?, status: row.get(4)?, due_date: row.get(5)?,
                    energy_type: row.get(6)?, completed_at: row.get(7)?, created_at: row.get(8)?,
                })
            })?;
            for r in rows { result.push(r?); }
        }
        Ok(result)
    }

    pub fn update_life_task_status(&self, member_id: &str, id: &str, status: &str) -> Result<()> {
        let conn = self.conn();
        let completed = if status == "completed" { Some(chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()) } else { None };
        conn.execute("UPDATE life_tasks SET status = ?1, completed_at = ?2 WHERE id = ?3 AND member_id = ?4", params![status, completed, id, member_id])?;
        Ok(())
    }

    pub fn delete_life_task(&self, member_id: &str, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM life_tasks WHERE id = ?1 AND member_id = ?2", params![id, member_id])?;
        Ok(())
    }

    pub fn add_life_habit(&self, id: &str, member_id: &str, name: &str, category: Option<&str>, frequency: &str, target_count: i64) -> Result<()> {
        let conn = self.conn();
        conn.execute("INSERT INTO life_habits (id, member_id, name, category, frequency, target_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![id, member_id, name, category, frequency, target_count])?;
        Ok(())
    }

    pub fn get_life_habits(&self, member_id: &str, active_only: bool) -> Result<Vec<super::types::LifeHabit>> {
        let conn = self.conn();
        let query = if active_only {
            "SELECT id, name, category, frequency, target_count, streak, best_streak, active, created_at FROM life_habits WHERE member_id = ?1 AND active = 1 ORDER BY name"
        } else {
            "SELECT id, name, category, frequency, target_count, streak, best_streak, active, created_at FROM life_habits WHERE member_id = ?1 ORDER BY name"
        };
        let mut stmt = conn.prepare(query)?;
        let rows = stmt.query_map(params![member_id], |row| {
            Ok(super::types::LifeHabit {
                id: row.get(0)?, name: row.get(1)?, category: row.get(2)?,
                frequency: row.get(3)?, target_count: row.get(4)?, streak: row.get(5)?,
                best_streak: row.get(6)?, active: row.get::<_, i64>(7)? != 0, created_at: row.get(8)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn log_life_habit(&self, id: &str, habit_id: &str, member_id: &str, logged_date: &str, count: i64) -> Result<()> {
        let conn = self.conn();
        conn.execute("INSERT INTO life_habit_logs (id, habit_id, logged_date, count) VALUES (?1, ?2, ?3, ?4)", params![id, habit_id, logged_date, count])?;
        // Update streak
        conn.execute("UPDATE life_habits SET streak = streak + 1 WHERE id = ?1 AND member_id = ?2", params![habit_id, member_id])?;
        Ok(())
    }

    pub fn get_orbit_dashboard(&self, member_id: &str) -> Result<super::types::OrbitDashboard> {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        // Today's focus — collect rows first, then batch-fetch tasks to avoid nested conn borrows
        let conn = self.conn();
        let mut focus_data: Vec<(String, String, Option<String>, i64, String)> = Vec::new();
        let mut task_ids: Vec<String> = Vec::new();
        {
            let mut stmt = conn.prepare("SELECT id, focus_date, task_id, position, created_at FROM life_daily_focus WHERE member_id = ?1 AND focus_date = ?2 ORDER BY position")?;
            let focus_rows = stmt.query_map(params![member_id, today], |row| {
                let id: String = row.get(0)?;
                let focus_date: String = row.get(1)?;
                let task_id: Option<String> = row.get(2)?;
                let position: i64 = row.get(3)?;
                let created_at: String = row.get(4)?;
                Ok((id, focus_date, task_id, position, created_at))
            })?;
            for r in focus_rows {
                let (id, focus_date, task_id, position, created_at) = r?;
                if let Some(tid) = &task_id {
                    task_ids.push(tid.clone());
                }
                focus_data.push((id, focus_date, task_id, position, created_at));
            }
        } // stmt dropped here, freeing conn borrow
        // Batch-fetch tasks for focus items
        let task_map: std::collections::HashMap<String, super::types::LifeTask> = if task_ids.is_empty() {
            std::collections::HashMap::new()
        } else {
            let placeholders = task_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let sql = format!("SELECT id, title, category, priority, status, due_date, energy_type, completed_at, created_at FROM life_tasks WHERE id IN ({}) AND member_id = ?{}", placeholders, task_ids.len() + 1);
            let mut task_stmt = conn.prepare(&sql)?;
            let mut params: Vec<&dyn rusqlite::ToSql> = task_ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
            params.push(&member_id as &dyn rusqlite::ToSql);
            let task_rows = task_stmt.query_map(params.as_slice(), |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    super::types::LifeTask {
                        id: r.get(0)?, title: r.get(1)?, category: r.get(2)?, priority: r.get(3)?,
                        status: r.get(4)?, due_date: r.get(5)?, energy_type: r.get(6)?,
                        completed_at: r.get(7)?, created_at: r.get(8)?,
                    },
                ))
            })?;
            let mut map = std::collections::HashMap::new();
            for r in task_rows {
                let (id, task) = r?;
                map.insert(id, task);
            }
            map
        };
        let focus: Vec<super::types::LifeDailyFocus> = focus_data.into_iter().map(|(id, focus_date, task_id, position, created_at)| {
            let task = task_id.as_ref().and_then(|tid| task_map.get(tid).cloned());
            super::types::LifeDailyFocus { id, focus_date, task_id, position, task, created_at }
        }).collect();
        // Drop conn guard before calling methods that also lock the mutex
        drop(conn);
        let tasks = self.get_life_tasks(member_id, Some("pending")).unwrap_or_default();
        let habits = self.get_life_habits(member_id, true).unwrap_or_default();
        let streak_total: i64 = habits.iter().map(|h| h.streak).sum();
        Ok(super::types::OrbitDashboard {
            today_focus: focus,
            pending_tasks: tasks,
            active_habits: habits,
            nudges: Vec::new(),
            streak_total,
            completed_today: 0,
        })
    }

    pub fn add_daily_focus(&self, id: &str, member_id: &str, task_id: &str, position: i64) -> Result<()> {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let conn = self.conn();
        conn.execute("INSERT INTO life_daily_focus (id, member_id, focus_date, task_id, position) VALUES (?1, ?2, ?3, ?4, ?5)", params![id, member_id, today, task_id, position])?;
        Ok(())
    }

    pub fn add_nudge(&self, id: &str, member_id: &str, nudge_type: &str, message: &str, action_label: Option<&str>) -> Result<()> {
        let conn = self.conn();
        conn.execute("INSERT INTO life_nudges (id, member_id, nudge_type, message, action_label) VALUES (?1, ?2, ?3, ?4, ?5)", params![id, member_id, nudge_type, message, action_label])?;
        Ok(())
    }

    pub fn get_nudges(&self) -> Result<Vec<super::types::LifeNudge>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, nudge_type, message, action_label, dismissed, created_at FROM life_nudges WHERE dismissed = 0 ORDER BY created_at DESC LIMIT 5")?;
        let rows = stmt.query_map([], |row| {
            Ok(super::types::LifeNudge {
                id: row.get(0)?, nudge_type: row.get(1)?, message: row.get(2)?,
                action_label: row.get(3)?, dismissed: row.get::<_, i64>(4)? != 0, created_at: row.get(5)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    // HOME HEALTH
    pub fn upsert_home_profile(&self, id: &str, address: Option<&str>, year_built: Option<i64>, square_feet: Option<i64>,
        hvac_type: Option<&str>, hvac_filter_size: Option<&str>, water_heater_type: Option<&str>,
        roof_type: Option<&str>, window_type: Option<&str>, insulation_type: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute(
            "INSERT INTO home_profiles (id, address, year_built, square_feet, hvac_type, hvac_filter_size, water_heater_type, roof_type, window_type, insulation_type, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
             ON CONFLICT(id) DO UPDATE SET address=?2, year_built=?3, square_feet=?4, hvac_type=?5, hvac_filter_size=?6, water_heater_type=?7, roof_type=?8, window_type=?9, insulation_type=?10, updated_at=?11",
            params![id, address, year_built, square_feet, hvac_type, hvac_filter_size, water_heater_type, roof_type, window_type, insulation_type, now],
        )?;
        Ok(())
    }
    pub fn get_home_profile(&self) -> Result<Option<super::types::HomeProfile>> {
        let conn = self.conn();
        let row = conn.query_row(
            "SELECT id, address, year_built, square_feet, hvac_type, hvac_filter_size, water_heater_type, roof_type, window_type, insulation_type, created_at, updated_at FROM home_profiles LIMIT 1",
            [], |row| Ok(super::types::HomeProfile {
                id: row.get(0)?, address: row.get(1)?, year_built: row.get(2)?, square_feet: row.get(3)?,
                hvac_type: row.get(4)?, hvac_filter_size: row.get(5)?, water_heater_type: row.get(6)?,
                roof_type: row.get(7)?, window_type: row.get(8)?, insulation_type: row.get(9)?,
                created_at: row.get(10)?, updated_at: row.get(11)?,
            })
        );
        match row {
            Ok(profile) => Ok(Some(profile)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
    pub fn add_home_bill(&self, id: &str, bill_type: &str, amount: f64, usage: Option<f64>, billing_month: &str, notes: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let nts = notes.map(String::from);
        conn.execute("INSERT INTO home_bills (id, bill_type, amount, usage, billing_month, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, bill_type, amount, usage, billing_month, nts])?;
        Ok(())
    }
    pub fn get_home_bills(&self, bill_type: Option<&str>, limit: i64) -> Result<Vec<super::types::HomeBill>> {
        let conn = self.conn();
        let mapper = |row: &rusqlite::Row| -> rusqlite::Result<super::types::HomeBill> {
            Ok(super::types::HomeBill {
                id: row.get(0)?, bill_type: row.get(1)?, amount: row.get(2)?, usage: row.get(3)?,
                billing_month: row.get(4)?, notes: row.get(5)?, created_at: row.get(6)?,
            })
        };
        let mut result = Vec::new();
        if let Some(bt) = bill_type {
            let mut stmt = conn.prepare("SELECT id, bill_type, amount, usage, billing_month, notes, created_at FROM home_bills WHERE bill_type = ?1 ORDER BY billing_month DESC LIMIT ?2")?;
            let rows = stmt.query_map(params![bt, limit], mapper)?;
            for r in rows { result.push(r?); }
        } else {
            let mut stmt = conn.prepare("SELECT id, bill_type, amount, usage, billing_month, notes, created_at FROM home_bills ORDER BY billing_month DESC LIMIT ?1")?;
            let rows = stmt.query_map(params![limit], mapper)?;
            for r in rows { result.push(r?); }
        }
        Ok(result)
    }
    pub fn get_bill_trends(&self, months: i64) -> Result<Vec<super::types::BillTrendPoint>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT billing_month, bill_type, SUM(amount) FROM home_bills GROUP BY billing_month, bill_type ORDER BY billing_month DESC LIMIT ?1")?;
        let rows = stmt.query_map(params![months * 3], |row| -> rusqlite::Result<(String, String, f64)> {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        let mut trend_map: std::collections::HashMap<String, super::types::BillTrendPoint> = std::collections::HashMap::new();
        for r in rows {
            let (month, bt, amt) = r?;
            let entry = trend_map.entry(month.clone()).or_insert(super::types::BillTrendPoint {
                month: month.clone(), electric: None, gas: None, water: None, total: 0.0,
            });
            match bt.as_str() { "electric" => entry.electric = Some(amt), "gas" => entry.gas = Some(amt), "water" => entry.water = Some(amt), _ => {} }
            entry.total += amt;
        }
        let mut result: Vec<_> = trend_map.into_values().collect();
        result.sort_by(|a, b| b.month.cmp(&a.month));
        result.truncate(months as usize);
        result.reverse();
        Ok(result)
    }
    pub fn add_home_maintenance(&self, id: &str, task: &str, category: &str, last_completed: Option<&str>, interval_months: Option<i64>, priority: Option<&str>, estimated_cost: Option<f64>, notes: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let nts = notes.map(String::from);
        let pri = priority.unwrap_or("normal");
        let next_due = match (last_completed, interval_months) {
            (Some(lc), Some(im)) => {
                chrono::NaiveDate::parse_from_str(lc, "%Y-%m-%d").ok()
                    .map(|d| (d + chrono::Duration::days(im * 30)).format("%Y-%m-%d").to_string())
            }
            _ => None,
        };
        let lc_owned = last_completed.map(String::from);
        conn.execute("INSERT INTO home_maintenance (id, task, category, last_completed, interval_months, next_due, priority, estimated_cost, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, task, category, lc_owned, interval_months, next_due, pri, estimated_cost, nts])?;
        Ok(())
    }
    pub fn get_home_maintenance(&self, category: Option<&str>) -> Result<Vec<super::types::HomeMaintenance>> {
        let conn = self.conn();
        let mapper = |row: &rusqlite::Row| -> rusqlite::Result<super::types::HomeMaintenance> {
            Ok(super::types::HomeMaintenance {
                id: row.get(0)?, task: row.get(1)?, category: row.get(2)?, last_completed: row.get(3)?,
                interval_months: row.get(4)?, next_due: row.get(5)?, priority: row.get(6)?,
                estimated_cost: row.get(7)?, notes: row.get(8)?, created_at: row.get(9)?,
            })
        };
        let mut result = Vec::new();
        if let Some(cat) = category {
            let mut stmt = conn.prepare("SELECT id, task, category, last_completed, interval_months, next_due, priority, estimated_cost, notes, created_at FROM home_maintenance WHERE category = ?1 ORDER BY next_due")?;
            let rows = stmt.query_map(params![cat], mapper)?;
            for r in rows { result.push(r?); }
        } else {
            let mut stmt = conn.prepare("SELECT id, task, category, last_completed, interval_months, next_due, priority, estimated_cost, notes, created_at FROM home_maintenance ORDER BY next_due")?;
            let rows = stmt.query_map([], mapper)?;
            for r in rows { result.push(r?); }
        }
        Ok(result)
    }
    pub fn get_upcoming_maintenance(&self, days: i64) -> Result<Vec<super::types::HomeMaintenance>> {
        let conn = self.conn();
        let future = (chrono::Utc::now() + chrono::Duration::days(days)).format("%Y-%m-%d").to_string();
        let mut stmt = conn.prepare("SELECT id, task, category, last_completed, interval_months, next_due, priority, estimated_cost, notes, created_at FROM home_maintenance WHERE next_due IS NOT NULL AND next_due <= ?1 ORDER BY priority DESC, next_due")?;
        let rows = stmt.query_map(params![future], |row: &rusqlite::Row| -> rusqlite::Result<super::types::HomeMaintenance> {
            Ok(super::types::HomeMaintenance {
                id: row.get(0)?, task: row.get(1)?, category: row.get(2)?, last_completed: row.get(3)?,
                interval_months: row.get(4)?, next_due: row.get(5)?, priority: row.get(6)?,
                estimated_cost: row.get(7)?, notes: row.get(8)?, created_at: row.get(9)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    pub fn get_overdue_maintenance(&self) -> Result<Vec<super::types::HomeMaintenance>> {
        let conn = self.conn();
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let mut stmt = conn.prepare("SELECT id, task, category, last_completed, interval_months, next_due, priority, estimated_cost, notes, created_at FROM home_maintenance WHERE next_due IS NOT NULL AND next_due < ?1 ORDER BY next_due")?;
        let rows = stmt.query_map(params![today], |row: &rusqlite::Row| -> rusqlite::Result<super::types::HomeMaintenance> {
            Ok(super::types::HomeMaintenance {
                id: row.get(0)?, task: row.get(1)?, category: row.get(2)?, last_completed: row.get(3)?,
                interval_months: row.get(4)?, next_due: row.get(5)?, priority: row.get(6)?,
                estimated_cost: row.get(7)?, notes: row.get(8)?, created_at: row.get(9)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    pub fn add_home_appliance(&self, id: &str, name: &str, category: &str, model: Option<&str>,
        installed_date: Option<&str>, expected_lifespan_years: Option<f64>, warranty_expiry: Option<&str>,
        estimated_replacement_cost: Option<f64>, notes: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let mdl = model.map(String::from);
        let nid = notes.map(String::from);
        conn.execute("INSERT INTO home_appliances (id, name, category, model, installed_date, expected_lifespan_years, warranty_expiry, estimated_replacement_cost, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, name, category, mdl, installed_date, expected_lifespan_years, warranty_expiry, estimated_replacement_cost, nid])?;
        Ok(())
    }
    pub fn get_home_appliances(&self) -> Result<Vec<super::types::HomeAppliance>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, name, category, model, installed_date, expected_lifespan_years, warranty_expiry, estimated_replacement_cost, notes, last_service, next_service, created_at FROM home_appliances ORDER BY category, name")?;
        let rows = stmt.query_map([], |row: &rusqlite::Row| -> rusqlite::Result<super::types::HomeAppliance> {
            Ok(super::types::HomeAppliance {
                id: row.get(0)?, name: row.get(1)?, category: row.get(2)?, model: row.get(3)?,
                installed_date: row.get(4)?, expected_lifespan_years: row.get(5)?, warranty_expiry: row.get(6)?,
                estimated_replacement_cost: row.get(7)?, notes: row.get(8)?, last_service: row.get(9)?,
                next_service: row.get(10)?, created_at: row.get(11)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    pub fn get_home_dashboard(&self) -> Result<super::types::HomeDashboard> {
        let profile = self.get_home_profile().ok().flatten();
        let upcoming = self.get_upcoming_maintenance(30).unwrap_or_default();
        let overdue = self.get_overdue_maintenance().unwrap_or_default();
        let appliances = self.get_home_appliances().unwrap_or_default();
        let bill_trend = self.get_bill_trends(6).unwrap_or_default();
        let monthly = bill_trend.last().map(|b| b.total).unwrap_or(0.0);
        let total_appliance_risk: f64 = appliances.iter().map(|a| {
            if let (Some(lifespan), Some(installed)) = (a.expected_lifespan_years, a.installed_date.as_ref()) {
                if let Ok(date) = chrono::NaiveDate::parse_from_str(installed, "%Y-%m-%d") {
                    let age = (chrono::Utc::now().date_naive() - date).num_days() as f64 / 365.25;
                    return ((age / lifespan) * 100.0).min(100.0);
                }
            }
            0.0
        }).sum();
        let mut score = 100.0;
        score -= overdue.len() as f64 * 10.0;
        score -= (monthly - 300.0).max(0.0) / 10.0;
        score -= total_appliance_risk / (appliances.len() as f64).max(1.0) / 5.0;
        let health_score = score.max(0.0).min(100.0);

        // ── Derive system status cards ──
        let systems = Self::derive_systems(&profile, &overdue, &upcoming, &appliances);

        Ok(super::types::HomeDashboard {
            profile, upcoming_maintenance: upcoming, overdue_maintenance: overdue,
            appliances_needing_service: appliances, bill_trend, total_monthly_utilities: monthly,
            health_score, systems, ai_alerts: vec![],
        })
    }

    fn derive_systems(
        profile: &Option<super::types::HomeProfile>,
        overdue: &[super::types::HomeMaintenance],
        upcoming: &[super::types::HomeMaintenance],
        appliances: &[super::types::HomeAppliance],
    ) -> Vec<super::types::HomeSystem> {
        let mut systems = Vec::new();
        let now = chrono::Utc::now().date_naive();

        // Helper: count maintenance for category
        let cat_overdue = |cat: &str| -> usize {
            overdue.iter().filter(|m| m.category.to_lowercase().contains(cat)).count()
        };
        let cat_upcoming = |cat: &str| -> usize {
            upcoming.iter().filter(|m| m.category.to_lowercase().contains(cat)).count()
        };
        let cat_next_due = |cat: &str| -> Option<String> {
            upcoming.iter()
                .filter(|m| m.category.to_lowercase().contains(cat))
                .filter_map(|m| m.next_due.as_ref())
                .min()
                .cloned()
        };

        // 1. HVAC
        {
            let hvac_overdue = cat_overdue("hvac") + cat_overdue("heating") + cat_overdue("cooling");
            let hvac_appliances: Vec<_> = appliances.iter()
                .filter(|a| a.category.to_lowercase().contains("hvac") || a.category.to_lowercase().contains("heating") || a.category.to_lowercase().contains("cooling"))
                .collect();
            let hvac_type = profile.as_ref().and_then(|p| p.hvac_type.as_deref()).unwrap_or("Not configured");
            let (status, detail) = if hvac_overdue > 0 {
                ("critical", format!("{} overdue task{}, {}", hvac_overdue, if hvac_overdue == 1 {""} else {"s"}, hvac_type))
            } else if let Some(due) = cat_next_due("hvac").or_else(|| cat_next_due("heating")).or_else(|| cat_next_due("cooling")) {
                if let Ok(d) = chrono::NaiveDate::parse_from_str(&due, "%Y-%m-%d") {
                    let days = (d - now).num_days();
                    if days <= 14 {
                        ("warning", format!("Filter due in {} days", days))
                    } else {
                        ("healthy", format!("Next service in {} days", days))
                    }
                } else {
                    ("healthy", hvac_type.to_string())
                }
            } else if !hvac_appliances.is_empty() {
                ("healthy", format!("{} appliance{} registered", hvac_appliances.len(), if hvac_appliances.len() == 1 {""} else {"s"}))
            } else {
                ("healthy", hvac_type.to_string())
            };
            systems.push(super::types::HomeSystem {
                name: "HVAC".into(), icon: "❄️".into(), status: status.into(), detail,
            });
        }

        // 2. Plumbing
        {
            let plumb_overdue = cat_overdue("plumbing") + cat_overdue("water");
            let water_heater = profile.as_ref().and_then(|p| p.water_heater_type.as_deref());
            let water_appliances: Vec<_> = appliances.iter()
                .filter(|a| a.category.to_lowercase().contains("plumb") || a.category.to_lowercase().contains("water"))
                .collect();
            let (status, detail) = if plumb_overdue > 0 {
                ("critical", format!("{} overdue task{}", plumb_overdue, if plumb_overdue == 1 {""} else {"s"}))
            } else if let Some(due) = cat_next_due("plumbing").or_else(|| cat_next_due("water")) {
                if let Ok(d) = chrono::NaiveDate::parse_from_str(&due, "%Y-%m-%d") {
                    let days = (d - now).num_days();
                    if days <= 14 {
                        ("warning", format!("Due in {} days", days))
                    } else {
                        ("healthy", format!("Next in {} days", days))
                    }
                } else {
                    ("healthy", water_heater.unwrap_or("No tasks scheduled").into())
                }
            } else {
                ("healthy", water_heater.unwrap_or(if water_appliances.is_empty() {"No tasks scheduled"} else {"On track"}).into())
            };
            systems.push(super::types::HomeSystem {
                name: "Plumbing".into(), icon: "🚿".into(), status: status.into(), detail,
            });
        }

        // 3. Electrical
        {
            let elec_overdue = cat_overdue("electrical") + cat_overdue("electric");
            let elec_appliances: Vec<_> = appliances.iter()
                .filter(|a| a.category.to_lowercase().contains("electr"))
                .collect();
            let (status, detail) = if elec_overdue > 0 {
                ("critical", format!("{} overdue task{}", elec_overdue, if elec_overdue == 1 {""} else {"s"}))
            } else if let Some(due) = cat_next_due("electrical").or_else(|| cat_next_due("electric")) {
                if let Ok(d) = chrono::NaiveDate::parse_from_str(&due, "%Y-%m-%d") {
                    let days = (d - now).num_days();
                    if days <= 14 {
                        ("warning", format!("Due in {} days", days))
                    } else {
                        ("healthy", format!("Next in {} days", days))
                    }
                } else {
                    ("healthy", "No issues".into())
                }
            } else {
                ("healthy", if elec_appliances.is_empty() {"No issues"} else {"On track"}.into())
            };
            systems.push(super::types::HomeSystem {
                name: "Electrical".into(), icon: "⚡".into(), status: status.into(), detail,
            });
        }

        // 4. Roof & Exterior
        {
            let roof_overdue = cat_overdue("roof") + cat_overdue("exterior") + cat_overdue("gutter");
            let roof_type = profile.as_ref().and_then(|p| p.roof_type.as_deref());
            let (status, detail) = if roof_overdue > 0 {
                ("critical", format!("{} overdue task{}", roof_overdue, if roof_overdue == 1 {""} else {"s"}))
            } else if let Some(due) = cat_next_due("roof").or_else(|| cat_next_due("exterior")).or_else(|| cat_next_due("gutter")) {
                if let Ok(d) = chrono::NaiveDate::parse_from_str(&due, "%Y-%m-%d") {
                    let days = (d - now).num_days();
                    if days <= 14 {
                        ("warning", format!("Due in {} days", days))
                    } else {
                        ("healthy", format!("Next in {} days", days))
                    }
                } else {
                    ("healthy", roof_type.unwrap_or("No issues").into())
                }
            } else {
                ("healthy", roof_type.unwrap_or("No issues").into())
            };
            systems.push(super::types::HomeSystem {
                name: "Roof & Exterior".into(), icon: "🏠".into(), status: status.into(), detail,
            });
        }

        // 5. Appliances
        {
            let warranty_risk: Vec<_> = appliances.iter()
                .filter(|a| {
                    if let Some(exp) = &a.warranty_expiry {
                        if let Ok(d) = chrono::NaiveDate::parse_from_str(exp, "%Y-%m-%d") {
                            return (d - now).num_days() <= 30;
                        }
                    }
                    false
                })
                .collect();
            let at_risk: Vec<_> = appliances.iter()
                .filter(|a| {
                    if let (Some(lifespan), Some(installed)) = (a.expected_lifespan_years, a.installed_date.as_ref()) {
                        if let Ok(date) = chrono::NaiveDate::parse_from_str(installed, "%Y-%m-%d") {
                            let age = (now - date).num_days() as f64 / 365.25;
                            return (age / lifespan) >= 0.9;
                        }
                    }
                    false
                })
                .collect();
            let (status, detail) = if !at_risk.is_empty() {
                ("critical", format!("{} appliance{} at end of life", at_risk.len(), if at_risk.len() == 1 {""} else {"s"}))
            } else if !warranty_risk.is_empty() {
                ("warning", format!("{} warranty expiring soon", warranty_risk.len()))
            } else {
                ("healthy", format!("{} registered", appliances.len()))
            };
            systems.push(super::types::HomeSystem {
                name: "Appliances".into(), icon: "🔧".into(), status: status.into(), detail,
            });
        }

        systems
    }

    pub fn delete_home_bill(&self, id: &str) -> Result<()> {
        self.conn().execute("DELETE FROM home_bills WHERE id = ?", [id])?;
        Ok(())
    }

    // ── Home Health: Foundation AI ──

    pub fn store_home_problem(&self, id: &str, symptom: &str, diagnosis_json: Option<&str>, system: Option<&str>, severity: Option<&str>) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO home_problems (id, symptom, diagnosis_json, system, severity) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, symptom, diagnosis_json, system, severity],
        )?;
        Ok(())
    }

    pub fn get_home_problems(&self, resolved: Option<bool>) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn();
        let query = match resolved {
            Some(r) => {
                let rv: i64 = if r { 1 } else { 0 };
                format!("SELECT id, symptom, diagnosis_json, system, severity, created_at, resolved FROM home_problems WHERE resolved = {} ORDER BY created_at DESC", rv)
            }
            None => "SELECT id, symptom, diagnosis_json, system, severity, created_at, resolved FROM home_problems ORDER BY created_at DESC".to_string(),
        };
        let mut stmt = conn.prepare(&query)?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "symptom": row.get::<_, String>(1)?,
                "diagnosis_json": row.get::<_, Option<String>>(2)?,
                "system": row.get::<_, Option<String>>(3)?,
                "severity": row.get::<_, Option<String>>(4)?,
                "created_at": row.get::<_, String>(5)?,
                "resolved": row.get::<_, i64>(6)? != 0,
            }))
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn get_seasonal_tasks(&self, month: i64) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, task, category, priority, estimated_time_minutes, estimated_cost, diy_possible, description, month, completed, completed_date
             FROM home_seasonal_tasks WHERE month = ?1 ORDER BY priority DESC, task"
        )?;
        let rows = stmt.query_map(params![month], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "task": row.get::<_, String>(1)?,
                "category": row.get::<_, String>(2)?,
                "priority": row.get::<_, String>(3)?,
                "estimated_time_minutes": row.get::<_, i64>(4)?,
                "estimated_cost": row.get::<_, f64>(5)?,
                "diy_possible": row.get::<_, i64>(6)? != 0,
                "description": row.get::<_, Option<String>>(7)?,
                "month": row.get::<_, i64>(8)?,
                "completed": row.get::<_, i64>(9)? != 0,
                "completed_date": row.get::<_, Option<String>>(10)?,
            }))
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn complete_seasonal_task(&self, task_id: &str) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute(
            "UPDATE home_seasonal_tasks SET completed = 1, completed_date = ?2 WHERE id = ?1",
            params![task_id, now],
        )?;
        Ok(())
    }

    pub fn store_chat_message(&self, id: &str, role: &str, content: &str, context_json: Option<&str>) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO home_chat_history (id, role, content, context_json) VALUES (?1, ?2, ?3, ?4)",
            params![id, role, content, context_json],
        )?;
        Ok(())
    }

    pub fn get_chat_history(&self, limit: i64) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, role, content, timestamp, context_json FROM home_chat_history ORDER BY timestamp DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "role": row.get::<_, String>(1)?,
                "content": row.get::<_, String>(2)?,
                "timestamp": row.get::<_, String>(3)?,
                "context_json": row.get::<_, Option<String>>(4)?,
            }))
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        result.reverse();
        Ok(result)
    }

    pub fn get_bills_by_type_grouped(&self) -> Result<Vec<(String, Vec<f64>)>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT bill_type, amount FROM home_bills ORDER BY billing_month DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })?;
        let mut map: std::collections::HashMap<String, Vec<f64>> = std::collections::HashMap::new();
        for r in rows {
            let (bt, amt) = r?;
            map.entry(bt).or_default().push(amt);
        }
        Ok(map.into_iter().collect())
    }

    pub fn get_bills_rolling_avg(&self, _months: i64) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT bill_type,
                    (SELECT amount FROM home_bills b2 WHERE b2.bill_type = b1.bill_type ORDER BY billing_month DESC LIMIT 1) as current_amount,
                    AVG(amount) as avg_amount,
                    COUNT(*) as bill_count
             FROM home_bills b1
             GROUP BY bill_type
             HAVING bill_count >= 2"
        )?;
        let rows = stmt.query_map([], |row| {
            let bill_type: String = row.get(0)?;
            let current: f64 = row.get(1)?;
            let avg: f64 = row.get(2)?;
            let deviation = if avg > 0.0 { ((current - avg) / avg) * 100.0 } else { 0.0 };
            Ok(serde_json::json!({
                "bill_type": bill_type,
                "current_amount": current,
                "average_amount": avg,
                "deviation_percent": deviation,
                "is_anomalous": deviation.abs() > 20.0,
            }))
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn get_year_bills_summary(&self) -> Result<serde_json::Value> {
        let conn = self.conn();
        let twelve_months_ago = (chrono::Utc::now() - chrono::Duration::days(365)).format("%Y-%m").to_string();

        let total: f64 = conn.query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM home_bills WHERE billing_month >= ?1",
            params![twelve_months_ago], |row| row.get(0)
        ).unwrap_or(0.0);

        let mut cat_stmt = conn.prepare(
            "SELECT bill_type, SUM(amount) FROM home_bills WHERE billing_month >= ?1 GROUP BY bill_type ORDER BY SUM(amount) DESC"
        )?;
        let cat_rows = cat_stmt.query_map(params![twelve_months_ago], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })?;
        let mut by_category = serde_json::Map::new();
        for r in cat_rows {
            let (cat, amt) = r?;
            by_category.insert(cat, serde_json::json!(amt));
        }

        let mut month_stmt = conn.prepare(
            "SELECT billing_month, SUM(amount) FROM home_bills WHERE billing_month >= ?1 GROUP BY billing_month ORDER BY billing_month"
        )?;
        let month_rows = month_stmt.query_map(params![twelve_months_ago], |row| {
            Ok(serde_json::json!({
                "month": row.get::<_, String>(0)?,
                "total": row.get::<_, f64>(1)?,
            }))
        })?;
        let mut monthly_totals = Vec::new();
        for r in month_rows { monthly_totals.push(r?); }

        let highest = monthly_totals.iter().max_by(|a, b| a["total"].as_f64().unwrap_or(0.0).partial_cmp(&b["total"].as_f64().unwrap_or(0.0)).unwrap());
        let lowest = monthly_totals.iter().min_by(|a, b| a["total"].as_f64().unwrap_or(0.0).partial_cmp(&b["total"].as_f64().unwrap_or(0.0)).unwrap());
        let avg_monthly = if !monthly_totals.is_empty() { total / monthly_totals.len() as f64 } else { 0.0 };

        Ok(serde_json::json!({
            "total_spent": total,
            "by_category": by_category,
            "monthly_totals": monthly_totals,
            "highest_month": highest,
            "lowest_month": lowest,
            "average_monthly": avg_monthly,
        }))
    }

    // DREAM BUILDER
    pub fn add_dream(&self, id: &str, member_id: Option<&str>, title: &str, description: Option<&str>, category: &str, target_date: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        let mid = member_id.map(String::from);
        let desc = description.map(String::from);
        let td = target_date.map(String::from);
        conn.execute("INSERT INTO dreams (id, member_id, title, description, category, target_date, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![id, mid, title, desc, category, td, now])?;
        Ok(())
    }
    pub fn get_dreams(&self, member_id: &str, status: Option<&str>) -> Result<Vec<super::types::Dream>> {
        let conn = self.conn();
        let mapper = |row: &rusqlite::Row| -> rusqlite::Result<super::types::Dream> {
            Ok(super::types::Dream {
                id: row.get(0)?, member_id: row.get(1)?, title: row.get(2)?, description: row.get(3)?,
                category: row.get(4)?, target_date: row.get(5)?, status: row.get(6)?, progress: row.get(7)?,
                ai_plan: row.get(8)?, ai_next_actions: row.get(9)?, created_at: row.get(10)?, updated_at: row.get(11)?,
            })
        };
        let mut result = Vec::new();
        if let Some(s) = status {
            let mut stmt = conn.prepare("SELECT id, member_id, title, description, category, target_date, status, progress, ai_plan, ai_next_actions, created_at, updated_at FROM dreams WHERE member_id = ?1 AND status = ?2 ORDER BY created_at DESC")?;
            let rows = stmt.query_map(params![member_id, s], mapper)?;
            for r in rows { result.push(r?); }
        } else {
            let mut stmt = conn.prepare("SELECT id, member_id, title, description, category, target_date, status, progress, ai_plan, ai_next_actions, created_at, updated_at FROM dreams WHERE member_id = ?1 ORDER BY created_at DESC")?;
            let rows = stmt.query_map(params![member_id], mapper)?;
            for r in rows { result.push(r?); }
        }
        Ok(result)
    }
    pub fn add_milestone(&self, id: &str, dream_id: &str, member_id: &str, title: &str, description: Option<&str>, target_date: Option<&str>, sort_order: i64) -> Result<()> {
        let conn = self.conn();
        let desc = description.map(String::from);
        let td = target_date.map(String::from);
        conn.execute("INSERT INTO dream_milestones (id, dream_id, member_id, title, description, target_date, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, dream_id, member_id, title, desc, td, sort_order])?;
        Ok(())
    }
    pub fn get_milestones(&self, dream_id: &str, member_id: &str) -> Result<Vec<super::types::DreamMilestone>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, dream_id, title, description, target_date, completed_at, is_completed, sort_order, created_at FROM dream_milestones WHERE dream_id = ?1 AND member_id = ?2 ORDER BY sort_order")?;
        let rows = stmt.query_map(params![dream_id, member_id], |row: &rusqlite::Row| -> rusqlite::Result<super::types::DreamMilestone> {
            Ok(super::types::DreamMilestone {
                id: row.get(0)?, dream_id: row.get(1)?, title: row.get(2)?, description: row.get(3)?,
                target_date: row.get(4)?, completed_at: row.get(5)?, is_completed: row.get::<_, i64>(6)? != 0,
                sort_order: row.get(7)?, created_at: row.get(8)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    pub fn complete_milestone(&self, member_id: &str, id: &str) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute("UPDATE dream_milestones SET is_completed = 1, completed_at = ?1 WHERE id = ?2 AND member_id = ?3", params![now, id, member_id])?;
        Ok(())
    }
    pub fn add_dream_task(&self, id: &str, dream_id: &str, milestone_id: Option<&str>, member_id: &str, title: &str, description: Option<&str>, due_date: Option<&str>, frequency: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let mid = milestone_id.map(String::from);
        let desc = description.map(String::from);
        let dd = due_date.map(String::from);
        let freq = frequency.map(String::from);
        conn.execute("INSERT INTO dream_tasks (id, dream_id, milestone_id, member_id, title, description, due_date, frequency) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, dream_id, mid, member_id, title, desc, dd, freq])?;
        Ok(())
    }
    pub fn get_dream_tasks(&self, dream_id: &str, member_id: &str) -> Result<Vec<super::types::DreamTask>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, dream_id, milestone_id, title, description, due_date, completed_at, is_completed, frequency, created_at FROM dream_tasks WHERE dream_id = ?1 AND member_id = ?2 ORDER BY is_completed, due_date")?;
        let rows = stmt.query_map(params![dream_id, member_id], |row: &rusqlite::Row| -> rusqlite::Result<super::types::DreamTask> {
            Ok(super::types::DreamTask {
                id: row.get(0)?, dream_id: row.get(1)?, milestone_id: row.get(2)?, title: row.get(3)?,
                description: row.get(4)?, due_date: row.get(5)?, completed_at: row.get(6)?,
                is_completed: row.get::<_, i64>(7)? != 0, frequency: row.get(8)?, created_at: row.get(9)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    pub fn get_upcoming_dream_tasks(&self, dream_id: &str, member_id: &str, days: i64) -> Result<Vec<super::types::DreamTask>> {
        let conn = self.conn();
        let future = (chrono::Utc::now() + chrono::Duration::days(days)).format("%Y-%m-%d").to_string();
        let mut stmt = conn.prepare("SELECT id, dream_id, milestone_id, title, description, due_date, completed_at, is_completed, frequency, created_at FROM dream_tasks WHERE dream_id = ?1 AND member_id = ?2 AND is_completed = 0 AND due_date IS NOT NULL AND due_date <= ?3 ORDER BY due_date")?;
        let rows = stmt.query_map(params![dream_id, member_id, future], |row: &rusqlite::Row| -> rusqlite::Result<super::types::DreamTask> {
            Ok(super::types::DreamTask {
                id: row.get(0)?, dream_id: row.get(1)?, milestone_id: row.get(2)?, title: row.get(3)?,
                description: row.get(4)?, due_date: row.get(5)?, completed_at: row.get(6)?,
                is_completed: row.get::<_, i64>(7)? != 0, frequency: row.get(8)?, created_at: row.get(9)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    pub fn complete_dream_task(&self, member_id: &str, id: &str) -> Result<()> {
        let conn = self.conn();
        let now = Self::now();
        conn.execute("UPDATE dream_tasks SET is_completed = 1, completed_at = ?1 WHERE id = ?2 AND member_id = ?3", params![now, id, member_id])?;
        Ok(())
    }
    pub fn add_dream_progress(&self, id: &str, dream_id: &str, member_id: &str, note: Option<&str>, progress_change: Option<f64>, ai_insight: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let n = note.map(String::from);
        let ai = ai_insight.map(String::from);
        conn.execute("INSERT INTO dream_progress (id, dream_id, member_id, note, progress_change, ai_insight) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, dream_id, member_id, n, progress_change, ai])?;
        // Update dream progress
        if let Some(pc) = progress_change {
            conn.execute("UPDATE dreams SET progress = MIN(100, MAX(0, progress + ?1)), updated_at = ?2 WHERE id = ?3 AND member_id = ?4",
                params![pc, Self::now(), dream_id, member_id])?;
        }
        Ok(())
    }
    pub fn get_dream_progress(&self, dream_id: &str, member_id: &str) -> Result<Vec<super::types::DreamProgress>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, dream_id, note, progress_change, ai_insight, created_at FROM dream_progress WHERE dream_id = ?1 AND member_id = ?2 ORDER BY created_at DESC LIMIT 20")?;
        let rows = stmt.query_map(params![dream_id, member_id], |row: &rusqlite::Row| -> rusqlite::Result<super::types::DreamProgress> {
            Ok(super::types::DreamProgress {
                id: row.get(0)?, dream_id: row.get(1)?, note: row.get(2)?, progress_change: row.get(3)?,
                ai_insight: row.get(4)?, created_at: row.get(5)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    pub fn get_dream_dashboard(&self, member_id: &str) -> Result<super::types::DreamDashboard> {
        let all_dreams = self.get_dreams(member_id, None).unwrap_or_default();
        let active: Vec<_> = all_dreams.iter().filter(|d| d.status == "active").cloned().collect();
        let mut total_ms = 0i64;
        let mut completed_ms = 0i64;
        let mut all_tasks = Vec::new();
        let mut all_progress = Vec::new();
        for d in &all_dreams {
            let ms = self.get_milestones(&d.id, member_id).unwrap_or_default();
            total_ms += ms.len() as i64;
            completed_ms += ms.iter().filter(|m| m.is_completed).count() as i64;
            let tasks = self.get_upcoming_dream_tasks(&d.id, member_id, 30).unwrap_or_default();
            all_tasks.extend(tasks);
            let prog = self.get_dream_progress(&d.id, member_id).unwrap_or_default();
            all_progress.extend(prog);
        }
        all_tasks.sort_by(|a, b| a.due_date.as_deref().unwrap_or("9999").cmp(&b.due_date.as_deref().unwrap_or("9999")));
        Ok(super::types::DreamDashboard {
            dreams: all_dreams, active_dreams: active.len() as i64,
            total_milestones: total_ms, completed_milestones: completed_ms,
            upcoming_tasks: all_tasks.into_iter().take(10).collect(),
            recent_progress: all_progress.into_iter().take(10).collect(),
        })
    }
    pub fn update_dream_ai_plan(&self, id: &str, ai_plan: &str, ai_next_actions: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("UPDATE dreams SET ai_plan = ?1, ai_next_actions = ?2, updated_at = ?3 WHERE id = ?4",
            params![ai_plan, ai_next_actions, Self::now(), id])?;
        Ok(())
    }
    pub fn delete_dream(&self, member_id: &str, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM dream_tasks WHERE dream_id = ?1 AND member_id = ?2", params![id, member_id])?;
        conn.execute("DELETE FROM dream_milestones WHERE dream_id = ?1 AND member_id = ?2", params![id, member_id])?;
        conn.execute("DELETE FROM dream_progress WHERE dream_id IN (SELECT id FROM dreams WHERE id = ?1 AND member_id = ?2)", params![id, member_id])?;
        conn.execute("DELETE FROM dreams WHERE id = ?1 AND member_id = ?2", params![id, member_id])?;
        Ok(())
    }

    // ── Dreams: Horizon Extensions ──

    pub fn get_dream_velocity(&self, dream_id: &str, member_id: &str) -> Result<super::types::DreamVelocity> {
        let conn = self.conn();
        let milestones_total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM dream_milestones WHERE dream_id = ?1 AND member_id = ?2", params![dream_id, member_id], |r| r.get(0)
        ).unwrap_or(0);
        let milestones_completed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM dream_milestones WHERE dream_id = ?1 AND member_id = ?2 AND is_completed = 1", params![dream_id, member_id], |r| r.get(0)
        ).unwrap_or(0);
        let tasks_total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM dream_tasks WHERE dream_id = ?1 AND member_id = ?2", params![dream_id, member_id], |r| r.get(0)
        ).unwrap_or(0);
        let tasks_completed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM dream_tasks WHERE dream_id = ?1 AND member_id = ?2 AND is_completed = 1", params![dream_id, member_id], |r| r.get(0)
        ).unwrap_or(0);
        let progress_pct = if milestones_total > 0 {
            (milestones_completed as f64 / milestones_total as f64) * 100.0
        } else { 0.0 };
        let pace = if progress_pct >= 70.0 { "ahead" } else if progress_pct >= 40.0 { "on_track" } else { "behind" };
        // Get target date for days remaining
        let target: Option<String> = conn.query_row(
            "SELECT target_date FROM dreams WHERE id = ?1 AND member_id = ?2", params![dream_id, member_id], |r| r.get(0)
        ).ok().flatten();
        let days_remaining = target.and_then(|t| {
            chrono::NaiveDate::parse_from_str(&t, "%Y-%m-%d").ok().map(|td| {
                (td - chrono::Utc::now().date_naive()).num_days()
            })
        });
        Ok(super::types::DreamVelocity {
            dream_id: dream_id.to_string(),
            milestones_completed, milestones_total,
            tasks_completed, tasks_total,
            progress_pct,
            pace: pace.to_string(),
            days_remaining,
            estimated_completion: None,
        })
    }

    pub fn get_dream_timeline(&self, dream_id: &str, member_id: &str) -> Result<super::types::DreamTimeline> {
        let conn = self.conn();
        // Combine milestones into timeline
        let mut entries = Vec::new();
        let mut stmt = conn.prepare("SELECT title, is_completed, target_date, completed_at FROM dream_milestones WHERE dream_id = ?1 AND member_id = ?2 ORDER BY sort_order")?;
        let rows = stmt.query_map(params![dream_id, member_id], |row| {
            let title: String = row.get(0)?;
            let completed: bool = row.get::<_, i64>(1)? != 0;
            let date: Option<String> = if completed { row.get(3)? } else { row.get(2)? };
            Ok(super::types::TimelineEntry {
                date: date.unwrap_or_default(),
                event_type: "milestone".to_string(),
                title,
                completed,
            })
        })?;
        for r in rows { entries.push(r?); }
        let total = entries.len() as i64;
        let completed = entries.iter().filter(|e| e.completed).count() as i64;
        Ok(super::types::DreamTimeline {
            dream_id: dream_id.to_string(),
            entries, total_entries: total, completed_entries: completed,
        })
    }

    pub fn set_dream_progress(&self, member_id: &str, dream_id: &str, progress_pct: f64) -> Result<()> {
        let conn = self.conn();
        conn.execute("UPDATE dreams SET progress = ?1 WHERE id = ?2 AND member_id = ?3", params![progress_pct, dream_id, member_id])?;
        Ok(())
    }

    pub fn get_active_dreams_with_velocity(&self, member_id: &str) -> Result<Vec<(super::types::Dream, super::types::DreamVelocity)>> {
        let dreams = self.get_dreams(member_id, Some("active"))?;
        let mut result = Vec::new();
        for dream in dreams {
            let velocity = self.get_dream_velocity(&dream.id, member_id).unwrap_or(super::types::DreamVelocity {
                dream_id: dream.id.clone(), milestones_completed: 0, milestones_total: 0,
                tasks_completed: 0, tasks_total: 0, progress_pct: 0.0,
                pace: "behind".to_string(), days_remaining: None, estimated_completion: None,
            });
            result.push((dream, velocity));
        }
        Ok(result)
    }

    // AGENT DIARY
    pub fn add_diary_entry(&self, id: &str, agent_id: &str, entry_date: &str, title: Option<&str>,
        content: &str, mood: &str, topics_discussed: Option<&str>, memorable_moment: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let word_count = content.split_whitespace().count() as i64;
        let tt = title.map(String::from);
        let td = topics_discussed.map(String::from);
        let mm = memorable_moment.map(String::from);
        conn.execute(
            "INSERT INTO diary_entries (id, agent_id, entry_date, title, content, mood, topics_discussed, memorable_moment, word_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, agent_id, entry_date, tt, content, mood, td, mm, word_count])?;
        Ok(())
    }
    pub fn get_diary_entries(&self, agent_id: &str, limit: i64) -> Result<Vec<super::types::DiaryEntry>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, agent_id, entry_date, title, content, mood, topics_discussed, memorable_moment, word_count, created_at FROM diary_entries WHERE agent_id = ?1 ORDER BY entry_date DESC, created_at DESC LIMIT ?2")?;
        let rows = stmt.query_map(params![agent_id, limit], Self::map_diary_entry)?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    pub fn get_diary_entries_by_date(&self, date: &str) -> Result<Vec<super::types::DiaryEntry>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, agent_id, entry_date, title, content, mood, topics_discussed, memorable_moment, word_count, created_at FROM diary_entries WHERE entry_date = ?1 ORDER BY created_at DESC")?;
        let rows = stmt.query_map(params![date], Self::map_diary_entry)?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    pub fn get_all_diary_entries(&self, limit: i64) -> Result<Vec<super::types::DiaryEntry>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, agent_id, entry_date, title, content, mood, topics_discussed, memorable_moment, word_count, created_at FROM diary_entries ORDER BY entry_date DESC, created_at DESC LIMIT ?1")?;
        let rows = stmt.query_map(params![limit], Self::map_diary_entry)?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }
    fn map_diary_entry(row: &rusqlite::Row) -> rusqlite::Result<super::types::DiaryEntry> {
        Ok(super::types::DiaryEntry {
            id: row.get(0)?, agent_id: row.get(1)?, entry_date: row.get(2)?,
            title: row.get(3)?, content: row.get(4)?, mood: row.get(5)?,
            topics_discussed: row.get(6)?, memorable_moment: row.get(7)?,
            word_count: row.get(8)?, created_at: row.get(9)?,
        })
    }
    pub fn get_diary_dashboard(&self) -> Result<super::types::DiaryDashboard> {
        let (total, this_week, moods) = {
            let conn = self.conn();
            let total: i64 = conn.query_row("SELECT COUNT(*) FROM diary_entries", [], |row| row.get(0)).unwrap_or(0);
            let week_ago = (chrono::Utc::now() - chrono::Duration::days(7)).format("%Y-%m-%d").to_string();
            let this_week: i64 = conn.query_row("SELECT COUNT(*) FROM diary_entries WHERE entry_date >= ?1", params![week_ago], |row| row.get(0)).unwrap_or(0);
            let mut mood_stmt = conn.prepare("SELECT mood, COUNT(*) as cnt FROM diary_entries GROUP BY mood ORDER BY cnt DESC")?;
            let mood_rows = mood_stmt.query_map([], |row| -> rusqlite::Result<super::types::MoodCount> {
                Ok(super::types::MoodCount { mood: row.get(0)?, count: row.get(1)? })
            })?;
            let mut moods = Vec::new();
            for r in mood_rows { moods.push(r?); }
            (total, this_week, moods)
        }; // conn dropped here
        let latest = self.get_all_diary_entries(5).unwrap_or_default();
        let conn = self.conn();
        let mut agents_stmt = conn.prepare("SELECT DISTINCT agent_id FROM diary_entries ORDER BY agent_id")?;
        let agents_rows = agents_stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut agents = Vec::new();
        for r in agents_rows { agents.push(r?); }
        Ok(super::types::DiaryDashboard {
            total_entries: total, entries_this_week: this_week,
            mood_distribution: moods, most_active_agent: agents.first().cloned(),
            latest_entries: latest, agents_with_entries: agents,
        })
    }
    pub fn add_mood_log(&self, id: &str, agent_id: &str, mood: &str, intensity: i64, trigger: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let tr = trigger.map(String::from);
        conn.execute("INSERT INTO diary_mood_log (id, agent_id, mood, intensity, trigger_event) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, agent_id, mood, intensity, tr])?;
        Ok(())
    }

    // ── Echo Entries ──

    pub fn echo_create_entry(&self, req: &crate::commands::EchoWriteRequest) -> Result<crate::commands::EchoEntry> {
        let id = uuid::Uuid::new_v4().to_string();
        let tags_json = serde_json::to_string(&req.tags.clone().unwrap_or_default())?;
        let word_count = req.content.split_whitespace().count() as i32;
        let is_voice = req.is_voice.unwrap_or(false) as i32;
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO echo_entries (id, content, mood, tags, is_voice, word_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, req.content, req.mood, tags_json, is_voice, word_count, now, now],
        )?;
        Ok(crate::commands::EchoEntry {
            id,
            content: req.content.clone(),
            mood: req.mood.clone(),
            tags: req.tags.clone().unwrap_or_default(),
            is_voice: is_voice != 0,
            word_count,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn echo_get_entries(&self, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<crate::commands::EchoEntry>> {
        let limit = limit.unwrap_or(50);
        let offset = offset.unwrap_or(0);
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, content, mood, tags, is_voice, word_count, created_at, updated_at
             FROM echo_entries ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
        )?;
        let rows = stmt.query_map(params![limit, offset], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(crate::commands::EchoEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                mood: row.get(2)?,
                tags,
                is_voice: row.get::<_, i32>(4)? != 0,
                word_count: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn echo_get_entry(&self, id: &str) -> Result<Option<crate::commands::EchoEntry>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, content, mood, tags, is_voice, word_count, created_at, updated_at
             FROM echo_entries WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(crate::commands::EchoEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                mood: row.get(2)?,
                tags,
                is_voice: row.get::<_, i32>(4)? != 0,
                word_count: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        rows.next().transpose().map_err(Into::into)
    }

    pub fn echo_delete_entry(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM echo_entries WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn echo_get_stats(&self) -> Result<crate::commands::EchoDailyBrief> {
        let conn = self.conn();
        let total: i32 = conn.query_row("SELECT COUNT(*) FROM echo_entries", [], |r| r.get(0))?;

        // Entries today
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let mut stmt = conn.prepare(
            "SELECT id, content, mood, tags, is_voice, word_count, created_at, updated_at
             FROM echo_entries WHERE DATE(created_at) >= ?1 ORDER BY created_at DESC"
        )?;
        let today_rows = stmt.query_map(params![today], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(crate::commands::EchoEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                mood: row.get(2)?,
                tags,
                is_voice: row.get::<_, i32>(4)? != 0,
                word_count: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        let today_entries: Vec<_> = today_rows.collect::<Result<Vec<_>, _>>()?;

        let avg_words: f64 = conn.query_row(
            "SELECT COALESCE(AVG(word_count), 0) FROM echo_entries", [], |r| r.get(0)
        )?;

        // Simple streak: count consecutive days with entries
        let streak = conn.query_row(
            "SELECT COUNT(DISTINCT DATE(created_at)) FROM echo_entries WHERE created_at >= DATE('now', '-' || (
                SELECT COUNT(DISTINCT DATE(created_at)) FROM echo_entries
            ) || ' days')",
            [], |r| r.get::<_, i32>(0)
        ).unwrap_or(0);

        Ok(crate::commands::EchoDailyBrief {
            today_entries,
            total_entries: total,
            current_streak: streak,
            avg_words_per_entry: avg_words,
            top_mood: None,
            recent_themes: vec![],
        })
    }

    // ── Echo Patterns ──

    pub fn echo_get_patterns(&self) -> Result<Vec<crate::commands::EchoPattern>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, pattern_type, title, description, confidence, data_json, created_at
             FROM echo_patterns ORDER BY confidence DESC, created_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(crate::commands::EchoPattern {
                id: row.get(0)?,
                pattern_type: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                confidence: row.get(4)?,
                data_json: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn echo_create_pattern(&self, pattern_type: &str, title: &str, description: &str, confidence: f64, data_json: Option<&str>) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn();
        conn.execute(
            "INSERT INTO echo_patterns (id, pattern_type, title, description, confidence, data_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, pattern_type, title, description, confidence, data_json, now],
        )?;
        Ok(())
    }

    pub fn echo_get_entries_by_date(&self, date: &str) -> Result<Vec<crate::commands::EchoEntry>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, content, mood, tags, is_voice, word_count, created_at, updated_at
             FROM echo_entries WHERE DATE(created_at) = ?1 ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map(params![date], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(crate::commands::EchoEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                mood: row.get(2)?,
                tags,
                is_voice: row.get::<_, i32>(4)? != 0,
                word_count: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

// ============================================================
// VAULT — File Browser Methods
// ============================================================

fn get_conn() -> std::sync::MutexGuard<'static, Connection> {
    super::get_engine().db.conn()
}

pub fn vault_upsert_file(
    id: &str,
    path: &str,
    name: &str,
    file_type: &str,
    mime_type: Option<&str>,
    extension: Option<&str>,
    size_bytes: i64,
    thumbnail_path: Option<&str>,
    width: Option<i32>,
    height: Option<i32>,
    duration_secs: Option<f64>,
    created_by: Option<&str>,
    source_prompt: Option<&str>,
    description: Option<&str>,
) -> Result<()> {
    let conn = get_conn();
    conn.execute(
        "INSERT INTO vault_files (id, path, name, file_type, mime_type, extension, size_bytes, thumbnail_path, width, height, duration_secs, created_by, source_prompt, description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(path) DO UPDATE SET name=excluded.name, file_type=excluded.file_type, mime_type=excluded.mime_type, extension=excluded.extension, size_bytes=excluded.size_bytes, thumbnail_path=excluded.thumbnail_path, width=excluded.width, height=excluded.height, duration_secs=excluded.duration_secs, description=excluded.description, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![id, path, name, file_type, mime_type, extension, size_bytes, thumbnail_path, width, height, duration_secs, created_by, source_prompt, description],
    )?;
    Ok(())
}

pub fn vault_get_files(file_type_filter: Option<&str>, limit: i64, offset: i64) -> Result<Vec<super::types::VaultFile>> {
    let conn = get_conn();
    let query = match file_type_filter {
        Some(_) => "SELECT id, path, name, file_type, mime_type, extension, size_bytes, thumbnail_path, width, height, duration_secs, created_by, source_prompt, description, is_favorite, created_at, updated_at FROM vault_files WHERE file_type = ?1 ORDER BY updated_at DESC LIMIT ?2 OFFSET ?3",
        None => "SELECT id, path, name, file_type, mime_type, extension, size_bytes, thumbnail_path, width, height, duration_secs, created_by, source_prompt, description, is_favorite, created_at, updated_at FROM vault_files ORDER BY updated_at DESC LIMIT ?1 OFFSET ?2",
    };
    let mut stmt = conn.prepare(query)?;
    let rows = match file_type_filter {
        Some(ft) => stmt.query_map(params![ft, limit, offset], map_vault_file)?,
        None => stmt.query_map(params![limit, offset], map_vault_file)?,
    };
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn vault_search(query: &str, limit: i64) -> Result<Vec<super::types::VaultFile>> {
    let conn = get_conn();
    let search_pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, path, name, file_type, mime_type, extension, size_bytes, thumbnail_path, width, height, duration_secs, created_by, source_prompt, description, is_favorite, created_at, updated_at
         FROM vault_files
         WHERE name LIKE ?1 OR description LIKE ?1 OR source_prompt LIKE ?1
         ORDER BY updated_at DESC LIMIT ?2"
    )?;
    let rows = stmt.query_map(params![search_pattern, limit], |row| map_vault_file(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn vault_get_file_by_id(id: &str) -> Result<Option<super::types::VaultFile>> {
    let conn = get_conn();
    let mut stmt = conn.prepare(
        "SELECT id, path, name, file_type, mime_type, extension, size_bytes, thumbnail_path, width, height, duration_secs, created_by, source_prompt, description, is_favorite, created_at, updated_at FROM vault_files WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| map_vault_file(row))?;
    rows.next().transpose().map_err(Into::into)
}

pub fn vault_delete_file(id: &str) -> Result<()> {
    let conn = get_conn();
    conn.execute("DELETE FROM vault_files WHERE id = ?", params![id])?;
    Ok(())
}

pub fn vault_toggle_favorite(id: &str) -> Result<()> {
    let conn = get_conn();
    conn.execute("UPDATE vault_files SET is_favorite = CASE WHEN is_favorite = 0 THEN 1 ELSE 0 END WHERE id = ?", params![id])?;
    Ok(())
}

pub fn vault_get_recent(limit: i64) -> Result<Vec<super::types::VaultFile>> {
    let conn = get_conn();
    let mut stmt = conn.prepare(
        "SELECT id, path, name, file_type, mime_type, extension, size_bytes, thumbnail_path, width, height, duration_secs, created_by, source_prompt, description, is_favorite, created_at, updated_at FROM vault_files ORDER BY created_at DESC LIMIT ?1"
    )?;
    let rows = stmt.query_map(params![limit], |row| map_vault_file(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn vault_get_favorites() -> Result<Vec<super::types::VaultFile>> {
    let conn = get_conn();
    let mut stmt = conn.prepare(
        "SELECT id, path, name, file_type, mime_type, extension, size_bytes, thumbnail_path, width, height, duration_secs, created_by, source_prompt, description, is_favorite, created_at, updated_at FROM vault_files WHERE is_favorite = 1 ORDER BY updated_at DESC"
    )?;
    let rows = stmt.query_map([], |row| map_vault_file(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn map_vault_file(row: &rusqlite::Row) -> rusqlite::Result<super::types::VaultFile> {
    Ok(super::types::VaultFile {
        id: row.get(0)?,
        path: row.get(1)?,
        name: row.get(2)?,
        file_type: row.get(3)?,
        mime_type: row.get(4)?,
        extension: row.get(5)?,
        size_bytes: row.get(6)?,
        thumbnail_path: row.get(7)?,
        width: row.get(8)?,
        height: row.get(9)?,
        duration_secs: row.get(10)?,
        created_by: row.get(11)?,
        source_prompt: row.get(12)?,
        description: row.get(13)?,
        is_favorite: row.get::<_, i64>(14)? != 0,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

// --- Projects ---

pub fn vault_create_project(id: &str, name: &str, description: Option<&str>, project_type: Option<&str>) -> Result<()> {
    let conn = get_conn();
    conn.execute(
        "INSERT INTO vault_projects (id, name, description, project_type) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, description, project_type],
    )?;
    Ok(())
}

pub fn vault_get_projects() -> Result<Vec<super::types::VaultProject>> {
    let conn = get_conn();
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.description, p.project_type, p.cover_file_id, p.is_archived, p.created_at, p.updated_at, COUNT(pf.file_id) as file_count
         FROM vault_projects p
         LEFT JOIN vault_project_files pf ON p.id = pf.project_id
         WHERE p.is_archived = 0
         GROUP BY p.id
         ORDER BY p.updated_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(super::types::VaultProject {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            project_type: row.get(3)?,
            cover_file_id: row.get(4)?,
            is_archived: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            file_count: Some(row.get(8)?),
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn vault_get_project_detail(project_id: &str) -> Result<Option<super::types::VaultProjectDetail>> {
    let conn = get_conn();
    let project = conn.query_row(
        "SELECT id, name, description, project_type, cover_file_id, is_archived, created_at, updated_at FROM vault_projects WHERE id = ?1",
        params![project_id],
        |row| {
            Ok(super::types::VaultProject {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                project_type: row.get(3)?,
                cover_file_id: row.get(4)?,
                is_archived: row.get::<_, i64>(5)? != 0,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                file_count: None,
            })
        },
    );
    match project {
        Ok(p) => {
            let mut stmt = conn.prepare(
                "SELECT f.id, f.path, f.name, f.file_type, f.mime_type, f.extension, f.size_bytes, f.thumbnail_path, f.width, f.height, f.duration_secs, f.created_by, f.source_prompt, f.description, f.is_favorite, f.created_at, f.updated_at
                 FROM vault_files f
                 JOIN vault_project_files pf ON f.id = pf.file_id
                 WHERE pf.project_id = ?1
                 ORDER BY pf.added_at DESC"
            )?;
            let rows = stmt.query_map(params![project_id], |row| map_vault_file(row))?;
            let files = rows.collect::<Result<Vec<_>, _>>()?;
            Ok(Some(super::types::VaultProjectDetail { project: p, files }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn vault_add_file_to_project(project_id: &str, file_id: &str, role: Option<&str>) -> Result<()> {
    let conn = get_conn();
    conn.execute(
        "INSERT OR IGNORE INTO vault_project_files (project_id, file_id, role) VALUES (?1, ?2, ?3)",
        params![project_id, file_id, role],
    )?;
    Ok(())
}

pub fn vault_remove_file_from_project(project_id: &str, file_id: &str) -> Result<()> {
    let conn = get_conn();
    conn.execute("DELETE FROM vault_project_files WHERE project_id = ?1 AND file_id = ?2", params![project_id, file_id])?;
    Ok(())
}

pub fn vault_delete_project(id: &str) -> Result<()> {
    let conn = get_conn();
    conn.execute("DELETE FROM vault_projects WHERE id = ?", params![id])?;
    Ok(())
}

// --- Tags ---

pub fn vault_upsert_tag(id: &str, name: &str, color: Option<&str>, tag_type: &str) -> Result<()> {
    let conn = get_conn();
    conn.execute(
        "INSERT INTO vault_tags (id, name, color, tag_type) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(name) DO UPDATE SET color=excluded.color",
        params![id, name, color, tag_type],
    )?;
    Ok(())
}

pub fn vault_tag_file(file_id: &str, tag_id: &str) -> Result<()> {
    let conn = get_conn();
    conn.execute("INSERT OR IGNORE INTO vault_file_tags (file_id, tag_id) VALUES (?1, ?2)", params![file_id, tag_id])?;
    Ok(())
}

pub fn vault_untag_file(file_id: &str, tag_id: &str) -> Result<()> {
    let conn = get_conn();
    conn.execute("DELETE FROM vault_file_tags WHERE file_id = ?1 AND tag_id = ?2", params![file_id, tag_id])?;
    Ok(())
}

pub fn vault_get_tags() -> Result<Vec<super::types::VaultTag>> {
    let conn = get_conn();
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, t.tag_type, COUNT(ft.file_id) as file_count
         FROM vault_tags t
         LEFT JOIN vault_file_tags ft ON t.id = ft.tag_id
         GROUP BY t.id
         ORDER BY file_count DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(super::types::VaultTag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            tag_type: row.get(3)?,
            file_count: Some(row.get(4)?),
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn vault_get_stats() -> Result<(i64, i64, i64)> {  // (total_files, total_size, total_projects)
    let conn = get_conn();
    let total_files: i64 = conn.query_row("SELECT COUNT(*) FROM vault_files", [], |r| r.get(0))?;
    let total_size: i64 = conn.query_row("SELECT COALESCE(SUM(size_bytes), 0) FROM vault_files", [], |r| r.get(0))?;
    let total_projects: i64 = conn.query_row("SELECT COUNT(*) FROM vault_projects WHERE is_archived = 0", [], |r| r.get(0))?;
    Ok((total_files, total_size, total_projects))
}

// ============================================================
// STUDIO — Creator Workspace
// ============================================================

pub fn studio_create_generation(id: &str, module: &str, prompt: &str, model: &str, provider: &str) -> Result<()> {
    let conn = get_conn();
    conn.execute(
        "INSERT INTO studio_generations (id, module, prompt, model, provider, status) VALUES (?1, ?2, ?3, ?4, ?5, 'pending')",
        params![id, module, prompt, model, provider],
    )?;
    Ok(())
}

pub fn studio_update_generation_status(id: &str, status: &str, output_path: Option<&str>, output_url: Option<&str>, metadata_json: Option<&str>, cost_cents: i64) -> Result<()> {
    let conn = get_conn();
    conn.execute(
        "UPDATE studio_generations SET status = ?1, output_path = ?2, output_url = ?3, metadata_json = ?4, cost_cents = ?5 WHERE id = ?6",
        params![status, output_path, output_url, metadata_json, cost_cents, id],
    )?;
    Ok(())
}

pub fn studio_get_generations(module: Option<&str>, limit: i64) -> Result<Vec<super::types::StudioGeneration>> {
    let conn = get_conn();
    if let Some(m) = module {
        let mut stmt = conn.prepare(
            "SELECT id, module, prompt, remix_of, model, provider, status, output_path, output_url, metadata_json, cost_cents, vault_file_id, created_at FROM studio_generations WHERE module = ?1 ORDER BY created_at DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![m, limit], |row| {
            Ok(super::types::StudioGeneration {
                id: row.get(0)?,
                module: row.get(1)?,
                prompt: row.get(2)?,
                remix_of: row.get(3)?,
                model: row.get(4)?,
                provider: row.get(5)?,
                status: row.get(6)?,
                output_path: row.get(7)?,
                output_url: row.get(8)?,
                metadata_json: row.get(9)?,
                cost_cents: row.get(10)?,
                vault_file_id: row.get(11)?,
                created_at: row.get(12)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, module, prompt, remix_of, model, provider, status, output_path, output_url, metadata_json, cost_cents, vault_file_id, created_at FROM studio_generations ORDER BY created_at DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(super::types::StudioGeneration {
                id: row.get(0)?,
                module: row.get(1)?,
                prompt: row.get(2)?,
                remix_of: row.get(3)?,
                model: row.get(4)?,
                provider: row.get(5)?,
                status: row.get(6)?,
                output_path: row.get(7)?,
                output_url: row.get(8)?,
                metadata_json: row.get(9)?,
                cost_cents: row.get(10)?,
                vault_file_id: row.get(11)?,
                created_at: row.get(12)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

pub fn studio_get_generation(id: &str) -> Result<Option<super::types::StudioGeneration>> {
    let conn = get_conn();
    let result = conn.query_row(
        "SELECT id, module, prompt, remix_of, model, provider, status, output_path, output_url, metadata_json, cost_cents, vault_file_id, created_at FROM studio_generations WHERE id = ?1",
        params![id],
        |row| {
            Ok(super::types::StudioGeneration {
                id: row.get(0)?,
                module: row.get(1)?,
                prompt: row.get(2)?,
                remix_of: row.get(3)?,
                model: row.get(4)?,
                provider: row.get(5)?,
                status: row.get(6)?,
                output_path: row.get(7)?,
                output_url: row.get(8)?,
                metadata_json: row.get(9)?,
                cost_cents: row.get(10)?,
                vault_file_id: row.get(11)?,
                created_at: row.get(12)?,
            })
        },
    );
    match result {
        Ok(gen) => Ok(Some(gen)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn studio_delete_generation(id: &str) -> Result<()> {
    let conn = get_conn();
    conn.execute("DELETE FROM studio_generations WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn studio_link_vault_file(generation_id: &str, vault_file_id: &str) -> Result<()> {
    let conn = get_conn();
    conn.execute(
        "UPDATE studio_generations SET vault_file_id = ?1 WHERE id = ?2",
        params![vault_file_id, generation_id],
    )?;
    Ok(())
}

pub fn studio_upsert_prompt(prompt: &str, module: &str) -> Result<()> {
    let conn = get_conn();
    // Check if prompt already exists for this module
    let existing = conn.query_row(
        "SELECT id FROM studio_prompts WHERE prompt = ?1 AND module = ?2",
        params![prompt, module],
        |row| row.get::<_, String>(0),
    );
    match existing {
        Ok(id) => {
            conn.execute(
                "UPDATE studio_prompts SET use_count = use_count + 1, last_used = datetime('now') WHERE id = ?1",
                params![id],
            )?;
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            conn.execute(
                "INSERT INTO studio_prompts (id, prompt, module, use_count, last_used) VALUES (?1, ?2, ?3, 1, datetime('now'))",
                params![uuid::Uuid::new_v4().to_string(), prompt, module],
            )?;
        }
        Err(e) => return Err(e.into()),
    }
    Ok(())
}

pub fn studio_get_prompts(module: Option<&str>, limit: i64) -> Result<Vec<super::types::StudioPromptHistory>> {
    let conn = get_conn();
    if let Some(m) = module {
        let mut stmt = conn.prepare(
            "SELECT id, prompt, module, use_count, last_used FROM studio_prompts WHERE module = ?1 ORDER BY last_used DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![m, limit], |row| {
            Ok(super::types::StudioPromptHistory {
                id: row.get(0)?,
                prompt: row.get(1)?,
                module: row.get(2)?,
                use_count: row.get(3)?,
                last_used: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, prompt, module, use_count, last_used FROM studio_prompts ORDER BY last_used DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(super::types::StudioPromptHistory {
                id: row.get(0)?,
                prompt: row.get(1)?,
                module: row.get(2)?,
                use_count: row.get(3)?,
                last_used: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

pub fn studio_update_usage(user_id: &str, month: &str, module: &str, cost_cents: i64) -> Result<()> {
    let conn = get_conn();
    conn.execute(
        "INSERT INTO studio_usage (id, user_id, month, module, generation_count, total_cost_cents)
         VALUES (?1, ?2, ?3, ?4, 1, ?5)
         ON CONFLICT(user_id, month, module) DO UPDATE SET generation_count = generation_count + 1, total_cost_cents = total_cost_cents + ?5",
        params![uuid::Uuid::new_v4().to_string(), user_id, month, module, cost_cents],
    )?;
    Ok(())
}

pub fn studio_get_usage(user_id: &str, month: &str) -> Result<Vec<super::types::StudioUsageStats>> {
    let conn = get_conn();
    let mut stmt = conn.prepare(
        "SELECT id, user_id, month, module, generation_count, total_cost_cents FROM studio_usage WHERE user_id = ?1 AND month = ?2"
    )?;
    let rows = stmt.query_map(params![user_id, month], |row| {
        Ok(super::types::StudioUsageStats {
            id: row.get(0)?,
            user_id: row.get(1)?,
            month: row.get(2)?,
            module: row.get(3)?,
            generation_count: row.get(4)?,
            total_cost_cents: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}


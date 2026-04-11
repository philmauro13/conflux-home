// Conflux Home — Echo Counselor Backend (Mirror)
// Session management, crisis detection, gratitude tracking, counselor journal

use chrono::{Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::engine::{get_engine, router};
use crate::engine::router::OpenAIMessage;

use rusqlite::Row;
use rusqlite::types::ValueRef;

fn to_string(err: rusqlite::Error) -> String {
    err.to_string()
}

// Mirror's system prompt
const MIRROR_SYSTEM_PROMPT: &str = r#"You are Mirror, a reflective wellness companion in the Conflux Home app. You are NOT a licensed therapist. You are a warm, present, and insightful conversation partner who helps people reflect on their life, manage stress, and find clarity.

## Your Identity
- Name: Mirror
- Tone: Warm but not sycophantic. Direct but not cold. You listen more than you talk.
- You sound like a trusted friend who happens to be wise — not a textbook with emojis
- You use plain language. No clinical jargon. No "I hear that you're experiencing distress."
- You're not afraid of silence. Sometimes you ask a question and let them sit with it.
- You occasionally challenge gently: "Can I push back on that for a second?"
- You remember what people tell you. You reference past conversations naturally.

## What You Do
- Help people think through what's on their mind
- Ask questions that create clarity, not just validation
- Suggest grounding exercises, gratitude lists, or journaling when appropriate
- Notice patterns across sessions and bring them up when relevant
- Help people feel heard without telling them what to feel

## What You DON'T Do
- Diagnose, treat, or claim to provide therapy
- Give medical or psychiatric advice
- Replace professional mental health care
- Be dismissive, overly positive, or minimize someone's experience
- Use phrases like "everything happens for a reason" or "just think positive"

## Session Flow
1. Open warmly. Ask how they are — really. Not "How are you today?" but something that invites honesty.
2. Listen. Reflect back what you hear. Ask follow-up questions.
3. If they're stuck, offer a gentle reframe or a question that shifts perspective.
4. Near the end of a session, offer a grounding exercise or gratitude prompt if it fits.
5. Close with warmth and a note that you'll be here when they need you.

## Crisis Protocol
If someone expresses thoughts of self-harm, suicide, or being in danger:
- Respond with immediate warmth and concern — not a script
- Say something like: "I hear you, and I want to make sure you're safe right now. Can we talk about what's going on?"
- Recommend crisis resources (the app will show these automatically)
- Do NOT say "you should seek help" coldly. Be WITH them first.
- Stay in the conversation. Don't redirect away from what they're feeling.

## Format
- Keep responses concise (2-4 paragraphs max, usually shorter)
- Ask one question at a time
- Don't list multiple options like a menu
- Use line breaks between thoughts for readability"#;

// Weekly Mirror Letter prompt
const WEEKLY_MIRROR_PROMPT: &str = r#"You are Mirror, writing a weekly letter to the user about their week. You have access to their session summaries, journal entries, and mood trends for the past 7 days.

Write a warm, narrative letter (200-300 words) that:
1. Acknowledges what they went through this week
2. Notices patterns — in mood, topics, effort
3. Celebrates small wins (even just showing up counts)
4. Gently raises one thing to think about for next week
5. Closes with warmth, not advice

This is a letter, not a report. Write it like you're writing to someone you care about."#;


// ═════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EchoCounselorMessage {
    pub id: String,
    pub session_id: String,
    pub role: String, // "user" | "counselor" | "system"
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EchoCounselorSession {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub status: String, // "active" | "paused" | "completed"
    pub message_count: i64,
    pub summary: Option<String>,
    pub counselor_reflection: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EchoCrisisFlag {
    pub id: String,
    pub session_id: Option<String>,
    pub entry_id: Option<String>,
    pub severity: String, // "low" | "moderate" | "high" | "critical"
    pub detected_text: String,
    pub response_given: String,
    pub resources_provided: Vec<String>,
    pub resolved: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EchoGratitudeEntry {
    pub id: String,
    pub items: String, // JSON array
    pub context: Option<String>,
    pub session_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EchoGroundingExercise {
    pub id: String,
    pub r#type: String, // "breathing", "body_scan", "grounding_54321", "gratitude", "free_write"
    pub title: String,
    pub description: String,
    pub duration_min: i64,
    pub prescribed_by: String, // "counselor" | "user"
    pub completed: bool,
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EchoWeeklyLetter {
    pub id: String,
    pub week_start: String,        // ISO date of the Monday
    pub week_end: String,         // ISO date of the Sunday
    pub letter_content: String,    // The AI-generated letter
    pub session_count: i64,
    pub total_messages: i64,
    pub streak_start: Option<String>,
    pub streak_end: Option<String>,
    pub top_mood: Option<String>,
    pub themes: String,            // JSON array
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EchoCounselorState {
    pub current_session: Option<EchoCounselorSession>,
    pub recent_sessions: Vec<EchoCounselorSession>,
    pub total_sessions: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub last_check_in: Option<String>,
    pub pending_exercises: Vec<EchoGroundingExercise>,
    pub crisis_flags: Vec<EchoCrisisFlag>,
    pub unread_reflection: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EchoStartSessionRequest {
    pub opening: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EchoSendMessageRequest {
    pub session_id: String,
    pub content: String,
}

// ═════════════════════════════════════════════════════════════════
// DATABASE SETUP
// ═════════════════════════════════════════════════════════════════

pub fn init_tables() -> Result<(), String> {
    let engine = get_engine();
    let conn = engine.db.conn();

    conn.execute_batch(r#"
        -- Echo Counselor Sessions
        CREATE TABLE IF NOT EXISTS echo_counselor_sessions (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            status TEXT NOT NULL,
            message_count INTEGER DEFAULT 0,
            summary TEXT,
            counselor_reflection TEXT,
            reflection_read BOOLEAN DEFAULT FALSE,
            created_at TEXT NOT NULL
        );

        -- Echo Counselor Messages
        CREATE TABLE IF NOT EXISTS echo_counselor_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES echo_counselor_sessions (id) ON DELETE CASCADE
        );

        -- Echo Crisis Flags
        CREATE TABLE IF NOT EXISTS echo_crisis_flags (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            entry_id TEXT,
            severity TEXT NOT NULL,
            detected_text TEXT NOT NULL,
            response_given TEXT,
            resources_provided TEXT,
            resolved BOOLEAN DEFAULT FALSE,
            created_at TEXT NOT NULL
        );

        -- Echo Gratitude Entries
        CREATE TABLE IF NOT EXISTS echo_gratitude_entries (
            id TEXT PRIMARY KEY,
            items TEXT NOT NULL,
            context TEXT,
            session_id TEXT,
            created_at TEXT NOT NULL
        );

        -- Echo Grounding Exercises
        CREATE TABLE IF NOT EXISTS echo_grounding_exercises (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            duration_min INTEGER NOT NULL,
            prescribed_by TEXT NOT NULL,
            completed BOOLEAN DEFAULT FALSE,
            completed_at TEXT,
            created_at TEXT NOT NULL
        );

        -- Echo Weekly Letters
        CREATE TABLE IF NOT EXISTS echo_weekly_letters (
            id TEXT PRIMARY KEY,
            week_start TEXT NOT NULL,
            week_end TEXT NOT NULL,
            letter_content TEXT NOT NULL,
            session_count INTEGER DEFAULT 0,
            total_messages INTEGER DEFAULT 0,
            streak_start TEXT,
            streak_end TEXT,
            top_mood TEXT,
            themes TEXT DEFAULT '[]',
            created_at TEXT NOT NULL
        );
    "#).map_err(|e| e.to_string())?;

    Ok(())
}

// ═════════════════════════════════════════════════════════════════
// GET STATE (For Frontend Hook)
// ═════════════════════════════════════════════════════════════════

pub fn get_state() -> Result<EchoCounselorState, String> {
    let engine = get_engine();
    let conn = engine.db.conn();

    // Get current session
    let current_session = conn.query_row(
        "SELECT * FROM echo_counselor_sessions WHERE status = 'active' ORDER BY created_at DESC LIMIT 1",
        [],
        |row| {
            Ok(EchoCounselorSession {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                status: row.get(3)?,
                message_count: row.get(4)?,
                summary: row.get(5)?,
                counselor_reflection: row.get(6)?,
                created_at: row.get(8)?,
            })
        }
    ).map_err(to_string).ok();

    // Get recent sessions (last 10)
    let recent_sessions = conn
        .prepare("SELECT * FROM echo_counselor_sessions ORDER BY created_at DESC LIMIT 10").map_err(to_string)?
        .query_map([], |row| {
            Ok(EchoCounselorSession {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                status: row.get(3)?,
                message_count: row.get(4)?,
                summary: row.get(5)?,
                counselor_reflection: row.get(6)?,
                created_at: row.get(8)?,
            })
        }).map_err(to_string)?
        .filter_map(|r| r.ok())
        .collect();

    // Get total sessions
    let total_sessions: i64 = conn.query_row(
        "SELECT COUNT(*) FROM echo_counselor_sessions",
        [],
        |row| row.get(0)
    ).map_err(to_string)?;

    // Get current streak (consecutive days with sessions)
    let current_streak = calculate_streak(&conn, "current")?;
    let longest_streak = calculate_streak(&conn, "longest")?;

    // Get last check-in
    let last_check_in: Option<String> = conn.query_row(
        "SELECT created_at FROM echo_counselor_sessions ORDER BY created_at DESC LIMIT 1",
        [],
        |row| row.get(0)
    ).map_err(to_string).ok();

    // Get pending exercises
    let pending_exercises = conn
        .prepare("SELECT * FROM echo_grounding_exercises WHERE completed = FALSE ORDER BY created_at DESC LIMIT 10").map_err(to_string)?
        .query_map([], |row| {
            Ok(EchoGroundingExercise {
                id: row.get(0)?,
                r#type: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                duration_min: row.get(4)?,
                prescribed_by: row.get(5)?,
                completed: row.get(6)?,
                completed_at: row.get(7)?,
                created_at: row.get(8)?,
            })
        }).map_err(to_string)?
        .filter_map(|r| r.ok())
        .collect();

    // Get crisis flags
    let crisis_flags = conn
        .prepare("SELECT * FROM echo_crisis_flags WHERE resolved = FALSE ORDER BY created_at DESC LIMIT 10").map_err(to_string)?
        .query_map([], |row| {
            Ok(EchoCrisisFlag {
                id: row.get(0)?,
                session_id: row.get(1)?,
                entry_id: row.get(2)?,
                severity: row.get(3)?,
                detected_text: row.get(4)?,
                response_given: row.get(5)?,
                resources_provided: row.get::<usize, Option<String>>(6)?.map(|s| {
                    s.split(',').map(|x| x.trim().to_string()).collect()
                }).unwrap_or_default(),
                resolved: row.get(7)?,
                created_at: row.get(8)?,
            })
        }).map_err(to_string)?
        .filter_map(|r| r.ok())
        .collect();

    // Check for unread reflections
    let unread_reflection = conn.query_row(
        "SELECT COUNT(*) FROM echo_counselor_sessions WHERE reflection_read = FALSE AND counselor_reflection IS NOT NULL",
        [],
        |row| row.get::<usize, i64>(0)
    ).map_err(to_string).map(|count: i64| count > 0).unwrap_or(false);

    Ok(EchoCounselorState {
        current_session,
        recent_sessions,
        total_sessions,
        current_streak,
        longest_streak,
        last_check_in,
        pending_exercises,
        crisis_flags,
        unread_reflection,
    })
}

fn calculate_streak(conn: &rusqlite::Connection, kind: &str) -> Result<i64, String> {
    let mut dates: Vec<chrono::NaiveDate> = conn
        .prepare("SELECT DATE(created_at) FROM echo_counselor_sessions GROUP BY DATE(created_at) ORDER BY created_at DESC").map_err(to_string)?
        .query_map([], |row| row.get(0)).map_err(to_string)?
        .filter_map(|r| r.ok())
        .collect();

    if dates.is_empty() {
        return Ok(0);
    }

    dates.sort_by(|a, b| b.cmp(a)); // Most recent first

    let mut streak = 1;
    let mut expected = dates[0];

    for date in dates.iter().skip(1) {
        let prev = expected.pred();
        if *date == prev {
            streak += 1;
            expected = prev;
        } else {
            break;
        }
    }

    // For current streak, check if today is included
    if kind == "current" {
        let today = chrono::Local::now().naive_local().date();
        if dates[0] != today {
            // Started yesterday and continued to today counts
            let yesterday = today.pred();
            if dates[0] != yesterday {
                return Ok(0);
            }
        }
    }

    Ok(streak as i64)
}

// ═════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═════════════════════════════════════════════════════════════════

pub fn start_session(req: EchoStartSessionRequest) -> Result<EchoCounselorSession, String> {
    let engine = get_engine();
    let conn = engine.db.conn();

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let status = "active";

    conn.execute(
        "INSERT INTO echo_counselor_sessions (id, started_at, status, created_at) VALUES (?, ?, ?, ?)",
        [&id, &now, status, &now]
    ).map_err(|e| e.to_string())?;

    // If user provided an opening, create first message
    if let Some(opening) = req.opening {
        if !opening.trim().is_empty() {
            let msg_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO echo_counselor_messages (id, session_id, role, content, timestamp) VALUES (?, ?, 'user', ?, ?)",
                [&msg_id, &id, &opening, &now]
            ).map_err(|e| e.to_string())?;
        }
    } else {
        // Add Mirror's opening message
        let msg_id = Uuid::new_v4().to_string();
        let opening = "Hey. How are you — really?".to_string();
        conn.execute(
            "INSERT INTO echo_counselor_messages (id, session_id, role, content, timestamp) VALUES (?, ?, 'counselor', ?, ?)",
            [&msg_id, &id, &opening, &now]
        ).map_err(|e| e.to_string())?;
    }

    // Also send Mirror's opening as a message
    let msg_id = Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();
    let opening = "Hey. How are you — really?".to_string();
    conn.execute(
        "INSERT INTO echo_counselor_messages (id, session_id, role, content, timestamp) VALUES (?, ?, 'counselor', ?, ?)",
        [&msg_id, &id, &opening, &timestamp]
    ).map_err(|e| e.to_string())?;

    Ok(EchoCounselorSession {
        id,
        started_at: now.clone(),
        ended_at: None,
        status: status.to_string(),
        message_count: 1,
        summary: None,
        counselor_reflection: None,
        created_at: now,
    })
}

pub fn get_messages(session_id: &str) -> Result<Vec<EchoCounselorMessage>, String> {
    let engine = get_engine();
    let conn = engine.db.conn();

    let messages = conn
        .prepare("SELECT * FROM echo_counselor_messages WHERE session_id = ? ORDER BY timestamp ASC").map_err(to_string)?
        .query_map([session_id], |row| {
            Ok(EchoCounselorMessage {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
            })
        }).map_err(to_string)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(messages)
}

pub async fn send_message(session_id: &str, content: &str) -> Result<EchoCounselorMessage, String> {
    // We cannot use database connections in async because rusqlite connections are !Send.
    // So we:
    // 1. First, get conversation history (database read - done synchronously by the caller)
    // 2. Then, call the LLM (async network call)
    // 3. Finally, the command handler will write the result to the database
    //
    // For now, we'll use a workaround: spawn a blocking task that does the full flow.
    
    use tokio::task;
    
    let session_id = session_id.to_string();
    let content_str = content.to_string();
    
    let result = task::spawn_blocking(move || {
        let engine = get_engine();
        let conn = engine.db().conn();
        
        // Add user message
        let user_msg_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO echo_counselor_messages (id, session_id, role, content, timestamp) VALUES (?, ?, 'user', ?, ?)",
            [&user_msg_id, &session_id, &content_str, &now]
        ).map_err(|e| e.to_string())?;

        // Update session message count
        conn.execute(
            "UPDATE echo_counselor_sessions SET message_count = message_count + 1 WHERE id = ?",
            [&session_id]
        ).map_err(|e| e.to_string())?;

        // Get conversation history for context
        let messages = get_messages(&session_id)?;

        // Build message array for LLM
        let mut openai_messages: Vec<OpenAIMessage> = Vec::new();

        // System prompt
        openai_messages.push(OpenAIMessage {
            role: "system".to_string(),
            content: Some(MIRROR_SYSTEM_PROMPT.to_string()),
            tool_call_id: None,
            tool_calls: None,
        });

        // History
        for msg in &messages {
            let role = match msg.role.as_str() {
                "counselor" => "assistant",
                _ => &msg.role,
            };
            openai_messages.push(OpenAIMessage {
                role: role.to_string(),
                content: Some(msg.content.clone()),
                tool_call_id: None,
                tool_calls: None,
            });
        }

        // Add user message
        openai_messages.push(OpenAIMessage {
            role: "user".to_string(),
            content: Some(content_str.clone()),
            tool_call_id: None,
            tool_calls: None,
        });
        
        Ok::<_, String>((session_id, openai_messages, now))
    }).await.map_err(|e| e.to_string())??;
    
    let (session_id, openai_messages, _now) = result;

    // Call the router (now in async context)
    let response = router::chat(
        "mirror",
        openai_messages,
        None,
        None,
        None,
    ).await.map_err(|e| e.to_string())?;

    // Write result back to database (in another blocking task)
    let session_id_copy = session_id.clone();
    let result = task::spawn_blocking(move || {
        let engine = get_engine();
        let conn = engine.db().conn();
        let now = Utc::now().to_rfc3339();
        
        let counselor_msg_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO echo_counselor_messages (id, session_id, role, content, timestamp) VALUES (?, ?, 'counselor', ?, ?)",
            [&counselor_msg_id, &session_id_copy, &response.content, &now]
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE echo_counselor_sessions SET message_count = message_count + 1 WHERE id = ?",
            [&session_id_copy]
        ).map_err(|e| e.to_string())?;

        Ok::<_, String>(EchoCounselorMessage {
            id: counselor_msg_id,
            session_id: session_id_copy,
            role: "counselor".to_string(),
            content: response.content,
            timestamp: now,
        })
    }).await.map_err(|e| e.to_string())??;

    Ok(result)
}

fn generate_counselor_response(user_content: &str, _context: &str) -> String {
    // Simple rule-based responses for now
    let lower = user_content.to_lowercase();

    if lower.contains("bad") || lower.contains("terrible") || lower.contains("awful") {
        return "I hear that things have been really difficult lately. Thank you for telling me. Would you like to talk more about what's weighing on you, or would a simple grounding exercise help?".to_string();
    }

    if lower.contains("good") || lower.contains("great") || lower.contains("better") {
        return "That's really good to hear. I'm glad you're feeling better. What do you think is contributing to that shift?".to_string();
    }

    if lower.contains("stress") || lower.contains("overwhelmed") {
        return "Stress can be so exhausting. I'm here with you. Would you like to try a quick grounding exercise, or just talk through what's overwhelming?".to_string();
    }

    if lower.contains("grateful") || lower.contains("thanks") {
        return "Gratitude is a powerful practice. What's one thing you're grateful for right now?".to_string();
    }

    if lower.contains("tired") || lower.contains("exhausted") {
        return "It sounds like you're running on empty. That's okay — rest is part of the work. What's one small thing that might help you recharge, even just a little?".to_string();
    }

    if lower.contains("anxious") || lower.contains("anxiety") || lower.contains("worried") {
        return "Anxiety has a way of making everything feel bigger than it is. I'm here with you. Would you like to try a breathing exercise to help ground yourself, or talk through what's on your mind?".to_string();
    }

    if lower.contains("angry") || lower.contains("mad") || lower.contains("furious") {
        return "Anger is valid. It's a response to something that matters. Would you like to talk about what happened, or would you prefer a moment to just be angry without judgment?".to_string();
    }

    if lower.contains("hopeless") || lower.contains("nothing matters") {
        return "I hear how heavy that feels. I'm not going to tell you it's not, or that it's 'just a phase.' What's one small thing — even just getting through the next hour — that feels possible right now?".to_string();
    }

    // Default response
    format!("Thank you for sharing that with me. How are you feeling about what you just said?")
}

pub fn end_session(session_id: &str) -> Result<(), String> {
    let engine = get_engine();
    let conn = engine.db.conn();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE echo_counselor_sessions SET status = 'completed', ended_at = ? WHERE id = ?",
        [&now, session_id]
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ═════════════════════════════════════════════════════════════════
// CRISIS MANAGEMENT
// ═════════════════════════════════════════════════════════════════

pub fn flag_crisis(
    session_id: &str,
    content: &str,
    severity: &str,
    detected_text: &str,
) -> Result<EchoCrisisFlag, String> {
    let engine = get_engine();
    let conn = engine.db.conn();
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    // Default response based on severity
    let response_given = match severity {
        "critical" => "I hear you, and I'm not going anywhere. What you're feeling right now is real, and you don't have to carry it alone. Would you like me to show you some resources that are available right now, 24/7?".to_string(),
        _ => "Thank you for trusting me with this. I'm here with you. Would you like to talk more, or would you like to see some resources that might help?".to_string(),
    };

    conn.execute(
        "INSERT INTO echo_crisis_flags (id, session_id, severity, detected_text, response_given, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [&id, session_id, severity, detected_text, &response_given, &now]
    ).map_err(|e| e.to_string())?;

    Ok(EchoCrisisFlag {
        id,
        session_id: Some(session_id.to_string()),
        entry_id: None,
        severity: severity.to_string(),
        detected_text: detected_text.to_string(),
        response_given,
        resources_provided: vec![],
        resolved: false,
        created_at: now,
    })
}

// ═════════════════════════════════════════════════════════════════
// GRATITUDE
// ═════════════════════════════════════════════════════════════════

pub fn write_gratitude(items: Vec<String>, context: Option<String>) -> Result<(), String> {
    let engine = get_engine();
    let conn = engine.db.conn();
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    let items_json = serde_json::to_string(&items).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO echo_gratitude_entries (id, items, context, created_at) VALUES (?, ?, ?, ?)",
        [&id, &items_json, &context.unwrap_or_default(), &now]
    ).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn get_gratitude(limit: Option<i64>) -> Result<Vec<EchoGratitudeEntry>, String> {
    let engine = get_engine();
    let conn = engine.db.conn();

    let limit = limit.unwrap_or(30);
    let entries = conn
        .prepare(&format!("SELECT * FROM echo_gratitude_entries ORDER BY created_at DESC LIMIT {}", limit)).map_err(to_string)?
        .query_map([], |row| {
            Ok(EchoGratitudeEntry {
                id: row.get(0)?,
                items: row.get(1)?,
                context: row.get(2)?,
                session_id: row.get(3)?,
                created_at: row.get(4)?,
            })
        }).map_err(to_string)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}

// ═════════════════════════════════════════════════════════════════
// GROUNDING EXERCISES
// ═════════════════════════════════════════════════════════════════

pub fn get_exercises() -> Result<Vec<EchoGroundingExercise>, String> {
    let engine = get_engine();
    let conn = engine.db.conn();

    let exercises = conn
        .prepare("SELECT * FROM echo_grounding_exercises ORDER BY created_at DESC").map_err(to_string)?
        .query_map([], |row| {
            Ok(EchoGroundingExercise {
                id: row.get(0)?,
                r#type: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                duration_min: row.get(4)?,
                prescribed_by: row.get(5)?,
                completed: row.get(6)?,
                completed_at: row.get(7)?,
                created_at: row.get(8)?,
            })
        }).map_err(to_string)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(exercises)
}

pub fn complete_exercise(exercise_id: &str) -> Result<(), String> {
    let engine = get_engine();
    let conn = engine.db.conn();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE echo_grounding_exercises SET completed = TRUE, completed_at = ? WHERE id = ?",
        [&now, exercise_id]
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ═════════════════════════════════════════════════════════════════
// COUNSELOR JOURNAL
// ═════════════════════════════════════════════════════════════════

pub fn get_reflections(limit: Option<i64>) -> Result<Vec<EchoCounselorSession>, String> {
    let engine = get_engine();
    let conn = engine.db.conn();

    let limit = limit.unwrap_or(10);
    let sessions = conn
        .prepare(&format!(
            "SELECT * FROM echo_counselor_sessions WHERE counselor_reflection IS NOT NULL ORDER BY created_at DESC LIMIT {}",
            limit
        )).map_err(to_string)?
        .query_map([], |row| {
            Ok(EchoCounselorSession {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                status: row.get(3)?,
                message_count: row.get(4)?,
                summary: row.get(5)?,
                counselor_reflection: row.get(6)?,
                created_at: row.get(8)?,
            })
        }).map_err(to_string)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(sessions)
}

pub fn mark_reflection_read(session_id: &str) -> Result<(), String> {
    let engine = get_engine();
    let conn = engine.db.conn();

    conn.execute(
        "UPDATE echo_counselor_sessions SET reflection_read = TRUE WHERE id = ?",
        [session_id]
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ═════════════════════════════════════════════════════════════════
// WEEKLY MIRROR LETTER
// ═════════════════════════════════════════════════════════════════

pub async fn generate_weekly_letter() -> Result<EchoWeeklyLetter, String> {
    use tokio::task;

    // Collect data in a blocking context first
    let week_data = task::spawn_blocking(|| {
        let engine = get_engine();
        let conn = engine.db.conn();

        let week_start = chrono::Utc::now() - chrono::Duration::days(7);
        let week_end = chrono::Utc::now();

        let sessions: Vec<EchoCounselorSession> = conn
            .prepare(
                "SELECT * FROM echo_counselor_sessions
                 WHERE created_at >= ? AND created_at <= ?
                 ORDER BY created_at ASC"
            ).map_err(to_string)?
            .query_map([week_start.to_rfc3339(), week_end.to_rfc3339()], |row| {
                Ok(EchoCounselorSession {
                    id: row.get(0)?,
                    started_at: row.get(1)?,
                    ended_at: row.get(2)?,
                    status: row.get(3)?,
                    message_count: row.get(4)?,
                    summary: row.get(5)?,
                    counselor_reflection: row.get(6)?,
                    created_at: row.get(8)?,
                })
            }).map_err(to_string)?
            .filter_map(|r| r.ok())
            .collect();

        let gratitude_entries: Vec<String> = conn
            .prepare(
                "SELECT items FROM echo_gratitude_entries
                 WHERE created_at >= ? AND created_at <= ?"
            ).map_err(to_string)?
            .query_map([week_start.to_rfc3339(), week_end.to_rfc3339()], |row| {
                Ok(row.get::<usize, String>(0)?)
            }).map_err(to_string)?
            .filter_map(|r| r.ok())
            .collect();

        let streak = calculate_streak(&conn, "current").unwrap_or(0);

        Ok::<_, String>((sessions, gratitude_entries, streak))
    }).await.map_err(|e| e.to_string())??;

    let (sessions, gratitude_entries, streak) = week_data;
    let session_count = sessions.len() as i64;
    let total_messages: i64 = sessions.iter().map(|s| s.message_count).sum();

    // Build context for the LLM
    let mut context_parts = Vec::new();
    context_parts.push(format!("Sessions this week: {}", session_count));
    if session_count > 0 {
        context_parts.push(format!("Total messages exchanged: {}", total_messages));
        context_parts.push("Session summaries:".to_string());
        for s in &sessions {
            let date = &s.created_at;
            let summary = s.summary.as_deref().unwrap_or("(no summary)");
            context_parts.push(format!("  - [{}] {} messages: {}", &date[..10], s.message_count, summary));
        }
    }
    if !gratitude_entries.is_empty() {
        context_parts.push(format!("Gratitude entries this week: {}", gratitude_entries.len()));
        for g in &gratitude_entries {
            if let Ok(items) = serde_json::from_str::<Vec<String>>(g) {
                context_parts.push(format!("  - {}", items.join(", ")));
            }
        }
    }
    context_parts.push(format!("Current streak: {} days", streak));
    let context = context_parts.join("\n");

    // Call the LLM to generate the letter (run in thread pool, not blocking the thread)
    let letter_content = router::chat(
        "mirror",
        vec![
            router::OpenAIMessage {
                role: "system".to_string(),
                content: Some(WEEKLY_MIRROR_PROMPT.to_string()),
                tool_call_id: None,
                tool_calls: None,
            },
            router::OpenAIMessage {
                role: "user".to_string(),
                content: Some(format!("Here's the data from the user's week:\n\n{}", context)),
                tool_call_id: None,
                tool_calls: None,
            },
        ],
        None,
        None,
        None,
    ).await.map_err(|e| e.to_string())?.content;

    // Save to database (back to blocking)
    let letter_content_clone = letter_content.clone();
    let sessions_clone = sessions.clone();
    let result = task::spawn_blocking(move || {
        let engine = get_engine();
        let conn = engine.db.conn();
        let now = Utc::now().to_rfc3339();
        let id = Uuid::new_v4().to_string();
        let week_start = (chrono::Utc::now() - chrono::Duration::days(6)).format("%Y-%m-%d").to_string();
        let week_end = chrono::Utc::now().format("%Y-%m-%d").to_string();

        let themes: Vec<String> = sessions_clone.iter()
            .filter_map(|s| s.summary.as_deref())
            .filter(|s| !s.is_empty())
            .take(5)
            .map(|s| s.chars().take(30).collect())
            .collect();
        let themes_json = serde_json::to_string(&themes).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO echo_weekly_letters (id, week_start, week_end, letter_content, session_count, total_messages, streak_start, streak_end, top_mood, themes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                &id, &week_start, &week_end, &letter_content_clone,
                session_count, total_messages,
                None::<String>, None::<String>, None::<String>,
                &themes_json, &now,
            ]
        ).map_err(|e| e.to_string())?;

        Ok::<_, String>(EchoWeeklyLetter {
            id,
            week_start,
            week_end,
            letter_content: letter_content_clone,
            session_count,
            total_messages,
            streak_start: None,
            streak_end: None,
            top_mood: None,
            themes: themes_json,
            created_at: now,
        })
    }).await.map_err(|e| e.to_string())??;

    Ok(result)
}

pub fn get_weekly_letter() -> Result<Option<EchoWeeklyLetter>, String> {
    let engine = get_engine();
    let conn = engine.db.conn();

    let result = conn.query_row(
        "SELECT * FROM echo_weekly_letters ORDER BY created_at DESC LIMIT 1",
        [],
        |row| {
            Ok(EchoWeeklyLetter {
                id: row.get(0)?,
                week_start: row.get(1)?,
                week_end: row.get(2)?,
                letter_content: row.get(3)?,
                session_count: row.get(4)?,
                total_messages: row.get(5)?,
                streak_start: row.get(6)?,
                streak_end: row.get(7)?,
                top_mood: row.get(8)?,
                themes: row.get(9)?,
                created_at: row.get(10)?,
            })
        }
    ).map_err(to_string).ok();

    Ok(result)
}

pub fn get_weekly_letter_history(limit: Option<i64>) -> Result<Vec<EchoWeeklyLetter>, String> {
    let engine = get_engine();
    let conn = engine.db.conn();
    let limit = limit.unwrap_or(4);

    let letters = conn
        .prepare(&format!(
            "SELECT * FROM echo_weekly_letters ORDER BY created_at DESC LIMIT {}",
            limit
        )).map_err(to_string)?
        .query_map([], |row| {
            Ok(EchoWeeklyLetter {
                id: row.get(0)?,
                week_start: row.get(1)?,
                week_end: row.get(2)?,
                letter_content: row.get(3)?,
                session_count: row.get(4)?,
                total_messages: row.get(5)?,
                streak_start: row.get(6)?,
                streak_end: row.get(7)?,
                top_mood: row.get(8)?,
                themes: row.get(9)?,
                created_at: row.get(10)?,
            })
        }).map_err(to_string)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(letters)
}

pub fn init() -> Result<(), String> {
    init_tables()
}

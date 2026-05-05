use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

// ── State Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfluxState {
    Idle,
    Listening,
    Thinking,
    Speaking,
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateChangeEvent {
    pub state: ConfluxState,
    pub agent_id: Option<String>,
    pub session_id: Option<String>,
    pub timestamp: String,
    pub metadata: Option<serde_json::Value>,
}

// ── State Manager ──

pub struct StateManager {
    current_state: ConfluxState,
    window: Option<tauri::Window>,
    last_transition: DateTime<Utc>,
}

impl StateManager {
    pub fn new() -> Self {
        Self {
            current_state: ConfluxState::Idle,
            window: None,
            last_transition: Utc::now(),
        }
    }

    pub fn set_window(&mut self, window: tauri::Window) {
        self.window = Some(window);
    }

    pub fn transition(&mut self, new_state: ConfluxState) -> Result<(), String> {
        self.current_state = new_state.clone();
        self.last_transition = Utc::now();

        if let Some(window) = &self.window {
            let event = StateChangeEvent {
                state: new_state.clone(),
                agent_id: None,
                session_id: None,
                timestamp: self.last_transition.to_rfc3339(),
                metadata: None,
            };

            log::info!("[StateManager] Transitioning to {:?}", new_state);
            window
                .emit("conflux:state", &event)
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn transition_with_context(
        &mut self,
        new_state: ConfluxState,
        agent_id: Option<String>,
        session_id: Option<String>,
        metadata: Option<serde_json::Value>,
    ) -> Result<(), String> {
        self.current_state = new_state.clone();
        self.last_transition = Utc::now();

        if let Some(window) = &self.window {
            let event = StateChangeEvent {
                state: new_state,
                agent_id,
                session_id,
                timestamp: self.last_transition.to_rfc3339(),
                metadata,
            };

            window
                .emit("conflux:state", &event)
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn current_state(&self) -> &ConfluxState {
        &self.current_state
    }

    pub fn last_transition(&self) -> &DateTime<Utc> {
        &self.last_transition
    }

    pub fn emit_error(&mut self, message: String) -> Result<(), String> {
        self.transition(ConfluxState::Error { message })
    }
}

// ── Singleton Pattern ──

// Singleton is now in state_manager.rs

// ── Commands (for frontend use) ──

#[tauri::command]
pub fn conflux_set_state(state: String) -> Result<(), String> {
    let manager = crate::engine::state_manager::get_state_manager();
    let mut mgr = manager.lock().map_err(|e| e.to_string())?;

    match state.as_str() {
        "idle" => mgr.transition(ConfluxState::Idle),
        "listening" => mgr.transition(ConfluxState::Listening),
        "thinking" => mgr.transition(ConfluxState::Thinking),
        "speaking" => mgr.transition(ConfluxState::Speaking),
        _ => Err(format!("Unknown state: {}", state)),
    }
}

#[tauri::command]
pub fn conflux_set_state_with_context(
    state: String,
    agent_id: Option<String>,
    session_id: Option<String>,
    metadata: Option<serde_json::Value>,
) -> Result<(), String> {
    let manager = crate::engine::state_manager::get_state_manager();
    let mut mgr = manager.lock().map_err(|e| e.to_string())?;

    let conflux_state = match state.as_str() {
        "idle" => ConfluxState::Idle,
        "listening" => ConfluxState::Listening,
        "thinking" => ConfluxState::Thinking,
        "speaking" => ConfluxState::Speaking,
        _ => return Err(format!("Unknown state: {}", state)),
    };

    mgr.transition_with_context(conflux_state, agent_id, session_id, metadata)
}

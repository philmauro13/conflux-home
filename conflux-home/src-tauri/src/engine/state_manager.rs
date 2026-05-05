// Singleton pattern for state manager

use super::state_events::StateManager;
use once_cell::sync::Lazy;
use std::sync::Mutex;

static STATE_MANAGER: Lazy<Mutex<StateManager>> = Lazy::new(|| Mutex::new(StateManager::new()));

pub fn get_state_manager() -> &'static Mutex<StateManager> {
    &STATE_MANAGER
}

#[tauri::command]
pub fn state_manager_get() -> Result<String, String> {
    Ok("state_manager_ready".to_string())
}

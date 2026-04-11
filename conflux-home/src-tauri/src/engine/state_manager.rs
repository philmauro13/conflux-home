// Singleton pattern for state manager

use std::sync::Mutex;
use once_cell::sync::Lazy;
use super::state_events::StateManager;

static STATE_MANAGER: Lazy<Mutex<StateManager>> = Lazy::new(|| {
    Mutex::new(StateManager::new())
});

pub fn get_state_manager() -> &'static Mutex<StateManager> {
    &STATE_MANAGER
}

#[tauri::command]
pub fn state_manager_get() -> Result<String, String> {
    Ok("state_manager_ready".to_string())
}

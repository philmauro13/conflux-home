// Model management for Whisper GGML models.
//
// Lookup order:
// 1. Bundled resource: <resource_dir>/models/ggml-{name}.bin
// 2. App data: <app_data_dir>/models/ggml-{name}.bin

use std::path::PathBuf;

/// Get the bundled resource model directory.
/// In Tauri v2, bundled resources end up in the resource_dir.
pub fn bundled_model_dir(resource_dir: &PathBuf) -> PathBuf {
    resource_dir.join("models")
}

/// Get the user model directory (app data).
pub fn user_model_dir(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("models")
}

/// Get the full path to the GGML model file.
/// Checks bundled resources first, then user app data.
pub fn model_path(resource_dir: &PathBuf, app_data_dir: &PathBuf, model_name: &str) -> PathBuf {
    let filename = format!("ggml-{}.bin", model_name);

    // Check bundled resources first
    let bundled = bundled_model_dir(resource_dir).join(&filename);
    if bundled.exists() {
        return bundled;
    }

    // Fall back to user app data
    user_model_dir(app_data_dir).join(&filename)
}

/// Check if a specific model exists on disk (bundled or user).
pub fn model_exists(resource_dir: &PathBuf, app_data_dir: &PathBuf, model_name: &str) -> bool {
    let filename = format!("ggml-{}.bin", model_name);

    let bundled = bundled_model_dir(resource_dir).join(&filename);
    if bundled.exists() {
        return true;
    }

    let user = user_model_dir(app_data_dir).join(&filename);
    user.exists()
}

/// Get model info: name, file size in bytes, and whether it exists.
pub fn model_info(
    resource_dir: &PathBuf,
    app_data_dir: &PathBuf,
    model_name: &str,
) -> serde_json::Value {
    let path = model_path(resource_dir, app_data_dir, model_name);
    let exists = path.exists();
    let size_bytes = if exists {
        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    let size_mb = (size_bytes as f64) / (1024.0 * 1024.0);

    let source = if exists {
        let bundled = bundled_model_dir(resource_dir).join(format!("ggml-{}.bin", model_name));
        if bundled.exists() {
            "bundled"
        } else {
            "user"
        }
    } else {
        "missing"
    };

    serde_json::json!({
        "name": model_name,
        "path": path.to_string_lossy(),
        "exists": exists,
        "size_bytes": size_bytes,
        "size_mb": (size_mb * 100.0).round() / 100.0,
        "source": source,
    })
}

/// Ensure the user models directory exists. Returns the path.
pub fn ensure_user_model_dir(app_data_dir: &PathBuf) -> Result<PathBuf, String> {
    let dir = user_model_dir(app_data_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create models directory: {}", e))?;
    Ok(dir)
}

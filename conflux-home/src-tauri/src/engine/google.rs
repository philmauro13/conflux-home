// Conflux Engine — Google Workspace Integration
// OAuth2 Desktop App flow + Gmail, Drive, Docs, Sheets APIs.
//
// Auth flow:
//   1. User clicks "Connect Google" in Settings
//   2. Engine starts temp HTTP server on localhost:8899
//   3. Browser opens Google consent screen
//   4. Google redirects to localhost:8899 with auth code
//   5. Engine exchanges code for tokens, stores in SQLite
//   6. Tokens auto-refresh on expiry

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::db::EngineDb;

// ── OAuth2 Config ──
// These MUST be set by the user via Settings (Google Cloud Console → OAuth 2.0 Client ID → Desktop app)
// We store them in the config table.

const REDIRECT_URI: &str = "http://localhost:8899/callback";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const SCOPES: &str = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/spreadsheets";

// Built-in OAuth credentials — Conflux Home registered Google Cloud app.
// Users never need to enter their own credentials.
const DEFAULT_CLIENT_ID: &str = "372361303204-ad5o8asv9qmbq6o12d954et8gsj82sft.apps.googleusercontent.com";
const DEFAULT_CLIENT_SECRET: &str = "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";

const OAUTH_PORT: u16 = 8899;

/// Get the effective client ID — DB override or built-in default.
fn get_client_id(db: &EngineDb) -> Result<String> {
    let db_id = db.get_config("google_client_id")?;
    Ok(db_id.filter(|s| !s.is_empty()).unwrap_or_else(|| DEFAULT_CLIENT_ID.to_string()))
}

/// Get the effective client secret — DB override or built-in default.
fn get_client_secret(db: &EngineDb) -> Result<String> {
    let db_secret = db.get_config("google_client_secret")?;
    Ok(db_secret.filter(|s| !s.is_empty()).unwrap_or_else(|| DEFAULT_CLIENT_SECRET.to_string()))
}

/// Accept a TCP connection with a timeout. Uses non-blocking mode + polling.
fn accept_with_timeout(listener: &TcpListener, timeout_secs: u64) -> Option<(std::net::TcpStream, std::net::SocketAddr)> {
    listener.set_nonblocking(true).ok()?;
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);

    loop {
        match listener.accept() {
            Ok(conn) => {
                listener.set_nonblocking(false).ok();
                return Some(conn);
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if std::time::Instant::now() >= deadline {
                    listener.set_nonblocking(false).ok();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(_) => {
                listener.set_nonblocking(false).ok();
                return None;
            }
        }
    }
}

// ── Token Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: String,
    pub scope: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    scope: Option<String>,
    #[allow(dead_code)]
    token_type: Option<String>,
}

// ── Auth Flow ──

/// Start the OAuth2 flow. Returns the URL the user should open in their browser.
pub fn get_auth_url(db: &EngineDb) -> Result<String> {
    let client_id = get_client_id(db)?;

    let url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        AUTH_URL,
        urlencoding::encode(&client_id),
        urlencoding::encode(REDIRECT_URI),
        urlencoding::encode(SCOPES),
    );

    Ok(url)
}

/// Start a temporary HTTP server, wait for the OAuth callback, exchange the code for tokens.
/// This blocks until the callback is received (or times out after 120 seconds).
pub fn handle_oauth_callback(db: &EngineDb) -> Result<GoogleTokens> {
    let client_id = get_client_id(db)?;
    let client_secret = get_client_secret(db)?;

    // Start temp server
    let listener = TcpListener::bind(format!("127.0.0.1:{}", OAUTH_PORT))
        .context(format!("Failed to bind to port {}. Is another instance running?", OAUTH_PORT))?;

    log::info!("[Google] Waiting for OAuth callback on port {}...", OAUTH_PORT);

    // Accept one connection (with a thread-based timeout)
    let (mut stream, _) = accept_with_timeout(&listener, 120)
        .context("Timed out waiting for OAuth callback (120s)")?;

    // Read the HTTP request
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf)?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // Extract the code from the request line: GET /callback?code=XXXXX HTTP/1.1
    let code = extract_code_from_request(&request)?;

    // Send success response to browser
    let response_body = r#"<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:system-ui;text-align:center;padding:60px;background:#111;color:#fff">
        <h1>&#9989; Google Connected!</h1>
        <p>You can close this tab and return to Conflux Home.</p>
        <script>setTimeout(()=>window.close(),3000)</script>
    </body></html>"#;

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        response_body.len(),
        response_body
    );
    let _ = stream.write_all(response.as_bytes());

    // Exchange code for tokens
    log::info!("[Google] Exchanging auth code for tokens...");
    let tokens = exchange_code_for_tokens(&client_id, &client_secret, &code)?;

    // Store tokens
    store_tokens(db, &tokens)?;

    // Try to get user email
    let mut email_str = None;
    if let Ok(email) = fetch_user_email(&tokens.access_token) {
        let _ = db.set_config("google_email", &email);
        log::info!("[Google] Connected as: {}", email);
        email_str = Some(email);
    }

    Ok(GoogleTokens { email: email_str, ..tokens })
}

fn extract_code_from_request(request: &str) -> Result<String> {
    // GET /callback?code=4/0AX4XfWh...&scope=... HTTP/1.1
    let first_line = request.lines().next().unwrap_or("");
    let query = first_line.split_whitespace().nth(1).unwrap_or("");

    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        if parts.next() == Some("code") {
            if let Some(code) = parts.next() {
                return Ok(code.to_string());
            }
        }
    }

    // Check for error
    if query.contains("error=") {
        let error = query.split("error=").nth(1).unwrap_or("unknown");
        anyhow::bail!("Google OAuth error: {}", error);
    }

    anyhow::bail!("No authorization code in callback request")
}

fn exchange_code_for_tokens(client_id: &str, client_secret: &str, code: &str) -> Result<GoogleTokens> {
    let client = reqwest::blocking::Client::new();

    let params = [
        ("code", code),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("redirect_uri", REDIRECT_URI),
        ("grant_type", "authorization_code"),
    ];

    let resp = client.post(TOKEN_URL)
        .form(&params)
        .send()
        .context("Failed to send token exchange request")?;

    if !resp.status().is_success() {
        let body = resp.text().unwrap_or_default();
        anyhow::bail!("Token exchange failed: {}", body);
    }

    let token_resp: TokenResponse = resp.json()
        .context("Failed to parse token response")?;

    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let expires_at = now + token_resp.expires_in.unwrap_or(3600);

    Ok(GoogleTokens {
        access_token: token_resp.access_token,
        refresh_token: token_resp.refresh_token
            .ok_or_else(|| anyhow::anyhow!("No refresh token returned. Try revoking access and reconnecting."))?,
        expires_at: format_timestamp(expires_at),
        scope: token_resp.scope,
        email: None,
    })
}

fn fetch_user_email(access_token: &str) -> Result<String> {
    let client = reqwest::blocking::Client::new();
    let resp = client.get("https://www.googleapis.com/oauth2/v2/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()?;

    #[derive(Deserialize)]
    struct UserInfo {
        email: String,
    }

    let info: UserInfo = resp.json()?;
    Ok(info.email)
}

// ── Token Management ──

pub fn store_tokens(db: &EngineDb, tokens: &GoogleTokens) -> Result<()> {
    let conn = db.conn();
    conn.execute(
        "INSERT INTO google_tokens (id, access_token, refresh_token, expires_at, scope)
         VALUES (?, ?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET
            access_token = ?1, refresh_token = ?2, expires_at = ?3, scope = ?4,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        rusqlite::params![tokens.access_token, tokens.refresh_token, tokens.expires_at, tokens.scope],
    )?;
    Ok(())
}

pub fn get_tokens(db: &EngineDb) -> Result<Option<GoogleTokens>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT access_token, refresh_token, expires_at, scope, email FROM google_tokens WHERE id = ?"
    )?;

    let result = stmt.query_row([], |row| {
        Ok(GoogleTokens {
            access_token: row.get(0)?,
            refresh_token: row.get(1)?,
            expires_at: row.get(2)?,
            scope: row.get(3)?,
            email: row.get(4)?,
        })
    });

    match result {
        Ok(t) => Ok(Some(t)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn is_connected(db: &EngineDb) -> Result<bool> {
    Ok(get_tokens(db)?.is_some())
}

pub fn disconnect(db: &EngineDb) -> Result<()> {
    let conn = db.conn();
    conn.execute("DELETE FROM google_tokens WHERE id = ?", [])?;
    let _ = db.set_config("google_email", "");
    Ok(())
}

/// Get a valid access token, refreshing if expired.
pub fn get_valid_token(db: &EngineDb) -> Result<String> {
    let tokens = get_tokens(db)?
        .ok_or_else(|| anyhow::anyhow!("Google not connected. Connect in Settings."))?;

    // Check if expired
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let expires_at = parse_timestamp(&tokens.expires_at)?;

    if now < expires_at - 60 {
        // Token still valid (with 60s buffer)
        return Ok(tokens.access_token);
    }

    // Refresh the token
    log::info!("[Google] Access token expired, refreshing...");
    let new_tokens = refresh_access_token(db, &tokens)?;

    Ok(new_tokens.access_token)
}

fn refresh_access_token(db: &EngineDb, tokens: &GoogleTokens) -> Result<GoogleTokens> {
    let client_id = get_client_id(db)?;
    let client_secret = get_client_secret(db)?;

    let client = reqwest::blocking::Client::new();
    let params = [
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("refresh_token", tokens.refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];

    let resp = client.post(TOKEN_URL)
        .form(&params)
        .send()
        .context("Failed to send token refresh request")?;

    if !resp.status().is_success() {
        let body = resp.text().unwrap_or_default();
        anyhow::bail!("Token refresh failed: {}", body);
    }

    let token_resp: TokenResponse = resp.json()?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let expires_at = now + token_resp.expires_in.unwrap_or(3600);

    let new_tokens = GoogleTokens {
        access_token: token_resp.access_token,
        refresh_token: tokens.refresh_token.clone(), // keep original refresh token
        expires_at: format_timestamp(expires_at),
        scope: token_resp.scope.or_else(|| tokens.scope.clone()),
        email: tokens.email.clone(),
    };

    store_tokens(db, &new_tokens)?;
    Ok(new_tokens)
}

// ── Google API Client ──

/// Make an authenticated GET request to a Google API.
fn api_get(db: &EngineDb, url: &str) -> Result<serde_json::Value> {
    let token = get_valid_token(db)?;
    let client = reqwest::blocking::Client::new();

    let resp = client.get(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .send()?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().unwrap_or_default();
        anyhow::bail!("Google API error {}: {}", status, body);
    }

    Ok(resp.json()?)
}

/// Make an authenticated POST request to a Google API.
fn api_post(db: &EngineDb, url: &str, body: &serde_json::Value) -> Result<serde_json::Value> {
    let token = get_valid_token(db)?;
    let client = reqwest::blocking::Client::new();

    let resp = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(body)
        .send()?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().unwrap_or_default();
        anyhow::bail!("Google API error {}: {}", status, body);
    }

    Ok(resp.json()?)
}

/// Make an authenticated PATCH request to a Google API.
fn api_patch(db: &EngineDb, url: &str, body: &serde_json::Value) -> Result<serde_json::Value> {
    let token = get_valid_token(db)?;
    let client = reqwest::blocking::Client::new();

    let resp = client.patch(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(body)
        .send()?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().unwrap_or_default();
        anyhow::bail!("Google API error {}: {}", status, body);
    }

    Ok(resp.json()?)
}

// ── Gmail Tools ──

/// Send an email via Gmail.
pub fn gmail_send(db: &EngineDb, to: &str, subject: &str, body: &str) -> Result<String> {
    // Build RFC 2822 message
    let email = format!("To: {}\r\nSubject: {}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}", to, subject, body);
    let encoded = base64_encode_url_safe(&email);

    let payload = serde_json::json!({
        "raw": encoded
    });

    let _resp = api_post(db, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", &payload)?;
    Ok(format!("Email sent to {}", to))
}

/// Search Gmail messages.
pub fn gmail_search(db: &EngineDb, query: &str, max_results: i64) -> Result<String> {
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?q={}&maxResults={}",
        urlencoding::encode(query),
        max_results.min(10),
    );

    let resp = api_get(db, &url)?;

    let messages = resp.get("messages")
        .and_then(|m| m.as_array())
        .ok_or_else(|| anyhow::anyhow!("No messages found"))?;

    let mut results = Vec::new();
    for msg in messages.iter().take(5) {
        let msg_id = msg.get("id").and_then(|i| i.as_str()).unwrap_or("");

        // Get message details
        let detail_url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date",
            msg_id
        );

        if let Ok(detail) = api_get(db, &detail_url) {
            let headers = detail.get("payload")
                .and_then(|p| p.get("headers"))
                .and_then(|h| h.as_array());

            let mut subject = String::new();
            let mut from = String::new();
            let mut date = String::new();

            if let Some(headers) = headers {
                for h in headers {
                    let name = h.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let value = h.get("value").and_then(|v| v.as_str()).unwrap_or("");
                    match name {
                        "Subject" => subject = value.to_string(),
                        "From" => from = value.to_string(),
                        "Date" => date = value.to_string(),
                        _ => {}
                    }
                }
            }

            let snippet = detail.get("snippet").and_then(|s| s.as_str()).unwrap_or("");
            results.push(format!(
                "• From: {}\n  Subject: {}\n  Date: {}\n  {}",
                from, subject, date,
                &snippet[..snippet.len().min(150)]
            ));
        }
    }

    if results.is_empty() {
        return Ok("No messages found.".to_string());
    }

    Ok(results.join("\n\n"))
}

// ── Google Drive Tools ──

/// List files in Google Drive.
pub fn drive_list(db: &EngineDb, query: Option<&str>, max_results: i64) -> Result<String> {
    let mut url = format!(
        "https://www.googleapis.com/drive/v3/files?pageSize={}&fields=files(id,name,mimeType,modifiedTime)",
        max_results.min(20)
    );

    if let Some(q) = query {
        url.push_str(&format!("&q={}", urlencoding::encode(q)));
    }

    let resp = api_get(db, &url)?;

    let files = resp.get("files")
        .and_then(|f| f.as_array())
        .ok_or_else(|| anyhow::anyhow!("No files found"))?;

    if files.is_empty() {
        return Ok("No files found.".to_string());
    }

    let results: Vec<String> = files.iter().map(|f| {
        let name = f.get("name").and_then(|n| n.as_str()).unwrap_or("Unknown");
        let mime = f.get("mimeType").and_then(|m| m.as_str()).unwrap_or("");
        let icon = match mime {
            "application/vnd.google-apps.document" => "📄",
            "application/vnd.google-apps.spreadsheet" => "📊",
            "application/vnd.google-apps.presentation" => "📽️",
            "application/vnd.google-apps.folder" => "📁",
            _ => "📎",
        };
        format!("{} {}", icon, name)
    }).collect();

    Ok(results.join("\n"))
}

// ── Google Docs Tools ──

/// Read a Google Doc's content.
pub fn doc_read(db: &EngineDb, document_id: &str) -> Result<String> {
    let url = format!("https://docs.googleapis.com/v1/documents/{}", document_id);
    let resp = api_get(db, &url)?;

    let title = resp.get("title").and_then(|t| t.as_str()).unwrap_or("Untitled");

    let body = resp.get("body")
        .and_then(|b| b.get("content"))
        .and_then(|c| c.as_array())
        .ok_or_else(|| anyhow::anyhow!("Could not read document body"))?;

    let mut text = Vec::new();
    for element in body {
        if let Some(paragraph) = element.get("paragraph") {
            if let Some(elements) = paragraph.get("elements").and_then(|e| e.as_array()) {
                let line: String = elements.iter()
                    .filter_map(|e| e.get("textRun"))
                    .filter_map(|tr| tr.get("content").and_then(|c| c.as_str()))
                    .collect();
                if !line.trim().is_empty() {
                    text.push(line);
                }
            }
        }
    }

    Ok(format!("📄 {}\n\n{}", title, text.join("")))
}

/// Write to a Google Doc (append text).
pub fn doc_write(db: &EngineDb, document_id: &str, content: &str) -> Result<String> {
    // First get the document to find the end index
    let url = format!("https://docs.googleapis.com/v1/documents/{}", document_id);
    let resp = api_get(db, &url)?;

    // Find the end index
    let end_index = resp.get("body")
        .and_then(|b| b.get("content"))
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.last())
        .and_then(|last| last.get("endIndex"))
        .and_then(|i| i.as_i64())
        .unwrap_or(1) - 1;

    // Batch update to insert text
    let update_url = format!("https://docs.googleapis.com/v1/documents/{}:batchUpdate", document_id);
    let body = serde_json::json!({
        "requests": [
            {
                "insertText": {
                    "location": { "index": end_index },
                    "text": format!("\n{}", content)
                }
            }
        ]
    });

    api_post(db, &update_url, &body)?;
    Ok(format!("Wrote {} chars to document {}", content.len(), document_id))
}

// ── Google Sheets Tools ──

/// Read values from a Google Sheet.
pub fn sheet_read(db: &EngineDb, spreadsheet_id: &str, range: &str) -> Result<String> {
    let url = format!(
        "https://sheets.googleapis.com/v4/spreadsheets/{}/values/{}",
        spreadsheet_id,
        urlencoding::encode(range)
    );

    let resp = api_get(db, &url)?;

    let values = resp.get("values")
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow::anyhow!("No data in range"))?;

    if values.is_empty() {
        return Ok("No data found.".to_string());
    }

    let rows: Vec<String> = values.iter().map(|row| {
        let cells: Vec<String> = match row.as_array() {
            Some(arr) => arr.iter()
                .map(|cell| cell.as_str().unwrap_or("").to_string())
                .collect(),
            None => vec![format!("{}", row)],
        };
        cells.join(" | ")
    }).collect();

    Ok(rows.join("\n"))
}

/// Write values to a Google Sheet.
pub fn sheet_write(db: &EngineDb, spreadsheet_id: &str, range: &str, values: Vec<Vec<String>>) -> Result<String> {
    let url = format!(
        "https://sheets.googleapis.com/v4/spreadsheets/{}/values/{}?valueInputOption=USER_ENTERED",
        spreadsheet_id,
        urlencoding::encode(range)
    );

    let body = serde_json::json!({
        "values": values
    });

    api_put(db, &url, &body)?;

    Ok(format!("Wrote to {}!{}", spreadsheet_id, range))
}

/// Make an authenticated PUT request to a Google API.
fn api_put(db: &EngineDb, url: &str, body: &serde_json::Value) -> Result<serde_json::Value> {
    let token = get_valid_token(db)?;
    let client = reqwest::blocking::Client::new();

    let resp = client.put(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(body)
        .send()?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().unwrap_or_default();
        anyhow::bail!("Google API error {}: {}", status, body);
    }

    Ok(resp.json()?)
}

// ── Tool Dispatch ──

/// Execute a Google tool by name.
pub async fn execute_google_tool(tool_name: &str, args: &serde_json::Value, db: &EngineDb) -> Result<super::tools::ToolResult> {
    // Clone db ref isn't possible, so we'll use the global engine
    // This is called from tools.rs which has access to the db
    match tool_name {
        "google_auth" => {
            let url = get_auth_url(db)?;
            Ok(super::tools::ToolResult {
                success: true,
                output: format!("Open this URL to connect Google:\n{}\n\nWaiting for callback on port {}...", url, OAUTH_PORT),
                error: None,
            })
        }
        "gmail_send" => {
            let to = args.get("to").and_then(|v| v.as_str()).unwrap_or("");
            let subject = args.get("subject").and_then(|v| v.as_str()).unwrap_or("");
            let body = args.get("body").and_then(|v| v.as_str()).unwrap_or("");
            match gmail_send(db, to, subject, body) {
                Ok(result) => Ok(super::tools::ToolResult { success: true, output: result, error: None }),
                Err(e) => Ok(super::tools::ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
            }
        }
        "gmail_search" => {
            let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let max = args.get("max_results").and_then(|v| v.as_i64()).unwrap_or(5);
            match gmail_search(db, query, max) {
                Ok(result) => Ok(super::tools::ToolResult { success: true, output: result, error: None }),
                Err(e) => Ok(super::tools::ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
            }
        }
        "google_drive_list" => {
            let query = args.get("query").and_then(|v| v.as_str());
            let max = args.get("max_results").and_then(|v| v.as_i64()).unwrap_or(10);
            match drive_list(db, query, max) {
                Ok(result) => Ok(super::tools::ToolResult { success: true, output: result, error: None }),
                Err(e) => Ok(super::tools::ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
            }
        }
        "google_doc_read" => {
            let doc_id = args.get("document_id").and_then(|v| v.as_str()).unwrap_or("");
            match doc_read(db, doc_id) {
                Ok(result) => Ok(super::tools::ToolResult { success: true, output: result, error: None }),
                Err(e) => Ok(super::tools::ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
            }
        }
        "google_doc_write" => {
            let doc_id = args.get("document_id").and_then(|v| v.as_str()).unwrap_or("");
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            match doc_write(db, doc_id, content) {
                Ok(result) => Ok(super::tools::ToolResult { success: true, output: result, error: None }),
                Err(e) => Ok(super::tools::ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
            }
        }
        "google_sheet_read" => {
            let sheet_id = args.get("spreadsheet_id").and_then(|v| v.as_str()).unwrap_or("");
            let range = args.get("range").and_then(|v| v.as_str()).unwrap_or("Sheet1");
            match sheet_read(db, sheet_id, range) {
                Ok(result) => Ok(super::tools::ToolResult { success: true, output: result, error: None }),
                Err(e) => Ok(super::tools::ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
            }
        }
        "google_sheet_write" => {
            let sheet_id = args.get("spreadsheet_id").and_then(|v| v.as_str()).unwrap_or("");
            let range = args.get("range").and_then(|v| v.as_str()).unwrap_or("Sheet1");
            let values_raw = args.get("values").and_then(|v| v.as_array());
            let values: Vec<Vec<String>> = match values_raw {
                Some(arr) => arr.iter().map(|row| {
                    if let Some(s) = row.as_str() {
                        vec![s.to_string()]
                    } else if let Some(row_arr) = row.as_array() {
                        row_arr.iter().map(|cell| cell.as_str().unwrap_or("").to_string()).collect()
                    } else {
                        vec![format!("{}", row)]
                    }
                }).collect(),
                None => vec![],
            };
            match sheet_write(db, sheet_id, range, values) {
                Ok(result) => Ok(super::tools::ToolResult { success: true, output: result, error: None }),
                Err(e) => Ok(super::tools::ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
            }
        }
        _ => Ok(super::tools::ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Unknown Google tool: {}", tool_name)),
        }),
    }
}

// ── Helpers ──

fn format_timestamp(secs: u64) -> String {
    chrono::DateTime::from_timestamp(secs as i64, 0)
        .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap())
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

fn parse_timestamp(ts: &str) -> Result<u64> {
    let dt = chrono::DateTime::parse_from_rfc3339(ts)
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%SZ")
            .map(|ndt| ndt.and_utc().fixed_offset()))?;
    Ok(dt.timestamp() as u64)
}

fn base64_encode_url_safe(data: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE.encode(data.as_bytes())
}

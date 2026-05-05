// Budget Matrix — Tauri Commands for Zero-Based Budgeting
// Uses local SQLite engine (consistent with Kitchen/Dreams)

use super::engine;
use serde::{Deserialize, Serialize};

// ── Budget Settings ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetSettings {
    pub id: String,
    pub user_id: String,
    pub pay_frequency: String,
    pub pay_dates: serde_json::Value,
    pub income_amount: f64,
    pub currency: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSettingsRequest {
    pub pay_frequency: String,
    pub pay_dates: serde_json::Value,
    pub income_amount: f64,
    pub currency: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_get_settings(
    member_id: Option<String>,
) -> Result<Option<BudgetSettings>, String> {
    let user_id = member_id.unwrap_or_default();
    if user_id.is_empty() {
        return Ok(None);
    }

    let engine = engine::get_engine();
    match engine.db().get_budget_settings(&user_id).await {
        Ok(Some(row)) => Ok(Some(BudgetSettings {
            id: row.id,
            user_id: row.user_id,
            pay_frequency: row.pay_frequency,
            pay_dates: serde_json::from_str(&row.pay_dates).unwrap_or(serde_json::json!([1, 15])),
            income_amount: row.income_amount,
            currency: row.currency,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_update_settings(
    req: UpdateSettingsRequest,
    member_id: Option<String>,
) -> Result<BudgetSettings, String> {
    let user_id = member_id.unwrap_or_default();
    if user_id.is_empty() {
        return Err("No user ID provided".to_string());
    }

    let engine = engine::get_engine();
    let currency = req.currency.unwrap_or_else(|| "USD".to_string());
    let id = uuid::Uuid::new_v4().to_string();
    let pay_dates_str = req.pay_dates.to_string();

    engine
        .db()
        .upsert_budget_settings(
            &id,
            &user_id,
            &req.pay_frequency,
            &pay_dates_str,
            req.income_amount,
            &currency,
        )
        .await
        .map_err(|e| e.to_string())?;

    // Return the updated settings
    match engine.db().get_budget_settings(&user_id).await {
        Ok(Some(row)) => Ok(BudgetSettings {
            id: row.id,
            user_id: row.user_id,
            pay_frequency: row.pay_frequency,
            pay_dates: serde_json::from_str(&row.pay_dates).unwrap_or(serde_json::json!([1, 15])),
            income_amount: row.income_amount,
            currency: row.currency,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }),
        Ok(None) => Err("Failed to retrieve settings after update".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

// ── Budget Buckets ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetBucket {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub icon: Option<String>,
    pub monthly_goal: f64,
    pub color: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateBucketRequest {
    pub name: String,
    pub icon: Option<String>,
    pub monthly_goal: f64,
    pub color: Option<String>,
    pub is_active: Option<bool>,
}

fn bucket_row_to_bucket(row: engine::types::BudgetBucketRow) -> BudgetBucket {
    BudgetBucket {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        icon: row.icon,
        monthly_goal: row.monthly_goal,
        color: row.color,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_get_buckets(member_id: Option<String>) -> Result<Vec<BudgetBucket>, String> {
    let user_id = member_id.unwrap_or_default();
    if user_id.is_empty() {
        return Ok(vec![]);
    }

    let engine = engine::get_engine();
    engine
        .db()
        .get_budget_buckets(&user_id)
        .await
        .map(|rows| rows.into_iter().map(bucket_row_to_bucket).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_create_bucket(
    req: UpdateBucketRequest,
    member_id: Option<String>,
) -> Result<BudgetBucket, String> {
    let user_id = member_id.unwrap_or_default();
    if user_id.is_empty() {
        return Err("No user ID provided".to_string());
    }

    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine
        .db()
        .create_budget_bucket(
            &id,
            &user_id,
            &req.name,
            req.icon.as_deref(),
            req.monthly_goal,
            req.color.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())?;

    // Return the created bucket
    let buckets = engine
        .db()
        .get_budget_buckets(&user_id)
        .await
        .map_err(|e| e.to_string())?;
    buckets
        .into_iter()
        .find(|b| b.id == id)
        .map(bucket_row_to_bucket)
        .ok_or_else(|| "Failed to retrieve created bucket".to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_update_bucket(
    id: String,
    req: UpdateBucketRequest,
    _member_id: Option<String>,
) -> Result<BudgetBucket, String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn_async().await;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE budget_buckets SET name=?1, icon=?2, monthly_goal=?3, color=?4, is_active=?5, updated_at=?6 WHERE id=?7",
        rusqlite::params![req.name, req.icon, req.monthly_goal, req.color,
                          if req.is_active.unwrap_or(true) { 1i64 } else { 0i64 }, now, id]
    ).map_err(|e| e.to_string())?;

    // Return updated bucket
    let mut stmt = conn.prepare(
        "SELECT id, user_id, name, icon, monthly_goal, color, is_active, created_at, updated_at FROM budget_buckets WHERE id=?1"
    ).map_err(|e| e.to_string())?;

    let row = stmt
        .query_row(rusqlite::params![id], |row| {
            Ok(BudgetBucket {
                id: row.get(0)?,
                user_id: row.get(1)?,
                name: row.get(2)?,
                icon: row.get(3)?,
                monthly_goal: row.get(4)?,
                color: row.get(5)?,
                is_active: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(row)
}

// ── Budget Transactions ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetTransaction {
    pub id: String,
    pub user_id: String,
    pub bucket_id: Option<String>,
    pub amount: f64,
    pub date: String,
    pub status: String,
    pub description: Option<String>,
    pub merchant: Option<String>,
    pub category: Option<String>,
    pub receipt_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogTransactionRequest {
    pub bucket_id: String,
    pub amount: f64,
    pub date: String,
    pub status: Option<String>,
    pub description: Option<String>,
    pub merchant: Option<String>,
    pub category: Option<String>,
    pub receipt_url: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_log_transaction(
    req: LogTransactionRequest,
    member_id: Option<String>,
) -> Result<BudgetTransaction, String> {
    let user_id = member_id.unwrap_or_default();
    if user_id.is_empty() {
        return Err("No user ID provided".to_string());
    }

    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    let status = req.status.unwrap_or_else(|| "confirmed".to_string());
    let bucket_id = if req.bucket_id.is_empty() {
        None
    } else {
        Some(req.bucket_id.as_str())
    };

    engine
        .db()
        .create_budget_transaction(
            &id,
            &user_id,
            bucket_id,
            req.amount,
            &req.date,
            &status,
            req.description.as_deref(),
            req.merchant.as_deref(),
            req.category.as_deref(),
            req.receipt_url.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())?;

    // Return the created transaction
    let transactions = engine
        .db()
        .get_budget_transactions(&user_id)
        .await
        .map_err(|e| e.to_string())?;
    transactions
        .into_iter()
        .find(|t| t.id == id)
        .map(|t| BudgetTransaction {
            id: t.id,
            user_id: t.user_id,
            bucket_id: t.bucket_id,
            amount: t.amount,
            date: t.date,
            status: t.status,
            description: t.description,
            merchant: t.merchant,
            category: t.category,
            receipt_url: t.receipt_url,
            created_at: t.created_at,
            updated_at: t.updated_at,
        })
        .ok_or_else(|| "Failed to retrieve created transaction".to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_get_transactions(
    bucket_id: Option<String>,
    _month: Option<String>,
    member_id: Option<String>,
) -> Result<Vec<BudgetTransaction>, String> {
    let user_id = member_id.unwrap_or_default();
    if user_id.is_empty() {
        return Ok(vec![]);
    }

    let engine = engine::get_engine();
    let all = engine
        .db()
        .get_budget_transactions(&user_id)
        .await
        .map_err(|e| e.to_string())?;

    let filtered: Vec<BudgetTransaction> = all
        .into_iter()
        .filter(|t| {
            if let Some(ref bid) = bucket_id {
                t.bucket_id.as_ref() == Some(bid)
            } else {
                true
            }
        })
        .map(|t| BudgetTransaction {
            id: t.id,
            user_id: t.user_id,
            bucket_id: t.bucket_id,
            amount: t.amount,
            date: t.date,
            status: t.status,
            description: t.description,
            merchant: t.merchant,
            category: t.category,
            receipt_url: t.receipt_url,
            created_at: t.created_at,
            updated_at: t.updated_at,
        })
        .collect();

    Ok(filtered)
}

// ── Budget Allocations ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetAllocation {
    pub id: String,
    pub user_id: String,
    pub bucket_id: String,
    pub pay_period_id: String,
    pub amount: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAllocationRequest {
    pub bucket_id: String,
    pub pay_period_id: String,
    pub amount: f64,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_update_allocation(
    req: UpdateAllocationRequest,
    member_id: Option<String>,
) -> Result<BudgetAllocation, String> {
    let user_id = member_id.unwrap_or_default();
    if user_id.is_empty() {
        return Err("No user ID provided".to_string());
    }

    let engine = engine::get_engine();
    let conn = engine.db().conn_async().await;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // Upsert: try update first, then insert
    let updated = conn.execute(
        "UPDATE budget_allocations SET amount=?1, updated_at=?2 WHERE user_id=?3 AND bucket_id=?4 AND pay_period_id=?5",
        rusqlite::params![req.amount, now, user_id, req.bucket_id, req.pay_period_id]
    ).map_err(|e| e.to_string())?;

    if updated == 0 {
        conn.execute(
            "INSERT INTO budget_allocations (id, user_id, bucket_id, pay_period_id, amount, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![id, user_id, req.bucket_id, req.pay_period_id, req.amount, now, now]
        ).map_err(|e| e.to_string())?;
    }

    // Return the allocation
    let allocations = engine
        .db()
        .get_budget_allocations(&user_id)
        .await
        .map_err(|e| e.to_string())?;
    allocations
        .into_iter()
        .find(|a| a.bucket_id == req.bucket_id && a.pay_period_id == req.pay_period_id)
        .map(|a| BudgetAllocation {
            id: a.id,
            user_id: a.user_id,
            bucket_id: a.bucket_id,
            pay_period_id: a.pay_period_id,
            amount: a.amount,
            created_at: a.created_at,
            updated_at: a.updated_at,
        })
        .ok_or_else(|| "Failed to retrieve allocation".to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_get_allocations(
    _pay_period_id: Option<String>,
    member_id: Option<String>,
) -> Result<Vec<BudgetAllocation>, String> {
    let user_id = member_id.unwrap_or_default();
    if user_id.is_empty() {
        return Ok(vec![]);
    }

    let engine = engine::get_engine();
    engine
        .db()
        .get_budget_allocations(&user_id)
        .await
        .map(|rows| {
            rows.into_iter()
                .map(|a| BudgetAllocation {
                    id: a.id,
                    user_id: a.user_id,
                    bucket_id: a.bucket_id,
                    pay_period_id: a.pay_period_id,
                    amount: a.amount,
                    created_at: a.created_at,
                    updated_at: a.updated_at,
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}

// ── Delete Commands ─────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_delete_transaction(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn_async().await;
    conn.execute(
        "DELETE FROM budget_transactions WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn budget_delete_bucket(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn_async().await;
    let now = chrono::Utc::now().to_rfc3339();
    // Soft-delete: mark inactive rather than hard-deleting (preserves transaction history)
    conn.execute(
        "UPDATE budget_buckets SET is_active = 0, updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

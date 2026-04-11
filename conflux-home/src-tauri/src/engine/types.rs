// Conflux Engine — Shared Types
// All core data structures for the agent runtime.

use serde::{Deserialize, Serialize};

// ── Agent ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub role: String,
    pub soul: Option<String>,
    pub instructions: Option<String>,
    pub model_alias: String,
    pub tier: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

// ── Session ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub agent_id: String,
    pub user_id: String,
    pub title: Option<String>,
    pub status: String, // 'active' | 'archived' | 'paused'
    pub message_count: i64,
    pub total_tokens: i64,
    pub created_at: String,
    pub updated_at: String,
}

// ── Message ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String, // 'system' | 'user' | 'assistant' | 'tool'
    pub content: String,
    pub tool_call_id: Option<String>,
    pub tool_name: Option<String>,
    pub tool_args: Option<String>,
    pub tool_result: Option<String>,
    pub tokens_used: i64,
    pub model: Option<String>,
    pub provider_id: Option<String>,
    pub latency_ms: Option<i64>,
    pub created_at: String,
}

// ── Memory ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub agent_id: String,
    pub memory_type: String, // 'fact' | 'preference' | 'skill' | 'knowledge' | 'correction'
    pub key: Option<String>,
    pub content: String,
    pub source: Option<String>,
    pub confidence: f64,
    pub access_count: i64,
    pub last_accessed: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub expires_at: Option<String>,
}

// ── Tool ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub id: String,
    pub name: String,
    pub description: String,
    pub parameters: String, // JSON Schema
    pub category: String,
    pub permissions: String, // JSON array
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecution {
    pub id: String,
    pub session_id: String,
    pub message_id: String,
    pub tool_id: String,
    pub agent_id: String,
    pub arguments: String,
    pub result: Option<String>,
    pub status: String, // 'pending' | 'running' | 'success' | 'error'
    pub error: Option<String>,
    pub duration_ms: Option<i64>,
}

// ── Chat Request / Response (OpenAI-compatible) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: Option<bool>,
    pub max_tokens: Option<i64>,
    pub temperature: Option<f64>,
    #[serde(default)]
    pub tools: Option<Vec<ChatTool>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTool {
    #[serde(rename = "type")]
    pub tool_type: String, // always "function"
    pub function: ChatToolFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String, // always "function"
    pub function: ToolCallFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String, // JSON string
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChoice {
    pub index: i64,
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
}

// ── Engine Response (internal) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineResponse {
    pub content: String,
    pub model: String,
    pub provider_id: String,
    pub provider_name: String,
    pub tokens_used: i64,
    pub latency_ms: i64,
    pub calls_remaining: i64,
}

// ── Provider Config ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model_id: String,
    pub model_alias: String,
    pub priority: i32,
    pub is_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

// ── Provider Template ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderTemplate {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub description: String,
    pub base_url: String,
    pub models: Vec<String>, // parsed from JSON array
    pub default_model: String,
    pub model_alias: String,
    pub category: String, // 'free' | 'cloud' | 'local'
    pub docs_url: Option<String>,
    pub is_free: bool,
    pub sort_order: i64,
}

// ── Agent Capability ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCapability {
    pub agent_id: String,
    pub capability: String,
    pub proficiency: String,
}

// ── Agent Permissions ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPermission {
    pub agent_id: String,
    pub can_talk_to: String, // JSON array or '*'
    pub max_delegation_depth: i64,
    pub max_tokens_per_session: i64,
    pub can_create_tasks: bool,
    pub can_delete_data: bool,
    pub requires_verification: bool,
    pub anti_hallucination: bool,
}

// ── Verification Record ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationRecord {
    pub id: String,
    pub agent_id: String,
    pub session_id: Option<String>,
    pub claim_type: String,
    pub claim: String,
    pub verified_by: Option<String>,
    pub verification: String,
    pub evidence: Option<String>,
    pub created_at: String,
}

// ── Agent Communication ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCommunication {
    pub id: String,
    pub from_agent: String,
    pub to_agent: String,
    pub message_type: String,
    pub content: String,
    pub response: Option<String>,
    pub status: String,
    pub session_id: Option<String>,
    pub tokens_used: i64,
    pub created_at: String,
    pub responded_at: Option<String>,
}

// ── Task ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub agent_id: String,
    pub status: String,
    pub result: Option<String>,
    pub parent_task_id: Option<String>,
    pub session_id: Option<String>,
    pub created_by: String,
    pub priority: String,
    pub requires_verify: bool,
    pub verified: bool,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

// ── Lesson Learned ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LessonLearned {
    pub id: String,
    pub agent_id: Option<String>,
    pub category: String,
    pub lesson: String,
    pub evidence: Option<String>,
    pub action_taken: Option<String>,
    pub is_active: bool,
    pub created_at: String,
}

// ── Webhook ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Webhook {
    pub id: String,
    pub name: String,
    pub agent_id: String,
    pub path: String,
    pub secret: Option<String>,
    pub task_template: String,
    pub is_enabled: bool,
    pub call_count: i64,
    pub last_called_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── Event ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    pub event_type: String,
    pub source_agent: Option<String>,
    pub target_agent: Option<String>,
    pub payload: Option<String>,
    pub processed: bool,
    pub created_at: String,
}

// ── Skill ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub emoji: String,
    pub version: String,
    pub author: Option<String>,
    pub skill_type: String,
    pub instructions: String,
    pub triggers: Option<String>,
    pub agents: String,
    pub permissions: Option<String>,
    pub is_active: bool,
    pub install_source: Option<String>,
    pub manifest_json: Option<String>,
    pub installed_at: String,
    pub updated_at: String,
}

// ── Heartbeat ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatRecord {
    pub id: String,
    pub check_name: String,
    pub status: String,
    pub details: Option<String>,
    pub checked_at: String,
}

// ── Quota ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaRecord {
    pub user_id: String,
    pub date: String,
    pub calls_used: i64,
    pub tokens_used: i64,
    pub providers_used: Option<String>, // JSON
}

// ── Cron Job ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJob {
    pub id: String,
    pub name: String,
    pub agent_id: String,
    pub schedule: String,
    pub timezone: String,
    pub task_message: String,
    pub is_enabled: bool,
    pub last_run_at: Option<String>,
    pub next_run_at: Option<String>,
    pub run_count: i64,
    pub error_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

// ── Mission ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mission {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub owner_agent_id: Option<String>,
    pub parent_id: Option<String>,
    pub data: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

// ── Telemetry ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEvent {
    pub id: String,
    pub event_type: String,
    pub agent_id: Option<String>,
    pub session_id: Option<String>,
    pub data: Option<String>,
    pub created_at: String,
}

// ── Family Member ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FamilyMember {
    pub id: String,
    pub name: String,
    pub age: Option<i64>,
    pub age_group: String,  // 'toddler' | 'preschool' | 'kid' | 'teen' | 'young_adult' | 'adult'
    pub avatar: Option<String>,
    pub color: String,
    pub default_agent_id: Option<String>,
    pub parent_id: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateFamilyMember {
    pub name: String,
    pub age: Option<i64>,
    pub age_group: String,
    pub avatar: Option<String>,
    pub color: Option<String>,
    pub default_agent_id: Option<String>,
    pub parent_id: Option<String>,
}

// ── Agent Template ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTemplate {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub description: String,
    pub age_group: String,
    pub soul: String,
    pub instructions: String,
    pub model_alias: String,
    pub category: String,
    pub is_system: bool,
    pub created_at: String,
}

// ── Story Game ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryGame {
    pub id: String,
    pub member_id: Option<String>,
    pub agent_id: String,
    pub title: String,
    pub genre: String,       // 'adventure' | 'mystery' | 'fantasy' | 'scifi' | 'horror'
    pub age_group: String,
    pub difficulty: String,  // 'easy' | 'normal' | 'hard'
    pub status: String,      // 'active' | 'completed' | 'paused'
    pub current_chapter: i64,
    pub story_state: Option<String>,  // JSON
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateStoryGame {
    pub member_id: Option<String>,
    pub title: String,
    pub genre: String,
    pub age_group: String,
    pub difficulty: Option<String>,
}

// ── Story Chapter ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryChapter {
    pub id: String,
    pub game_id: String,
    pub chapter_number: i64,
    pub title: Option<String>,
    pub narrative: String,
    pub choices: String,      // JSON array
    pub puzzle: Option<String>, // JSON
    pub puzzle_solved: bool,
    pub image_prompt: Option<String>,
    pub image_url: Option<String>,
    pub chosen_choice_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryChoice {
    pub id: String,
    pub text: String,
    pub consequence_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryPuzzle {
    pub puzzle_type: String,  // 'riddle' | 'pattern' | 'logic' | 'word' | 'code'
    pub question: String,
    pub answer: String,
    pub hint: Option<String>,
}

// ── Story Seed ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorySeed {
    pub id: String,
    pub title: String,
    pub genre: String,
    pub age_group: String,
    pub difficulty: String,
    pub opening: String,
    pub initial_choices: String, // JSON
    pub world_template: String,  // JSON
    pub puzzle_types: String,    // JSON
    pub created_at: String,
}

// ── Learning Activity ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningActivity {
    pub id: String,
    pub member_id: String,
    pub agent_id: String,
    pub session_id: Option<String>,
    pub activity_type: String,  // 'reading' | 'math' | 'science' | 'coding' | 'creative' | etc.
    pub topic: Option<String>,
    pub description: Option<String>,
    pub difficulty: Option<String>,
    pub score: Option<f64>,
    pub duration_sec: Option<i64>,
    pub tokens_used: i64,
    pub metadata: Option<String>,  // JSON
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningGoal {
    pub id: String,
    pub member_id: String,
    pub goal_type: String,  // 'streak' | 'mastery' | 'exploration' | 'custom'
    pub activity_type: Option<String>,
    pub title: String,
    pub target_value: f64,
    pub current_value: f64,
    pub unit: Option<String>,
    pub deadline: Option<String>,
    pub is_complete: bool,
    pub created_at: String,
    pub completed_at: Option<String>,
}

// ── Learning Progress Summary (computed) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningProgress {
    pub member_id: String,
    pub member_name: String,
    pub total_activities: i64,
    pub total_minutes: i64,
    pub current_streak_days: i64,
    pub longest_streak_days: i64,
    pub activities_by_type: Vec<ActivityCount>,
    pub recent_topics: Vec<String>,
    pub average_score: Option<f64>,
    pub goals: Vec<LearningGoal>,
    pub weekly_summary: Vec<DailyActivity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityCount {
    pub activity_type: String,
    pub count: i64,
    pub total_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyActivity {
    pub date: String,
    pub count: i64,
    pub minutes: i64,
}

// ── Meal Plan ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MealPlan {
    pub id: String,
    pub member_id: Option<String>,
    pub week_start: String,
    pub plan_data: String,   // JSON
    pub grocery_list: Option<String>,  // JSON
    pub created_at: String,
    pub updated_at: String,
}

// ── Budget Entry ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetEntry {
    pub id: String,
    pub member_id: Option<String>,
    pub entry_type: String,  // 'income' | 'expense' | 'savings' | 'goal'
    pub category: String,
    pub amount: f64,
    pub description: Option<String>,
    pub recurring: bool,
    pub frequency: Option<String>,
    pub date: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryTotal {
    pub category: String,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetSummary {
    pub month: String,
    pub total_income: f64,
    pub total_expenses: f64,
    pub total_savings: f64,
    pub net: f64,
    pub categories: Vec<CategoryTotal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetGoal {
    pub id: String,
    pub member_id: Option<String>,
    pub name: String,
    pub target_amount: f64,
    pub current_amount: f64,
    pub deadline: Option<String>,
    pub monthly_allocation: Option<f64>,
    pub auto_allocate: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetPattern {
    pub category: String,
    pub pattern_type: String,  // "recurring", "increasing", "decreasing", "seasonal"
    pub description: String,
    pub avg_amount: f64,
    pub frequency: String,
}

// ── Budget Engine (Zero-Based Budgeting) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetSettingsRow {
    pub id: String,
    pub user_id: String,
    pub pay_frequency: String,
    pub pay_dates: String,
    pub income_amount: f64,
    pub currency: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetBucketRow {
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
pub struct BudgetAllocationRow {
    pub id: String,
    pub user_id: String,
    pub bucket_id: String,
    pub pay_period_id: String,
    pub amount: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetTransactionRow {
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
pub struct MonthlyReport {
    pub month: String,
    pub total_income: f64,
    pub total_expenses: f64,
    pub total_savings: f64,
    pub net: f64,
    pub top_categories: Vec<CategoryTotal>,
    pub patterns: Vec<BudgetPattern>,
    pub goals_progress: Vec<BudgetGoal>,
    pub savings_rate: f64,
    pub comparison_to_last_month: Option<f64>,
}

// ── Content Feed Item ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentFeedItem {
    pub id: String,
    pub member_id: Option<String>,
    pub content_type: String,  // 'news' | 'tip' | 'challenge' | 'fun_fact' | 'reminder'
    pub title: String,
    pub body: String,
    pub source_url: Option<String>,
    pub category: Option<String>,
    pub is_read: bool,
    pub is_bookmarked: bool,
    pub created_at: String,
    pub expires_at: Option<String>,
}

// ── Smart Kitchen — Meals ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meal {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub cuisine: Option<String>,
    pub category: Option<String>,  // 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert'
    pub photo_url: Option<String>,
    pub prep_time_min: Option<i64>,
    pub cook_time_min: Option<i64>,
    pub servings: i64,
    pub difficulty: String,
    pub instructions: Option<String>,
    pub estimated_cost: Option<f64>,
    pub cost_per_serving: Option<f64>,
    pub calories: Option<i64>,
    pub tags: Option<String>,  // JSON array
    pub source: String,
    pub is_favorite: bool,
    pub last_made: Option<String>,
    pub times_made: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MealIngredient {
    pub id: String,
    pub meal_id: String,
    pub name: String,
    pub quantity: Option<f64>,
    pub unit: Option<String>,
    pub estimated_cost: Option<f64>,
    pub category: Option<String>,
    pub is_optional: bool,
    pub notes: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MealPlanEntry {
    pub id: String,
    pub week_start: String,
    pub day_of_week: i64,   // 0=Mon ... 6=Sun
    pub meal_slot: String,  // 'breakfast' | 'lunch' | 'dinner' | 'snack'
    pub meal_id: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroceryItem {
    pub id: String,
    pub member_id: Option<String>,
    pub name: String,
    pub quantity: Option<f64>,
    pub unit: Option<String>,
    pub category: Option<String>,
    pub estimated_cost: Option<f64>,
    pub is_checked: bool,
    pub source_meal_id: Option<String>,
    pub week_start: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MealPhoto {
    pub id: String,
    pub meal_id: String,
    pub photo_url: String,
    pub caption: Option<String>,
    pub ai_tags: Option<String>,
    pub taken_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeMenuItem {
    pub meal_id: String,
    pub name: String,
    pub emoji: String,
    pub reason: String,          // "You have all ingredients" / "Uses expiring X"
    pub estimated_minutes: i64,
    pub missing_ingredients: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PantryHeatItem {
    pub name: String,
    pub freshness: f64,          // 0.0 (expired) to 1.0 (fresh)
    pub days_until_expiry: Option<i64>,
    pub location: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CookingStep {
    pub step_number: i64,
    pub instruction: String,
    pub duration_minutes: Option<i64>,
    pub timer_alert: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KitchenDigest {
    pub week_start: String,
    pub meals_cooked: i64,
    pub variety_score: f64,      // 0-100
    pub unique_cuisines: i64,
    pub estimated_savings: f64,
    pub top_cuisine: Option<String>,
    pub suggestion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KitchenNudge {
    pub nudge_type: String,      // "expiring", "variety", "budget", "health"
    pub message: String,
    pub action_label: String,
    pub emoji: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KitchenInventoryItem {
    pub id: String,
    pub member_id: String,
    pub name: String,
    pub quantity: Option<f64>,
    pub unit: Option<String>,
    pub category: Option<String>,
    pub expiry_date: Option<String>,
    pub location: Option<String>,  // 'fridge' | 'freezer' | 'pantry'
    pub last_restocked: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── Fridge Scanner Results ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FridgeScanResult {
    pub items: Vec<KitchenInventoryItem>,
    pub summary: String,
    pub waste_risk: Vec<String>,
    pub suggested_meals: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MealMatch {
    pub meal_id: String,
    pub meal_name: String,
    pub have_count: i64,
    pub total_count: i64,
    pub match_pct: f64,
    pub missing_ingredients: Vec<String>,
    pub can_make: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MealMatchResult {
    pub matches: Vec<MealMatch>,
    pub total_inventory_items: i64,
    pub can_make_count: i64,
}

// ── Life Autopilot ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeDocument {
    pub id: String,
    pub member_id: Option<String>,
    pub doc_type: String,
    pub title: String,
    pub content: Option<String>,
    pub ai_summary: Option<String>,
    pub ai_key_dates: Option<String>,   // JSON
    pub ai_action_items: Option<String>, // JSON
    pub source: String,
    pub file_url: Option<String>,
    pub tags: Option<String>,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeReminder {
    pub id: String,
    pub member_id: Option<String>,
    pub document_id: Option<String>,
    pub reminder_type: String,
    pub title: String,
    pub description: Option<String>,
    pub due_date: String,
    pub priority: String,
    pub is_dismissed: bool,
    pub is_completed: bool,
    pub recurring: bool,
    pub frequency: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeKnowledge {
    pub id: String,
    pub member_id: Option<String>,
    pub category: String,
    pub key: String,
    pub value: String,
    pub source_doc_id: Option<String>,
    pub confidence: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeAutopilotDashboard {
    pub upcoming_reminders: Vec<LifeReminder>,
    pub recent_documents: Vec<LifeDocument>,
    pub knowledge_count: i64,
    pub documents_count: i64,
    pub overdue_reminders: Vec<LifeReminder>,
}

// ── Life Autopilot: Orbit ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeTask {
    pub id: String,
    pub title: String,
    pub category: Option<String>,
    pub priority: String,
    pub status: String,
    pub due_date: Option<String>,
    pub energy_type: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeHabit {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub frequency: String,
    pub target_count: i64,
    pub streak: i64,
    pub best_streak: i64,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeHabitLog {
    pub id: String,
    pub habit_id: String,
    pub logged_date: String,
    pub count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeDailyFocus {
    pub id: String,
    pub focus_date: String,
    pub task_id: Option<String>,
    pub position: i64,
    pub task: Option<LifeTask>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeSchedule {
    pub id: String,
    pub task_id: Option<String>,
    pub suggested_time: Option<String>,
    pub energy_match: Option<String>,
    pub reason: Option<String>,
    pub accepted: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeNudge {
    pub id: String,
    pub nudge_type: String,
    pub message: String,
    pub action_label: Option<String>,
    pub dismissed: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrbitDashboard {
    pub today_focus: Vec<LifeDailyFocus>,
    pub pending_tasks: Vec<LifeTask>,
    pub active_habits: Vec<LifeHabit>,
    pub nudges: Vec<LifeNudge>,
    pub streak_total: i64,
    pub completed_today: i64,
}

// ── Meal with ingredients (joined) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MealWithIngredients {
    pub meal: Meal,
    pub ingredients: Vec<MealIngredient>,
}

// ── Weekly plan summary ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeeklyPlan {
    pub week_start: String,
    pub days: Vec<DayPlan>,
    pub total_estimated_cost: f64,
    pub meal_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayPlan {
    pub day_of_week: i64,
    pub day_name: String,
    pub slots: Vec<PlanSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanSlot {
    pub meal_slot: String,
    pub meal: Option<Meal>,
    pub notes: Option<String>,
}

// ── Home Health ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeProfile {
    pub id: String,
    pub address: Option<String>,
    pub year_built: Option<i64>,
    pub square_feet: Option<i64>,
    pub hvac_type: Option<String>,
    pub hvac_filter_size: Option<String>,
    pub water_heater_type: Option<String>,
    pub roof_type: Option<String>,
    pub window_type: Option<String>,
    pub insulation_type: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeBill {
    pub id: String,
    pub bill_type: String,
    pub amount: f64,
    pub usage: Option<f64>,
    pub billing_month: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeMaintenance {
    pub id: String,
    pub task: String,
    pub category: String,
    pub last_completed: Option<String>,
    pub interval_months: Option<i64>,
    pub next_due: Option<String>,
    pub priority: String,
    pub estimated_cost: Option<f64>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeAppliance {
    pub id: String,
    pub name: String,
    pub category: String,
    pub model: Option<String>,
    pub installed_date: Option<String>,
    pub expected_lifespan_years: Option<f64>,
    pub warranty_expiry: Option<String>,
    pub estimated_replacement_cost: Option<f64>,
    pub notes: Option<String>,
    pub last_service: Option<String>,
    pub next_service: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeSystem {
    pub name: String,
    pub icon: String,
    pub status: String, // "healthy" | "warning" | "critical"
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeDashboard {
    pub profile: Option<HomeProfile>,
    pub upcoming_maintenance: Vec<HomeMaintenance>,
    pub overdue_maintenance: Vec<HomeMaintenance>,
    pub appliances_needing_service: Vec<HomeAppliance>,
    pub bill_trend: Vec<BillTrendPoint>,
    pub total_monthly_utilities: f64,
    pub health_score: f64,
    pub systems: Vec<HomeSystem>,
    pub ai_alerts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillTrendPoint {
    pub month: String,
    pub electric: Option<f64>,
    pub gas: Option<f64>,
    pub water: Option<f64>,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeInsight {
    pub title: String,
    pub description: String,
    pub estimated_impact: Option<String>,
    pub priority: String,
    pub category: String,
}

// ── Dream Builder ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dream {
    pub id: String,
    pub member_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub category: String,
    pub target_date: Option<String>,
    pub status: String,
    pub progress: f64,
    pub ai_plan: Option<String>,
    pub ai_next_actions: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DreamMilestone {
    pub id: String,
    pub dream_id: String,
    pub title: String,
    pub description: Option<String>,
    pub target_date: Option<String>,
    pub completed_at: Option<String>,
    pub is_completed: bool,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DreamTask {
    pub id: String,
    pub dream_id: String,
    pub milestone_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub due_date: Option<String>,
    pub completed_at: Option<String>,
    pub is_completed: bool,
    pub frequency: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DreamProgress {
    pub id: String,
    pub dream_id: String,
    pub note: Option<String>,
    pub progress_change: Option<f64>,
    pub ai_insight: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DreamDashboard {
    pub dreams: Vec<Dream>,
    pub active_dreams: i64,
    pub total_milestones: i64,
    pub completed_milestones: i64,
    pub upcoming_tasks: Vec<DreamTask>,
    pub recent_progress: Vec<DreamProgress>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DreamVelocity {
    pub dream_id: String,
    pub milestones_completed: i64,
    pub milestones_total: i64,
    pub tasks_completed: i64,
    pub tasks_total: i64,
    pub progress_pct: f64,
    pub pace: String,          // "ahead", "on_track", "behind"
    pub days_remaining: Option<i64>,
    pub estimated_completion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEntry {
    pub date: String,
    pub event_type: String,    // "milestone", "task", "progress"
    pub title: String,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DreamTimeline {
    pub dream_id: String,
    pub entries: Vec<TimelineEntry>,
    pub total_entries: i64,
    pub completed_entries: i64,
}

// ── Agent Diary ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiaryEntry {
    pub id: String,
    pub agent_id: String,
    pub entry_date: String,
    pub title: Option<String>,
    pub content: String,
    pub mood: String,
    pub topics_discussed: Option<String>,
    pub memorable_moment: Option<String>,
    pub word_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiaryDashboard {
    pub total_entries: i64,
    pub entries_this_week: i64,
    pub mood_distribution: Vec<MoodCount>,
    pub most_active_agent: Option<String>,
    pub latest_entries: Vec<DiaryEntry>,
    pub agents_with_entries: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodCount {
    pub mood: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiaryMoodLog {
    pub id: String,
    pub agent_id: String,
    pub mood: String,
    pub intensity: i64,
    pub trigger_event: Option<String>,
    pub created_at: String,
}

// ── Vault ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultFile {
    pub id: String,
    pub path: String,
    pub name: String,
    pub file_type: String,
    pub mime_type: Option<String>,
    pub extension: Option<String>,
    pub size_bytes: i64,
    pub thumbnail_path: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub duration_secs: Option<f64>,
    pub created_by: Option<String>,
    pub source_prompt: Option<String>,
    pub description: Option<String>,
    pub is_favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultProject {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub project_type: Option<String>,
    pub cover_file_id: Option<String>,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub file_count: Option<i64>,  // populated via JOIN
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultTag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub tag_type: String,
    pub file_count: Option<i64>,  // populated via JOIN
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultProjectDetail {
    pub project: VaultProject,
    pub files: Vec<VaultFile>,
}

// ── Studio ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioGeneration {
    pub id: String,
    pub module: String,           // 'image' | 'video' | 'music' | 'voice' | 'code' | 'design'
    pub prompt: String,
    pub remix_of: Option<String>,
    pub model: String,
    pub provider: String,
    pub status: String,           // 'pending' | 'generating' | 'complete' | 'failed'
    pub output_path: Option<String>,
    pub output_url: Option<String>,
    pub metadata_json: Option<String>,
    pub cost_cents: i64,
    pub vault_file_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioPromptHistory {
    pub id: String,
    pub prompt: String,
    pub module: String,
    pub use_count: i64,
    pub last_used: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioUsageStats {
    pub id: String,
    pub user_id: String,
    pub month: String,
    pub module: String,
    pub generation_count: i64,
    pub total_cost_cents: i64,
}

// ── Orbit Cross-App Insights ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrbitInsights {
    pub insights: Vec<OrbitInsight>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrbitInsight {
    pub id: String,
    pub title: String,
    pub message: String,
    pub icon: String,
    pub source_apps: Vec<String>,  // ["budget", "kitchen", "dreams"]
    pub confidence: f64,            // 0.0 - 1.0
    pub action_suggestion: Option<String>,
    pub priority: String,           // "high", "medium", "low"
    pub created_at: String,
}

// ── Echo Counselor Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoCounselorMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoCounselorSession {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub status: String,
    pub message_count: i64,
    pub summary: Option<String>,
    pub counselor_reflection: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoCrisisFlag {
    pub id: String,
    pub session_id: Option<String>,
    pub entry_id: Option<String>,
    pub severity: String,
    pub detected_text: String,
    pub response_given: String,
    pub resources_provided: Vec<String>,
    pub resolved: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoGratitudeEntry {
    pub id: String,
    pub items: String,
    pub context: Option<String>,
    pub session_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoGroundingExercise {
    pub id: String,
    pub r#type: String,
    pub title: String,
    pub description: String,
    pub duration_min: i64,
    pub prescribed_by: String,
    pub completed: bool,
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoStartSessionRequest {
    pub opening: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoSendMessageRequest {
    pub session_id: String,
    pub content: String,
}

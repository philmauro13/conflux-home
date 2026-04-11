// Conflux Home — Intent Router Hook
// Classifies natural language input and routes to the correct agent/app.

export type IntentType =
  | 'budget'
  | 'kitchen'
  | 'dreams'
  | 'life'
  | 'home'
  | 'feed'
  | 'chat'
  | 'general';

export interface IntentResult {
  type: IntentType;
  view: string; // Target view for navigation
  confidence: number; // 0-1
  agentId?: string; // Target agent
  prompt?: string; // Pre-built prompt to send
  rationale?: string; // Why this route was chosen
}

// ── Keyword-based intent classification ──

const INTENT_RULES: Array<{ keywords: string[]; type: IntentType; view: string; agentId: string }> = [
  {
    keywords: [
      'afford', 'afford', 'budget', 'spend', 'spent', 'money', 'cost', 'price',
      'income', 'salary', 'expense', 'save', 'saving', 'savings', 'bill', 'paid',
      'pay', 'payment', 'categorize', 'transaction', 'dollar', 'dollars',
      'financial', 'finances', 'how much', 'can i buy', 'can i get',
    ],
    type: 'budget',
    view: 'budget',
    agentId: 'pulse',
  },
  {
    keywords: [
      'cook', 'recipe', 'meal', 'dinner', 'lunch', 'breakfast', 'eat', 'food',
      'hungry', 'pantry', 'grocery', 'groceries', 'kitchen', 'bake', 'fry',
      'grill', 'snack', 'drink', 'what to make', 'what should i cook',
      'what should i eat', 'what to eat', 'meal plan', 'ingredients',
      'hungry', 'cook tonight', 'dinner tonight', 'dinner tonight', 'tonight', 'meal prep',
    ],
    type: 'kitchen',
    view: 'kitchen',
    agentId: 'hearth',
  },
  {
    keywords: [
      'dream', 'goal', 'achieve', 'milestone', 'progress', 'target',
      'break down', 'breakdown', 'decompose', 'plan', 'objective',
      'accomplish', 'want to do', 'want to', 'i want to', 'my dream',
      'learn guitar', 'learn piano', 'learn music', 'get fit', 'lose weight',
      'marathon', 'fitness', 'start a business', 'side hustle',
    ],
    type: 'dreams',
    view: 'dreams',
    agentId: 'horizon',
  },
  {
    keywords: [
      'task', 'schedule', 'calendar', 'focus', 'priority', 'habit',
      'reminder', 'what today', 'what is my day', 'what should i do',
      'what should i focus', "what's on my plate", 'todo', 'to-do',
      'life', 'autopilot', 'reschedule', 'due', 'deadline',
      'keep me on track', "keeping me up", 'stressed', 'stress',
    ],
    type: 'life',
    view: 'life',
    agentId: 'orbit',
  },
  {
    keywords: [
      'maintenance', 'appliance', 'fix', 'repair', 'home',
      'bill due', 'utility', 'water', 'electricity', 'insurance',
      'house', 'property', 'leak', 'broken',
    ],
    type: 'home',
    view: 'home',
    agentId: 'foundation',
  },
  {
    keywords: [
      'news', 'feed', 'briefing', 'happening', 'update',
      'what', 'news today', 'daily brief', 'morning brief',
      'what is going on', 'summarize', 'summary',
    ],
    type: 'feed',
    view: 'feed',
    agentId: 'current',
  },
];

// ── Confidence scoring ──

function scoreIntent(input: string, keywords: string[]): number {
  const lower = input.toLowerCase();
  const words = lower.split(/\s+/);
  let score = 0;

  for (const keyword of keywords) {
    if (lower.includes(keyword)) {
      // Longer/more specific keywords = higher confidence
      score += keyword.split(' ').length * 0.3;
      // Exact word match = bonus
      if (words.some(w => w === keyword)) {
        score += 0.5;
      }
    }
  }

  // Normalize: cap at 1.0
  return Math.min(1.0, score / 1.5);
}

// ── Build a contextual prompt for the target app ──

function buildPrompt(input: string, type: IntentType): string {
  switch (type) {
    case 'budget':
      return `The user asked: "${input}". Help them with their budget question. If they're asking about affordability, check their spending and give a clear answer. Be concise and warm.`;
    case 'kitchen':
      return `The user asked: "${input}". Help them with their kitchen/meal question. Suggest recipes from what they might have, or help them plan.`;
    case 'dreams':
      return `The user asked: "${input}". Help them break this down into actionable steps. Create milestones and tasks if you can.`;
    case 'life':
      return `The user asked: "${input}". Help them organize their day, prioritize tasks, or manage their schedule.`;
    case 'home':
      return `The user asked: "${input}". Help them with their home maintenance, bills, or appliance tracking.`;
    case 'feed':
      return `The user asked: "${input}". Give them a helpful summary or briefing about what's relevant.`;
    default:
      return input;
  }
}

// ── Main classification ──

export function classifyIntent(input: string): IntentResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { type: 'chat', view: 'chat', confidence: 1.0, agentId: 'conflux' };
  }

  let bestScore = 0;
  let bestMatch: IntentResult = {
    type: 'chat',
    view: 'chat',
    confidence: 0,
    agentId: 'conflux',
  };

  for (const rule of INTENT_RULES) {
    const score = scoreIntent(trimmed, rule.keywords);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        type: rule.type,
        view: rule.view,
        confidence: score,
        agentId: rule.agentId,
        prompt: buildPrompt(trimmed, rule.type),
      };
    }
  }

  // If no confident match, fallback to chat
  if (bestMatch.confidence < 0.2) {
    return {
      type: 'chat',
      view: 'chat',
      confidence: 1.0 - bestMatch.confidence,
      agentId: 'conflux',
      rationale: 'No confident match — falling back to general chat',
    };
  }

  return {
    ...bestMatch,
    rationale: `Matched with ${Math.round(bestMatch.confidence * 100)}% confidence`,
  };
}

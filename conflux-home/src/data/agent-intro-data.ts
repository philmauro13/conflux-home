export interface AgentIntroConfig {
  id: string;
  name: string;
  emoji: string;
  appColor: string;
  introText: string;
  inputLabel: string;
  placeholder: string;
  starterConfig: {
    defaultBudgetCategories?: string[];
    defaultPantryItems?: { name: string; category?: string; location?: string }[];
    dreamTemplates?: { title: string; description: string }[];
    focusAreas?: string[];
  };
}

export const AGENT_INTRO_CONFIGS: AgentIntroConfig[] = [
  {
    id: 'hearth',
    name: 'Hearth',
    emoji: '🍳',
    appColor: '#ff8844',
    introText: "I'm Hearth — your kitchen intelligence. I've pre-loaded your pantry with common staples. Tell me what you cook and I'll learn your rhythm. What's your favorite meal?",
    inputLabel: "Tell me your favorite dishes and I'll stock your kitchen",
    placeholder: "e.g., Spaghetti carbonara, chicken stir-fry, pancakes",
    starterConfig: {
      defaultPantryItems: [
        { name: 'Salt', category: 'spice', location: 'pantry' },
        { name: 'Pepper', category: 'spice', location: 'pantry' },
        { name: 'Olive oil', category: 'oil', location: 'pantry' },
        { name: 'Flour', category: 'baking', location: 'pantry' },
        { name: 'Sugar', category: 'baking', location: 'pantry' },
        { name: 'Eggs', category: 'dairy', location: 'fridge' },
        { name: 'Milk', category: 'dairy', location: 'fridge' },
        { name: 'Butter', category: 'dairy', location: 'fridge' },
      ],
    },
  },
  {
    id: 'pulse',
    name: 'Pulse',
    emoji: '💰',
    appColor: '#00cc88',
    introText: "I'm Pulse — your financial heartbeat. I've set up starter categories so you don't have to configure anything. Tell me your monthly income and I'll allocate everything.",
    inputLabel: "What's your approximate monthly income? I'll set it up.",
    placeholder: "e.g., $5000",
    starterConfig: {
      defaultBudgetCategories: ['Groceries', 'Dining', 'Housing', 'Transport', 'Entertainment', 'Health', 'Savings'],
    },
  },
  {
    id: 'horizon',
    name: 'Horizon',
    emoji: '🏔️',
    appColor: '#3b82f6',
    introText: "I'm Horizon — I help you turn big dreams into real progress. What's one thing you want to achieve in the next 90 days? I'll break it down into steps for you.",
    inputLabel: "Tell me your goal and I'll decompose it.",
    placeholder: "e.g., Learn guitar, run a 5K, start a side business",
    starterConfig: {
      dreamTemplates: [
        { title: 'Learn a Skill', description: 'Pick up a new skill over 90 days' },
        { title: 'Get Fit', description: 'Improve your fitness with regular exercise' },
        { title: 'Start a Business', description: 'Launch a small side business' },
      ],
    },
  },
  {
    id: 'orbit',
    name: 'Orbit',
    emoji: '🪐',
    appColor: '#7b2fff',
    introText: "I'm Orbit — I keep your life on track. I've set up a focus system for you. What's been keeping you up at night lately?",
    inputLabel: "What's your top priority right now?",
    placeholder: "e.g., Health, Work, Relationships",
    starterConfig: {
      focusAreas: ['Health', 'Work', 'Relationships'],
    },
  },
  {
    id: 'conflux',
    name: 'Conflux',
    emoji: '🤖',
    appColor: '#6366F1',
    introText: "I'm Conflux — your strategic partner. My job is to make sure all your agents work together. You're all set — let's get started.",
    inputLabel: '', // No input for Conflux
    placeholder: '',
    starterConfig: {},
  },
];

export function getAgentIntroConfig(id: string): AgentIntroConfig | undefined {
  return AGENT_INTRO_CONFIGS.find(config => config.id === id);
}
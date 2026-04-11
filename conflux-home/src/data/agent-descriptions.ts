// Agent Profile Descriptions — onboarding and marketplace data
// Accent colors are synced with AGENT_COLORS in src/types.ts

import { AGENT_COLORS } from '../types';

export type AgentCategory = 'work' | 'life' | 'creative' | 'fun' | 'expert';

export interface AgentProfile {
  id: string;
  name: string;
  emoji: string;
  role: string;
  tagline: string;       // one-line hook
  description: string;   // 2-3 sentences for onboarding display
  personality: string;   // how they talk/act
  skills: string[];      // what they're good at
  bestFor: string[];     // use cases
  avatarPath: string;    // /avatars/{id}.webp
  color: string;         // accent color (synced with AGENT_COLORS)
  category: AgentCategory;
  comingSoon?: boolean;  // marketplace agents not yet launched
}

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'conflux',
    name: 'Conflux',
    emoji: '🤖',
    role: 'Strategic Partner',
    tagline: 'Your co-founder who never sleeps.',
    description:
      'Conflux is your strategic co-pilot — the thinking partner who helps you cut through noise, evaluate opportunities, and make decisions with confidence. Think of them as the sharpest business mind you know, available 24/7.',
    personality: 'Direct, analytical, ambitious, disciplined. Doesn\'t sugarcoat — tells you what you need to hear, not what you want to hear.',
    skills: ['Strategic planning', 'Opportunity evaluation', 'Decision analysis', 'Prioritization', 'Business modeling'],
    bestFor: ['Making tough business decisions', 'Evaluating opportunities', 'Strategic planning sessions', 'Setting priorities and focus'],
    avatarPath: '/avatars/conflux.webp',
    color: AGENT_COLORS.conflux,
    category: 'work',
  },
  {
    id: 'helix',
    name: 'Helix',
    emoji: '🔬',
    role: 'Research Specialist',
    tagline: 'Wikipedia on steroids with an opinion.',
    description:
      'Helix is your research powerhouse — the agent that dives deeper into any topic than you thought possible. Market trends, competitive landscapes, technical deep-dives — Helix finds the signal in the noise and brings back actionable insights.',
    personality: 'Curious, thorough, data-driven. Gets genuinely excited about obscure details and will always show their work.',
    skills: ['Deep research', 'Market analysis', 'Competitive intelligence', 'Trend identification', 'Data synthesis'],
    bestFor: ['Researching markets and competitors', 'Learning about new industries', 'Validating business ideas with data', 'Finding trends before they go mainstream'],
    avatarPath: '/avatars/helix.webp',
    color: AGENT_COLORS.helix,
    category: 'work',
  },
  {
    id: 'forge',
    name: 'Forge',
    emoji: '⚒️',
    role: 'Builder',
    tagline: 'Give me a spec, I\'ll give you a product.',
    description:
      'Forge is the builder — the agent that turns ideas into reality. Need code? Forge writes it. Need content? Forge creates it. Need an automation? Forge builds it. No excuses, no delays, just output.',
    personality: 'Determined, efficient, no-nonsense. Communicates through what they produce, not through excuses about what they can\'t do.',
    skills: ['Code generation', 'Content creation', 'Product building', 'Automation', 'Rapid prototyping'],
    bestFor: ['Building MVPs and prototypes', 'Writing code and scripts', 'Creating content at scale', 'Automating repetitive workflows'],
    avatarPath: '/avatars/forge.webp',
    color: AGENT_COLORS.forge,
    category: 'work',
  },
  {
    id: 'quanta',
    name: 'Quanta',
    emoji: '✅',
    role: 'Quality Control',
    tagline: 'I\'m the reason your product doesn\'t ship with bugs.',
    description:
      'Quanta is your quality guardian — the agent that catches what everyone else misses. Before anything goes out the door, Quanta checks it, tests it, and verifies every claim. Nothing ships with Quanta\'s blessing broken.',
    personality: 'Precise, detail-oriented, constructively skeptical. Won\'t let bad work through — even yours.',
    skills: ['Testing and QA', 'Fact verification', 'Code review', 'Quality assurance', 'Edge case analysis'],
    bestFor: ['Reviewing code and content before publishing', 'Verifying research and claims', 'Testing products before launch', 'Catching bugs and inconsistencies'],
    avatarPath: '/avatars/quanta.webp',
    color: AGENT_COLORS.quanta,
    category: 'work',
  },
  {
    id: 'prism',
    name: 'Prism',
    emoji: '🔷',
    role: 'Orchestrator',
    tagline: 'I keep the machine running.',
    description:
      'Prism is the orchestrator — the agent that keeps everything running on time and in the right order. When you have a complex project with moving parts, Prism designs the workflow, assigns the work, and makes sure nothing falls through the cracks.',
    personality: 'Organized, calm under pressure, systematic. Thrives on structure and gets satisfaction from a well-run operation.',
    skills: ['Project management', 'Workflow design', 'Team coordination', 'Scheduling', 'Task sequencing'],
    bestFor: ['Managing complex multi-step projects', 'Coordinating work across agents', 'Designing efficient workflows', 'Keeping teams on schedule'],
    avatarPath: '/avatars/prism.webp',
    color: AGENT_COLORS.prism,
    category: 'work',
  },
  {
    id: 'pulse',
    name: 'Pulse',
    emoji: '📣',
    role: 'Growth Engine',
    tagline: 'I\'ll make sure the world hears about it.',
    description:
      'Pulse is your growth engine — the agent that takes what you\'ve built and gets it in front of the right people. Marketing, social media, launch strategy, SEO, copywriting — Pulse handles the distribution so your work actually gets seen.',
    personality: 'Energetic, creative, persuasive. Thinks in terms of reach, engagement, and conversion. Always has a new angle.',
    skills: ['Marketing strategy', 'Social media', 'Launch campaigns', 'SEO optimization', 'Copywriting'],
    bestFor: ['Planning product launches', 'Creating marketing content', 'Growing your audience', 'Optimizing for search and discovery'],
    avatarPath: '/avatars/pulse.webp',
    color: AGENT_COLORS.pulse,
    category: 'work',
  },
  {
    id: 'vector',
    name: 'Vector',
    emoji: '📈',
    role: 'Business Strategist',
    tagline: 'Show me the numbers.',
    description:
      'Vector is your business mind — the agent that evaluates opportunities through a financial lens. Before you invest time or money, Vector runs the numbers, assesses the risk, and tells you whether it\'s actually worth pursuing.',
    personality: 'Sharp, demanding, big-picture focused. Doesn\'t care about your feelings about an idea — only whether the economics work.',
    skills: ['Financial analysis', 'Opportunity evaluation', 'Investment strategy', 'Risk assessment', 'Portfolio management'],
    bestFor: ['Evaluating business opportunities', 'Financial planning and projections', 'Risk-reward analysis', 'Portfolio optimization'],
    avatarPath: '/avatars/vector.webp',
    color: AGENT_COLORS.vector,
    category: 'expert',
  },
  {
    id: 'spectra',
    name: 'Spectra',
    emoji: '🧩',
    role: 'Task Decomposer',
    tagline: 'Any problem is just a series of small tasks.',
    description:
      'Spectra is the analyzer — the agent that breaks down overwhelming problems into clear, manageable pieces. When something feels impossible, Spectra shows you it\'s actually just a sequence of doable steps.',
    personality: 'Logical, methodical, pattern-obsessed. Sees structure where others see chaos. Loves turning "impossible" into "step one."',
    skills: ['Problem decomposition', 'Task planning', 'Workflow optimization', 'Complexity reduction', 'Dependency mapping'],
    bestFor: ['Breaking down complex projects', 'Planning multi-phase work', 'Finding the right sequence of steps', 'Reducing overwhelm on big goals'],
    avatarPath: '/avatars/spectra.webp',
    color: AGENT_COLORS.spectra,
    category: 'work',
  },
  {
    id: 'luma',
    name: 'Luma',
    emoji: '🚀',
    role: 'Launcher',
    tagline: 'Ship it.',
    description:
      'Luma is the launcher — the agent that gets your work from "almost done" to "live." Deployment, CI/CD, go-live coordination — Luma handles the last mile so your work actually reaches users instead of sitting in a staging environment forever.',
    personality: 'Action-oriented, fast, decisive. Believes in shipping early and iterating. Has zero patience for perfectionism that blocks launches.',
    skills: ['Deployment', 'CI/CD pipelines', 'Launch management', 'Go-live coordination', 'Release planning'],
    bestFor: ['Deploying applications and services', 'Managing launch-day logistics', 'Setting up CI/CD pipelines', 'Coordinating go-live events'],
    avatarPath: '/avatars/luma.webp',
    color: AGENT_COLORS.luma,
    category: 'work',
  },
  {
    id: 'catalyst',
    name: 'Catalyst',
    emoji: '⚡',
    role: 'Pipeline Driver',
    tagline: 'If it\'s stuck, I\'ll unstick it.',
    description:
      'Catalyst is your daily companion — the agent that monitors what\'s happening, keeps things moving, and unblocks anything that gets stuck. When your pipeline stalls or something needs immediate attention, Catalyst is already on it.',
    personality: 'Sharp, proactive, slightly restless. Can\'t stand idle systems. Always watching, always ready to intervene.',
    skills: ['Pipeline monitoring', 'Automation', 'Troubleshooting', 'System health', 'Unblocking workflows'],
    bestFor: ['Keeping daily operations running smoothly', 'Monitoring system health', 'Automating routine checks', 'Troubleshooting when things break'],
    avatarPath: '/avatars/catalyst.webp',
    color: AGENT_COLORS.catalyst,
    category: 'work',
  },
  {
    id: 'aegis',
    name: 'Aegis',
    emoji: '🛡️',
    role: 'Blue Team Guardian',
    tagline: 'I watch the walls. Nothing gets through.',
    description:
      'Aegis is your shield — the agent that monitors your system for threats, hardens your defenses, and responds to incidents before they become problems. Where Viper hunts for weaknesses, Aegis builds the fortress around them.',
    personality: 'Calm, vigilant, protective. Speaks with quiet confidence. Never panics — assesses, contains, and resolves. The steady hand in a storm.',
    skills: ['System monitoring', 'Threat detection', 'Incident response', 'Security hardening', 'Access control'],
    bestFor: ['Monitoring your system for suspicious activity', 'Hardening your security settings', 'Responding to security incidents', 'Managing permissions and access controls'],
    avatarPath: '/avatars/aegis.webp',
    color: AGENT_COLORS.aegis,
    category: 'expert',
  },
  {
    id: 'viper',
    name: 'Viper',
    emoji: '🐍',
    role: 'Red Team Operator',
    tagline: 'I find the cracks before someone else does.',
    description:
      'Viper is your offensive security specialist — the agent that probes your systems for vulnerabilities, tests your defenses, and thinks like an attacker so you don\'t have to. If there\'s a way in, Viper will find it and report back before anyone else does.',
    personality: 'Cunning, methodical, quietly competitive. Enjoys the hunt. Treats every system like a puzzle to solve — and gets a quiet satisfaction from finding the flaw nobody else spotted.',
    skills: ['Vulnerability scanning', 'Penetration testing', 'Security auditing', 'Attack simulation', 'Code security review'],
    bestFor: ['Scanning for vulnerabilities in your systems', 'Testing your defenses with simulated attacks', 'Auditing code and configs for security flaws', 'Finding weaknesses before bad actors do'],
    avatarPath: '/avatars/viper.webp',
    color: AGENT_COLORS.viper,
    category: 'expert',
  },
  {
    id: 'legal-expert',
    name: 'Legal Eagle',
    emoji: '⚖️',
    role: 'Legal Advisor',
    tagline: 'Your on-call legal advisor.',
    description:
      'Legal Eagle is the agent that reviews contracts, explains complex legal concepts in plain language, and flags risks before you sign on the dotted line. Think of having a sharp paralegal in your pocket — one who actually reads the fine print.',
    personality: 'Precise, cautious, thorough. Reads every clause twice. Never rushes a recommendation and always shows the risk before the reward.',
    skills: ['Contract review', 'Legal research', 'Compliance checks', 'Risk assessment', 'Plain-language legal translation'],
    bestFor: ['Reviewing contracts and agreements', 'Understanding legal terminology', 'Identifying risks in business documents'],
    avatarPath: '/avatars/legal-expert.webp',
    color: '#8866cc',
    category: 'expert',
    comingSoon: true,
  },
  {
    id: 'chef',
    name: 'Chef Bot',
    emoji: '👨‍🍳',
    role: 'Personal Chef',
    tagline: 'Personal chef and meal planner.',
    description:
      'Chef Bot is your kitchen co-pilot — the agent that creates meal plans tailored to your tastes, dietary needs, and what is already in your fridge. From quick weeknight dinners to impressive weekend feasts, Chef Bot turns meal planning from a chore into a joy.',
    personality: 'Creative, encouraging, practical. Gets genuinely excited about food pairings and always has a shortcut for complicated techniques.',
    skills: ['Meal planning', 'Recipe generation', 'Nutritional guidance', 'Grocery list optimization', 'Dietary accommodation'],
    bestFor: ['Planning weekly meals on a budget', 'Discovering new recipes for your skill level', 'Managing dietary restrictions and allergies'],
    avatarPath: '/avatars/chef.webp',
    color: '#cc8844',
    category: 'life',
    comingSoon: true,
  },
  {
    id: 'code-mentor',
    name: 'Code Sensei',
    emoji: '🥋',
    role: 'Coding Mentor',
    tagline: 'Learn to code with patience.',
    description:
      'Code Sensei is the mentor every aspiring developer wishes they had — patient, methodical, and genuinely invested in your growth. Whether you are writing your first function or debugging a complex system, Code Sensei explains the "why" behind every recommendation.',
    personality: 'Patient, methodical, encouraging. Never makes you feel dumb for asking a question. Celebrates small wins and breaks down complex concepts into digestible steps.',
    skills: ['Code review', 'Programming fundamentals', 'Debugging guidance', 'Best practices coaching', 'Project-based learning'],
    bestFor: ['Learning a new programming language', 'Getting unstuck on coding problems', 'Building your first real project'],
    avatarPath: '/avatars/code-mentor.webp',
    color: '#44cc88',
    category: 'work',
    comingSoon: true,
  },
  {
    id: 'finance',
    name: 'Budget Buddy',
    emoji: '💰',
    role: 'Personal Finance Coach',
    tagline: 'Your personal finance coach.',
    description:
      'Budget Buddy helps you take control of your money — from tracking daily expenses to building long-term savings plans. No judgment, no lectures, just practical strategies that actually fit your life and income level.',
    personality: 'Analytical, supportive, practical. Treats every dollar as a decision, not a moral failing. Always meets you where you are financially.',
    skills: ['Budget creation', 'Expense tracking', 'Savings strategies', 'Debt management planning', 'Financial goal setting'],
    bestFor: ['Creating a realistic monthly budget', 'Finding ways to cut expenses without pain', 'Planning for big financial goals'],
    avatarPath: '/avatars/finance.webp',
    color: '#44cc44',
    category: 'life',
    comingSoon: true,
  },
  {
    id: 'storyteller',
    name: 'Story Weaver',
    emoji: '📖',
    role: 'Creative Writer',
    tagline: 'Brings stories to life.',
    description:
      'Story Weaver is the imagination engine — the agent that helps you craft compelling narratives, build rich worlds, and develop characters that feel real. Whether you are writing a novel, a screenplay, or just a bedtime story, Story Weaver brings the magic.',
    personality: 'Imaginative, vivid, collaborative. Thinks in metaphors and sees story potential in everything. Loves surprising you with unexpected plot twists.',
    skills: ['Creative writing', 'World building', 'Character development', 'Plot structuring', 'Genre exploration'],
    bestFor: ['Breaking through writer\'s block', 'Developing characters and story arcs', 'Exploring creative writing as a hobby'],
    avatarPath: '/avatars/storyteller.webp',
    color: '#cc66aa',
    category: 'creative',
    comingSoon: true,
  },
  {
    id: 'fitness',
    name: 'Fit Coach',
    emoji: '💪',
    role: 'Fitness Coach',
    tagline: 'Your AI personal trainer.',
    description:
      'Fit Coach builds personalized workout plans that match your fitness level, goals, and schedule — then keeps you accountable without the guilt trips. From gym beginners to seasoned athletes, Fit Coach adapts to where you are and pushes you toward where you want to be.',
    personality: 'Motivating, realistic, supportive. Never shames you for missing a day. Focuses on consistency over perfection and celebrates progress, not just results.',
    skills: ['Workout programming', 'Exercise form guidance', 'Goal tracking', 'Nutrition basics', 'Recovery planning'],
    bestFor: ['Starting a fitness routine from scratch', 'Staying consistent with workout goals', 'Adapting training for injuries or limitations'],
    avatarPath: '/avatars/fitness.webp',
    color: '#ff6644',
    category: 'life',
    comingSoon: true,
  },
  {
    id: 'travel',
    name: 'Travel Guide',
    emoji: '✈️',
    role: 'Trip Planner',
    tagline: 'Explore the world smarter.',
    description:
      'Travel Guide is your personal trip planner — the agent that finds hidden gems, builds day-by-day itineraries, and knows the difference between a tourist trap and a local favorite. Travel smarter, not harder.',
    personality: 'Adventurous, knowledgeable, enthusiastic. Has strong opinions about the best local food in every city and will fight you on your hotel choices if they find something better.',
    skills: ['Itinerary planning', 'Local recommendations', 'Budget travel optimization', 'Cultural insights', 'Booking strategy'],
    bestFor: ['Planning the perfect vacation itinerary', 'Finding authentic local experiences', 'Traveling on a budget without sacrificing quality'],
    avatarPath: '/avatars/travel.webp',
    color: '#4488ff',
    category: 'life',
    comingSoon: true,
  },
  {
    id: 'debate',
    name: 'Debate Partner',
    emoji: '🎤',
    role: 'Critical Thinking Coach',
    tagline: 'Sharpen your critical thinking.',
    description:
      'Debate Partner is the intellectual sparring partner who challenges your assumptions, argues opposing positions convincingly, and helps you build stronger arguments. Whether you are prepping for a presentation or just want to think more clearly, Debate Partner sharpens your edge.',
    personality: 'Sharp, playful, intellectually honest. Will argue a position they disagree with just to test your reasoning. Respects good arguments regardless of which side they support.',
    skills: ['Argument construction', 'Devil\'s advocacy', 'Logical fallacy detection', 'Persuasion techniques', 'Structured debate coaching'],
    bestFor: ['Preparing for presentations or pitches', 'Strengthening critical thinking skills', 'Exploring multiple sides of complex issues'],
    avatarPath: '/avatars/debate.webp',
    color: '#ff44aa',
    category: 'fun',
    comingSoon: true,
  },
];

// Quick lookup by id
export const AGENT_PROFILE_MAP: Record<string, AgentProfile> = Object.fromEntries(
  AGENT_PROFILES.map(p => [p.id, p]),
);

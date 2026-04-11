// Agent Recommendation Engine
// Maps user goals → recommended agents with personalized reasoning

import { AGENT_PROFILES, AGENT_PROFILE_MAP, AgentProfile } from '../data/agent-descriptions';

// ── Types ──

export interface AgentRecommendation {
  agentId: string;
  name: string;
  emoji: string;
  role: string;
  reason: string;       // personalized one-liner for why this agent fits
  primaryGoal: string;  // the goal that most strongly recommends this agent
}

export interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  role: string;
  tagline: string;
  description: string;
  skills: string[];
  color: string;
}

// ── Goal Definitions ──

interface GoalDefinition {
  description: string;
  agents: { agentId: string; reason: string }[];
}

const GOAL_MAP: Record<string, GoalDefinition> = {
  'building-a-business': {
    description: 'Launch, grow, and scale a business — from idea to revenue',
    agents: [
      { agentId: 'conflux', reason: 'Strategic planning for your business' },
      { agentId: 'helix', reason: 'Market research while you sleep' },
      { agentId: 'forge', reason: 'Build products fast' },
      { agentId: 'vector', reason: 'Financial strategy and opportunity evaluation' },
      { agentId: 'pulse', reason: 'Get your product in front of people' },
    ],
  },
  'learning-research': {
    description: 'Deep-dive into topics, verify facts, and turn research into action',
    agents: [
      { agentId: 'helix', reason: 'Deep research on any topic' },
      { agentId: 'quanta', reason: 'Verify information accuracy' },
      { agentId: 'conflux', reason: 'Connect insights to action' },
    ],
  },
  'work-productivity': {
    description: 'Organize workflows, automate tasks, and get more done with less effort',
    agents: [
      { agentId: 'prism', reason: 'Organize your workflows' },
      { agentId: 'forge', reason: 'Automate repetitive tasks' },
      { agentId: 'spectra', reason: 'Break big projects into pieces' },
      { agentId: 'quanta', reason: 'Quality check everything' },
    ],
  },
  'creative-projects': {
    description: 'Create content, code, or products — and share them with the world',
    agents: [
      { agentId: 'forge', reason: 'Create content, code, and products' },
      { agentId: 'pulse', reason: 'Share your work with the world' },
      { agentId: 'helix', reason: 'Research and inspiration for your projects' },
    ],
  },
  'everyday-life': {
    description: 'Daily planning, quick research, and keeping everything running smoothly',
    agents: [
      { agentId: 'conflux', reason: 'Daily planning and decisions' },
      { agentId: 'helix', reason: 'Research anything, anytime' },
      { agentId: 'catalyst', reason: 'Keep everything running smoothly' },
    ],
  },
};

// ── Engine ──

const MAX_RECOMMENDED = 6;

/**
 * Given selected goal IDs, returns the best agent recommendations.
 * Agents are ranked by frequency across goals (agents in more goals rank higher).
 * Capped at 6 agents for a starter team.
 */
export function recommendAgents(selectedGoals: string[]): AgentRecommendation[] {
  // Collect all agent mentions across selected goals with their reasons
  const agentScores: Record<string, { count: number; reason: string; primaryGoal: string }> = {};

  for (const goalId of selectedGoals) {
    const goal = GOAL_MAP[goalId];
    if (!goal) continue;

    for (const { agentId, reason } of goal.agents) {
      if (!agentScores[agentId]) {
        agentScores[agentId] = { count: 0, reason, primaryGoal: goalId };
      }
      agentScores[agentId].count += 1;
      // If this agent appears in a new goal, update primary goal to the first one that selected it
      // (the first mention's reason is kept)
    }
  }

  // Sort by frequency (descending), then alphabetically for tie-breaking
  const sorted = Object.entries(agentScores)
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, MAX_RECOMMENDED);

  return sorted.map(([agentId, { reason, primaryGoal }]) => {
    const profile = AGENT_PROFILE_MAP[agentId];
    return {
      agentId,
      name: profile?.name ?? agentId,
      emoji: profile?.emoji ?? '🤖',
      role: profile?.role ?? 'Agent',
      reason,
      primaryGoal,
    };
  });
}

/**
 * Returns a human-readable description for a goal ID.
 */
export function getGoalDescription(goalId: string): string {
  return GOAL_MAP[goalId]?.description ?? 'Achieve your goals with the right AI agents';
}

/**
 * Returns full agent info for a given agent ID.
 */
export function getAgentInfo(agentId: string): AgentInfo | null {
  const profile = AGENT_PROFILE_MAP[agentId];
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    emoji: profile.emoji,
    role: profile.role,
    tagline: profile.tagline,
    description: profile.description,
    skills: profile.skills,
    color: profile.color,
  };
}

// ── Defaults for skip-onboarding path ──

export const DEFAULT_GOALS = ['building-a-business', 'work-productivity'];
export const DEFAULT_AGENTS = ['conflux', 'forge', 'prism'];

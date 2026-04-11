// Conflux Home — Agent Data Reader
// Fetches, parses, and caches agent information from OpenClaw via the GatewayClient.

import type { GatewayClient } from './index';
import type { ToolInvokeResponse } from './types';

// ── Types ──

export type AgentStatus = 'idle' | 'working' | 'thinking' | 'error' | 'offline';

export interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  role: string;
  status: AgentStatus;
  model: string;
  currentTask?: string;
  lastActive?: string;
  memorySize?: number;
}

export interface AgentIdentity {
  emoji: string;
  name: string;
  role: string;
}

// ── Known Agent Identities (defaults, can be overridden by live data) ──

const KNOWN_IDENTITIES: Record<string, AgentIdentity> = {
  conflux:   { emoji: '🤖', name: 'Conflux',    role: 'Strategic Partner' },
  helix:    { emoji: '🔬', name: 'Helix',     role: 'Research & Intelligence' },
  forge:    { emoji: '🔨', name: 'Forge',     role: 'Builder' },
  quanta:   { emoji: '✅', name: 'Quanta',    role: 'Quality Control' },
  prism:    { emoji: '💎', name: 'Prism',     role: 'System Orchestrator' },
  pulse:    { emoji: '📣', name: 'Pulse',     role: 'Growth & Marketing' },
  vector:   { emoji: '🎯', name: 'Vector',    role: 'CEO / Gatekeeper' },
  spectra:  { emoji: '🧩', name: 'Spectra',   role: 'Task Decomposition' },
  luma:     { emoji: '🚀', name: 'Luma',      role: 'Launcher' },
  catalyst: { emoji: '⚡', name: 'Catalyst',  role: 'Pipeline Driver' },
};

// ── Session info shape from sessions_list tool ──

interface SessionListItem {
  sessionKey?: string;
  agentId?: string;
  kind?: string;
  lastActivity?: string;
  createdAt?: string;
  [key: string]: unknown;
}

// ── Helpers ──

/** Extract an array from a tool response, handling various shapes */
function extractArray(res: ToolInvokeResponse): unknown[] {
  if (!res.ok) return [];
  const details = res.result?.details;
  if (!details) return [];

  // Shape: { agents: [...] } (agents_list)
  if (Array.isArray((details as Record<string, unknown>)['agents'])) {
    return (details as Record<string, unknown>)['agents'] as unknown[];
  }

  // Shape: { sessions: [...] } (sessions_list)
  if (Array.isArray((details as Record<string, unknown>)['sessions'])) {
    return (details as Record<string, unknown>)['sessions'] as unknown[];
  }

  // Shape: array directly in details
  if (Array.isArray(details)) return details;

  return [];
}

/** Derive a status string from session activity timestamps */
function deriveStatus(lastActive?: string): AgentStatus {
  if (!lastActive) return 'offline';
  const diff = Date.now() - new Date(lastActive).getTime();
  const TEN_MINUTES = 10 * 60 * 1000;
  if (diff < TEN_MINUTES) return 'working';
  return 'idle';
}

// ── Cache ──

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 10_000; // 10 seconds

// ── AgentReader ──

export class AgentReader {
  private readonly client: GatewayClient;
  private readonly cacheTtlMs: number;

  // Cache stores
  private agentsCache: CacheEntry<AgentInfo[]> | null = null;
  private sessionsCache: CacheEntry<SessionListItem[]> | null = null;

  constructor(client: GatewayClient, cacheTtlMs?: number) {
    this.client = client;
    this.cacheTtlMs = cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  // ── Public API ──

  /**
   * Get all agents with their current status.
   * Combines the agents_list tool (configured agents) with sessions_list
   * (active sessions) to produce enriched AgentInfo records.
   */
  async getAllAgents(): Promise<AgentInfo[]> {
    // Check cache
    if (this.agentsCache && Date.now() < this.agentsCache.expiresAt) {
      return this.agentsCache.data;
    }

    const [agentRecords, sessions] = await Promise.all([
      this.fetchAgentList(),
      this.fetchSessions(),
    ]);

    // Build a map of agent IDs to their most recent session
    const sessionByAgent = new Map<string, SessionListItem>();
    for (const session of sessions) {
      const agentId = session.agentId;
      if (!agentId) continue;
      const existing = sessionByAgent.get(agentId);
      if (!existing || (session.lastActivity && (!existing.lastActivity || session.lastActivity > existing.lastActivity))) {
        sessionByAgent.set(agentId, session);
      }
    }

    // Build AgentInfo for each configured agent
    const agents: AgentInfo[] = agentRecords.map((record) => {
      const id = String((record as Record<string, unknown>)['id'] ?? '');
      const identity = this.getIdentitySync(id);
      const session = sessionByAgent.get(id);

      return {
        id,
        name: identity.name,
        emoji: identity.emoji,
        role: identity.role,
        status: session ? deriveStatus(session.lastActivity) : 'offline',
        model: '', // populated via session_status if needed
        currentTask: undefined, // not available from sessions_list alone
        lastActive: session?.lastActivity,
      };
    });

    // Also include agents that have active sessions but aren't in agents_list
    for (const [agentId, session] of sessionByAgent) {
      if (!agents.find((a) => a.id === agentId)) {
        const identity = this.getIdentitySync(agentId);
        agents.push({
          id: agentId,
          name: identity.name,
          emoji: identity.emoji,
          role: identity.role,
          status: deriveStatus(session.lastActivity),
          model: '',
          lastActive: session.lastActivity,
        });
      }
    }

    // Update cache
    this.agentsCache = {
      data: agents,
      expiresAt: Date.now() + this.cacheTtlMs,
    };

    return agents;
  }

  /**
   * Get detailed info for one agent by ID.
   * Returns null if the agent is not found.
   */
  async getAgent(id: string): Promise<AgentInfo | null> {
    const agents = await this.getAllAgents();
    return agents.find((a) => a.id === id) ?? null;
  }

  /**
   * Get agent identity metadata (emoji, name, role).
   * Uses known defaults; can be overridden by live data in the future.
   */
  async getAgentIdentity(id: string): Promise<AgentIdentity> {
    return this.getIdentitySync(id);
  }

  /**
   * Get the current session status (model, tokens, context usage).
   * This calls session_status on the gateway and returns the raw details.
   */
  async getCurrentSessionStatus(): Promise<Record<string, unknown>> {
    const res = await this.client.invokeTool('session_status', {});
    if (res.ok && res.result?.details) {
      return res.result.details as Record<string, unknown>;
    }
    return {};
  }

  /** Clear all cached data. */
  clearCache(): void {
    this.agentsCache = null;
    this.sessionsCache = null;
  }

  // ── Private ──

  /** Get identity from known defaults */
  private getIdentitySync(id: string): AgentIdentity {
    return KNOWN_IDENTITIES[id] ?? {
      emoji: '❓',
      name: id,
      role: 'Unknown',
    };
  }

  /** Fetch agent list from gateway (agents_list tool) */
  private async fetchAgentList(): Promise<unknown[]> {
    try {
      const res = await this.client.invokeTool('agents_list', {});
      return extractArray(res);
    } catch {
      return [];
    }
  }

  /** Fetch active sessions from gateway (sessions_list tool) */
  private async fetchSessions(): Promise<SessionListItem[]> {
    // Check cache
    if (this.sessionsCache && Date.now() < this.sessionsCache.expiresAt) {
      return this.sessionsCache.data;
    }

    try {
      const res = await this.client.invokeTool('sessions_list', {});
      const items = extractArray(res) as SessionListItem[];
      this.sessionsCache = {
        data: items,
        expiresAt: Date.now() + this.cacheTtlMs,
      };
      return items;
    } catch {
      return [];
    }
  }
}

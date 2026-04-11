import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentReader } from '../agents';
import type { GatewayClient } from '../index';
import type { ToolInvokeResponse } from '../types';

// Mock GatewayClient
function mockClient(responses: Record<string, ToolInvokeResponse>): GatewayClient {
  return {
    invokeTool: vi.fn(async (tool: string) => {
      return responses[tool] ?? { ok: false, error: 'not found' };
    }),
  } as unknown as GatewayClient;
}

describe('AgentReader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getAllAgents returns agents from agents_list and sessions_list', async () => {
    const client = mockClient({
      agents_list: {
        ok: true,
        result: { details: { agents: [{ id: 'conflux' }, { id: 'forge' }] } },
      },
      sessions_list: {
        ok: true,
        result: {
          details: {
            sessions: [
              { agentId: 'conflux', lastActivity: new Date().toISOString() },
            ],
          },
        },
      },
    });

    const reader = new AgentReader(client);
    const agents = await reader.getAllAgents();

    expect(agents.length).toBeGreaterThanOrEqual(2);
    const conflux = agents.find((a) => a.id === 'conflux');
    expect(conflux).toBeDefined();
    expect(conflux!.name).toBe('Conflux');
    expect(conflux!.emoji).toBe('🤖');
    expect(conflux!.status).toBe('working'); // recent activity
  });

  it('getAgent returns null for unknown agent', async () => {
    const client = mockClient({
      agents_list: { ok: true, result: { details: { agents: [] } } },
      sessions_list: { ok: true, result: { details: { sessions: [] } } },
    });

    const reader = new AgentReader(client);
    const agent = await reader.getAgent('nonexistent');
    expect(agent).toBeNull();
  });

  it('getAgentIdentity returns known identity', async () => {
    const client = mockClient({});
    const reader = new AgentReader(client);

    const identity = await reader.getAgentIdentity('forge');
    expect(identity.name).toBe('Forge');
    expect(identity.emoji).toBe('🔨');
    expect(identity.role).toBe('Builder');
  });

  it('getAgentIdentity returns fallback for unknown agent', async () => {
    const client = mockClient({});
    const reader = new AgentReader(client);

    const identity = await reader.getAgentIdentity('unknown-agent');
    expect(identity.name).toBe('unknown-agent');
    expect(identity.emoji).toBe('❓');
    expect(identity.role).toBe('Unknown');
  });

  it('agents with no session show offline status', async () => {
    const client = mockClient({
      agents_list: {
        ok: true,
        result: { details: { agents: [{ id: 'quanta' }] } },
      },
      sessions_list: {
        ok: true,
        result: { details: { sessions: [] } },
      },
    });

    const reader = new AgentReader(client);
    const agents = await reader.getAllAgents();
    const quanta = agents.find((a) => a.id === 'quanta');
    expect(quanta!.status).toBe('offline');
  });

  it('agents with old activity show idle status', async () => {
    const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
    const client = mockClient({
      agents_list: {
        ok: true,
        result: { details: { agents: [{ id: 'helix' }] } },
      },
      sessions_list: {
        ok: true,
        result: {
          details: {
            sessions: [{ agentId: 'helix', lastActivity: oldTime }],
          },
        },
      },
    });

    const reader = new AgentReader(client);
    const agents = await reader.getAllAgents();
    const helix = agents.find((a) => a.id === 'helix');
    expect(helix!.status).toBe('idle');
  });

  it('caches results within TTL', async () => {
    const client = mockClient({
      agents_list: { ok: true, result: { details: { agents: [{ id: 'conflux' }] } } },
      sessions_list: { ok: true, result: { details: { sessions: [] } } },
    });

    const reader = new AgentReader(client, 60000);
    await reader.getAllAgents();
    await reader.getAllAgents();

    // Should only call invokeTool twice per call (agents_list + sessions_list), cached on second getAllAgents
    expect(client.invokeTool).toHaveBeenCalledTimes(2);
  });

  it('clearCache forces fresh fetch', async () => {
    const client = mockClient({
      agents_list: { ok: true, result: { details: { agents: [{ id: 'conflux' }] } } },
      sessions_list: { ok: true, result: { details: { sessions: [] } } },
    });

    const reader = new AgentReader(client, 60000);
    await reader.getAllAgents();
    reader.clearCache();
    await reader.getAllAgents();

    // 2 calls + 2 calls = 4
    expect(client.invokeTool).toHaveBeenCalledTimes(4);
  });

  it('getCurrentSessionStatus returns session details', async () => {
    const client = mockClient({
      session_status: {
        ok: true,
        result: { details: { model: 'test', contextUsage: 0.5 } },
      },
    });

    const reader = new AgentReader(client);
    const status = await reader.getCurrentSessionStatus();
    expect(status['model']).toBe('test');
  });

  it('getCurrentSessionStatus returns empty on failure', async () => {
    const client = mockClient({
      session_status: { ok: false },
    });

    const reader = new AgentReader(client);
    const status = await reader.getCurrentSessionStatus();
    expect(status).toEqual({});
  });

  it('handles agents_list tool error gracefully', async () => {
    const client = {
      invokeTool: vi.fn(async () => { throw new Error('network error'); }),
    } as unknown as GatewayClient;

    const reader = new AgentReader(client);
    const agents = await reader.getAllAgents();
    // Should not throw — returns agents from sessions only or empty
    expect(Array.isArray(agents)).toBe(true);
  });

  it('includes session-only agents not in agents_list', async () => {
    const client = mockClient({
      agents_list: { ok: true, result: { details: { agents: [] } } },
      sessions_list: {
        ok: true,
        result: {
          details: {
            sessions: [{ agentId: 'catalyst', lastActivity: new Date().toISOString() }],
          },
        },
      },
    });

    const reader = new AgentReader(client);
    const agents = await reader.getAllAgents();
    const catalyst = agents.find((a) => a.id === 'catalyst');
    expect(catalyst).toBeDefined();
    expect(catalyst!.name).toBe('Catalyst');
    expect(catalyst!.status).toBe('working');
  });
});

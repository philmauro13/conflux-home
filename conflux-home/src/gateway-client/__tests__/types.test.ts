import { describe, it, expect } from 'vitest';
import type {
  GatewayConfig,
  GatewayAgent,
  GatewaySessionStatus,
  ChatMessage,
  ChatCompletionsResponse,
  ChatStreamChunk,
  HealthResponse,
  ToolInvokeResponse,
  ChatSessionState,
  StreamCallbacks,
} from '../types';
import { GatewayError, GatewayTimeoutError } from '../types';

describe('types', () => {
  it('exports GatewayConfig interface', () => {
    const config: GatewayConfig = { token: 'test-token' };
    expect(config.token).toBe('test-token');
    expect(config.baseUrl).toBeUndefined();
  });

  it('exports GatewayConfig with baseUrl', () => {
    const config: GatewayConfig = { token: 'tok', baseUrl: 'http://localhost:9999' };
    expect(config.baseUrl).toBe('http://localhost:9999');
  });

  it('exports GatewayAgent interface', () => {
    const agent: GatewayAgent = { id: 'conflux', name: 'Conflux', status: 'online' };
    expect(agent.id).toBe('conflux');
  });

  it('exports GatewaySessionStatus interface', () => {
    const status: GatewaySessionStatus = { model: 'test', tokens: 100 };
    expect(status['model']).toBe('test');
  });

  it('exports ChatMessage with correct roles', () => {
    const system: ChatMessage = { role: 'system', content: 'You are helpful' };
    const user: ChatMessage = { role: 'user', content: 'Hello' };
    const assistant: ChatMessage = { role: 'assistant', content: 'Hi!' };
    expect(system.role).toBe('system');
    expect(user.role).toBe('user');
    expect(assistant.role).toBe('assistant');
  });

  it('exports ChatCompletionsResponse interface', () => {
    const resp: ChatCompletionsResponse = {
      id: 'chat-1',
      object: 'chat.completion',
      created: Date.now(),
      model: 'openclaw:conflux',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
    };
    expect(resp.choices[0].message.content).toBe('hi');
  });

  it('exports ChatStreamChunk interface', () => {
    const chunk: ChatStreamChunk = {
      choices: [{ delta: { content: 'hello' }, index: 0, finish_reason: null }],
    };
    expect(chunk.choices[0].delta.content).toBe('hello');
  });

  it('exports HealthResponse interface', () => {
    const health: HealthResponse = { ok: true, status: 'live' };
    expect(health.ok).toBe(true);
    expect(health.status).toBe('live');
  });

  it('exports ToolInvokeResponse interface', () => {
    const res: ToolInvokeResponse = {
      ok: true,
      result: { details: { agents: [] } },
    };
    expect(res.ok).toBe(true);
  });

  it('exports ChatSessionState interface', () => {
    const state: ChatSessionState = {
      agentId: 'conflux',
      messages: [],
      isStreaming: false,
      error: null,
    };
    expect(state.agentId).toBe('conflux');
  });

  it('exports StreamCallbacks interface', () => {
    const callbacks: StreamCallbacks = {
      onChunk: () => {},
      onDone: () => {},
      onError: () => {},
      onStart: () => {},
    };
    expect(typeof callbacks.onChunk).toBe('function');
  });

  it('GatewayError has correct properties', () => {
    const err = new GatewayError('test error', 500, 'body');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('GatewayError');
    expect(err.message).toBe('test error');
    expect(err.status).toBe(500);
    expect(err.body).toBe('body');
  });

  it('GatewayTimeoutError extends GatewayError', () => {
    const err = new GatewayTimeoutError();
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.name).toBe('GatewayTimeoutError');
    expect(err.message).toBe('Gateway request timed out');
  });
});

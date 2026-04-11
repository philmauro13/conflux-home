import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatSession, sendMessage, streamMessage } from '../chat';
import { GatewayError } from '../types';
import type { GatewayConfig, ChatMessage } from '../types';

const config: GatewayConfig = { baseUrl: 'http://localhost:18789', token: 'test-token' };

describe('ChatSession', () => {
  let session: ChatSession;

  beforeEach(() => {
    session = new ChatSession(config, 'conflux');
  });

  it('initializes with empty state', () => {
    expect(session.agentId).toBe('conflux');
    expect(session.messages).toEqual([]);
    expect(session.isStreaming).toBe(false);
    expect(session.error).toBeNull();
  });

  it('addMessage appends to messages', () => {
    session.addMessage({ role: 'user', content: 'hello' });
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].content).toBe('hello');
  });

  it('addUserMessage creates and adds a user message', () => {
    const msg = session.addUserMessage('hi');
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('hi');
    expect(session.messages).toHaveLength(1);
  });

  it('addAssistantMessage creates and adds an assistant message', () => {
    session.addAssistantMessage('response');
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe('assistant');
  });

  it('setSystemMessage adds system message at front', () => {
    session.addUserMessage('hi');
    session.setSystemMessage('be helpful');
    expect(session.messages[0].role).toBe('system');
    expect(session.messages[0].content).toBe('be helpful');
  });

  it('setSystemMessage replaces existing system message', () => {
    session.setSystemMessage('old');
    session.setSystemMessage('new');
    const systemMsgs = session.messages.filter((m) => m.role === 'system');
    expect(systemMsgs).toHaveLength(1);
    expect(systemMsgs[0].content).toBe('new');
  });

  it('getRecent returns last N messages', () => {
    session.addUserMessage('a');
    session.addAssistantMessage('b');
    session.addUserMessage('c');
    expect(session.getRecent(2)).toHaveLength(2);
    expect(session.getRecent(2)[0].content).toBe('b');
  });

  it('getMessages returns a copy', () => {
    session.addUserMessage('test');
    const msgs = session.getMessages();
    expect(msgs).toHaveLength(1);
    // Modifying the copy shouldn't affect the session
    msgs.push({ role: 'user', content: 'extra' });
    expect(session.messages).toHaveLength(1);
  });

  it('clearMessages resets messages and error', () => {
    session.addUserMessage('test');
    session.clearMessages();
    expect(session.messages).toEqual([]);
    expect(session.error).toBeNull();
  });

  it('state is readonly', () => {
    const state = session.state;
    expect(state.agentId).toBe('conflux');
    expect(state.isStreaming).toBe(false);
  });

  it('cancel aborts when streaming', () => {
    // cancel() is safe to call even when not streaming
    session.cancel();
    expect(session.isCancelled).toBe(false);
  });
});

describe('ChatSession persistence', () => {
  it('save/load roundtrip with mock localStorage', () => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      length: 0,
      key: () => null,
    };
    vi.stubGlobal('localStorage', mockStorage);

    const session = new ChatSession(config, 'test-agent', { persist: true });
    session.addUserMessage('persisted message');
    session.save();

    expect(store['conflux-chat-session:test-agent']).toBeDefined();

    const session2 = new ChatSession(config, 'test-agent', { persist: false });
    const loaded = session2.load();
    expect(loaded).toBe(true);
    expect(session2.messages).toHaveLength(1);
    expect(session2.messages[0].content).toBe('persisted message');

    session2.clearPersisted();
    expect(store['conflux-chat-session:test-agent']).toBeUndefined();

    vi.unstubAllGlobals();
  });
});

describe('sendMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends POST to /v1/chat/completions with correct body', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'chat-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'openclaw:conflux',
        choices: [{ index: 0, message: { role: 'assistant', content: 'hello back' }, finish_reason: 'stop' }],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await sendMessage(config, 'conflux', [{ role: 'user', content: 'hello' }]);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:18789/v1/chat/completions');
    expect(opts.headers['x-openclaw-agent-id']).toBe('conflux');
    expect(opts.headers['Authorization']).toBe('Bearer test-token');

    const body = JSON.parse(opts.body);
    expect(body.model).toBe('openclaw:conflux');
    expect(body.stream).toBe(false);
    expect(body.messages[0].content).toBe('hello');

    expect(result).toBe('hello back');
  });

  it('throws GatewayError on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    }));

    await expect(
      sendMessage(config, 'conflux', [{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(GatewayError);
  });

  it('returns empty string when choices is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [],
      }),
    }));

    const result = await sendMessage(config, 'conflux', []);
    expect(result).toBe('');
  });
});

describe('streamMessage / SSE parsing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function makeSSEStream(lines: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + '\n'));
        }
        controller.close();
      },
    });
  }

  it('parses SSE chunks and calls onChunk', async () => {
    const chunks: string[] = [];
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"content":" world"},"index":0,"finish_reason":null}]}',
      'data: [DONE]',
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      body: makeSSEStream(sseLines),
    }));

    const result = await streamMessage(
      config,
      'conflux',
      [{ role: 'user', content: 'hi' }],
      (chunk) => chunks.push(chunk),
    );

    expect(result).toBe('Hello world');
    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('handles empty stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      body: makeSSEStream(['data: [DONE]']),
    }));

    const result = await streamMessage(config, 'conflux', [], () => {});
    expect(result).toBe('');
  });

  it('skips unparseable lines', async () => {
    const sseLines = [
      'not valid json',
      'data: {"choices":[{"delta":{"content":"ok"},"index":0}]}',
      'data: [DONE]',
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      body: makeSSEStream(sseLines),
    }));

    const chunks: string[] = [];
    const result = await streamMessage(config, 'conflux', [], (c) => chunks.push(c));
    expect(result).toBe('ok');
  });

  it('skips comment lines starting with colon', async () => {
    const sseLines = [
      ': keepalive',
      'data: {"choices":[{"delta":{"content":"hi"},"index":0}]}',
      'data: [DONE]',
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      body: makeSSEStream(sseLines),
    }));

    const result = await streamMessage(config, 'conflux', [], () => {});
    expect(result).toBe('hi');
  });

  it('throws on non-OK streaming response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    }));

    await expect(
      streamMessage(config, 'conflux', [], () => {}),
    ).rejects.toThrow(GatewayError);
  });

  it('throws when response body is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      body: null,
    }));

    await expect(
      streamMessage(config, 'conflux', [], () => {}),
    ).rejects.toThrow('No response body for SSE stream');
  });
});

/**
 * Stress tests for `CC: Handle Fork` — validates session state resolution
 * and cliUuid lookup across nested forks, post-compaction scenarios, and
 * edge cases.
 *
 * These tests exercise handle-fork.ts with mocked Services, verifying:
 * - Correct sessionId + cliUuid persisted on the new thread
 * - The viewSession validation guard (post-compaction safety)
 * - Graceful degradation when viewSession throws
 * - openThreadChatAndRefreshRecent called AFTER state persistence (race fix)
 */

import { action as handleFork } from '../../src/actions/claude-code/handle-fork';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface MockThread {
  id: string;
  context?: { claudeCode?: Record<string, unknown> };
  tags?: string[];
}

interface MockMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text?: string;
  context?: Record<string, unknown>;
}

/**
 * Build a minimal Services mock. Thread state is stored in `threads` map
 * so getClaudeState/persistClaudeState work via byId/update.
 */
function createServices(opts: {
  threads: Map<string, MockThread>;
  messages: Map<string, MockMessage[]>;
  /** viewSession return value or error. Default: empty array. */
  viewSessionResult?: unknown[] | Error;
}) {
  const { threads, messages } = opts;
  const callOrder: string[] = [];

  const viewSessionMock = vi.fn(async () => {
    if (opts.viewSessionResult instanceof Error) throw opts.viewSessionResult;
    return opts.viewSessionResult ?? [];
  });

  const openThreadChatMock = vi.fn(() => {
    callOrder.push('openThreadChat');
  });

  return {
    services: {
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      repository: {
        chatQueries: {
          threadData: vi.fn((threadId: string) => ({
            messages: messages.get(threadId) || [],
          })),
        },
        threadQueries: {
          byId: vi.fn((threadId: string) => threads.get(threadId) || null),
        },
        threadCommands: {
          update: vi.fn((threadId: string, updates: any) => {
            callOrder.push('persistState');
            const thread = threads.get(threadId);
            if (thread) {
              thread.context = updates.context ?? thread.context;
              thread.tags = updates.tags ?? thread.tags;
            }
          }),
        },
      },
      emitter: {
        sendToPlugin: vi.fn(),
      },
      settings: {
        updatePluginSetting: vi.fn(),
      },
      cli: {
        claudeCode: {
          viewSession: viewSessionMock,
        },
      },
      chat: {
        openThreadChatAndRefreshRecent: openThreadChatMock,
      },
    } as any,
    viewSessionMock,
    openThreadChatMock,
    callOrder,
  };
}

/** Shorthand: get the claudeCode state persisted on a thread. */
function getState(threads: Map<string, MockThread>, threadId: string) {
  return threads.get(threadId)?.context?.claudeCode as Record<string, unknown> | undefined;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMessages(...specs: Array<{ id: string; sender: 'user' | 'assistant'; cliUuid?: string }>): MockMessage[] {
  return specs.map(s => ({
    id: s.id,
    sender: s.sender,
    text: `msg ${s.id}`,
    ...(s.cliUuid ? { context: { cliUuid: s.cliUuid } } : {}),
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CC: Handle Fork — stress tests', () => {
  // ── 1. Baseline fork ────────────────────────────────────────────────────────

  it('copies sessionId, cliUuid, and cwd from source thread', async () => {
    const threads = new Map<string, MockThread>([
      ['source', { id: 'source', context: { claudeCode: { sessionId: 'S1', cwd: '/project' } }, tags: [] }],
      ['new', { id: 'new', context: {}, tags: [] }],
    ]);
    const messages = new Map([
      ['source', makeMessages(
        { id: 'M1', sender: 'user' },
        { id: 'M2', sender: 'assistant', cliUuid: 'U1' },
        { id: 'M3', sender: 'user' },
        { id: 'M4', sender: 'assistant', cliUuid: 'U2' },
        { id: 'M5', sender: 'user' },
      )],
    ]);

    // viewSession confirms U2 exists in session S1
    const { services } = createServices({
      threads, messages,
      viewSessionResult: [
        { type: 'assistant', uuid: 'U1' },
        { type: 'assistant', uuid: 'U2' },
      ],
    });

    const result = await handleFork(
      { sourceThreadId: 'source', newThreadId: 'new', sourceMessageId: 'M5' },
      services,
    );

    expect(result).toMatchObject({ success: true, copied: true, sessionId: 'S1', cliUuid: 'U2' });

    const state = getState(threads, 'new');
    expect(state).toMatchObject({
      sessionId: 'S1',
      cwd: '/project',
      forkFrom: { sessionId: 'S1', cliUuid: 'U2' },
    });
  });

  // ── 2. Fork at assistant message with cliUuid ───────────────────────────────

  it('uses the fork-point message cliUuid when it is an assistant message', async () => {
    const threads = new Map<string, MockThread>([
      ['source', { id: 'source', context: { claudeCode: { sessionId: 'S1', cwd: '/p' } }, tags: [] }],
      ['new', { id: 'new', context: {}, tags: [] }],
    ]);
    const messages = new Map([
      ['source', makeMessages(
        { id: 'M1', sender: 'user' },
        { id: 'M2', sender: 'assistant', cliUuid: 'U1' },
        { id: 'M3', sender: 'assistant', cliUuid: 'U2' },
      )],
    ]);

    const { services } = createServices({
      threads, messages,
      viewSessionResult: [{ type: 'assistant', uuid: 'U1' }, { type: 'assistant', uuid: 'U2' }],
    });

    const result = await handleFork(
      { sourceThreadId: 'source', newThreadId: 'new', sourceMessageId: 'M2' },
      services,
    );

    expect(result).toMatchObject({ cliUuid: 'U1' });
  });

  // ── 3. Fork at first user message — no prior assistant ──────────────────────

  it('sets cliUuid to undefined when no assistant message precedes fork point', async () => {
    const threads = new Map<string, MockThread>([
      ['source', { id: 'source', context: { claudeCode: { sessionId: 'S1' } }, tags: [] }],
      ['new', { id: 'new', context: {}, tags: [] }],
    ]);
    const messages = new Map([
      ['source', makeMessages(
        { id: 'M1', sender: 'user' },
        { id: 'M2', sender: 'user' },
      )],
    ]);

    const { services } = createServices({ threads, messages });

    const result = await handleFork(
      { sourceThreadId: 'source', newThreadId: 'new', sourceMessageId: 'M1' },
      services,
    );

    expect(result).toMatchObject({ success: true, copied: true, cliUuid: undefined });

    const state = getState(threads, 'new');
    expect(state).toMatchObject({
      forkFrom: { sessionId: 'S1', cliUuid: undefined },
    });
  });

  // ── 4. Nested fork at pre-fork message ──────────────────────────────────────

  it('resolves cliUuid from copied message context on a nested fork', async () => {
    // Thread B was forked from A. B now has sessionId S2.
    // B's messages include copies from A with cliUuids from S1 era.
    // Forking B at a pre-fork message (M2') should use the cliUuid from M2'.
    // viewSession(S2) should confirm the UUID exists (S2 inherits S1 history).
    const threads = new Map<string, MockThread>([
      ['threadB', { id: 'threadB', context: { claudeCode: { sessionId: 'S2', cwd: '/p', previousSessionIds: ['S1'] } }, tags: ['claude-code'] }],
      ['threadC', { id: 'threadC', context: {}, tags: [] }],
    ]);
    const messages = new Map([
      ['threadB', makeMessages(
        { id: 'M1p', sender: 'user' },                         // copied from A
        { id: 'M2p', sender: 'assistant', cliUuid: 'U1' },     // copied from A, cliUuid from session S1
        { id: 'M3p', sender: 'user' },                         // copied from A
        { id: 'M4p', sender: 'assistant', cliUuid: 'U2' },     // copied from A (fork point of A→B)
        { id: 'M5', sender: 'user' },                           // new in B
        { id: 'M6', sender: 'assistant', cliUuid: 'U4' },       // new in B, cliUuid from S2
      )],
    ]);

    // S2 was forked from S1 at U2, so S2 contains U1 and U2
    const { services } = createServices({
      threads, messages,
      viewSessionResult: [
        { type: 'assistant', uuid: 'U1' },
        { type: 'assistant', uuid: 'U2' },
        { type: 'assistant', uuid: 'U4' },
      ],
    });

    const result = await handleFork(
      { sourceThreadId: 'threadB', newThreadId: 'threadC', sourceMessageId: 'M2p' },
      services,
    );

    expect(result).toMatchObject({ success: true, copied: true, sessionId: 'S2', cliUuid: 'U1' });

    const state = getState(threads, 'threadC');
    expect(state).toMatchObject({
      sessionId: 'S2',
      forkFrom: { sessionId: 'S2', cliUuid: 'U1' },
    });
  });

  // ── 5. Nested fork after compaction (guard fires) ───────────────────────────

  it('clears cliUuid when viewSession shows UUID not in compacted session', async () => {
    // Thread B was compacted: sessionId changed from S2 to S3.
    // Pre-fork messages still carry cliUuids from S1/S2 era.
    // viewSession(S3) does NOT contain those old UUIDs.
    const threads = new Map<string, MockThread>([
      ['threadB', { id: 'threadB', context: { claudeCode: { sessionId: 'S3', cwd: '/p', previousSessionIds: ['S1', 'S2'] } }, tags: ['claude-code'] }],
      ['threadC', { id: 'threadC', context: {}, tags: [] }],
    ]);
    const messages = new Map([
      ['threadB', makeMessages(
        { id: 'M1p', sender: 'user' },
        { id: 'M2p', sender: 'assistant', cliUuid: 'U1' },     // stale UUID from S1
        { id: 'M3p', sender: 'user' },
        { id: 'M4p', sender: 'assistant', cliUuid: 'U2' },     // stale UUID from S1
        { id: 'M5', sender: 'assistant', cliUuid: 'U5' },       // from S3
      )],
    ]);

    // S3 (compacted) only contains U5, not U1 or U2
    const { services } = createServices({
      threads, messages,
      viewSessionResult: [{ type: 'assistant', uuid: 'U5' }],
    });

    const result = await handleFork(
      { sourceThreadId: 'threadB', newThreadId: 'threadC', sourceMessageId: 'M2p' },
      services,
    );

    // cliUuid should be cleared — fork from session end
    expect(result).toMatchObject({ success: true, copied: true, cliUuid: undefined });

    const state = getState(threads, 'threadC');
    expect(state).toMatchObject({
      sessionId: 'S3',
      forkFrom: { sessionId: 'S3', cliUuid: undefined },
    });
  });

  // ── 6. viewSession throws — graceful degradation ───────────────────────────

  it('clears cliUuid when viewSession throws', async () => {
    const threads = new Map<string, MockThread>([
      ['source', { id: 'source', context: { claudeCode: { sessionId: 'S1', cwd: '/p' } }, tags: [] }],
      ['new', { id: 'new', context: {}, tags: [] }],
    ]);
    const messages = new Map([
      ['source', makeMessages(
        { id: 'M1', sender: 'user' },
        { id: 'M2', sender: 'assistant', cliUuid: 'U1' },
      )],
    ]);

    const { services } = createServices({
      threads, messages,
      viewSessionResult: new Error('JSONL not found'),
    });

    const result = await handleFork(
      { sourceThreadId: 'source', newThreadId: 'new', sourceMessageId: 'M2' },
      services,
    );

    expect(result).toMatchObject({ success: true, copied: true, cliUuid: undefined });
    expect(services.logger.warn).toHaveBeenCalledWith(
      '[fork] could not validate cliUuid against session JSONL',
      expect.objectContaining({ cliUuid: 'U1' }),
    );
  });

  // ── 7. Triple nested fork (A→B→C→D) ────────────────────────────────────────

  it('resolves correct sessionId and cliUuid on a triple-nested fork', async () => {
    // Thread D was forked from C, which was forked from B, which was forked from A.
    // D has sessionId S4. Messages include copies from the A era with cliUuid U1.
    const threads = new Map<string, MockThread>([
      ['threadD', { id: 'threadD', context: { claudeCode: { sessionId: 'S4', cwd: '/deep', previousSessionIds: ['S1', 'S2', 'S3'] } }, tags: ['claude-code'] }],
      ['threadE', { id: 'threadE', context: {}, tags: [] }],
    ]);
    const messages = new Map([
      ['threadD', makeMessages(
        { id: 'M1ppp', sender: 'user' },
        { id: 'M2ppp', sender: 'assistant', cliUuid: 'U1' },   // from A's session S1
        { id: 'M3', sender: 'user' },
        { id: 'M4', sender: 'assistant', cliUuid: 'U8' },       // from D's session S4
      )],
    ]);

    // S4 (fork chain) still contains U1 from the original session
    const { services } = createServices({
      threads, messages,
      viewSessionResult: [
        { type: 'assistant', uuid: 'U1' },
        { type: 'assistant', uuid: 'U8' },
      ],
    });

    const result = await handleFork(
      { sourceThreadId: 'threadD', newThreadId: 'threadE', sourceMessageId: 'M2ppp' },
      services,
    );

    expect(result).toMatchObject({ success: true, copied: true, sessionId: 'S4', cliUuid: 'U1' });

    const state = getState(threads, 'threadE');
    expect(state).toMatchObject({
      sessionId: 'S4',
      forkFrom: { sessionId: 'S4', cliUuid: 'U1' },
    });
  });

  // ── 8. No source session state ──────────────────────────────────────────────

  it('returns copied:false and still opens the thread when source has no session', async () => {
    const threads = new Map<string, MockThread>([
      ['source', { id: 'source', context: {}, tags: [] }],
      ['new', { id: 'new', context: {}, tags: [] }],
    ]);

    const { services, openThreadChatMock } = createServices({
      threads,
      messages: new Map(),
    });

    const result = await handleFork(
      { sourceThreadId: 'source', newThreadId: 'new', sourceMessageId: 'M1' },
      services,
    );

    expect(result).toMatchObject({ success: true, copied: false });
    expect(openThreadChatMock).toHaveBeenCalledWith('new');
  });

  // ── 9. Missing sourceMessageId ──────────────────────────────────────────────

  it('sets cliUuid to undefined when sourceMessageId is omitted', async () => {
    const threads = new Map<string, MockThread>([
      ['source', { id: 'source', context: { claudeCode: { sessionId: 'S1' } }, tags: [] }],
      ['new', { id: 'new', context: {}, tags: [] }],
    ]);

    const { services } = createServices({
      threads,
      messages: new Map(),
    });

    const result = await handleFork(
      { sourceThreadId: 'source', newThreadId: 'new' },
      services,
    );

    expect(result).toMatchObject({ success: true, copied: true, cliUuid: undefined });

    const state = getState(threads, 'new');
    expect(state).toMatchObject({
      forkFrom: { sessionId: 'S1', cliUuid: undefined },
    });
  });

  // ── 10. openThreadChatAndRefreshRecent called AFTER state persistence ──────

  it('persists state before opening the thread chat (race fix)', async () => {
    const threads = new Map<string, MockThread>([
      ['source', { id: 'source', context: { claudeCode: { sessionId: 'S1', cwd: '/p' } }, tags: [] }],
      ['new', { id: 'new', context: {}, tags: [] }],
    ]);
    const messages = new Map([
      ['source', makeMessages(
        { id: 'M1', sender: 'user' },
        { id: 'M2', sender: 'assistant', cliUuid: 'U1' },
      )],
    ]);

    const { services, callOrder } = createServices({
      threads, messages,
      viewSessionResult: [{ type: 'assistant', uuid: 'U1' }],
    });

    await handleFork(
      { sourceThreadId: 'source', newThreadId: 'new', sourceMessageId: 'M2' },
      services,
    );

    // persistState (via threadCommands.update) must come before openThreadChat
    const persistIndex = callOrder.indexOf('persistState');
    const openIndex = callOrder.indexOf('openThreadChat');
    expect(persistIndex).toBeGreaterThanOrEqual(0);
    expect(openIndex).toBeGreaterThan(persistIndex);
  });
});

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { query } from '#features/code/be/services/claude-code/query.ts';
import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import type { ClaudeConversationTurn } from '#features/code/be/services/claude-code/conversation.ts';
import type { StreamLine } from '#features/code/be/services/claude-code/types.ts';
import { consumeConversationTurn } from '../../../../src/content/actions/claude-code/_helpers/stream-consumer.ts';
import { getClaudeState } from '../../../../src/content/actions/claude-code/_helpers/thread-context.ts';
import { action as command } from '../../../../src/content/actions/claude-code/cc-command.ts';
import { chatService } from '#features/threads/be/services/chat.ts';
vi.mock('../../../../src/content/actions/claude-code/_helpers/context-usage.ts', () => ({ refreshThreadContextUsage: vi.fn(async () => {}) }));

const deletion = process.env.CLAUDE_RESEARCH_TASK_DELETION === '1';
const executable = process.env.CLAUDE_RESEARCH_EXECUTABLE, workspace = process.env.CLAUDE_RESEARCH_WORKSPACE, endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;
it.skipIf(!executable || !workspace || !endpoint)('actual native task metadata reaches the owner, source activity and observation command', async () => {
  expect(process.env.HOME).toBe(workspace); expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
  const cwd = join(workspace!, 'project'), temporary = join(workspace!, 'tmp'); await mkdir(cwd); await mkdir(temporary, { mode: 0o700 });
  const { id } = repository.threadCommands.create({ topic: 'Native task list', instructions: '', tags: [] });
  repository.threadCommands.update(id, { context: { claudeCode: { cwd, permissionMode: 'default' } } });
  mockService<Services, 'cli'>('cli', { claudeCode: { getConversation: store.getConversation, getHandle: store.getHandle, isCurrentTurn: store.isCurrentTurn, storeHandle: store.storeHandle, clearHandle: store.clearHandle } as never });
  const updates = vi.fn(chatService.updateMessageState);
  mockService<Services, 'chat'>('chat', { ...chatService, updateMessageState: updates });
  mockService<Services, 'logger'>('logger', { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  mockService<Services, 'threads'>('threads', { updateChatState: vi.fn() });
  const emitted = vi.fn();
  mockService<Services, 'emitter'>('emitter', { sendToSystem: emitted, broadcastToPlugin: vi.fn() });
  const consume = (turn: ClaudeConversationTurn) => consumeConversationTurn(turn, { services, threadId: id, text: '', sessionCwd: cwd });
  const native = await query({ cwd, cliPath: executable, env: { ...Object.fromEntries(Object.keys(process.env).map(key => [key, undefined])), HOME: workspace, CLAUDE_CONFIG_DIR: join(workspace!, '.claude'), CLAUDE_CODE_TMPDIR: temporary, ANTHROPIC_BASE_URL: endpoint, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_ENABLE_TODO_TOOLS: '1', CLAUDE_CODE_ENABLE_TASKS: '1' },
    permissionMode: 'default', settingSources: [], settings: JSON.stringify({ apiKeyHelper: '/usr/bin/printf research-fixture-key' }), model: 'sonnet', strictMcpConfig: true,
    keepStdinOpen: true, surfaceControlRequests: true, noSessionPersistence: true, maxTurns: 16, signal: AbortSignal.timeout(25000) });
  const owner = await store.openConversation(id, 'task-native-fixture', async () => native, consume), events: StreamLine[] = [];
  let deletionReceiptRemoved = false, completedObserved = false;
  owner.subscribe(event => {
    events.push(event);
    if (owner.listObservedTasks().some(task => task.status === 'completed')) completedObserved = true;
    const metadata = (event as { tool_use_result?: { updatedFields?: string[] } }).tool_use_result;
    if (metadata?.updatedFields?.includes('deleted')) deletionReceiptRemoved = completedObserved && owner.listObservedTasks().length === 0;
  });
  try {
    owner.start('Run only the fixed private task CRUD fixture.', consume);
    await vi.waitFor(() => expect(events.some(event => event.type === 'result')).toBe(true), { timeout: 15000 });
    await vi.waitFor(() => expect(owner.busy).toBe(false));
    expect(events.every(event => event.type !== 'result' || (event.subtype === 'success' && event.is_error !== true))).toBe(true);
    expect(getClaudeState(services, id)?.pendingControlRequest).toBeFalsy();
    const tasks = owner.listObservedTasks(); if (deletion) { expect(deletionReceiptRemoved).toBe(true); expect(tasks).toEqual([]); }
    else { expect(tasks).toHaveLength(1); expect(tasks[0]).toMatchObject({ id: '1', subject: 'NativeTaskFixture', status: 'completed' }); }
    const listing = await command({ command: 'cc-tasks', threadId: id }, services, {} as never, 'task-control');
    if (deletion) expect(listing.text).not.toContain('1: NativeTaskFixture');
    else { expect(listing.text).toContain('1: NativeTaskFixture — completed'); expect(listing.text).toContain('not a fresh read'); } expect(listing.data).toEqual(tasks);
    const rowUpdates = updates.mock.calls.flatMap(([, patch]) => (patch.blocks ?? []).filter((block: any) => block.type === 'tool-activity').flatMap((block: any) => block.props.entries));
    expect(new Set(rowUpdates.filter((entry: any) => ['TaskCreate','TaskGet','TaskList','TaskUpdate'].includes(entry.tool)).map((entry: any) => entry.tool)).size).toBe(4);
    await owner.close(); expect(owner.listObservedTasks()).toEqual([]);
    await writeFile(join(workspace!, 'task-list-app-evidence.json'), JSON.stringify({ deletedObserved: deletionReceiptRemoved, sourceConsumer: true, nativeOwner: true, observedFinal: true, commandPresented: true, closed: true, successfulModelResults: true, qualification: 'Actual query/owner/source consumer and cc-tasks; compiled flow, task mutation controls, all native branches and mounted UI remain separate.' }, null, 2));
  } finally { store.killAllHandles(); }
}, 35000);

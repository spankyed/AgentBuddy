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
import { action as approve } from '../../../../src/content/actions/claude-code/approve-tool.ts';
import { chatService } from '#features/threads/be/services/chat.ts';
vi.mock('../../../../src/content/actions/claude-code/_helpers/context-usage.ts', () => ({ refreshThreadContextUsage: vi.fn(async () => {}) }));

const executable = process.env.CLAUDE_RESEARCH_EXECUTABLE, workspace = process.env.CLAUDE_RESEARCH_WORKSPACE, endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;
it.skipIf(!executable || !workspace || !endpoint)('actual native Workflow phases and completion update their original source-consumer row', async () => {
  expect(process.env.HOME).toBe(workspace); expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
  const failed = process.env.CLAUDE_WORKFLOW_EXPECT_FAILURE === '1';
  const stopped = process.env.CLAUDE_WORKFLOW_EXPECT_STOP === '1';
  const terminal = stopped ? 'stopped' : failed ? 'failed' : 'completed';
  const cwd = join(workspace!, 'project'), temporary = join(workspace!, 'tmp'); await mkdir(cwd); await mkdir(temporary, { mode: 0o700 });
  const { id } = repository.threadCommands.create({ topic: 'Native Workflow', instructions: '', tags: [] });
  repository.threadCommands.update(id, { context: { claudeCode: { cwd, permissionMode: 'default' } } });
  mockService<Services, 'cli'>('cli', { claudeCode: { getConversation: store.getConversation, getHandle: store.getHandle, isCurrentTurn: store.isCurrentTurn, storeHandle: store.storeHandle, clearHandle: store.clearHandle } as never });
  const updates = vi.fn(chatService.updateMessageState);
  mockService<Services, 'chat'>('chat', { ...chatService, updateMessageState: updates });
  mockService<Services, 'logger'>('logger', { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  mockService<Services, 'threads'>('threads', { updateChatState: vi.fn() });
  const emitted = vi.fn();
  mockService<Services, 'emitter'>('emitter', { sendToSystem: emitted, broadcastToPlugin: vi.fn() });
  const consume = (turn: ClaudeConversationTurn) => consumeConversationTurn(turn, { services, threadId: id, text: '', sessionCwd: cwd });
  const native = await query({ cwd, cliPath: executable, env: { HOME: workspace, CLAUDE_CONFIG_DIR: join(workspace!, '.claude'), CLAUDE_CODE_TMPDIR: temporary, ANTHROPIC_BASE_URL: endpoint, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    permissionMode: 'default', settingSources: [], settings: JSON.stringify({ apiKeyHelper: '/usr/bin/printf research-fixture-key' }), model: 'default', strictMcpConfig: true,
    keepStdinOpen: true, surfaceControlRequests: true, noSessionPersistence: true, maxTurns: 4, signal: AbortSignal.timeout(25000) });
  const owner = await store.openConversation(id, 'workflow-native-fixture', async () => native, consume), events: StreamLine[] = [];
  owner.subscribe(event => { events.push(event); });
  try {
    owner.start('Run only the fixed deterministic local Workflow fixture.', consume);
    await vi.waitFor(() => expect(getClaudeState(services, id)?.pendingControlRequest?.toolName).toBe('Workflow'), { timeout: 10000 });
    const pending = getClaudeState(services, id)!.pendingControlRequest!;
    let script = 'export const meta = { name: "research-native-workflow", description: "Fixed arithmetic fixture", phases: [{title:"Fixture"}] };\nphase("Fixture");\nlog("NATIVE_WORKFLOW_FIXTURE");\nreturn {marker:"NATIVE_WORKFLOW_FIXTURE",answer:42};\n';
    if (failed) script = script.replace('return {marker:"NATIVE_WORKFLOW_FIXTURE",answer:42};', 'throw new Error("NATIVE_WORKFLOW_FAILURE");');
    if (stopped) script = script.replace('return {marker:"NATIVE_WORKFLOW_FIXTURE",answer:42};', 'await new Promise(() => {});');
    expect(pending.originalInput?.script).toBe(script);
    expect(await approve({ threadId: id, requestId: pending.requestId, toolName: 'Workflow', originalInput: pending.originalInput }, services)).toMatchObject({ success: true });
    if (stopped) {
      await vi.waitFor(() => expect(events.some(event => event.type === 'system' && event.subtype === 'task_progress')).toBe(true), { timeout: 10000 });
      const listing = await command({ command: 'cc-workflows', threadId: id }, services, {} as never, 'workflow-control');
      const task = listing.data.find((task: any) => task.status === 'running'); expect(task).toBeDefined();
      const stop = await command({ command: 'cc-workflows', threadId: id, text: `stop ${task.taskId}` }, services, {} as never, 'workflow-control');
      expect(stop.text).toMatch(/Stop request acknowledged|stopped/);
    }
    await vi.waitFor(() => expect(events.some(event => event.type === 'system' && event.subtype === 'task_notification' && event.status === terminal)).toBe(true), { timeout: 10000 });
    if (stopped) {
      await vi.waitFor(() => expect(owner.busy).toBe(false));
      const inputId = owner.start('Return only fixed text without tools.', consume);
      await vi.waitFor(() => expect(events.some(event => event.type === 'result' && event.user_message_uuid === inputId)).toBe(true), { timeout: 10000 });
    } else await vi.waitFor(() => expect(events.filter(event => event.type === 'result')).toHaveLength(2), { timeout: 10000 });
    await vi.waitFor(() => expect(owner.busy).toBe(false));
    expect(events.every(event => event.type !== 'result' || (event.subtype === 'success' && event.is_error !== true))).toBe(true);
    const rowUpdates = updates.mock.calls.flatMap(([messageId, patch]) => (patch.blocks ?? []).filter((block: any) => block.type === 'tool-activity').flatMap((block: any) => block.props.entries.filter((entry: any) => entry.tool === 'Workflow').map((entry: any) => ({ messageId, entry, blockState: block.props.state }))));
    const final = rowUpdates.at(-1)!;
    expect(final.entry).toMatchObject({ status: failed || stopped ? 'error' : 'ok', outputSummary: expect.stringContaining(`${terminal} — Fixture`) });
    expect(final.entry.details.input.script).toBe(pending.originalInput?.script);
    expect(final.entry.details.output).toContain('Workflow launched in background.');
    if (failed) expect(final.entry.details.error).toContain('NATIVE_WORKFLOW_FAILURE');
    const completions = emitted.mock.calls.map(([, event]) => event).filter(event => event.eventType === 'cc.stream.completed');
    expect(completions.filter(event => event.payload.hadErrors)).toHaveLength(failed || stopped ? 1 : 0);
    expect(new Set(rowUpdates.map(row => row.messageId)).size).toBe(1);
    expect(events.some(event => event.type === 'system' && event.subtype === 'task_progress' && Array.isArray(event.workflow_progress))).toBe(true);
    expect(store.getConversation(id)?.owner).toBe(owner);
    await owner.close();
    await writeFile(join(workspace!, 'workflow-app-evidence.json'), JSON.stringify({ sourceConsumer: true, nativeOwner: true, nativeApproval: true, sameOriginalRow: true, phasePresented: true, completionPresented: true, taskStatus: terminal, successfulModelResults: true, taskErrorAccountedOnce: failed || stopped, stoppedViaCommand: stopped, sameOwnerFollowup: stopped, nativeFailureMarkerRetained: failed, originalInputRetained: true, nativeLaunchOutputRetained: true, closed: true, qualification: 'Actual query/owner/source consumer and approval action; compiled flow and mounted UI remain separate.' }, null, 2));
  } finally { store.killAllHandles(); }
}, 15000);

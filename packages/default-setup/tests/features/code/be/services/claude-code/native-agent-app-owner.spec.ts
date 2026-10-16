import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { importCompiledContent } from '@apackdev/sdk/utils';
import { importFlows, mockService, startApp } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { claudeCode } from '#features/code/be/services/claude-code/index.ts';
import * as runner from '#features/code/be/services/claude-code/runner.ts';
import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import type { ResultLine, StreamLine } from '#features/code/be/services/claude-code/types.ts';
import { getClaudeState } from '../../../../../../src/content/actions/claude-code/_helpers/thread-context.ts';

const executable = process.env.CLAUDE_RESEARCH_EXECUTABLE;
const workspace = process.env.CLAUDE_RESEARCH_WORKSPACE;
const endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;

it.skipIf(!executable || !workspace || !endpoint)('compiled app preserves native Agent task, host mappings and cumulative cost', async () => {
  expect(process.env.HOME).toBe(workspace);
  expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
  vi.stubEnv('ANTHROPIC_BASE_URL', endpoint!); vi.stubEnv('CLAUDE_CODE_SIMPLE', undefined); vi.stubEnv('CLAUDE_CODE_COORDINATOR_MODE', undefined);
  await mkdir(join(workspace!, '.claude', 'agents'), { recursive: true });
  await writeFile(join(workspace!, '.claude', 'settings.json'), JSON.stringify({ apiKeyHelper: '/usr/bin/printf research-fixture-key' }));
  await writeFile(join(workspace!, '.claude', 'agents', 'status-fixture.md'), '---\nname: status-fixture\ndescription: Disposable local status worker\ntools: []\nmaxTurns: 1\n---\nNativeStatusChildSystem. Return the requested fixed worker marker without tools.\n');
  services.settings.set({ kind: 'feature', featureRef: 'default-setup/code' }, ['cliPaths', 'claude-code'], executable!);
  const spawning = vi.spyOn(runner, 'spawnStream');
  const originalQuery = claudeCode.query.bind(claudeCode);
  let sent: ReturnType<typeof vi.spyOn> | undefined;
  vi.spyOn(claudeCode, 'query').mockImplementation(async options => {
    const handle = await originalQuery({ ...options, signal: AbortSignal.timeout(30000) });
    sent = vi.spyOn(handle, 'send'); return handle;
  });
  const events: StreamLine[] = [], results: ResultLine[] = [];
  const pendingAtResults: boolean[] = [];
  const original = services.cli.claudeCode;
  const opened = vi.fn<Services['cli']['claudeCode']['openConversation']>((...args) => original.openConversation(...args).then(owner => {
    owner.subscribe(event => { events.push(event); if (event.type === 'result') { results.push(event as ResultLine); pendingAtResults.push(owner.handle.hasPendingBackgroundTasks(event)); } });
    return owner;
  }));
  mockService<Services, 'cli'>('cli', { claudeCode: { ...original, openConversation: opened } });
  const compiledDir = resolve(import.meta.dirname, '../../../../../../dist/runtime/content');
  importCompiledContent({ compiledDir, include: { flows: new Set(), library: new Set(), notes: new Set(), settings: new Set() } });
  const flows = JSON.parse(readFileSync(join(compiledDir, 'flows.content.json'), 'utf8'));
  importFlows({ 'Claude Code': { ...flows['Claude Code'], root: true } });
  const app = await startApp({ systems: ['brain'] }); await app.runFlow('Claude Code');
  const { id } = repository.threadCommands.create({ topic: 'Native Agent owner fixture', instructions: '', tags: [] });
  repository.threadCommands.update(id, { context: { claudeCode: { cwd: workspace! } } });
  const state = () => getClaudeState(services, id);
  const messages = () => repository.chatQueries.threadData(id)?.messages ?? [];
  try {
    const first = repository.chatCommands.addMessage({ threadId: id, sender: 'user', text: 'NativeSubagentParentFixture: Run the disposable status worker.' });
    await app.runFlow('Claude Code', { event: 'user.message', data: { threadId: id, text: first.text, messageId: first.id, mode: 'Claude Code', phase: 'Edit' } });
    await vi.waitFor(() => expect(results).toHaveLength(1), { timeout: 15000 });
    expect(pendingAtResults).toEqual([true]);
    await vi.waitFor(() => expect(state()?.turns).toBe(1), { timeout: 15000 });
    await vi.waitFor(() => expect(store.isConversationBusy(id)).toBe(false));
    expect(results).toHaveLength(1);
    expect(messages().find(message => message.id === first.id)?.context?.cliUuid).toBe(results[0]?.user_message_uuid);
    const owner = store.getConversation(id)!.owner;
    const second = repository.chatCommands.addMessage({ threadId: id, sender: 'user', text: 'Synthetic second host input while the agent is running.' });
    await app.runFlow('Claude Code', { event: 'user.message', data: { threadId: id, text: second.text, messageId: second.id, mode: 'Claude Code', phase: 'Edit' } });
    await vi.waitFor(() => expect(state()?.turns).toBe(2), { timeout: 15000 });
    await vi.waitFor(() => expect(store.isConversationBusy(id)).toBe(false));
    expect(store.getConversation(id)?.owner).toBe(owner); expect(opened).toHaveBeenCalledOnce(); expect(spawning).toHaveBeenCalledOnce(); expect(sent).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(pendingAtResults).toEqual([true, true]);
    expect(events.some(event => event.type === 'system' && event.subtype === 'task_notification')).toBe(false);
    await vi.waitFor(() => expect(state()?.turns).toBe(3), { timeout: 15000 });
    await vi.waitFor(() => expect(store.isConversationBusy(id)).toBe(false));
    expect(pendingAtResults).toEqual([true, true, false]);
    expect(results[2]?.user_message_uuid).toBeUndefined();
    expect(messages().find(message => message.id === second.id)?.context?.cliUuid).toBe(results[1]?.user_message_uuid);
    expect(results.every(result => result.subtype === 'success')).toBe(true);
    expect(Math.abs(state()!.totalCostUsd! - results.at(-1)!.total_cost_usd!)).toBeLessThan(1e-12);
    const assistants = messages().filter(message => message.sender === 'assistant');
    expect(assistants.some(message => message.text?.replaceAll('ParentSubagentFixtureComplete', '').includes('SubagentFixtureComplete'))).toBe(false);
    expect(JSON.stringify(assistants.flatMap(message => message.blocks ?? []))).toContain('SubagentFixtureComplete');
    const childIds = new Set(events.flatMap(event => event.type === 'assistant' && event.parent_tool_use_id && event.uuid ? [event.uuid] : []));
    expect(assistants.some(message => childIds.has(message.context?.cliUuid as string))).toBe(false);
    expect(events.some(event => event.type === 'system' && event.subtype === 'task_started' && event.task_type === 'local_agent')).toBe(true);
    expect(events.some(event => event.type === 'system' && event.subtype === 'task_notification' && event.status === 'completed')).toBe(true);
    expect(await store.closeIdleConversation(id)).toBe(true);
    await writeFile(join(workspace!, 'agent-app-evidence.json'), JSON.stringify({ compiledFlow: true, productionLaunchService: true, privateAgentDefinitionLoaded: true, firstResultPending: true,
      completionWithoutHostUuid: true, canonicalHostMappings: true, sameNativeOwner: true, singleNativeProcess: true, hostInputs: 2, appTurns: 3, secondInputBeforeChildCompleted: true, nativeResults: results.length, pendingAtResults,
      exactCostAccounting: true, childOutputSeparated: true, childOutputRetained: true, parentRewindIdentity: true, appTotalCostUsd: state()!.totalCostUsd, nativeCumulativeCosts: results.map(result => result.total_cost_usd), assistantMessages: assistants.map(message => ({ text: message.text })), closed: true }, null, 2));
  } finally { await writeFile(join(workspace!, 'agent-app-events.json'), JSON.stringify(events, null, 2)); store.killAllHandles(); }
}, 45000);

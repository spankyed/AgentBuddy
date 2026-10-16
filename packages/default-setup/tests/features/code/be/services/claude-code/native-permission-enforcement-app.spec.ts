import { readFileSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { importCompiledContent } from '@apackdev/sdk/utils';
import { importFlows, mockService, startApp } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import * as runner from '#features/code/be/services/claude-code/runner.ts';
import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import { UserStreamLineSchema, type ResultLine, type StreamLine } from '#features/code/be/services/claude-code/types.ts';
import { getClaudeState } from '../../../../../../src/content/actions/claude-code/_helpers/thread-context.ts';

const executable = process.env.CLAUDE_RESEARCH_EXECUTABLE, workspace = process.env.CLAUDE_RESEARCH_WORKSPACE, endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;

it.skipIf(!executable || !workspace || !endpoint)('compiled permission edits deny and restore actual tool execution in the same conversation', async () => {
 expect(process.env.HOME).toBe(workspace); expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
 for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
 vi.stubEnv('ANTHROPIC_BASE_URL', endpoint!);
 const cwd = join(workspace!, 'project'); await mkdir(cwd, { recursive: true });
 const settings = join(workspace!, '.claude', 'settings.json');
 await writeFile(settings, JSON.stringify({ language: 'preserve-fixture', apiKeyHelper: '/usr/bin/printf research-fixture-key', permissions: { allow: ['Bash'] } }));
 services.settings.set({ kind: 'feature', featureRef: 'default-setup/code' }, ['cliPaths', 'claude-code'], executable!);
 const spawning = vi.spyOn(runner, 'spawnStream'), writers = vi.spyOn(runner, 'execOnce');
 const events: StreamLine[] = [], results: ResultLine[] = [];
 const original = services.cli.claudeCode;
 const opened = vi.fn<Services['cli']['claudeCode']['openConversation']>((...args) => original.openConversation(...args).then(owner => {
  owner.subscribe(event => { events.push(event); if (event.type === 'result') results.push(event as ResultLine); }); return owner;
 }));
 mockService<Services, 'cli'>('cli', { claudeCode: { ...original, openConversation: opened } });
 const compiledDir = resolve(import.meta.dirname, '../../../../../../dist/runtime/content');
 importCompiledContent({ compiledDir, include: { flows: new Set(), library: new Set(), notes: new Set(), settings: new Set() } });
 const flows = JSON.parse(readFileSync(join(compiledDir, 'flows.content.json'), 'utf8')); importFlows({ 'Claude Code': { ...flows['Claude Code'], root: true } });
 const app = await startApp({ systems: ['brain'] }); await app.runFlow('Claude Code');
 const { id } = repository.threadCommands.create({ topic: 'Native permission enforcement', instructions: '', tags: [] });
 repository.threadCommands.update(id, { context: { claudeCode: { cwd, permissionMode: 'default' } } });
 const input = async (turn: number) => {
  const text = `ResearchPermissionTurn${turn}: write only the disposable synthetic fixture marker.`;
  const user = repository.chatCommands.addMessage({ threadId: id, sender: 'user', text });
  await app.runFlow('Claude Code', { event: 'user.message', data: { threadId: id, text, messageId: user.id, mode: 'Claude Code', phase: 'Edit' } });
  await vi.waitFor(() => expect(getClaudeState(services, id)?.turns).toBe(turn), { timeout: 15000 });
  await vi.waitFor(() => expect(store.isConversationBusy(id)).toBe(false));
  expect(getClaudeState(services, id)?.pendingControlRequest).toBeUndefined();
 };
 const messages = () => repository.chatQueries.threadData(id)?.messages ?? [];
 const edit = async (text: string) => {
  const before = messages().length;
  await app.runFlow('Claude Code', { event: 'user.command', data: { command: 'cc-permissions', text, threadId: id } });
  await vi.waitFor(() => expect(messages().length).toBeGreaterThan(before), { timeout: 15000 });
  return messages().at(-1)?.text ?? '';
 };
 try {
  await input(1); const owner = store.getConversation(id)!.owner;
  expect(await readFile(join(workspace!, 'fixture.txt'), 'utf8')).toBe('synthetic protocol fixture\n'); await unlink(join(workspace!, 'fixture.txt'));
  const added = await edit('add deny userSettings Bash'); expect(added).toContain('Saved userSettings permission change.'); expect(added).toContain('deny [userSettings; persistent] Bash'); expect(added).toContain('Running conversation permissions');
  await input(2); expect(store.getConversation(id)?.owner).toBe(owner);
  await expect(readFile(join(workspace!, 'fixture.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  const removed = await edit('remove deny userSettings Bash'); expect(removed).toContain('Saved userSettings permission change.'); expect(removed).not.toContain('deny [userSettings; persistent] Bash'); expect(removed).toContain('allow [userSettings; persistent] Bash');
  await input(3); expect(store.getConversation(id)?.owner).toBe(owner);
  expect(await readFile(join(workspace!, 'fixture.txt'), 'utf8')).toBe('synthetic protocol fixture\n');
  const toolResults = events.flatMap(event => { const parsed = UserStreamLineSchema.safeParse(event); return parsed.success && Array.isArray(parsed.data.message.content) ? parsed.data.message.content.filter(block => block.type === 'tool_result') : []; });
  const correlated = [1, 2, 3].map(turn => toolResults.filter(result => result.tool_use_id === `toolu_research_fixture_${turn}`));
  expect(correlated.map(items => items.length)).toEqual([1, 1, 1]);
  expect(correlated.map(items => Boolean(items[0].is_error))).toEqual([false, true, false]);
  expect(String(correlated[1]![0].content)).toContain('Permission to use Bash has been denied');
  expect(results).toHaveLength(3); expect(results.every(result => result.subtype === 'success')).toBe(true);
  expect(events.filter(event => event.type === 'control_request')).toHaveLength(0);
  expect(opened).toHaveBeenCalledOnce(); expect(spawning).toHaveBeenCalledOnce(); expect(writers).toHaveBeenCalledTimes(2);
  expect(spawning.mock.calls[0]![0]).toEqual(expect.arrayContaining(['--permission-mode', 'default']));
  for (const [args] of writers.mock.calls) expect(args).toEqual(['edit-permission-rules', '--json']);
  const saved = JSON.parse(await readFile(settings, 'utf8')); expect(saved).toMatchObject({ language: 'preserve-fixture', apiKeyHelper: '/usr/bin/printf research-fixture-key', permissions: { allow: ['Bash'], deny: [] } });
  expect(await store.closeIdleConversation(id)).toBe(true);
  await writeFile(join(workspace!, 'permission-enforcement-app-evidence.json'), JSON.stringify({ compiledFlow: true, productionLaunchService: true, sameNativeOwner: true, nativeProcesses: 1, nativeWriters: 2, hostInputs: 3, commandReplies: 2, nativeResults: 3, markerWritten: [true, false, true], toolResultErrors: [false, true, false], hostPermissionRequests: 0, permissionMode: 'default', unrelatedUserSettingsPreserved: true, originalAllowPreserved: true, closed: true }, null, 2));
 } finally { await writeFile(join(workspace!, 'permission-enforcement-app-events.json'), JSON.stringify(events, null, 2)); store.killAllHandles(); }
}, 15000);

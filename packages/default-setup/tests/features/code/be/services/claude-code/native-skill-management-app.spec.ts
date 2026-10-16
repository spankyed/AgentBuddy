import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import { getClaudeState } from '../../../../../../src/content/actions/claude-code/_helpers/thread-context.ts';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { importCompiledContent } from '@apackdev/sdk/utils';
import { importFlows, startApp } from '@apackdev/testing/harness';
import { services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import * as runner from '#features/code/be/services/claude-code/runner.ts';
const executable = process.env.CLAUDE_RESEARCH_EXECUTABLE, workspace = process.env.CLAUDE_RESEARCH_WORKSPACE;

it.skipIf(!executable || !workspace)('routes native Skill management and memory catalogs through the compiled app command flow', async () => {
 expect(process.env.HOME).toBe(workspace);
 for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
 const cwd = join(workspace!, 'project');
 for (const [name, extra] of [['editable-fixture', ''], ['locked-fixture', 'disable-model-invocation: true\n']]) {
  const dir = join(cwd, '.claude', 'skills', name); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Private compiled command fixture\n${extra}---\nSynthetic fixture body.\n`);
 }
 await writeFile(join(cwd, '.claude', 'settings.json'), JSON.stringify({ permissions: { deny: ['Bash'] } }));
 const ruleDir = join(cwd, '.claude', 'rules'); await mkdir(ruleDir, { recursive: true });
 await writeFile(join(ruleDir, 'memory-rule.md'), 'Synthetic memory catalog fixture.\n');
 services.settings.set({ kind: 'feature', featureRef: 'default-setup/code' }, ['cliPaths', 'claude-code'], executable!);
 const streams = vi.spyOn(runner, 'spawnStream'), commands = vi.spyOn(runner, 'execOnce');
 const compiledDir = resolve(import.meta.dirname, '../../../../../../dist/runtime/content');
 importCompiledContent({ compiledDir, include: { flows: new Set(), library: new Set(), notes: new Set(), settings: new Set() } });
 const flows = JSON.parse(readFileSync(join(compiledDir, 'flows.content.json'), 'utf8'));
 importFlows({ 'Claude Code': { ...flows['Claude Code'], root: true } });
 const app = await startApp({ systems: ['brain'] }); await app.runFlow('Claude Code');
 const { id } = repository.threadCommands.create({ topic: 'Native Skill commands', instructions: '', tags: [] });
 repository.threadCommands.update(id, { context: { claudeCode: { cwd } } });
 const retained = process.env.CLAUDE_RESEARCH_RETAINED === '1';
 if (retained) {
  await writeFile(join(workspace!, '.claude', 'settings.json'), JSON.stringify({ apiKeyHelper: '/usr/bin/printf research-fixture-key' }));
  const user = repository.chatCommands.addMessage({ threadId: id, sender: 'user', text: 'Reply with the synthetic fixture confirmation.' });
  await app.runFlow('Claude Code', { event: 'user.message', data: { threadId: id, text: user.text, messageId: user.id, mode: 'Claude Code', phase: 'Edit' } });
  await vi.waitFor(() => expect(getClaudeState(services, id)?.turns).toBe(1), { timeout: 15000 });
  await vi.waitFor(() => expect(store.isConversationBusy(id)).toBe(false));
  expect(store.getConversation(id)?.owner.sessionCwd).toBe(cwd);
 }
 const owner = store.getConversation(id)?.owner;
 const texts = () => (repository.chatQueries.threadData(id)?.messages ?? []).map(message => message.text ?? '');
 const send = async (text: string, command = 'cc-skills') => {
  const before = texts().length;
  await app.runFlow('Claude Code', { event: 'user.command', data: { command, text, threadId: id } });
  await vi.waitFor(() => expect(texts().length).toBeGreaterThan(before), { timeout: 15000 });
  return texts().at(-1)!;
 };
 expect(await send('')).toContain('editable-fixture [project] — on');
 expect(texts().at(-1)).toContain('locked by author');
 const settings = join(cwd, '.claude', 'settings.local.json');
 expect(await send('set editable-fixture off')).toContain('Updated editable-fixture.');
 expect(JSON.parse(await readFile(settings, 'utf8')).skillOverrides['editable-fixture']).toBe('off');
 expect(texts().at(-1)).toContain('hidden from command suggestions');
 const before = await readFile(settings);
 expect(await send('set locked-fixture on')).toContain('its state cannot be changed here');
 expect(await readFile(settings)).toEqual(before);
 expect(await send('set editable-fixture on')).toContain('Updated editable-fixture.');
 expect(JSON.parse(await readFile(settings, 'utf8')).skillOverrides?.['editable-fixture']).toBeUndefined();
 const memoryReply = await send('', 'cc-memory');
 expect(memoryReply).toContain('.claude/rules/memory-rule.md');
 expect(memoryReply).toContain('[other]');
 expect(memoryReply).toContain('Auto-memory: on');
 expect(memoryReply).not.toContain('Auto-dream');
 expect(await send('auto off', 'cc-memory')).toContain('Saved user auto-memory setting: off.');
 expect(texts().at(-1)).toContain('Auto-memory: off');
 expect(JSON.parse(await readFile(join(workspace!, '.claude', 'settings.json'), 'utf8')).autoMemoryEnabled).toBe(false);
 expect(await send('auto on', 'cc-memory')).toContain('Saved user auto-memory setting: on.');
 expect(texts().at(-1)).toContain('Auto-memory: on');
 const userSettings = JSON.parse(await readFile(join(workspace!, '.claude', 'settings.json'), 'utf8'));
 expect(userSettings.autoMemoryEnabled).toBe(true);
 if (retained) expect(userSettings.apiKeyHelper).toBe('/usr/bin/printf research-fixture-key');
 const permissionReply = await send('', 'cc-permissions');
 expect(permissionReply).toContain('deny [projectSettings; persistent] Bash');
 expect(permissionReply).toContain(`Workspace: ${cwd}`);
 expect(permissionReply).toContain('Managed-only rules: no');
 expect(permissionReply).toContain(retained ? 'Running conversation permissions' : 'Project configuration permissions');
 if (retained) { expect(store.getConversation(id)?.owner).toBe(owner); expect(await store.closeIdleConversation(id)).toBe(true); }
 expect(streams).toHaveBeenCalledTimes(retained ? 1 : 12); expect(commands).toHaveBeenCalledTimes(5);
 if (!retained) for (const [args] of streams.mock.calls) expect(args).toContain('--no-session-persistence');
 expect(commands.mock.calls.filter(([args]) => args[0] === 'edit-skill-overrides')).toHaveLength(3);
 expect(commands.mock.calls.filter(([args]) => args[0] === 'edit-memory-settings')).toHaveLength(2);
 for (const [args] of commands.mock.calls) expect(args[1]).toBe('--json');
 await writeFile(join(workspace!, 'skill-management-app-evidence.json'), JSON.stringify({ compiledFlow: true, productionLaunchService: true, nativeListing: true, nativeEdit: true, authorLockRejected: true, rejectedEditUnchanged: true, redundantOverrideRemoved: true, threadProjectScope: true, retainedProcess: retained, sameOwner: retained ? store.getConversation(id) === undefined && !!owner : undefined, nativeMemoryCatalog: true, hiddenDreamOmitted: true, nativeMemorySettings: true, nativePermissionCatalog: true, commandReplies: 8, nativeStreamingProcesses: streams.mock.calls.length, nativeWriterProcesses: commands.mock.calls.length, modelPrompts: retained ? 1 : 0 }, null, 2));
}, 45000);

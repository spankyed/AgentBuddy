import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { importCompiledContent } from '@apackdev/sdk/utils';
import { importFlows, startApp } from '@apackdev/testing/harness';
import { services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { claudeCode } from '#features/code/be/services/claude-code/index.ts';
import * as runner from '#features/code/be/services/claude-code/runner.ts';
import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import { getClaudeState } from '../../../../../../src/content/actions/claude-code/_helpers/thread-context.ts';

const executable = process.env.CLAUDE_RESEARCH_EXECUTABLE;
const workspace = process.env.CLAUDE_RESEARCH_WORKSPACE;
const endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;
const hookUrl = process.env.CLAUDE_RESEARCH_HOOK_URL;

it.skipIf(!executable || !workspace || !endpoint || !hookUrl)('compiled app inherits native exec-args and HTTP hooks from user settings', async () => {
  expect(process.env.HOME).toBe(workspace);
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
  expect(new URL(endpoint!).hostname).toBe('127.0.0.1'); expect(new URL(hookUrl!).hostname).toBe('127.0.0.1');
  vi.stubEnv('ANTHROPIC_BASE_URL', endpoint!); vi.stubEnv('CLAUDE_CODE_SIMPLE', undefined); vi.stubEnv('CLAUDE_CODE_COORDINATOR_MODE', undefined);
  execFileSync('/usr/bin/git', ['init', '-q', workspace!]);
  await mkdir(join(workspace!, '.claude'), { recursive: true });
  const hookScript = join(workspace!, 'native-exec-hook.mjs');
  await writeFile(hookScript, `import {writeFile} from 'node:fs/promises';let text='';for await(const chunk of process.stdin)text+=chunk;await writeFile(new URL('./exec-hook-record.json',import.meta.url),JSON.stringify({argv:process.argv.slice(2),input:JSON.parse(text),allowed:process.env.CLAUDE_RESEARCH_ALLOWED,unlisted:process.env.CLAUDE_RESEARCH_UNLISTED}));process.stdout.write('{}');`);
  const guardedScript = join(workspace!, 'guarded-hook.mjs');
  await writeFile(guardedScript, `import {writeFile} from 'node:fs/promises';await writeFile(new URL('./guarded-hook.txt',import.meta.url),'unexpected');process.stdout.write('{}');`);
  const literals = ['$HOME', '$(/usr/bin/printf not-a-shell)', 'two words', `quote'"`, 'semi;colon'];
  const settings = {
    apiKeyHelper: '/usr/bin/printf research-fixture-key',
    env: { CLAUDE_RESEARCH_ALLOWED: 'allowed-fixture', CLAUDE_RESEARCH_UNLISTED: 'unlisted-fixture' },
    permissions: { allow: ['Bash'] },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
      { type: 'command', command: process.execPath, args: [hookScript, ...literals, '${CLAUDE_PROJECT_DIR}/fixture.txt'], timeout: 5 },
      { type: 'command', command: process.execPath, args: [guardedScript], if: 'Bash(echo never-matches-fixture)', timeout: 5 },
      { type: 'http', url: hookUrl, headers: { 'X-Allowed': '$CLAUDE_RESEARCH_ALLOWED', 'X-Unlisted': '$CLAUDE_RESEARCH_UNLISTED' }, allowedEnvVars: ['CLAUDE_RESEARCH_ALLOWED'], timeout: 5 },
    ] }] },
  };
  await writeFile(join(workspace!, '.claude', 'settings.json'), JSON.stringify(settings));
  services.settings.set({ kind: 'feature', featureRef: 'default-setup/code' }, ['cliPaths', 'claude-code'], executable!);
  const spawning = vi.spyOn(runner, 'spawnStream');
  const originalQuery = claudeCode.query.bind(claudeCode);
  vi.spyOn(claudeCode, 'query').mockImplementation(options => originalQuery({ ...options, signal: AbortSignal.timeout(25000) }));
  const compiledDir = resolve(import.meta.dirname, '../../../../../../dist/runtime/content');
  importCompiledContent({ compiledDir, include: { flows: new Set(), library: new Set(), notes: new Set(), settings: new Set() } });
  const flows = JSON.parse(readFileSync(join(compiledDir, 'flows.content.json'), 'utf8'));
  importFlows({ 'Claude Code': { ...flows['Claude Code'], root: true } });
  const app = await startApp({ systems: ['brain'] }); await app.runFlow('Claude Code');
  const { id } = repository.threadCommands.create({ topic: 'Native configured hooks', instructions: '', tags: [] });
  repository.threadCommands.update(id, { context: { claudeCode: { cwd: workspace! } } });
  try {
    const message = repository.chatCommands.addMessage({ threadId: id, sender: 'user', text: 'Create only the disposable fixture marker.' });
    await app.runFlow('Claude Code', { event: 'user.message', data: { threadId: id, text: message.text, messageId: message.id, mode: 'Claude Code', phase: 'Edit' } });
    await vi.waitFor(() => expect(getClaudeState(services, id)?.turns).toBe(1), { timeout: 15000 });
    await vi.waitFor(() => expect(store.isConversationBusy(id)).toBe(false));
    const record = JSON.parse(await readFile(join(workspace!, 'exec-hook-record.json'), 'utf8'));
    expect(record.argv).toEqual([...literals, join(workspace!, 'fixture.txt')]);
    expect(record.input.hook_event_name).toBe('PreToolUse'); expect(record.input.tool_name).toBe('Bash');
    await expect(readFile(join(workspace!, 'guarded-hook.txt'))).rejects.toHaveProperty('code', 'ENOENT');
    expect(record.allowed).toBe('allowed-fixture'); expect(record.unlisted).toBe('unlisted-fixture');
    expect(await readFile(join(workspace!, 'fixture.txt'), 'utf8')).toBe('synthetic protocol fixture\n');
    expect(getClaudeState(services, id)?.pendingControlRequest).toBeUndefined();
    expect(spawning).toHaveBeenCalledOnce(); expect(await store.closeIdleConversation(id)).toBe(true);
    await rename(join(workspace!, 'fixture.txt'), join(workspace!, 'allowed-fixture.txt'));
    const failureCases: Array<{ policy: 'block' | 'continue'; toolExecuted: boolean; nativeTurnCompleted: boolean }> = [];
    for (const policy of ['block', 'continue'] as const) {
      await writeFile(join(workspace!, '.claude', 'settings.json'), JSON.stringify({ ...settings, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
        { type: 'command', command: process.execPath, args: ['-e', 'process.exit(7)'], timeout: 5, onFailure: policy },
      ] }] } }));
      const { id: next } = repository.threadCommands.create({ topic: `Hook failure ${policy}`, instructions: '', tags: [] });
      repository.threadCommands.update(next, { context: { claudeCode: { cwd: workspace! } } });
      const user = repository.chatCommands.addMessage({ threadId: next, sender: 'user', text: 'Create only the disposable fixture marker.' });
      await app.runFlow('Claude Code', { event: 'user.message', data: { threadId: next, text: user.text, messageId: user.id, mode: 'Claude Code', phase: 'Edit' } });
      await vi.waitFor(() => expect(getClaudeState(services, next)?.turns).toBe(1), { timeout: 15000 });
      await vi.waitFor(() => expect(store.isConversationBusy(next)).toBe(false));
      const blocks = repository.chatQueries.threadData(next)?.messages?.flatMap(message => message.blocks ?? []) ?? [];
      const entries = blocks.flatMap(block => block.type === 'tool-activity' && Array.isArray(block.props?.entries) ? block.props.entries as Array<{ tool: string; status: string }> : []);
      if (policy === 'block') {
        await expect(readFile(join(workspace!, 'fixture.txt'))).rejects.toHaveProperty('code', 'ENOENT');
        expect(entries.find(entry => entry.tool === 'Bash')?.status).toBe('error');
      } else {
        expect(await readFile(join(workspace!, 'fixture.txt'), 'utf8')).toBe('synthetic protocol fixture\n');
        expect(entries.find(entry => entry.tool === 'Bash')?.status).toBe('ok');
      }
      expect(await store.closeIdleConversation(next)).toBe(true);
      failureCases.push({ policy, toolExecuted: policy === 'continue', nativeTurnCompleted: true });
    }
    expect(spawning).toHaveBeenCalledTimes(3);
    await writeFile(join(workspace!, 'configured-hooks-app-evidence.json'), JSON.stringify({ compiledFlow: true, productionLaunchService: true, inheritedUserSettings: true, directArgumentsPreserved: true, projectPlaceholderExpanded: true, configuredEnvInherited: true, nativeToolCompleted: true, oneProcessPerCase: true, nativeProcesses: 3, conditionSkipped: true, failureCases, argv: record.argv, hookEvent: record.input.hook_event_name, toolName: record.input.tool_name, closed: true }, null, 2));
  } finally { store.killAllHandles(); }
}, 15000);

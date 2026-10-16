import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { getMemoryDialog } from '#features/code/be/services/claude-code/memory.ts';
import { getSkillsDialog } from '#features/code/be/services/claude-code/skills.ts';
import { getPermissionRules } from '#features/code/be/services/claude-code/permissions.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
import { action as planAction } from '../../../../src/content/actions/claude-code/cc-plan.ts';
import { action as contextAction } from '../../../../src/content/actions/claude-code/cc-context.ts';
import { refreshThreadContextUsage } from '../../../../src/content/actions/claude-code/_helpers/context-usage.ts';

const executable = process.env.CLAUDE_RESEARCH_EXECUTABLE, workspace = process.env.CLAUDE_RESEARCH_WORKSPACE, endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;
it.skipIf(!executable || !workspace || !endpoint)('only explicit fresh metadata reads run native session lifecycle hooks', async () => {
  expect(process.env.HOME).toBe(workspace);
  expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
  const cwd = join(workspace!, 'project'), config = join(workspace!, '.claude'), capture = join(workspace!, 'lifecycle.jsonl'), helper = join(workspace!, 'lifecycle.mjs');
  await mkdir(cwd, { recursive: true }); await mkdir(config, { recursive: true });
  const skillDirectory = join(cwd, '.claude', 'skills', 'lifecycle-fixture');
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(join(skillDirectory, 'SKILL.md'), '---\nname: lifecycle-fixture\ndescription: Disposable catalog fixture\n---\nReturn fixed text.\n');
  await writeFile(helper, "import {appendFileSync} from 'node:fs';let text='';for await(const bytes of process.stdin){text+=bytes.toString();if(text.length>65536)throw Error('oversize fixture');}const value=JSON.parse(text);appendFileSync(process.argv[2],JSON.stringify({event:value.hook_event_name})+'\\n');process.stdout.write('{}\\n');\n");
  const settings = join(config, 'settings.json'), before = JSON.stringify({ apiKeyHelper: '/usr/bin/printf research-fixture-key', hooks: Object.fromEntries(['SessionStart', 'SessionEnd'].map(event => [event, [{ hooks: [{ type: 'command', command: process.execPath, args: [helper, capture] }] }]])) });
  await writeFile(settings, before);
  const options = { cwd, cliPath: executable, env: { HOME: workspace, CLAUDE_CONFIG_DIR: config, ANTHROPIC_BASE_URL: endpoint, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, signal: AbortSignal.timeout(25000) };
  const memory = vi.fn(() => getMemoryDialog(options)), skills = vi.fn(async () => (await getSkillsDialog(options)).skills), permissions = vi.fn(() => getPermissionRules(options)), context = vi.fn(), plan = vi.fn(), writer = vi.fn();
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: () => undefined, getMemoryDialog: memory, listSkills: skills, getPermissionRules: permissions, getContextUsage: context, getPlan: plan, setAutoMemory: writer, editSkill: writer, editPermissionRules: writer } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const { id } = repository.threadCommands.create({ topic: 'Metadata lifecycle', instructions: '', tags: [] });
  repository.threadCommands.update(id, { context: { claudeCode: { cwd, sessionId: 'saved-fixture-session' } } });
  for (const command of ['cc-memory', 'cc-skills', 'cc-permissions']) {
    expect((await action({ command, threadId: id }, services, {} as never, 'metadata-flow')).text).toContain(`${command} start`);
  }
  expect((await contextAction({ threadId: id }, services, {} as never, 'metadata-flow')).text).toContain('cc-context start');
  expect((await planAction({ threadId: id }, services)).text).toContain('cc-plan start');
  await refreshThreadContextUsage(services, id, { sessionId: 'saved-fixture-session', cwd });
  for (const read of [memory, skills, permissions, context, plan, writer]) expect(read).not.toHaveBeenCalled();
  await expect(readFile(capture)).rejects.toMatchObject({ code: 'ENOENT' });
  for (const [index, command] of ['cc-memory', 'cc-skills', 'cc-permissions'].entries()) {
    const reply = await action({ command, text: 'start', threadId: id }, services, {} as never, 'metadata-flow');
    expect(reply.text).not.toContain('failed:'); expect(reply.data).toBeDefined();
    const events = (await readFile(capture, 'utf8')).trim().split('\n').map(line => JSON.parse(line).event);
    expect(events).toEqual(Array.from({ length: index + 1 }, () => ['SessionStart', 'SessionEnd']).flat());
  }
  for (const read of [memory, skills, permissions]) expect(read).toHaveBeenCalledOnce();
  expect(await readFile(settings, 'utf8')).toBe(before);
  await writeFile(join(workspace!, 'metadata-lifecycle-app-evidence.json'), JSON.stringify({ sourceCommands: true, defaultCommandStarts: 0, automaticRefreshStarts: 0, defaultWriterCalls: 0, explicitCatalogStarts: 3, hookEvents: ['SessionStart', 'SessionEnd', 'SessionStart', 'SessionEnd', 'SessionStart', 'SessionEnd'], settingsUnchanged: true, qualification: 'Actual source commands and native memory/Skill/permission readers; saved-session plan/context explicit starts and compiled/mounted publication remain separate.' }, null, 2));
}, 35000);

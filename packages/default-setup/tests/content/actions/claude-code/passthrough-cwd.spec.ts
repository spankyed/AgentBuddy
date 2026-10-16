import { expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
it.each(['cc-mcp', 'cc-agents', 'cc-doctor'])('scopes %s passthrough to the thread project override', async command => {
 const { id } = repository.threadCommands.create({ topic: 'Native command scope', instructions: '', tags: [] }); repository.threadCommands.update(id, { context: { claudeCode: { cwd: '/saved-project', cwdOverride: '/selected-project' } } });
 const exec = vi.fn().mockResolvedValue({ stdout: 'fixture', stderr: '', exitCode: 0 }); mockService<Services, 'cli'>('cli', { claudeCode: { exec } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
 await action({ command, threadId: id }, services, {} as never, 'command-flow'); expect(exec).toHaveBeenCalledWith(command === 'cc-mcp' ? ['mcp', 'list'] : [command.slice(3)], { cwd: '/selected-project' });
});
it('preserves default service scope when no thread directory exists', async () => {
 const exec = vi.fn().mockResolvedValue({ stdout: 'fixture', stderr: '', exitCode: 0 }); mockService<Services, 'cli'>('cli', { claudeCode: { exec } as never });
 await action({ command: 'cc-mcp', text: 'list' }, services, {} as never, 'command-flow'); expect(exec).toHaveBeenCalledWith(['mcp', 'list'], undefined);
});
it.skipIf(!process.env.CLAUDE_MCP_SCOPE_TEST_BINARY)('writes native project MCP configuration only in the selected thread project', async () => {
 const { mkdtemp, mkdir, readFile, realpath } = await import('node:fs/promises'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path'); const { execFileSync } = await import('node:child_process'); const { execOnce } = await import('#features/code/be/services/claude-code/runner.ts');
 const root = await realpath(await mkdtemp(join(tmpdir(), 'cc-mcp-scope-native-'))), selected = join(root, 'selected'), fallback = join(root, 'fallback'), home = join(root, 'home');
 for (const path of [selected, fallback, join(home, '.claude')]) await mkdir(path, { recursive: true }); for (const path of [selected, fallback]) execFileSync('/usr/bin/git', ['init', '-q', path]);
 const { id } = repository.threadCommands.create({ topic: 'Selected MCP project', instructions: '', tags: [] }); repository.threadCommands.update(id, { context: { claudeCode: { cwd: fallback, cwdOverride: selected } } });
 mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
 mockService<Services, 'cli'>('cli', { claudeCode: { exec: (args: readonly string[], opts?: { cwd?: string }) => execOnce(args, { cwd: opts?.cwd ?? fallback, cliPath: process.env.CLAUDE_MCP_SCOPE_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude'), DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, timeoutMs: 10000 }) } as never });
 const result = await action({ command: 'cc-mcp', text: `add-json research '${JSON.stringify({type:'stdio',command:'/usr/bin/true',args:['argument with spaces'],env:{RESEARCH_VALUE:'value with spaces'}})}' --scope project`, threadId: id }, services, {} as never, 'command-flow');
 expect(result.text).not.toContain('failed:'); expect(JSON.parse(await readFile(join(selected, '.mcp.json'), 'utf8')).mcpServers.research).toMatchObject({ command: '/usr/bin/true', args: ['argument with spaces'], env: { RESEARCH_VALUE: 'value with spaces' } }); await expect(readFile(join(fallback, '.mcp.json'))).rejects.toMatchObject({ code: 'ENOENT' });
}, 15000);


it('forwards quoted values and shell syntax literally without expanding or executing them', async () => {
 const exec = vi.fn().mockResolvedValue({ stdout: 'fixture', stderr: '', exitCode: 0 }); mockService<Services, 'cli'>('cli', { claudeCode: { exec } as never });
 await action({ command: 'cc-agents', text: '--cwd "/project with spaces" "$HOME" $(fixture) ;' }, services, {} as never, 'command-flow');
 expect(exec).toHaveBeenCalledWith(['agents', '--cwd', '/project with spaces', '$HOME', '$(fixture)', ';'], undefined);
 exec.mockClear(); const result = await action({ command: 'cc-mcp', text: "get 'unfinished" }, services, {} as never, 'command-flow'); expect(result.text).toContain('unclosed quote'); expect(exec).not.toHaveBeenCalled();
});

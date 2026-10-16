import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { list, get } from '#features/code/be/services/claude-code/mcp.ts';
import { execOnce } from '#features/code/be/services/claude-code/runner.ts';
it.skipIf(!process.env.CLAUDE_MCP_OUTPUT_TEST_BINARY)('retains native notices and pending-server details without inventing structured records or activating unapproved servers', async () => {
 const cwd = await realpath(await mkdtemp(join(tmpdir(), 'claude-mcp-output-native-'))), home = join(cwd, 'home'), config = join(home, '.claude'); await mkdir(config, { recursive: true }); execFileSync('/usr/bin/git', ['init', '-q', cwd]);
 const marker = join(cwd, 'unexpected-server-start'), options = { cwd, cliPath: process.env.CLAUDE_MCP_OUTPUT_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: config, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, timeoutMs: 10000 };
 expect(await list(options)).toContain('No MCP servers configured.');
 const definition = { type: 'stdio', command: process.execPath, args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started')`] };
 await execOnce(['mcp', 'add-json', 'research-project', JSON.stringify(definition), '--scope', 'project'], options);
 const before = await readFile(join(cwd, '.mcp.json'), 'utf8');
 const summary = await list(options); expect(typeof summary).toBe('string'); expect(summary).toContain('research-project:'); expect(summary).toContain('Pending approval');
 const detail = await get('research-project', options); expect(typeof detail).toBe('string'); expect(detail).toContain('Scope: Project config'); expect(detail).toContain('Type: stdio'); expect(detail).toContain('Pending approval');
 await expect(get('research-missing', options)).rejects.toMatchObject({ exitCode: 1, stderr: expect.stringContaining('No MCP server named') });
 expect(await readFile(join(cwd, '.mcp.json'), 'utf8')).toBe(before); await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
}, 20000);

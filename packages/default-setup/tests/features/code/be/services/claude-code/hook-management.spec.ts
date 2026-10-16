import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ClaudeHooksListingSchema } from '#features/code/be/services/claude-code/host-controls.ts';
import { getHooksListing } from '#features/code/be/services/claude-code/hook-management.ts';
import { query } from '#features/code/be/services/claude-code/query.ts';
const catalog = { events: [], eventCatalog: [], hooks: [], policy: { disabledByPolicy: false, managedOnly: false, pluginOnly: false, allDisabled: false, policyHookCount: 0 } };
describe('native hook catalog boundary', () => {
 it('retains native mode/error metadata and rejects unredacted HTTP targets', () => {
  const input = { ...catalog, bareMode: { exitHint: 'restart' }, errors: [{ file: '/fixture', path: ['hooks'], message: 'invalid' }], futureMetadata: true };
  expect(ClaudeHooksListingSchema.parse(input)).toEqual(input);
  const row = { event: 'PreToolUse', matcher: '', source: 'userSettings', sourceLabel: 'User', type: 'http', displayText: 'URL', commandText: 'URL', contentLabel: 'URL', editable: { matcher: '', config: { type: 'http', headers: { Authorization: 'must-not-leak' } } } };
  expect(() => ClaudeHooksListingSchema.parse({ ...catalog, hooks: [row] })).toThrow('unredacted HTTP header');
 });
 it('refuses prompt options before launching discovery', async () => {
  await expect(getHooksListing({ cwd: '/fixture', prompt: 'must not send' } as never)).rejects.toThrow('unsupported hook catalog options: prompt');
 });
 it.skipIf(!process.env.CLAUDE_HOOKS_TEST_BINARY)('reads fresh and retained native catalogs with masked values and unchanged source files', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'claude-hooks-native-'))), home = join(cwd, 'home'), config = join(home, '.claude');
  await mkdir(config, { recursive: true });
  const path = join(config, 'settings.json'), bytes = JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'http', url: 'https://example.invalid/hook', headers: { Authorization: 'synthetic-private-value' } }] }] } });
  await writeFile(path, bytes);
  const options = { cwd, cliPath: process.env.CLAUDE_HOOKS_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: config, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, signal: AbortSignal.timeout(15000) };
  const fresh = await getHooksListing(options);
  expect(fresh.eventCatalog).toHaveLength(33); expect(fresh.hooks.find(hook => hook.source === 'userSettings')?.editable).toMatchObject({ headersRedacted: true, config: { headers: { Authorization: '' } } });
  expect(JSON.stringify(fresh)).not.toContain('synthetic-private-value');
  const handle = await query({ ...options, keepStdinOpen: true, tools: [], strictMcpConfig: true, noSessionPersistence: true });
  try { expect(await handle.getHooksListing()).toEqual(fresh); expect(await handle.getHooksListing()).toEqual(fresh); } finally { await handle.close(); }
  expect(await readFile(path, 'utf8')).toBe(bytes);
 }, 20000);
});

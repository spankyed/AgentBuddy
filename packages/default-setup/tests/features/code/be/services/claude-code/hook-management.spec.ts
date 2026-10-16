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
 }, 15000);
});

it('rejects oversized hook edits before spawning', async () => {
  const { editHook } = await import('#features/code/be/services/claude-code/hook-management.ts');
  await expect(editHook({ op: 'add', source: 'userSettings', event: 'PreToolUse', hook: { type: 'command', command: 'x'.repeat(524288) } }, { cwd: '/fixture', cliPath: '/must-not-spawn' })).rejects.toThrow('native stdin limit');
});

it.skipIf(!process.env.CLAUDE_HOOKS_TEST_BINARY)('delegates native edits and preserves structured refusals and masked targets', async () => {
  const { editHook } = await import('#features/code/be/services/claude-code/hook-management.ts');
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'claude-hook-edit-native-'))), home = join(cwd, 'home'), config = join(home, '.claude'); await mkdir(config, { recursive: true });
  const path = join(config, 'settings.json'); await writeFile(path, JSON.stringify({ language: 'preserve' }));
  const options = { cwd, cliPath: process.env.CLAUDE_HOOKS_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: config, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, signal: AbortSignal.timeout(15000) };
  const hook = { type: 'http', url: 'https://example.invalid/original', headers: { Authorization: 'synthetic-private-value' } };
  expect(await editHook({ op: 'add', source: 'userSettings', event: 'PreToolUse', matcher: 'Read', hook }, options)).toEqual({ ok: true });
  const before = await readFile(path, 'utf8');
  expect(await editHook({ op: 'add', source: 'userSettings', event: 'PreToolUse', matcher: 'Read', hook }, options)).toMatchObject({ ok: false, code: 'duplicate' }); expect(await readFile(path, 'utf8')).toBe(before);
  const original = (await getHooksListing(options)).hooks.find(row => row.source === 'userSettings')!;
  const target = { event: original.event, matcher: original.editable!.matcher, hook: original.editable!.config };
  expect(JSON.stringify(target)).not.toContain('synthetic-private-value');
  expect(await editHook({ op: 'replace', source: 'userSettings', event: 'PostToolUse', matcher: 'Read', target, hook: { type: 'http', url: 'https://example.invalid/replaced', headers: { authorization: '' } } }, options)).toEqual({ ok: true });
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ language: 'preserve', hooks: { PostToolUse: [{ hooks: [{ headers: { authorization: 'synthetic-private-value' } }] }] } });
  const replacement = (await getHooksListing(options)).hooks.find(row => row.source === 'userSettings')!;
  expect(await editHook({ op: 'remove', source: 'userSettings', event: replacement.event, target: { event: replacement.event, matcher: replacement.editable!.matcher, hook: replacement.editable!.config } }, options)).toEqual({ ok: true });
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ language: 'preserve' });
  expect(await editHook({ op: 'remove', source: 'userSettings', event: original.event, target }, options)).toMatchObject({ ok: false, code: 'target_missing' });
  expect(await editHook({ op: 'add', source: 'userSettings', event: 'PreToolUse', hook: JSON.parse('{"type":"command","command":"/usr/bin/true","__proto__":{}}') }, options)).toMatchObject({ ok: false, code: 'bad_request' });
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ language: 'preserve' });
}, 15000);

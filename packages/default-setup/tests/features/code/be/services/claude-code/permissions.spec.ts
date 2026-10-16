import { query } from '#features/code/be/services/claude-code/query.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editPermissionRules, getPermissionRules } from '#features/code/be/services/claude-code/permissions.ts';
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const catalog = { state: { rules: [{ behavior: 'deny', source: 'policySettings', rule: 'Bash', editability: 'readonly', notInEffect: true }], workspaceDirectories: [{ path: '/extra', source: 'session' }], originalCwd: '/project', managedOnly: true, errors: [{ file: '/fixture/settings.json', path: ['permissions'], message: 'Fixture error' }] } };
async function fixture(error = false) {
 const cwd = await mkdtemp(join(tmpdir(), 'claude-permissions-')); directories.push(cwd); const cliPath = join(cwd, 'fixture.mjs');
 await writeFile(cliPath, `#!${process.execPath}
import {createInterface} from 'node:readline';import {writeFileSync} from 'node:fs';
const requests=[];const input=createInterface({input:process.stdin});
input.on('line',line=>{const value=JSON.parse(line);requests.push(value);const init=value.request?.subtype==='initialize';
const response=${error}&&!init?{subtype:'error',request_id:value.request_id,error:'native permissions unavailable'}:{subtype:'success',request_id:value.request_id,response:init?{commands:[],agents:[],models:[]}:value.request.subtype==='apply_flag_settings'?{}:${JSON.stringify(catalog)}};
console.log(JSON.stringify({type:'control_response',response}));});
input.on('close',()=>writeFileSync('capture.json',JSON.stringify({requests,argv:process.argv.slice(2)})));
`, { mode: 0o755 });return { cwd, cliPath, env: { PATH: process.env.PATH, HOME: cwd } };
}
describe('native permission catalog', () => {
 it('retains rule spellings, editability, ineffective rows and errors without a model turn', async () => {
  const options = await fixture(); await expect(getPermissionRules(options)).resolves.toEqual(catalog);
  const capture = JSON.parse(await readFile(join(options.cwd, 'capture.json'), 'utf8'));
  expect(capture.requests.map((value: {request: {subtype: string}}) => value.request.subtype)).toEqual(['initialize', 'list_permission_rules']); expect(capture.argv).toContain('--no-session-persistence');
 });
 it('propagates native refusal and closes', async () => {
  const options = await fixture(true); await expect(getPermissionRules(options)).rejects.toThrow('native permissions unavailable');
  expect(JSON.parse(await readFile(join(options.cwd, 'capture.json'), 'utf8')).requests).toHaveLength(2);
 });
 it('rejects extra prompt options before launching', async () => {
  const options = await fixture(); await expect(getPermissionRules({ ...options, prompt: 'must not send' } as typeof options)).rejects.toThrow('unsupported permission catalog options: prompt');
  await expect(readFile(join(options.cwd, 'capture.json'))).rejects.toMatchObject({ code: 'ENOENT' });
 });
 it.skipIf(!process.env.CLAUDE_PERMISSIONS_TEST_BINARY)('reads native rules and provenance from private user/project/local files', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'claude-permissions-native-'))); directories.push(cwd); const home = join(cwd, 'home'), config = join(home, '.claude');
  await mkdir(config, { recursive: true }); await mkdir(join(cwd, '.claude'), { recursive: true });
  await writeFile(join(config, 'settings.json'), JSON.stringify({ permissions: { allow: ['Read(./fixture.txt)'] } }));
  await writeFile(join(cwd, '.claude', 'settings.json'), JSON.stringify({ permissions: { deny: ['Bash'] } }));
  await writeFile(join(cwd, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { ask: ['Glob'] } }));
  const data = await getPermissionRules({ cwd, cliPath: process.env.CLAUDE_PERMISSIONS_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: config, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } });
  expect(data.state.originalCwd).toBe(cwd); expect(data.state.managedOnly).toBe(false);
  for (const [behavior, source, rule] of [['allow', 'userSettings', 'Read(./fixture.txt)'], ['deny', 'projectSettings', 'Bash'], ['ask', 'localSettings', 'Glob']]) expect(data.state.rules).toContainEqual(expect.objectContaining({ behavior, source, rule, editability: 'persistent' }));
 }, 20000);
});


describe('native permission edits and refresh', () => {
 it('refreshes with an empty flag patch before reading the process catalog', async () => {
  const options = await fixture(); const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true });
  try { await expect(handle.refreshPermissionRules()).resolves.toEqual(catalog); } finally { await handle.close(); }
  const capture = JSON.parse(await readFile(join(options.cwd, 'capture.json'), 'utf8'));
  expect(capture.requests.map((value: {request: object}) => value.request)).toEqual([expect.objectContaining({ subtype: 'initialize' }), { subtype: 'apply_flag_settings', settings: {} }, { subtype: 'list_permission_rules' }]);
 });
 it('does not read a catalog after the native refresh is refused', async () => {
  const options = await fixture(true); const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true });
  try { await expect(handle.refreshPermissionRules()).rejects.toThrow('native permissions unavailable'); } finally { await handle.close(); }
  expect(JSON.parse(await readFile(join(options.cwd, 'capture.json'), 'utf8')).requests.map((value: {request: {subtype: string}}) => value.request.subtype)).toEqual(['initialize', 'apply_flag_settings']);
 });
 it('rejects unsupported sources and oversized encoded stdin before spawning', async () => {
  const options = await fixture();
  await expect(editPermissionRules({ op: 'remove', behavior: 'deny', rule: 'Bash', source: 'policySettings' } as never, options)).rejects.toThrow();
  await expect(editPermissionRules({ op: 'add', behavior: 'deny', rules: Array(100).fill('ࠀ'.repeat(10000)), destination: 'userSettings' }, options)).rejects.toThrow('native stdin limit');
  await expect(readFile(join(options.cwd, 'capture.json'))).rejects.toMatchObject({ code: 'ENOENT' });
 });
 it.skipIf(!process.env.CLAUDE_PERMISSIONS_TEST_BINARY)('uses native canonicalization, duplicate refusal and exact removal without losing unrelated settings', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'claude-permission-edit-native-'))); directories.push(cwd);
  const home = join(cwd, 'home'), config = join(home, '.claude'); await mkdir(config, { recursive: true });
  const path = join(config, 'settings.json'); await writeFile(path, JSON.stringify({ language: 'preserve' }));
  const options = { cwd, cliPath: process.env.CLAUDE_PERMISSIONS_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: config, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } };
  const saved = await editPermissionRules({ op: 'add', rules: ['Bash(*)'], behavior: 'deny', destination: 'userSettings' }, options);
  expect(saved.stored).toContain('Bash'); expect(saved.warnings.length).toBeGreaterThan(0);
  const snapshot = await readFile(path, 'utf8'); expect(JSON.parse(snapshot)).toMatchObject({ language: 'preserve', permissions: { deny: ['Bash'] } });
  await expect(editPermissionRules({ op: 'add', rules: ['Bash'], behavior: 'deny', destination: 'userSettings' }, options)).rejects.toThrow(); expect(await readFile(path, 'utf8')).toBe(snapshot);
  await expect(editPermissionRules({ op: 'remove', rule: 'Bash(*)', behavior: 'deny', source: 'userSettings' }, options)).rejects.toThrow(); expect(await readFile(path, 'utf8')).toBe(snapshot);
  await expect(editPermissionRules({ op: 'remove', rule: 'Bash', behavior: 'deny', source: 'userSettings' }, { ...options, env: { ...options.env, CLAUDE_CODE_CHILD_SESSION: '1' } })).rejects.toThrow(/editor started inside a Claude Code session/); expect(await readFile(path, 'utf8')).toBe(snapshot);
  await editPermissionRules({ op: 'remove', rule: 'Bash', behavior: 'deny', source: 'userSettings' }, options);
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ language: 'preserve', permissions: { deny: [] } });
 }, 20000);
});

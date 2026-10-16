import { query } from '#features/code/be/services/claude-code/query.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMemoryDialog, setAutoMemory } from '#features/code/be/services/claude-code/memory.ts';
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const dialog = { files: [], folders: [], auto_memory: { enabled: false, toggleable: false, status: 'off' }, auto_dream: { shown: false, enabled: false, toggleable: false, status: 'off', detail: '' } };
async function fixture(error = false) {
 const cwd = await mkdtemp(join(tmpdir(), 'claude-memory-')); directories.push(cwd); const cliPath = join(cwd, 'fixture.mjs');
 await writeFile(cliPath, `#!${process.execPath}
import {createInterface} from 'node:readline';import {writeFileSync} from 'node:fs';
const requests=[];const input=createInterface({input:process.stdin});
input.on('line',line=>{const value=JSON.parse(line);requests.push(value);const init=value.request?.subtype==='initialize';
const response=${error}&&!init?{subtype:'error',request_id:value.request_id,error:'native memory unavailable'}:{subtype:'success',request_id:value.request_id,response:init?{commands:[],agents:[],models:[]}:${JSON.stringify(dialog)}};
console.log(JSON.stringify({type:'control_response',response}));});
input.on('close',()=>writeFileSync('capture.json',JSON.stringify({requests,argv:process.argv.slice(2)})));
`, { mode: 0o755 });
 return { cwd, cliPath, env: { PATH: process.env.PATH, HOME: cwd } };
}
describe('native memory dialog', () => {
 it('retains unavailable state and optional memories, closes without sending a model turn', async () => {
  const options = await fixture(); await expect(getMemoryDialog(options)).resolves.toEqual(dialog);
  const capture = JSON.parse(await readFile(join(options.cwd, 'capture.json'), 'utf8'));
  expect(capture.requests.map((value: {request: {subtype: string}}) => value.request.subtype)).toEqual(['initialize', 'get_memory_dialog']);
  expect(capture.argv).toContain('--no-session-persistence');
 });
 it('closes and propagates discovery failures', async () => {
  const options = await fixture(true); await expect(getMemoryDialog(options)).rejects.toThrow('native memory unavailable');
  expect(JSON.parse(await readFile(join(options.cwd, 'capture.json'), 'utf8')).requests).toHaveLength(2);
 });
 it('rejects extra prompt options before launching', async () => {
  const options = await fixture(); await expect(getMemoryDialog({ ...options, prompt: 'must not send' } as typeof options)).rejects.toThrow('unsupported memory discovery options: prompt');
  await expect(readFile(join(options.cwd, 'capture.json'))).rejects.toMatchObject({ code: 'ENOENT' });
 });
 it.skipIf(!process.env.CLAUDE_MEMORY_TEST_BINARY)('discovers native user/project/local/rule metadata with private config', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'claude-memory-native-'))); directories.push(cwd); const home = join(cwd, 'home');
  await mkdir(join(home, '.claude'), { recursive: true }); await mkdir(join(cwd, '.claude', 'rules'), { recursive: true });
  const paths = [join(home, '.claude', 'CLAUDE.md'), join(cwd, 'CLAUDE.md'), join(cwd, 'CLAUDE.local.md'), join(cwd, '.claude', 'rules', 'fixture.md')];
  for (const path of paths) await writeFile(path, 'Synthetic native instruction fixture.\n');
  const data = await getMemoryDialog({ cwd, cliPath: process.env.CLAUDE_MEMORY_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude'), DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } });
  for (const path of paths) expect(data.files).toContainEqual(expect.objectContaining({ path, exists: true }));
  expect(data.auto_memory.enabled).toBe(true); expect(data.auto_dream.shown).toBe(false);
 }, 15000);
 it('rejects nonboolean preference values before process launch', async () => {
  const options = await fixture(); await expect(setAutoMemory('off' as unknown as boolean, options)).rejects.toThrow();
  await expect(readFile(join(options.cwd, 'capture.json'))).rejects.toMatchObject({ code: 'ENOENT' });
 });
 it.skipIf(!process.env.CLAUDE_MEMORY_TEST_BINARY)('persists user preference through native code and reads the retained state', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'claude-memory-write-'))); directories.push(cwd);
  const home = join(cwd, 'home'), config = join(home, '.claude'); await mkdir(config, { recursive: true });
  await writeFile(join(config, 'settings.json'), JSON.stringify({ language: 'research-preserve' }));
  const options = { cwd, cliPath: process.env.CLAUDE_MEMORY_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: config, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } };
  const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true });
  try {
   expect((await handle.getMemoryDialog()).auto_memory.enabled).toBe(true);
   await setAutoMemory(false, options); expect((await handle.getMemoryDialog()).auto_memory.enabled).toBe(false);
   await setAutoMemory(true, options); expect((await handle.getMemoryDialog()).auto_memory.enabled).toBe(true);
   expect(JSON.parse(await readFile(join(config, 'settings.json'), 'utf8'))).toMatchObject({ language: 'research-preserve', autoMemoryEnabled: true });
   const beforeRefusal = await readFile(join(config, 'settings.json'));
   await expect(setAutoMemory(false, { ...options, env: { ...options.env, CLAUDE_CODE_CHILD_SESSION: '1' } })).rejects.toThrow('inside a Claude Code session');
   expect(await readFile(join(config, 'settings.json'))).toEqual(beforeRefusal);
  } finally { await handle.close(); }
 }, 15000);

});

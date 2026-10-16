import { query } from '#features/code/be/services/claude-code/query.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editSkillOverride, getSkillsDialog } from '#features/code/be/services/claude-code/skills.ts';
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const skill = { name: 'fixture', display_name: 'Fixture', description: 'Synthetic', source: 'project', tokens: 2, state: 'user-invocable-only', locked_by: 'author', advertised: true, handles: {} };
async function fixture(error = false) {
 const cwd = await mkdtemp(join(tmpdir(), 'claude-skills-')); directories.push(cwd);
 const cliPath = join(cwd, 'fixture.mjs');
 await writeFile(cliPath, `#!${process.execPath}
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
const requests=[];const input=createInterface({input:process.stdin});
input.on('line',line=>{const value=JSON.parse(line);requests.push(value);const init=value.request?.subtype==='initialize';
const response=${error}&&!init?{subtype:'error',request_id:value.request_id,error:'native discovery unavailable'}:{subtype:'success',request_id:value.request_id,response:init?{commands:[],agents:[],models:[]}:{skills:[${JSON.stringify(skill)}]}};
console.log(JSON.stringify({type:'control_response',response}));});
input.on('close',()=>writeFileSync('capture.json',JSON.stringify({requests,argv:process.argv.slice(2)})));
`, { mode: 0o755 });
 return { cwd, cliPath, env: { PATH: process.env.PATH, HOME: cwd } };
}
describe('native Skill discovery', () => {
 it('retains states and locks without sending a prompt, persists nothing and closes', async () => {
  const options = await fixture(); await expect(getSkillsDialog(options)).resolves.toEqual({ skills: [skill] });
  const capture = JSON.parse(await readFile(join(options.cwd, 'capture.json'), 'utf8'));
  expect(capture.requests.map((value: {request: {subtype: string}}) => value.request.subtype)).toEqual(['initialize', 'get_skills_dialog']);
  expect(capture.argv).toContain('--no-session-persistence');
 });
 it('propagates native failure and closes', async () => {
  const options = await fixture(true); await expect(getSkillsDialog(options)).rejects.toThrow('native discovery unavailable');
  expect(JSON.parse(await readFile(join(options.cwd, 'capture.json'), 'utf8')).requests).toHaveLength(2);
 });
 it('rejects extra prompt options before spawning', async () => {
  const options = await fixture(); await expect(getSkillsDialog({ ...options, prompt: 'must not send' } as typeof options)).rejects.toThrow('unsupported Skill discovery options: prompt');
  await expect(readFile(join(options.cwd, 'capture.json'))).rejects.toMatchObject({ code: 'ENOENT' });
 });
 it.skipIf(!process.env.CLAUDE_SKILL_TEST_BINARY)('discovers standard Skill directories through the pinned native process', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-native-skills-')); directories.push(cwd);
  const home = join(cwd, 'home'), dir = join(cwd, '.claude', 'skills', 'native-fixture');
  await mkdir(dir, { recursive: true }); await mkdir(join(home, '.claude'), { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), '---\nname: native-fixture\ndescription: Native fixture\ndisable-model-invocation: true\n---\nSynthetic body.\n');
  const result = await getSkillsDialog({ cwd, cliPath: process.env.CLAUDE_SKILL_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude'), DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } });
  expect(result.skills).toContainEqual(expect.objectContaining({ name: 'native-fixture', state: 'user-invocable-only', locked_by: 'author', source: 'project' }));
 }, 20000);
 it('validates edit state before launching a process', async () => {
  const options = await fixture();
  await expect(editSkillOverride({ name: 'fixture', state: 'invalid' }, options)).rejects.toThrow();
  await expect(readFile(join(options.cwd, 'capture.json'))).rejects.toMatchObject({ code: 'ENOENT' });
 });
 it.skipIf(!process.env.CLAUDE_SKILL_TEST_BINARY)('persists edits through the pinned native writer and preserves author locks', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-native-edit-')); directories.push(cwd);
  const home = join(cwd, 'home'); await mkdir(join(home, '.claude'), { recursive: true });
  for (const [name, extra] of [['editable', ''], ['locked', 'disable-model-invocation: true\n']]) {
   const dir = join(cwd, '.claude', 'skills', name); await mkdir(dir, { recursive: true });
   await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Native edit fixture\n${extra}---\nSynthetic body.\n`);
  }
  const options = { cwd, cliPath: process.env.CLAUDE_SKILL_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude'), DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } };
  const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true });
  try {
  expect((await handle.getSkillsDialog()).skills).toContainEqual(expect.objectContaining({ name: 'editable', state: 'on' }));
  await expect(editSkillOverride({ name: 'editable', state: 'off' }, options)).resolves.toEqual({ changed: true });
  await handle.reloadSkills();
  expect((await handle.getSkillsDialog()).skills).toContainEqual(expect.objectContaining({ name: 'editable', state: 'off', advertised: false }));
  const settings = join(cwd, '.claude', 'settings.local.json');
  expect(JSON.parse(await readFile(settings, 'utf8')).skillOverrides.editable).toBe('off');
  const before = await readFile(settings);
  await expect(editSkillOverride({ name: 'locked', state: 'on' }, options)).rejects.toThrow();
  expect(await readFile(settings)).toEqual(before);
  await expect(editSkillOverride({ name: 'editable', state: 'on' }, { ...options, env: { ...options.env, CLAUDE_CODE_CHILD_SESSION: '1' } })).rejects.toThrow('inside a Claude Code session');
  expect(await readFile(settings)).toEqual(before);
  } finally { await handle.close(); }
 }, 20000);

});

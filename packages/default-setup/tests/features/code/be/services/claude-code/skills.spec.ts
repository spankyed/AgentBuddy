import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSkillsDialog } from '#features/code/be/services/claude-code/skills.ts';
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
});

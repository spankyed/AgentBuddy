import { execFileSync, spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../helpers/published-packages';

/** scripts/with-source.mjs gives a command's Node processes the @abuddy/source condition */
const WITH_SOURCE = path.join(REPO_ROOT, 'scripts', 'with-source.mjs');
const PRINT_NODE_OPTIONS = ['node', '-p', 'process.env.NODE_OPTIONS'];

function run(args: string[], nodeOptions?: string, extraEnv: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, ...extraEnv };
  if (nodeOptions !== undefined) env.NODE_OPTIONS = nodeOptions;
  return spawnSync(process.execPath, [WITH_SOURCE, ...args], { cwd: REPO_ROOT, env, encoding: 'utf-8' });
}

describe('with-source', () => {
  it("appends the condition to the caller's NODE_OPTIONS", () => {
    expect(run(PRINT_NODE_OPTIONS, '--max-old-space-size=4096').stdout.trim())
      .toBe('--max-old-space-size=4096 --conditions=@abuddy/source');
    expect(run(PRINT_NODE_OPTIONS).stdout.trim()).toBe('--conditions=@abuddy/source');
  });

  it('leaves it off for a run that declared it resolves the published packages', () => {
    // ABUDDY_PACKAGES is the one place the mode is declared, and every decider reads it, so a run
    // can't have this wrapper adding source resolution while the rest of it resolves dist
    expect(run(PRINT_NODE_OPTIONS, undefined, { ABUDDY_PACKAGES: 'dist' }).stdout.trim()).toBe('');
    expect(run(PRINT_NODE_OPTIONS, '--conditions=@abuddy/source --max-old-space-size=4096', { ABUDDY_PACKAGES: 'dist' }).stdout.trim())
      .toBe('--max-old-space-size=4096');
    expect(run(PRINT_NODE_OPTIONS, undefined, { ABUDDY_PACKAGES: 'source' }).stdout.trim()).toBe('--conditions=@abuddy/source');
  });

  it('adds the condition once when nested', () => {
    expect(run(['node', WITH_SOURCE, ...PRINT_NODE_OPTIONS]).stdout.trim()).toBe('--conditions=@abuddy/source');
  });

  it("exits with the command's code", () => {
    expect(run(['node', '-e', 'process.exit(3)']).status).toBe(3);
  });

  // The wrapper shares its process group with the command it runs, so a terminal's Ctrl+C reaches
  // both. Running it detached and signalling the group reproduces that without a tty.
  function ctrlC(childCode: string) {
    return new Promise<{ out: string; code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const child = spawn(process.execPath, [WITH_SOURCE, process.execPath, '-e', childCode], {
        cwd: REPO_ROOT,
        env: { PATH: process.env.PATH },
        detached: true, // its own process group, as the terminal's foreground group is
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let signalled = false;
      child.stdout.setEncoding('utf-8');
      child.stdout.on('data', (chunk: string) => {
        out += chunk;
        if (signalled || !out.includes('ready')) return;
        signalled = true;
        process.kill(-(child.pid as number), 'SIGINT');
      });
      child.on('error', reject);
      child.on('exit', (code, signal) => resolve({ out, code, signal }));
    });
  }

  const READY_THEN_COUNT_SIGINTS =
    "let n=0;process.on('SIGINT',()=>{if(++n===1)setTimeout(()=>{console.log('sigints='+n);process.exit(0)},300)});" +
    'setTimeout(()=>{},5000);console.log("ready")';

  it.skipIf(process.platform === 'win32')('delivers a terminal Ctrl+C to the command exactly once', async () => {
    const { out, code } = await ctrlC(READY_THEN_COUNT_SIGINTS);
    expect(out).toContain('sigints=1');
    expect(code).toBe(0);
  });

  it.skipIf(process.platform === 'win32')('exits the way a signalled command did', async () => {
    const { signal } = await ctrlC("process.on('SIGINT',()=>{process.removeAllListeners('SIGINT');process.kill(process.pid,'SIGINT')});setTimeout(()=>{},5000);console.log('ready')");
    expect(signal).toBe('SIGINT');
  });

  it('is the only way npm scripts in the checkout get the condition (no .npmrc node-options)', () => {
    const value = execFileSync('npm', ['config', 'get', 'node-options'], { cwd: REPO_ROOT, env: { PATH: process.env.PATH }, encoding: 'utf-8' });
    expect(value.trim()).toBe('null');
  });
});

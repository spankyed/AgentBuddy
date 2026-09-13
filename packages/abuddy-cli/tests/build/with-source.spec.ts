import { execFileSync, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../helpers/published-packages';

/** scripts/with-source.mjs gives a command's Node processes the @abuddy/source condition */
const WITH_SOURCE = path.join(REPO_ROOT, 'scripts', 'with-source.mjs');
const PRINT_NODE_OPTIONS = ['node', '-p', 'process.env.NODE_OPTIONS'];

function run(args: string[], nodeOptions?: string) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH };
  if (nodeOptions !== undefined) env.NODE_OPTIONS = nodeOptions;
  return spawnSync(process.execPath, [WITH_SOURCE, ...args], { cwd: REPO_ROOT, env, encoding: 'utf-8' });
}

describe('with-source', () => {
  it("appends the condition to the caller's NODE_OPTIONS", () => {
    expect(run(PRINT_NODE_OPTIONS, '--max-old-space-size=4096').stdout.trim())
      .toBe('--max-old-space-size=4096 --conditions=@abuddy/source');
    expect(run(PRINT_NODE_OPTIONS).stdout.trim()).toBe('--conditions=@abuddy/source');
  });

  it('adds the condition once when nested', () => {
    expect(run(['node', WITH_SOURCE, ...PRINT_NODE_OPTIONS]).stdout.trim()).toBe('--conditions=@abuddy/source');
  });

  it("exits with the command's code", () => {
    expect(run(['node', '-e', 'process.exit(3)']).status).toBe(3);
  });

  it('is the only way npm scripts in the checkout get the condition (no .npmrc node-options)', () => {
    const value = execFileSync('npm', ['config', 'get', 'node-options'], { cwd: REPO_ROOT, env: { PATH: process.env.PATH }, encoding: 'utf-8' });
    expect(value.trim()).toBe('null');
  });
});

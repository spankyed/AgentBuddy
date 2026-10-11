import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const CLI = path.resolve(__dirname, '..', '..', 'bin', 'apack.mjs');

let tmp: string | undefined;

afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function run(cwd: string, args: string[]): string {
  return execFileSync('node', [CLI, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

describe('apack bin hand-off', () => {
  it('runs the @apack/cli the project pins instead of itself', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-handoff-'));
    const projectCli = path.join(tmp, 'node_modules', '@apack', 'cli');
    fs.mkdirSync(path.join(projectCli, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(projectCli, 'package.json'), JSON.stringify({ name: '@apack/cli', version: '9.9.9' }));
    fs.writeFileSync(
      path.join(projectCli, 'bin', 'apack.mjs'),
      "console.log('project cli ' + process.argv.slice(2).join(' '));\n",
    );
    const nested = path.join(tmp, 'src');
    fs.mkdirSync(nested);

    expect(run(nested, ['--version']).trim()).toBe('project cli --version');
  });

  it('runs itself when the project resolves @apack/cli to this CLI', () => {
    // The monorepo links node_modules/@apack/cli to this package
    const own = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf-8'));

    expect(run(path.resolve(__dirname, '..'), ['--version']).trim()).toBe(own.version);
  });

  it('runs itself when the project has no @apack/cli', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-handoff-'));
    const own = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf-8'));

    expect(run(tmp, ['--version']).trim()).toBe(own.version);
  });
});

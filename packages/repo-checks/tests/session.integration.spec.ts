import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { createSession, prepareIntegration } from '../../../scripts/session.mjs';
import { checkoutProfile, withCheckoutProfile } from '../../../scripts/lib/dev-profile.mjs';

let dir: string;
let repo: string;
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-session-test-'));
  repo = path.join(dir, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Session test');
  git(repo, 'config', 'user.email', 'session@example.invalid');
  fs.writeFileSync(path.join(repo, 'base.txt'), 'base');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'Base');
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function branch(name: string, file = `${name}.txt`, value = name) {
  git(repo, 'switch', '-c', name, 'main');
  fs.writeFileSync(path.join(repo, file), value);
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', name);
  git(repo, 'switch', 'main');
}

/** Real Git and process boundaries, with only the expensive dependency install/chain replaced. */
function check(mode = '', args = ['check', 'first']) {
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const npm = path.join(bin, 'npm');
  fs.writeFileSync(npm, `#!${process.execPath}
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
fs.appendFileSync(process.env.SESSION_COMMANDS, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + '\\n');
if (process.env.SESSION_MODE === 'setup-fail') process.exit(9);
if (process.argv[3] === 'chain') {
  if (process.env.SESSION_MODE === 'fail') process.exit(9);
  if (process.env.SESSION_MODE === 'drift') fs.writeFileSync('unexpected.txt', 'changed');
  if (process.env.SESSION_MODE === 'advance') execFileSync('git', ['update-ref', 'refs/heads/first', 'main'], { cwd: process.env.SESSION_SOURCE });
}
`);
  fs.chmodSync(npm, 0o755);
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/session.mjs'), ...args], {
    cwd: repo, encoding: 'utf8', env: {
      ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      SESSION_MODE: mode, SESSION_COMMANDS: path.join(dir, 'commands'), SESSION_SOURCE: repo,
    },
  });
}

describe('isolated editing sessions', () => {
  it('separates files, index and profiles while canonical paths share their own identity', () => {
    const one = createSession(repo, 'one');
    const two = createSession(repo, 'two');
    expect(path.dirname(one)).not.toBe(repo);
    fs.writeFileSync(path.join(one, 'base.txt'), 'one');
    git(one, 'add', '.');
    expect(git(repo, 'status', '--porcelain')).toBe('');
    expect(git(two, 'status', '--porcelain')).toBe('');
    expect(checkoutProfile(repo)).toBe('development');
    expect(checkoutProfile(one)).not.toBe(checkoutProfile(two));
    const alias = path.join(dir, 'alias');
    fs.symlinkSync(one, alias);
    expect(checkoutProfile(alias)).toBe(checkoutProfile(one));
    expect(withCheckoutProfile(one, ['--state'], {})).toEqual(['--state', '--profile', checkoutProfile(one)]);
    for (const flags of [['--profile', 'custom'], ['--profile=custom'], ['--fresh', '--rm'], ['--data-dir', '/custom']]) {
      expect(withCheckoutProfile(one, flags, {})).toEqual(flags);
    }
    expect(withCheckoutProfile(one, ['--state'], { APACK_USER_DATA_DIR: '/custom' })).toEqual(['--state']);
    expect(() => createSession(repo, '../escape')).toThrow('session name');
  });

  it('identifies the primary checkout with separately stored Git metadata', () => {
    git(repo, 'init', '--separate-git-dir', path.join(dir, 'metadata'));
    git(repo, 'config', 'core.worktree', repo);
    expect(checkoutProfile(repo)).toBe('development');
    const session = createSession(repo, 'separate');
    expect(session).toBe(fs.realpathSync(path.join(dir, 'repo-worktrees', 'separate')));
    expect(checkoutProfile(session)).toMatch(/^worktree-/);
    expect(createSession(session, 'from-linked')).toBe(path.join(path.dirname(session), 'from-linked'));
  });

  it('inserts profile options before the positional delimiter', () => {
    expect(withCheckoutProfile(repo, ['export', '--', 'backup'], {}))
      .toEqual(['export', '--profile', 'development', '--', 'backup']);
    expect(withCheckoutProfile(repo, ['--', '--profile=filename'], {}))
      .toEqual(['--profile', 'development', '--', '--profile=filename']);
    expect(withCheckoutProfile(repo, ['--profile', 'custom', '--', 'backup'], {}))
      .toEqual(['--profile', 'custom', '--', 'backup']);
  });

  it('merges committed branches in a detached candidate without touching source branches or indexes', () => {
    branch('first');
    branch('second');
    const refs = git(repo, 'show-ref');
    const { dir: candidate, inputs } = prepareIntegration(repo, ['first', 'second']);
    expect(fs.readFileSync(path.join(candidate, 'first.txt'), 'utf8')).toBe('first');
    expect(fs.readFileSync(path.join(candidate, 'second.txt'), 'utf8')).toBe('second');
    expect(git(candidate, 'branch', '--show-current')).toBe('');
    expect(inputs.map(input => input.ref)).toEqual(['HEAD', 'first', 'second']);
    expect(git(repo, 'show-ref')).toBe(refs);
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('refuses uncommitted inputs and keeps merge conflicts outside the source checkout', () => {
    fs.writeFileSync(path.join(repo, 'base.txt'), 'dirty');
    expect(() => prepareIntegration(repo, ['main'])).toThrow('Commit your changes');
    git(repo, 'restore', 'base.txt');
    branch('first', 'base.txt', 'one');
    branch('second', 'base.txt', 'two');
    expect(() => prepareIntegration(repo, ['first', 'second'])).toThrow('Merge failed');
    expect(git(repo, 'status', '--porcelain')).toBe('');
    expect(fs.readFileSync(path.join(repo, 'base.txt'), 'utf8')).toBe('base');
  });

  it('prepares a new session and retains it when dependency setup fails', () => {
    const result = check('setup-fail', ['new', 'review']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Checkout retained');
    expect(result.stdout).not.toContain('Ready.');
    const session = path.join(dir, 'repo-worktrees', 'review');
    expect(git(session, 'branch', '--show-current')).toBe('session/review');
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('runs dependency installation and the full strict gate in the candidate', () => {
    branch('first');
    const result = check();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Combined validation passed');
    const commands = fs.readFileSync(path.join(dir, 'commands'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(commands.map(command => command.args)).toEqual([
      ['ci', '--no-audit', '--no-fund'], ['run', 'build:default-setup'], ['run', 'build:runtime'],
      ['run', 'chain', '--', '--strict', '--all', '--cores', '2'],
    ]);
    expect(commands.every(command => command.cwd !== repo)).toBe(true);
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it.each([
    ['fail', 'failed'], ['drift', 'candidate changed'], ['advance', 'advanced during validation'],
  ])('never reports success when validation is invalid: %s', (mode, message) => {
    branch('first');
    const result = check(mode);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(result.stdout).not.toContain('Combined validation passed');
  });
});

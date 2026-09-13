import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gitSource } from '../../src/commands/pack';

let tmp: string | undefined;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('gitSource (bundle.json source)', () => {
  it("records the origin without credentials an https remote carries", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-source-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: tmp, stdio: 'pipe' }).toString().trim();
    git('init', '--quiet');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '--allow-empty', '-m', 'init');
    git('remote', 'add', 'origin', 'https://author:ghp_secret@github.com/acme/demo-pack.git');

    expect(gitSource(tmp)).toEqual({ commit: git('rev-parse', 'HEAD'), repo: 'https://github.com/acme/demo-pack.git' });
  });
});

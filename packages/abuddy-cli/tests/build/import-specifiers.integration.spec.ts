import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../helpers/published-packages';

/**
 * The one check on `scripts/check-import-specifiers.ts` that runs it as a process. Every other test of it
 * calls its exported checks in-process and lives in `import-specifiers.spec.ts`, in the fast suite.
 */
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-specifiers-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('check-import-specifiers as a script', () => {
  it('runs as a script through a symlinked path', () => {
    const link = path.join(root, 'check.ts');
    fs.symlinkSync(path.join(REPO_ROOT, 'scripts', 'check-import-specifiers.ts'), link);
    const output = execFileSync(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), [link], { cwd: REPO_ROOT, stdio: 'pipe' }).toString();
    expect(output).toMatch(/Import specifiers and pack rules pass/);
    // It checks the whole repo, parsing every file
  }, 60_000);
});

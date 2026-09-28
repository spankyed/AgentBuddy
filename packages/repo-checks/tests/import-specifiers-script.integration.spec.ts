import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHECKS } from '../../../scripts/check-import-specifiers.ts';

/**
 * The one check on `scripts/check-import-specifiers.ts` that runs it as a process. Every other test of it
 * calls its exported checks in-process and lives in `import-specifiers.integration.spec.ts` — which is also
 * in this half, because at 6.4s it costs more than this one does. Spawning stopped deciding the split.
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
  });

  /**
   * `--list` is where "does an external pack get this rule, and what does doing without it cost?" is answered.
   * That question was surveyed by hand twice and written down neither time; the answer is derived from the
   * entries now, so what has to hold is that every rule reaches the output and says which side it is on.
   *
   * Derived from `CHECKS` rather than from a count written here — a table of eighteen that lists seventeen is
   * the failure this replaces.
   */
  it('says of every rule whether a pack is held to it too, and what the others cost', () => {
    const list = execFileSync(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
      [path.join(REPO_ROOT, 'scripts', 'check-import-specifiers.ts'), '--list'], { cwd: REPO_ROOT, stdio: 'pipe' }).toString();

    expect(CHECKS.length, 'no rules, so this would pass over nothing').toBeGreaterThan(0);
    for (const rule of CHECKS) {
      expect(list, `${rule.id} is missing from --list`).toContain(rule.id);
      const side = rule.packRule === undefined ? 'no — see below' : `yes, as \`${rule.packRule}\``;
      expect(list, `${rule.id} does not say which side it is on`).toContain(side);
    }

    // And each repo-only rule says what a pack does without it, rather than only that it is repo-only
    const repoOnly = CHECKS.filter((rule) => rule.repoOnly !== undefined);
    expect(repoOnly.length, 'no rule is repo-only, so the second table would be empty').toBeGreaterThan(0);
    for (const rule of repoOnly) expect(list, `${rule.id} gives no reason`).toContain(rule.repoOnly!);
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { population } from '@abuddy/sdk/testing';
import { repoFiles } from './_support/repo-files.ts';

/**
 * Environment identity and data paths are decided only by @abuddy/sdk/env (and the main
 * process bootstrap that feeds it). This guard fails if the old, divergent resolution
 * patterns come back anywhere in the repo's code.
 *
 * Here and not in `@abuddy/sdk`, where it lived until 2026-10-01, because its subject is every tracked
 * file and not that package — it imports nothing from it. A suite's project is re-run when that project's
 * inputs move, so a guard over the repo has to sit in a suite that declares the repo (`SUITE_READS`'
 * `repo`), and making `@abuddy/sdk`'s 573 tests repo-wide cost 11.6s on every change to protect this one
 * 0.4s check. It missed a forbidden path committed to `@abuddy/cli` for exactly that reason.
 */

/**
 * The patterns a file is allowed to contain, and why — **per pattern, not per file**.
 *
 * It was per file until 2026-10-01, and the skip ran before the pattern loop, so a file excused for one
 * pattern was invisible to all three. Nothing was hiding behind that, checked: every entry below needs a
 * strict subset, and naming the subset is what keeps a file excused for its data dir from quietly
 * gaining a channel read.
 *
 * The same pass found two entries excusing nothing. `electron-builder.mjs` reads
 * `process.env.ABUDDY_ENV === 'beta'`, and the env pattern's `(?!\s*=)` — meant to permit assignment —
 * exempts a comparison too; `abuddy-sdk/tests/env/app-context.spec.ts` is a test, which that pattern
 * already allows. Both passed without their entry, so both are gone.
 */
const ALLOWED: Record<string, { patterns: readonly PatternId[]; why: string }> = {
  'packages/abuddy-sdk/src/env/index.ts': { patterns: ['data-dir', 'env-read', 'channel'], why: 'the resolver itself' },
  'packages/main/src/app-context.ts': {
    patterns: ['env-read', 'channel'], why: 'main-process bootstrap: infers the environment once',
  },
  'packages/main/vite.config.js': { patterns: ['env-read', 'channel'], why: 'build time: bakes the release channel stamp' },
  'packages/main/vitest.config.ts': {
    patterns: ['channel'], why: 'test time: supplies the stamp the build bakes, so the bootstrap can be tested',
  },
  // Not the `export ABUDDY_ENV=production` the old reason named — no pattern here matches shell. What
  // fires is `__ABUDDY_CHANNEL__` in a comment explaining the stamp, which is worth knowing before
  // someone rewords it and wonders why the entry went stale
  'build/build.sh': { patterns: ['channel'], why: 'build time: its comment names the channel stamp it bakes' },
  'build/prod/clean.sh': {
    patterns: ['data-dir'], why: 'manual cleanup script that deliberately removes a packaged app\'s data dir',
  },
  'packages/repo-checks/tests/identity-guard.spec.ts': {
    patterns: ['data-dir', 'channel'], why: 'this guard, which has to spell the patterns it looks for',
  },
};

type PatternId = 'data-dir' | 'env-read' | 'channel';

const FORBIDDEN: Array<{ id: PatternId; pattern: RegExp; why: string; allowInTests?: boolean }> = [
  { id: 'data-dir', pattern: /Application Support/, why: 'platform data dirs are derived only in @abuddy/sdk/env' },
  { id: 'env-read', pattern: /process\.env\.ABUDDY_ENV\b(?!\s*=)/, why: 'read the environment via resolveAppContext()', allowInTests: true },
  { id: 'channel', pattern: /__ABUDDY_CHANNEL__/, why: 'the channel stamp is consumed only by the main bootstrap' },
];

const trackedCodeFiles = (): string[] => repoFiles().filter((file) =>
  /\.(ts|tsx|js|mjs|cjs|vue|sh)$/.test(file)
  && !file.includes('node_modules/') && !file.includes('/dist/') && !file.includes('__generated__/'));

/** Which forbidden patterns a file actually contains, after the rule that tests may hold an env read. */
function fires(file: string): PatternId[] {
  const isTest = /(^|\/)tests?\//.test(file) || file.endsWith('.spec.ts');
  const lines = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8').split('\n');
  return FORBIDDEN
    .filter(({ pattern, allowInTests }) => !(allowInTests && isTest) && lines.some((line) => pattern.test(line)))
    .map(({ id }) => id);
}

describe('environment identity guard', () => {
  it('no code outside the env module resolves environment or data dirs on its own', () => {
    // The subject is every tracked code file; a walk that returned none would report no violation and
    // read exactly like a pass
    const files = population('tracked code files', trackedCodeFiles(), { atLeast: 500 });
    const violations: string[] = [];
    for (const file of files) {
      const excused = ALLOWED[file]?.patterns ?? [];
      const isTest = /(^|\/)tests?\//.test(file) || file.endsWith('.spec.ts');
      const lines = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8').split('\n');
      lines.forEach((line, i) => {
        for (const { id, pattern, why, allowInTests } of FORBIDDEN) {
          // Excused for this pattern, not for the file: an entry earned by a data dir does not also
          // hide a channel read that appears later
          if (excused.includes(id) || (allowInTests && isTest)) continue;
          if (pattern.test(line)) violations.push(`${file}:${i + 1} ${line.trim()}  ← ${why}`);
        }
      });
    }
    expect(violations, 'Resolve identity via @abuddy/sdk/env (resolveAppContext)').toEqual([]);
  });

  /**
   * The direction this list had no answer for until 2026-10-01, and the one that found two dead entries:
   * an exemption excuses nothing once the file stops containing the pattern it was written for. Nothing
   * fails then — the entry simply sits there, and the next reader takes it for a live constraint.
   */
  it('excuses nothing that has stopped needing it', () => {
    const stale = Object.entries(ALLOWED).flatMap(([file, { patterns }]) => {
      if (!fs.existsSync(path.join(REPO_ROOT, file))) return [`${file}: gone`];
      const actual = fires(file);
      const unused = patterns.filter((id) => !actual.includes(id));
      return unused.length > 0 ? [`${file}: no longer contains ${unused.join(', ')}`] : [];
    });
    expect(stale, 'drop these from ALLOWED, or the pattern they name from their entry').toEqual([]);
  });
});

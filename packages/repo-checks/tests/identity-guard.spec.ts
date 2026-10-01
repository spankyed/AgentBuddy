import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
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

const ALLOWED: Record<string, string> = {
  'packages/abuddy-sdk/src/env/index.ts': 'the resolver itself',
  'packages/main/src/app-context.ts': 'main-process bootstrap: infers the environment once',
  'packages/main/vite.config.js': 'build time: bakes the release channel stamp',
  'packages/main/vitest.config.ts': 'test time: supplies the stamp the build bakes, so the bootstrap can be tested',
  'electron-builder.mjs': 'build time: picks the beta appId/productName',
  'build/build.sh': 'build time: exports the release channel',
  'build/prod/clean.sh': 'manual cleanup script that deliberately removes a packaged app\'s data dir',
  'packages/repo-checks/tests/identity-guard.spec.ts': 'this guard',
  'packages/abuddy-sdk/tests/env/app-context.spec.ts': 'resolver tests',
};

const FORBIDDEN: Array<{ pattern: RegExp; why: string; allowInTests?: boolean }> = [
  { pattern: /Application Support/, why: 'platform data dirs are derived only in @abuddy/sdk/env' },
  { pattern: /process\.env\.ABUDDY_ENV\b(?!\s*=)/, why: 'read the environment via resolveAppContext()', allowInTests: true },
  { pattern: /__ABUDDY_CHANNEL__/, why: 'the channel stamp is consumed only by the main bootstrap' },
];

// `repoFiles` is the shared one now: it asks the same question (tracked plus untracked, minus gitignored,
// minus what is only in the index) and this file had its own copy only because a spec may not import across
// packages — which moving it here settles
const trackedCodeFiles = (): string[] => repoFiles().filter((file) =>
  /\.(ts|tsx|js|mjs|cjs|vue|sh)$/.test(file)
  && !file.includes('node_modules/') && !file.includes('/dist/') && !file.includes('__generated__/'));

describe('environment identity guard', () => {
  it('no code outside the env module resolves environment or data dirs on its own', () => {
    const violations: string[] = [];
    for (const file of trackedCodeFiles()) {
      if (ALLOWED[file]) continue;
      // Tests may save/restore the env vars around a case
      const isTest = /(^|\/)tests?\//.test(file) || file.endsWith('.spec.ts');
      const lines = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8').split('\n');
      lines.forEach((line, i) => {
        for (const { pattern, why, allowInTests } of FORBIDDEN) {
          if (allowInTests && isTest) continue;
          if (pattern.test(line)) violations.push(`${file}:${i + 1} ${line.trim()}  ← ${why}`);
        }
      });
    }
    expect(violations, 'Resolve identity via @abuddy/sdk/env (resolveAppContext)').toEqual([]);
  });
});

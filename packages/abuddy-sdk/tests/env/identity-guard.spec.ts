import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Environment identity and data paths are decided only by @abuddy/sdk/env (and the main
 * process bootstrap that feeds it). This guard fails if the old, divergent resolution
 * patterns come back anywhere in the repo's code.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const ALLOWED: Record<string, string> = {
  'packages/abuddy-sdk/src/env/index.ts': 'the resolver itself',
  'packages/main/src/app-context.ts': 'main-process bootstrap: infers the environment once',
  'packages/main/vite.config.js': 'build time: bakes the release channel stamp',
  'electron-builder.mjs': 'build time: picks the beta appId/productName',
  'build/build.sh': 'build time: exports the release channel',
  'build/prod/clean.sh': 'manual cleanup script that deliberately removes a packaged app\'s data dir',
  'packages/default-setup/dev-build.mjs': 'dev tooling that explicitly targets abuddy-dev',
  'packages/abuddy-sdk/tests/env/identity-guard.spec.ts': 'this guard',
  'packages/abuddy-sdk/tests/env/app-context.spec.ts': 'resolver tests',
};

const FORBIDDEN: Array<{ pattern: RegExp; why: string; allowInTests?: boolean }> = [
  { pattern: /USER_DATA_PATH/, why: 'replaced by ABUDDY_USER_DATA_DIR via resolveAppContext()' },
  { pattern: /Application Support/, why: 'platform data dirs are derived only in @abuddy/sdk/env' },
  { pattern: /process\.env\.ABUDDY_ENV\b(?!\s*=)/, why: 'read the environment via resolveAppContext()', allowInTests: true },
  { pattern: /__ABUDDY_CHANNEL__/, why: 'the channel stamp is consumed only by the main bootstrap' },
  { pattern: /\b(getPacksDir|getPacksDirForEnv|getApiPortFile|resolveAppDataDir|resolveAppEnv)\s*\(/, why: 'removed; use resolveAppContext()' },
];

function trackedCodeFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: REPO_ROOT, encoding: 'utf-8' });
  return out.split('\n').filter(f =>
    /\.(ts|tsx|js|mjs|cjs|vue|sh)$/.test(f) &&
    !f.includes('node_modules/') &&
    !f.includes('/dist/') &&
    !f.includes('__generated__/') &&
    fs.existsSync(path.join(REPO_ROOT, f)),
  );
}

describe('environment identity guard', () => {
  it('no code outside the env module resolves environment or data dirs on its own', () => {
    const violations: string[] = [];
    for (const file of trackedCodeFiles()) {
      if (ALLOWED[file]) continue;
      // Tests may save/restore the env vars around a case
      const isTest = /(^|\/)tests?\//.test(file) || /\.spec\.ts$/.test(file);
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

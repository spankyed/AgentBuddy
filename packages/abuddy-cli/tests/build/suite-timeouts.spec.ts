// Decision 7: timeouts are per tier, not per package. A unit suite with `testTimeout: 120_000` does not
// catch a hang, it reports one as a slow pass — which is how a load-induced stall once reached a chain
// summary as two unexplained errors instead of a timeout.
//
// The budget lives with the tier table and the configs keep plain literals, deliberately: a vitest config
// importing a constant across package layers is the thing `check:specifiers` exists to prevent. So this is
// a ceiling on what a config may declare, checked here.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, TIER_TIMEOUT_MS, type Tier } from '../../../../scripts/lib/chain-steps.ts';
import { UNIT_SUITES, unitStepName } from '../../../../scripts/lib/unit-suites.ts';

/** Every test config in the repo, and the chain step that runs it — so a new one cannot go unchecked */
function configs(): { file: string; step: string }[] {
  const found: { file: string; step: string }[] = [];
  for (const suite of UNIT_SUITES) {
    const file = path.join('packages', suite.dir, 'vitest.config.ts');
    if (fs.existsSync(path.join(REPO_ROOT, file))) found.push({ file, step: unitStepName(suite) });
  }
  found.push({ file: 'packages/abuddy-cli/vitest.integration.config.ts', step: 'test:integration' });
  found.push({ file: 'playwright.config.ts', step: 'test' });
  return found.filter(({ file }) => fs.existsSync(path.join(REPO_ROOT, file)));
}

const TIMEOUT_KEYS = ['testTimeout', 'hookTimeout', 'teardownTimeout', 'timeout'];

/** The timeout values a config declares, ignoring commented-out lines */
function declaredTimeouts(file: string): { key: string; ms: number }[] {
  const out: { key: string; ms: number }[] = [];
  for (const raw of fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*')) continue;
    for (const key of TIMEOUT_KEYS) {
      const match = new RegExp(`\\b${key}\\s*:\\s*([\\d_]+)`).exec(line);
      if (match) out.push({ key, ms: Number(match[1].replace(/_/g, '')) });
    }
  }
  return out;
}

const tierOf = (step: string): Tier => CHAIN_STEPS.find((s) => s.name === step)!.tier;

describe('a suite times a test out at its tier budget', () => {
  it('has a chain step for every test config, so none goes unchecked', () => {
    const orphans = configs().filter(({ step }) => !CHAIN_STEPS.some((s) => s.name === step));
    expect(orphans.map(({ file }) => file)).toEqual([]);
  });

  it.each(configs())('$file', ({ file, step }) => {
    const budget = TIER_TIMEOUT_MS[tierOf(step)];
    const over = declaredTimeouts(file).filter(({ ms }) => ms > budget);
    expect(over, `${file} runs in ${step} (tier ${tierOf(step)}), whose budget is ${budget}ms`).toEqual([]);
  });
});

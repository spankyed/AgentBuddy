// Decision 7: timeouts are per tier, not per package. A unit suite with `testTimeout: 120_000` does not
// catch a hang, it reports one as a slow pass — which is how a load-induced stall once reached a chain
// summary as two unexplained errors instead of a timeout.
//
// The budget lives with the tier table and the configs keep plain literals, deliberately: a vitest config
// importing a constant across package layers is the thing `check:specifiers` exists to prevent. So the
// literals are checked here — that every config declares its tier's budget, and that no config or single
// test moves above it. Both directions, because a budget tighter than the tier is not a safe default: it
// turns contention into a failure where the tier had headroom, which is what it did.
//
// Both halves matter, and only the first was checked at first. A config states the policy; a third argument
// to `it()` escapes it for one test, and reading configs alone saw fifteen overrides of 60s to 240s sitting
// in tier-1 suites whose budget is 15s.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, INTEGRATION_SUITES, TIER_TIMEOUT_MS, type Tier } from '../../../scripts/lib/chain-steps.ts';
import { UNIT_SUITES, unitStepName } from '../../../scripts/lib/unit-suites.ts';
import { overrideKey, specFilesUnder, timeoutOverrides, type TimeoutOverride } from '../../../scripts/lib/test-timeouts.ts';

/**
 * Tests allowed to override their tier's budget, and why.
 *
 * An entry is a claim that one test genuinely needs longer than its tier gives — not that the default was
 * once 5s and nobody revisited it, which is what the other overrides turned out to be. The check below
 * fails on an entry whose override has gone, so the list shrinks when the reason does.
 */
const TIMEOUT_EXCEPTIONS: Record<string, string> = {};

/** The chain step that runs a spec, which is what decides its tier */
function stepForSpec(file: string): string {
  const dir = file.split('/')[1];
  if (dir === 'abuddy-cli' && file.endsWith('.integration.spec.ts')) return 'test:integration';
  const suite = UNIT_SUITES.find((candidate) => candidate.dir === dir);
  return suite ? unitStepName(suite) : 'test:unit:host';
}

/** Every override in the repo's spec files, with the tier it has to fit inside */
function overrides(): (TimeoutOverride & { step: string; budget: number })[] {
  return UNIT_SUITES.flatMap((suite) => specFilesUnder(path.join(REPO_ROOT, 'packages', suite.dir, 'tests')))
    .flatMap((file) => timeoutOverrides(file, REPO_ROOT))
    .map((override) => {
      const step = stepForSpec(override.file);
      return { ...override, step, budget: TIER_TIMEOUT_MS[CHAIN_STEPS.find((s) => s.name === step)!.tier] };
    });
}

/** Every test config in the repo, and the chain step that runs it — so a new one cannot go unchecked */
function configs(): { file: string; step: string }[] {
  const found: { file: string; step: string }[] = [];
  for (const suite of UNIT_SUITES) {
    const file = path.join('packages', suite.dir, 'vitest.config.ts');
    if (fs.existsSync(path.join(REPO_ROOT, file))) found.push({ file, step: unitStepName(suite) });
  }
  for (const suite of INTEGRATION_SUITES) {
    found.push({ file: path.join('packages', suite.dir, 'vitest.integration.config.ts'), step: 'test:integration' });
  }
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

describe('a test does not quietly buy itself more time than its tier allows', () => {
  it('declares no timeout above its tier budget, except where the list says why', () => {
    const over = overrides()
      .filter((override) => override.ms === undefined || override.ms > override.budget)
      .filter((override) => !(overrideKey(override) in TIMEOUT_EXCEPTIONS))
      .map((override) => `${override.file}:${override.line} ${override.runner} sets ${override.ms === undefined ? 'a timeout this cannot evaluate' : `${override.ms / 1000}s`}, and ${override.step} allows ${override.budget / 1000}s`);
    expect(over, 'remove it, or add it to TIMEOUT_EXCEPTIONS with the reason it needs longer').toEqual([]);
  });

  // A list of exceptions is honest only while each one is still an exception
  it('lists no exception whose override has gone', () => {
    const live = new Set(overrides().map(overrideKey));
    expect(Object.keys(TIMEOUT_EXCEPTIONS).filter((key) => !live.has(key)), 'drop these from TIMEOUT_EXCEPTIONS').toEqual([]);
  });
});

describe('a suite times a test out at its tier budget', () => {
  it('has a chain step for every test config, so none goes unchecked', () => {
    const orphans = configs().filter(({ step }) => !CHAIN_STEPS.some((s) => s.name === step));
    expect(orphans.map(({ file }) => file)).toEqual([]);
  });

  it.each(configs())('$file declares nothing above its tier budget', ({ file, step }) => {
    const budget = TIER_TIMEOUT_MS[tierOf(step)];
    const over = declaredTimeouts(file).filter(({ ms }) => ms > budget);
    expect(over, `${file} runs in ${step} (tier ${tierOf(step)}), whose budget is ${budget}ms`).toEqual([]);
  });

  /**
   * And declares it, rather than leaving the budget to whatever the runner defaults to.
   *
   * A ceiling was only half the rule, and the missing half is the one that bit. Vitest defaults to 5s for a
   * test and 10s for a hook — both *tighter* than tier 1's 15s — so a config that declares nothing is not
   * safely inside its tier, it is running on a third number nobody chose. Under the chain's three lanes a
   * 5.8s typecheck in `@abuddy/sdk` crossed the 5s default and was reported as a hang, in a suite whose tier
   * allowed 15s; the next in line was a 4.1s lock test in `@abuddy/host` at 82% of the same default. Five of
   * the thirteen configs were in that state, which is also why the three-lane default is safer than it was:
   * `CLAUDE.md` credits per-tier timeouts with removing the 5s cap, and they had only reached eight configs.
   *
   * Equality, not a floor: the budget belongs to the tier, so a suite that wants a different one is asking
   * for a different tier.
   */
  const REQUIRED = (file: string): string[] => (file.endsWith('playwright.config.ts') ? ['timeout'] : ['testTimeout', 'hookTimeout']);

  it.each(configs())('$file declares its tier budget', ({ file, step }) => {
    const budget = TIER_TIMEOUT_MS[tierOf(step)];
    const declared = new Map(declaredTimeouts(file).map(({ key, ms }) => [key, ms]));
    const wrong = REQUIRED(file)
      .filter((key) => declared.get(key) !== budget)
      .map((key) => `${key} is ${declared.has(key) ? `${declared.get(key)!}ms` : 'not declared, so the runner default applies'}`);
    expect(wrong, `${file} runs in ${step} (tier ${tierOf(step)}), so it must declare ${budget}ms`).toEqual([]);
  });
});

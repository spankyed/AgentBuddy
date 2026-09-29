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
import { overrideKey, specFilesUnder, stepForSpec, timeoutOverrides, type TimeoutOverride } from '../../../scripts/lib/test-timeouts.ts';

/**
 * Tests allowed to override their tier's budget, and why.
 *
 * An entry is a claim that one test genuinely needs longer than its tier gives — not that the default was
 * once 5s and nobody revisited it, which is what the other overrides turned out to be. The check below
 * fails on an entry whose override has gone, so the list shrinks when the reason does.
 */
const TIMEOUT_EXCEPTIONS: Record<string, string> = {};

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

/**
 * Where a config's timeouts are declared: its own text, and the helper it delegates to.
 *
 * A pack's config is a call to `definePackTestConfig` (`@abuddy/testing/vitest`), which holds the budget so
 * that every pack's suite runs with the same one — the whole point of collapsing three copies into it. This
 * check reads a config as *text* rather than importing it (importing one creates a temp data dir), so the
 * delegation has to be followed here or the property it checks reads as absent the moment a pack stops
 * restating it. The helper's source comes first, so a pack that overrides a key still wins.
 */
const PACK_TEST_CONFIG = path.join('packages', 'abuddy-testing', 'src', 'vitest.ts');

function timeoutSources(file: string): string[] {
  const own = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');
  if (!own.includes('definePackTestConfig')) return [own];
  return [fs.readFileSync(path.join(REPO_ROOT, PACK_TEST_CONFIG), 'utf-8'), own];
}

/** The timeout values a config declares, ignoring commented-out lines */
function declaredTimeouts(file: string): { key: string; ms: number }[] {
  const out: { key: string; ms: number }[] = [];
  for (const raw of timeoutSources(file).join('\n').split('\n')) {
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

/**
 * Which step a spec's budget comes from.
 *
 * Derived from `INTEGRATION_SUITES`, not from a named package. Naming one put the 8 integration specs in
 * `repo-checks` and `publish-checks` under a tier-1 budget while their tier is 2 — and nothing failed,
 * because neither has a per-test override today and the *configs* were already derived. These cases are the
 * firing case that absence left it without.
 */
describe('a spec takes the budget of the step that runs it', () => {
  it('sends every integration half to test:integration, whichever package it is in', () => {
    expect(INTEGRATION_SUITES.length, 'no suites derived, so this proves nothing').toBeGreaterThan(1);
    for (const suite of INTEGRATION_SUITES) {
      expect(stepForSpec(`packages/${suite.dir}/tests/x.integration.spec.ts`), suite.dir).toBe('test:integration');
    }
  });

  it('leaves the fast half with its pool, which is a different tier', () => {
    for (const suite of INTEGRATION_SUITES) {
      expect(stepForSpec(`packages/${suite.dir}/tests/x.spec.ts`), suite.dir).toBe(unitStepName(suite));
    }
    const tiers = (step: string) => CHAIN_STEPS.find((s) => s.name === step)!.tier;
    expect(tiers('test:integration'), 'and the two tiers really do differ, or none of this matters')
      .not.toBe(tiers(unitStepName(INTEGRATION_SUITES[0]!)));
  });

  // A package with no second config has no integration half to send anywhere, whatever a file is called
  it('does not invent an integration step for a package without one', () => {
    const plain = UNIT_SUITES.find((s) => !INTEGRATION_SUITES.some((i) => i.dir === s.dir))!;
    expect(stepForSpec(`packages/${plain.dir}/tests/x.integration.spec.ts`)).toBe(unitStepName(plain));
  });
});

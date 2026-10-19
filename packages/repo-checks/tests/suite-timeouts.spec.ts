// Timeouts are per size, not per package. A unit suite with `testTimeout: 120_000` does not catch a hang,
// it reports one as a slow pass — which is how a load-induced stall once reached a chain summary as two
// unexplained errors instead of a timeout.
//
// The budget lives with `SIZE_MS` and the configs keep plain literals, deliberately: a vitest config
// importing a constant across package layers is the thing `check:specifiers` exists to prevent. So the
// literals are checked here — that every config declares its size's budget, and that no config or single
// test moves above it. Both directions, because a budget tighter than the size is not a safe default: it
// turns contention into a failure where the size had headroom, which is what it did.
//
// Both halves matter, and only the first was checked at first. A config states the policy; a third argument
// to `it()` escapes it for one test, and reading configs alone saw fifteen overrides of 60s to 240s sitting
// in small suites whose budget is 15s.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { INTEGRATION_SUITES } from '../../../scripts/lib/chain-steps.ts';
import { SIZE_MS, UNIT_SUITES, type Size } from '../../../scripts/lib/unit-suites.ts';
import { overrideKey, sizeOf, specFilesUnder, timeoutOverrides, type TimeoutOverride } from '../../../scripts/lib/test-timeouts.ts';

/**
 * Tests allowed to override their size's budget, and why.
 *
 * An entry is a claim that one test genuinely needs longer than its size gives — not that the default was
 * once 5s and nobody revisited it, which is what the other overrides turned out to be. The check below
 * fails on an entry whose override has gone, so the list shrinks when the reason does.
 */
const TIMEOUT_EXCEPTIONS: Record<string, string> = {
  'packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts > builds and archives a real pack under the %s Electron runtime':
    'Four sequential public CLI commands exercise scaffold, feature generation, Electron build and Node archive. Linux completed the workflow in 59.141s; signed macOS init measured 53.797s and its complete build 59.735s. Authoring/archive commands retain 60s; only the full cold compile gets 120s headroom. Their composition gets 300s. Phase timing, direct content-compiler runtime evidence, retirement, output and activation-free cross-runtime archive assertions remain.',

  'packages/apack-cli/tests/build/build-worker.integration.spec.ts > compiles content through the captured worker and invalidates changed loader inputs':
    'This scenario owns installation capture and two sequential real content builds. Two Windows attempts exceeded the former 60s setup hook after codegen and while compiling, before ordering assertions. The single 120s case then completed its first build and exact ordering/source assertions but expired during the second real build. A 180s case budget covers these sequential builds without a separate setup hook; retain exact require/loader/import ordering, source identities, changed payload and revision checks. Other cases and production deadlines are unchanged.',
  'packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts > tracks retained Vite ESM preload and loader inputs without freezing Vue sources':
    'Two separate cold Windows attempts exceeded 60s during installation capture and terminated at 91.0s and 95.6s before assertions. This single startup scenario allows 120s for capture, two frontends and namespace/HMR checks; warm full acceptance measured 44.5s. Async byte reads separately address event-loop starvation. Keep five-second freshness/helper bounds and every invalidation, restoration, selection and live-source assertion.',
  'packages/apack-cli/tests/build/compiler-pe-libraries.integration.spec.ts > repairs a failed Vite assembly context through newly discovered watch inputs':
    'The real Windows lifecycle passes in 232.4s: initial backend/frontend readiness, missing-assembly refusal, repair publication and retirement run sequentially. Frontend replacements share one verified compiler installation. This scenario uses 300s. Keep the 20-second event bounds, failed-input matcher, no-initialization, incumbent, value and retirement assertions; this does not extend helper deadlines or other cases.',
  'packages/apack-cli/tests/build/compiler-pe-libraries.integration.spec.ts > refuses Node .local overrides through the captured compiler runtime before initialization':
    'Ordinary redirected Node loading, full public-CLI compiler capture/verification, then protected worker refusal and cleanup are sequential. VM stage evidence records 46.07s in package capture; the complete invocation reaches attributed refusal at 73.08s. This single scenario uses 120s with test-owned child cancellation. Keep the authored-path diagnostic, captured-marker/DLL and both no-initialization assertions.',
  'packages/apack-cli/tests/build/compiler-pe-libraries.integration.spec.ts > captures PE %s inputs and preserves publication after outside-library refusal':
    'Windows run 39094144526 emits its first backend runtime near the 60-second deadline, before freshness/restoration and refusal complete. Run 39095177818 passes the preload/thread scenarios in 62.55s/61.63s. Keep the 120-second scenario bound and phase timings; the combined preload/thread case additionally verifies process-wide DLL reuse. The CommonJS compiler-reuse case passes in run 39100052114 in 106.17s, including freshness/restoration and refused publication, under that unchanged bound.',
  'packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts > watches external Vite native changes and repairs a failed generation through newly discovered inputs':
    'Initial backend/Vite publication, native dependency refusal and watched repair are sequential. Hosted macOS run 39079072090 detects the rebuild but expires its separate console wait. Awaiting the actual builds passes in 98.76 seconds on run 39079492068. Retain the original 120-second scenario budget, separate 20-second missing-event bounds and every incumbent/value/retirement assertion.',
  'packages/apack-cli/tests/commands/scaffold.integration.spec.ts > adds a step (declared, shipped in build/steps.build.mjs) and a service that build':
    'Real step/service scaffolding, compiler publication and authored-pack typechecking take 56.93 seconds alone and exceeded 60 seconds in the two-worker pool. This complete authoring scenario has a 120-second budget; its assertions are unchanged.',
  'packages/apack-cli/tests/build/frontend-resources.integration.spec.ts > watches initially empty external Tailwind content through nested directory links':
    'Initial compilation plus two actual watched rebuilds take 57.05 seconds alone and exceeded 60 seconds in the two-worker pool. The scenario has a 120-second budget; both existing 20-second rebuild waits and CSS assertions remain unchanged.',
  'packages/apack-cli/tests/build/staged-dsl.integration.spec.ts > preserves a verified build on a later failure, then publishes and reuses the current definitions with its frontend':
    'Five sequential actual builds cover initial publication, refusal, recovery, reuse and removal. Measured at 93.33 seconds alongside the two-build DSL case on two workers; assertions and per-operation waits are unchanged.',
  'packages/apack-cli/tests/build/watch-worker-inputs.integration.spec.ts > rebuilds for worker inputs and repairs missing external reads without authored edits':
    'Three actual backend compiler attempts and ready watch subscriptions take 68.27 seconds. The measured repair takes 26.57 seconds; each build wait uses the existing 60-second integration budget within this 120-second scenario.',
  'packages/apack-cli/tests/build/build-output-swap.integration.spec.ts > does not reuse facade files from an incumbent with stamps from a refused replacement':
    'Three sequential real builds prove initial publication, refused replacement and recovery. Assertions pass in 59.27 seconds alone; the same scenario reaches 63.50 seconds alongside focused checks.',
  'packages/apack-cli/tests/build/watch-external-types.integration.spec.ts > rebuilds external contracts and recovers a retargeted missing input without an authored edit':
    'Four real compiler attempts share this scenario, including refusal and missing-input repair. Measured at 73.69 seconds; each rebuild wait stays bounded at 20 seconds.',
  'packages/apack-cli/tests/build/build-worker.integration.spec.ts > uses the captured compiler and retains unchanged build/cache identity on repeat builds':
    'Two independent cold compiler installations/builds plus archive and reuse verification. On the two-core Windows VM after the report-API repair, the first build takes 155.705 seconds, replay/archive finish at 169.409 seconds, and the second worker starts at 214 seconds; 240 seconds expires during that build. Windows gets 360 seconds for two complete cold builds and cleanup; macOS retains 120 seconds. Both builders are teardown-owned and all source-path, cache, output and disposal assertions remain.',
};

/** Every override in the repo's spec files, with the size it has to fit inside */
function overrides(): (TimeoutOverride & { size: Size; budget: number })[] {
  return UNIT_SUITES.flatMap((suite) => specFilesUnder(path.join(REPO_ROOT, 'packages', suite.dir, 'tests')))
    .flatMap((file) => timeoutOverrides(file, REPO_ROOT))
    .map((override) => {
      const size = sizeOf(override.file);
      return { ...override, size, budget: SIZE_MS[size] };
    });
}

/** Every test config in the repo, and its size — so a new one cannot go unchecked */
function configs(): { file: string; size: Size }[] {
  const found: string[] = [
    ...UNIT_SUITES.map((suite) => path.join('packages', suite.dir, 'vitest.config.ts')),
    ...INTEGRATION_SUITES.map((suite) => path.join('packages', suite.dir, 'vitest.integration.config.ts')),
    'playwright.config.ts',
  ];
  return found
    .filter((file) => fs.existsSync(path.join(REPO_ROOT, file)))
    .map((file) => ({ file, size: sizeOf(file) }));
}

const TIMEOUT_KEYS = ['testTimeout', 'hookTimeout', 'teardownTimeout', 'timeout'];

/**
 * Where a config's timeouts are declared: its own text, and the helper it delegates to.
 *
 * A pack's config is a call to one of these helpers, which holds the budget so that every pack's suite runs
 * with the same one — the whole point of collapsing the copies into it. This check reads a config as *text*
 * rather than importing it (importing one creates a temp data dir), so the delegation has to be followed
 * here or the property it checks reads as absent the moment a pack stops restating it. The helper's source
 * comes first, so a pack that overrides a key still wins.
 *
 * One entry per runner, because a timeout means something different to each: `definePackTestConfig` holds
 * `testTimeout`/`hookTimeout` for vitest, `definePackE2EConfig` holds Playwright's `timeout`. A helper
 * missing from here reads as a config that declares nothing — which is a passing `declares nothing above
 * its budget` and a failing `declares its budget`, so it fails loudly rather than quietly.
 */
const DELEGATES: Record<string, string> = {
  definePackTestConfig: path.join('packages', 'apack-testing', 'src', 'vitest.ts'),
  definePackE2EConfig: path.join('packages', 'apack-testing', 'src', 'playwright.ts'),
};

/**
 * The helper's own body, not the whole file it lives in.
 *
 * One module can hold several helpers with different answers: `src/playwright.ts` has three, and two of
 * them declare `timeout: 0` because a driving run and a serving session have no deadline at all. Reading
 * the file whole found those zeros for a config that delegates to the E2E helper and reported the root
 * suite's budget as 0ms. So the delegation is to a declaration, and this is where it ends.
 */
function helperBody(source: string, helper: string): string {
  const from = source.indexOf(`export function ${helper}`);
  if (from === -1) return source;
  const rest = source.slice(from);
  const next = rest.indexOf('\nexport ', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

function timeoutSources(file: string): string[] {
  const own = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');
  const delegate = Object.entries(DELEGATES).find(([helper]) => own.includes(helper));
  if (delegate === undefined) return [own];
  const [helper, source] = delegate;
  return [helperBody(fs.readFileSync(path.join(REPO_ROOT, source), 'utf-8'), helper), own];
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

describe('a test does not quietly buy itself more time than its size allows', () => {
  it('declares no timeout above its size budget, except where the list says why', () => {
    const over = overrides()
      .filter((override) => override.ms === undefined || override.ms > override.budget)
      .filter((override) => !(overrideKey(override) in TIMEOUT_EXCEPTIONS))
      .map((override) => `${override.file}:${override.line} ${override.runner} sets ${override.ms === undefined ? 'a timeout this cannot evaluate' : `${override.ms / 1000}s`}, and a ${override.size} target allows ${override.budget / 1000}s`);
    expect(over, 'remove it, or add it to TIMEOUT_EXCEPTIONS with the reason it needs longer').toEqual([]);
  });

  // A list of exceptions is honest only while each one is still an exception
  it('lists no exception whose override has gone', () => {
    const live = new Set(overrides().map(overrideKey));
    expect(Object.keys(TIMEOUT_EXCEPTIONS).filter((key) => !live.has(key)), 'drop these from TIMEOUT_EXCEPTIONS').toEqual([]);
  });
});

describe('a suite times a test out at its size budget', () => {
  // The population, not a spot check: a config nobody derived is one whose budget nothing holds
  it('finds every test config, so none goes unchecked', () => {
    const found = configs();
    expect(found.length, 'no configs derived, so every case below passes over nothing').toBeGreaterThan(10);
    expect(new Set(found.map(({ size }) => size)), 'both sizes have a config, or one branch is never taken')
      .toEqual(new Set(['small', 'large']));
  });

  it.each(configs())('$file declares nothing above its $size budget', ({ file, size }) => {
    const budget = SIZE_MS[size];
    const over = declaredTimeouts(file).filter(({ ms }) => ms > budget);
    expect(over, `${file} is ${size}, whose budget is ${budget}ms`).toEqual([]);
  });

  /**
   * And declares it, rather than leaving the budget to whatever the runner defaults to.
   *
   * A ceiling was only half the rule, and the missing half is the one that bit. Vitest defaults to 5s for a
   * test and 10s for a hook — both *tighter* than a small target's 15s — so a config that declares nothing
   * is not safely inside its size, it is running on a third number nobody chose. Under the chain's three
   * lanes a 5.8s typecheck in `@apackdev/sdk` crossed the 5s default and was reported as a hang, in a suite
   * allowed 15s; the next in line was a 4.1s lock test in `@apackdev/host` at 82% of the same default. Five
   * of the thirteen configs were in that state, which is also why the three-lane default is safer than it
   * was: `CLAUDE.md` credits these budgets with removing the 5s cap, and they had only reached eight configs.
   *
   * Equality, not a floor: the budget belongs to the size, so a suite that wants a different one is asking
   * for a different size.
   */
  const REQUIRED = (file: string): string[] => (file.endsWith('playwright.config.ts') ? ['timeout'] : ['testTimeout', 'hookTimeout']);

  it.each(configs())('$file declares its $size budget', ({ file, size }) => {
    const budget = SIZE_MS[size];
    const declared = new Map(declaredTimeouts(file).map(({ key, ms }) => [key, ms]));
    const wrong = REQUIRED(file)
      .filter((key) => declared.get(key) !== budget)
      .map((key) => `${key} is ${declared.has(key) ? `${declared.get(key)!}ms` : 'not declared, so the runner default applies'}`);
    expect(wrong, `${file} is ${size}, so it must declare ${budget}ms`).toEqual([]);
  });
});

/**
 * Which size a spec's budget comes from.
 *
 * Derived from `INTEGRATION_SUITES`, not from a named package and not from the filename alone. Naming one
 * put the 8 integration specs in `repo-checks` and `publish-checks` under a small budget while they run
 * large — and nothing failed, because neither has a per-test override today and the *configs* were already
 * derived. These cases are the firing case that absence left it without.
 */
describe('a file takes the budget of the target it runs in', () => {
  it('calls every integration half large, whichever package it is in', () => {
    expect(INTEGRATION_SUITES.length, 'no suites derived, so this proves nothing').toBeGreaterThan(1);
    for (const suite of INTEGRATION_SUITES) {
      expect(sizeOf(`packages/${suite.dir}/tests/x.integration.spec.ts`), suite.dir).toBe('large');
    }
  });

  it('leaves the fast half small, which is a different budget', () => {
    for (const suite of INTEGRATION_SUITES) {
      expect(sizeOf(`packages/${suite.dir}/tests/x.spec.ts`), suite.dir).toBe('small');
    }
    expect(SIZE_MS.small, 'and the two budgets really do differ, or none of this matters').not.toBe(SIZE_MS.large);
  });

  // A package with no second config runs everything in its fast half, whatever a file is called
  it('does not call a spec large in a package with no integration half', () => {
    const plain = UNIT_SUITES.find((s) => !INTEGRATION_SUITES.some((i) => i.dir === s.dir))!;
    expect(sizeOf(`packages/${plain.dir}/tests/x.integration.spec.ts`)).toBe('small');
  });

  /**
   * And it answers for a config by the config's own existence, which is the other half of the one
   * question. These were two functions in two modules until 2026-10: a spec's name is a claim and a
   * config's name is the fact, and that asymmetry is a reason for two branches rather than two names.
   */
  it('reads a config by which config it is', () => {
    const [withHalf] = INTEGRATION_SUITES;
    expect(sizeOf(`packages/${withHalf!.dir}/vitest.integration.config.ts`)).toBe('large');
    expect(sizeOf(`packages/${withHalf!.dir}/vitest.config.ts`)).toBe('small');
    expect(sizeOf('playwright.config.ts'), 'the E2E suite is its own target').toBe('large');
  });

  /**
   * A file that is neither gets no answer. Every unrecognised path would otherwise fall through to
   * `small`, and since the budget is a ceiling, the confident wrong answer is the permissive one — a
   * caller would be told 15s for something nothing had reasoned about.
   */
  it('refuses a file that belongs to no test target', () => {
    expect(() => sizeOf('docs/goals/README.md')).toThrow(/neither a test config nor a spec/);
    expect(() => sizeOf('scripts/lib/unit-suites.ts')).toThrow(/neither a test config nor a spec/);
  });
});

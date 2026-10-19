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
import { repoFiles } from './_support/repo-files.ts';

/**
 * Tests allowed to override their size's budget, and why.
 *
 * An entry is a claim that one test genuinely needs longer than its size gives — not that the default was
 * once 5s and nobody revisited it, which is what the other overrides turned out to be. The check below
 * fails on an entry whose override has gone, so the list shrinks when the reason does.
 */
const TIMEOUT_EXCEPTIONS: Record<string, string> = {
  'packages/apack-cli/tests/build/build-worker.integration.spec.ts > records external inputs read by content compiler worker threads':
    'A cold captured build runs four compiler-thread lifecycles before external-input verification. Its build is explicitly bounded at 120s, then 20s covers receipt/freshness assertions; fixture teardown drains the registered builder. Normal run 39253013877 exceeded the former 60s complete-case limit. Other operation/event/cleanup limits remain unchanged.',
  'packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts > uses the %s Electron runtime through the shared compiler launcher':
    'Runtime capture (60s), captured launch (unchanged 15s), verification/retirement (20s) compose the driver allowance; the 120s case includes fixture setup/cleanup. Normal gate 39248035810 exceeded the former 30s nested driver limit. The asynchronous driver preserves runner updates and records phase completion without relaxing identity or retirement assertions.',
  'packages/apack-cli/tests/build/build-worker.integration.spec.ts > refuses candidate output changed by a compiler exit handler and retains the incumbent':
    'One cold captured build precedes sealed-output mutation/refusal and incumbent verification. The owner uses test cancellation and is drained before fixture deletion; the scenario allows 180s for the public build and 20s for verification/disposal. This is the earlier normal-run 60s timeout, not a new value failure.',
  'packages/apack-cli/tests/build/types-bundler-determinism.integration.spec.ts > is identical from the workspace and from the packed tarballs a consumer installs':
    'Two bounded cold public builds (180s each), package materialization (60s) and verification/disposal (20s) are sequential. Asynchronous commands preserve runner responsiveness; test cancellation kills the active command and teardown waits for it before removing inputs.',
  'packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts > builds and archives a real pack under the %s Electron runtime':
    'Four sequential command bounds total 360s (60 + 60 + 180 + 60), plus 60s for verification and disposal. Each command retains its own deadline and two-second forced-close grace. The outer bound accommodates their composition; runtime, output, retirement and passive archive assertions remain.',
  'packages/apack-cli/tests/build/build-worker.integration.spec.ts > removes its worker and compiler when the public build command is stopped while $name':
    'Startup allows 60s, shutdown 20s and final cleanup 20s. The enclosing scenario accommodates all three existing bounds without changing them.',

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
    'Two snapshot-backed backend publications, frontend startup/refusal/repair and awaited retirement are sequential. Complete two-core disposable macOS control 39195118565 takes 238.58 seconds with all assertions intact. This scenario has a 300-second budget; separate 20-second missing-event waits and incumbent/value/publication/retirement assertions are unchanged.',
  'packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts > captures native %s libraries and retains the incumbent after outside-library refusal':
    'One successful build, freshness/restoration verification, two ordinary-loader controls and two refused compiler attempts are sequential. Disposable macOS control 39199301017 completes preload/thread cases in 44.652s/53.334s; preload exceeds the former 60s outer bound in the two-worker strict pool. This scenario uses 120s while preserving every initialization, source/copy, freshness, incumbent and teardown assertion. Helper and suite deadlines are unchanged; the broad slowdown itself is not attributed.',
  'packages/apack-cli/tests/commands/scaffold.integration.spec.ts > adds a step (declared, shipped in build/steps.build.mjs) and a service that build':
    "Step generation, service generation, real build and typecheck share this case.",
  'packages/apack-cli/tests/build/frontend-resources.integration.spec.ts > watches initially empty external Tailwind content through nested directory links':
    "Initial capture precedes two directory-membership/link-retarget builds, with separate request, compiler and notification bounds from watch-builds.",
  'packages/apack-cli/tests/build/staged-dsl.integration.spec.ts > preserves a verified build on a later failure, then publishes and reuses the current definitions with its frontend':
    "Five real builds cover publication, refusal, repair, reuse and removal, followed by verification and disposal.",
  'packages/apack-cli/tests/build/watch-worker-inputs.integration.spec.ts > rebuilds for worker inputs and repairs missing external reads without authored edits':
    "Initial compiler capture/publication precedes two unchanged 60s worker-input refusal/recovery waits and disposal.",
  'packages/apack-cli/tests/build/build-output-swap.integration.spec.ts > does not reuse facade files from an incumbent with stamps from a refused replacement':
    "Three sequential real builds, including refusal and recovery, followed by integrity verification and disposal.",
  'packages/apack-cli/tests/build/watch-external-types.integration.spec.ts > rebuilds external contracts and recovers a retargeted missing input without an authored edit':
    "Initial capture precedes replacement, refusal and recovery builds; watch-builds bounds each request/compiler operation before the unchanged notification checks.",
  'packages/apack-cli/tests/build/build-worker.integration.spec.ts > uses the captured compiler and retains unchanged build/cache identity on repeat builds':
    'Two independent cold compiler installations/builds plus archive and reuse verification. On the two-core Windows VM, the first build takes 155.705 seconds and 240 seconds expires during the second. Two-worker macOS control 39206807491 completes the second build at 111.034 seconds; the broad pool expires at its former 120s outer bound after the first build. The same sequential scenario gets 360 seconds on every platform. Both builders are teardown-owned and all source-path, cache, output and disposal assertions remain.',
  "packages/apack-cli/tests/build/build-output-swap.integration.spec.ts > publishes help as snapshot data and retains accepted articles after an invalid edit":
    "Two successful builds and one refused help edit share the case; retain article, revision and staging assertions.",
  "packages/apack-cli/tests/build/dependency-inputs.integration.spec.ts > retains the consumer build when a content compiler changes accepted dependency bytes":
    "Producer and consumer builds precede a refused replacement; dependency bytes and incumbent verification remain required.",
  "packages/apack-cli/tests/build/build-registry.integration.spec.ts > compiles flows against the steps it loaded, and leaves the bound registry untouched":
    "One successful compilation and one refused replacement share the scenario; retain registry and receipt assertions.",
  "packages/apack-cli/tests/build/frontend-resources.integration.spec.ts > rebuilds Vue styles after only an external stylesheet changes":
    "Initial publication and stylesheet-only rebuild are sequential; verification and disposal follow.",
  "packages/apack-cli/tests/build/package-inputs.integration.spec.ts > rebuilds the frontend when an undeclared imported package changes behind unchanged types":
    "Two real builds verify changed runtime bytes behind unchanged declarations.",
  "packages/apack-cli/tests/commands/scaffold.integration.spec.ts > adds a feature, builds, typechecks and packs a verified archive":
    "Feature generation, validate, doctor, build, typecheck and archive are six sequential toolchain operations; extraction and verification follow.",
  "packages/apack-cli/tests/commands/scaffold.integration.spec.ts > records the facade dependents compile against, and then reports it up to date":
    "A build and three source-facade derivations are sequential; keep missing, update and current-report assertions.",
  "packages/apack-cli/tests/commands/scaffold.integration.spec.ts > regenerates entries when a source file codegen reads changes, not only the manifest":
    "Two separate CLI generation commands prove invalidation and subsequent unchanged reuse.",
  "packages/apack-cli/tests/commands/add-extensions.integration.spec.ts > scaffolds an artifact viewer taking artifact, declared with its icon and viewer":
    "Each of two artifact scaffolds regenerates pack entries; declaration and component assertions follow.",
  "packages/apack-cli/tests/commands/add-extensions.integration.spec.ts > scaffolds display blocks taking their props and input blocks taking disabled/response, emitting submit/cancel":
    "Display and input block scaffolds each regenerate entries before component/manifest verification.",
  "packages/apack-cli/tests/commands/add-extensions.integration.spec.ts > declares each migration under its version line and the version it targets, which the pack entry registers and tsc accepts":
    "Four migration scaffolds, explicit generation and a real TypeScript program run sequentially.",
  "packages/apack-cli/tests/build/watch-module-freshness.integration.spec.ts > refreshes flow modules loaded through ordinary imports on the next watched build":
    "Initial capture precedes a real flow rebuild; its request, compiler operation and original notification check have separate bounds.",
  "packages/apack-cli/tests/build/watch-module-freshness.integration.spec.ts > recompiles changed transitive content modules and retains the accepted build on failure":
    "Initial capture precedes a replacement and a refused content build, each with separate request/compiler bounds and the original notification check.",
  "packages/apack-cli/tests/build/frontend-workers.integration.spec.ts > retains the accepted build after a worker error and publishes its repair":
    "Initial capture precedes refused and repaired worker builds, bounded separately from their unchanged notification checks.",
  "packages/apack-cli/tests/build/frontend-resources.integration.spec.ts > watches an external %s asset in a separate directory":
    "Initial capture precedes an asset rebuild; watch-builds separates the request/compiler limits from the original notification check.",
  "packages/apack-cli/tests/build/package-inputs.integration.spec.ts > automatically rebuilds an undeclared runtime imported by $name without a type or authored edit":
    "Initial capture precedes an imported-runtime rebuild with separate request/compiler bounds and the original notification check.",
  "packages/apack-cli/tests/build/editor-declarations.integration.spec.ts > builds declared editor members and step presentation, then discovers a copied source-free build":
    "A cold captured public build precedes source-free inspection, actual frontend loading and disposal.",
  "packages/apack-cli/tests/build/package-inputs.integration.spec.ts > keeps a captured build current after standalone generation with unchanged generated code":
    "Cold public build, standalone generation and common-record replays run sequentially.",
  "packages/apack-cli/tests/commands/info.integration.spec.ts > reports authentic compiled content and cached dependency provenance after producer source removal":
    "Two actual pack builds and three CLI archive/inspection commands precede source-removal/provenance assertions.",
  "packages/apack-cli/tests/build/frontend-generation.integration.spec.ts > refreshes backend and live frontend together, retains failed incumbents and awaits retirement":
    "Frontend startup, refused cold replacement and repaired cold replacement are sequential; existing 2s HMR/fetch limits and retirement checks remain.",
  "packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts > captures the selected native image suffix and refuses its later transitive escape":
    "Two captured build attempts follow native fixture/ordinary-loader preparation; freshness, pre-initialization refusal and disposal remain. The complete diagnostic takes 69.377s, above the former default.",
  "packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts > retains launch-time native search paths across preload changes and compiler workers":
    "Two captured builds plus native fixture preparation, source/copy verification and disposal share the case.",
  "packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts > refuses external %s before native initialization after preload mutation":
    "Ordinary-loader selection and an accepted build precede a refused captured replacement; retain native pre-initialization and incumbent assertions.",
  "packages/apack-cli/tests/build/dependency-graph.integration.spec.ts > beforeAll":
    "The dependency diamond setup builds four real packs in dependency order before the five assertions.",
  "packages/apack-cli/tests/_support/facade-packs.ts > beforeAll":
    "Shared facade setup materializes its package layout, scaffolds a step and builds dependency plus consumer before running type/completion assertions.",
  "packages/apack-cli/tests/build/frontend-resources.integration.spec.ts > beforeEach":
    "Watcher setup captures its compiler and publishes its initial frontend before test-specific rebuild waits.",
  "packages/apack-cli/tests/build/watch-publication.integration.spec.ts > beforeEach":
    "Initial compiler capture/publication, installation, static catalog inspection and actual host reload precede the case.",
  "packages/apack-cli/tests/build/frontend-generation.integration.spec.ts > beforeEach":
    "The setup copies a private compiler then publishes its initial captured generation before replacement assertions.",
  "packages/apack-cli/tests/build/build-output-swap.integration.spec.ts > rebuilds damaged %s data instead of renewing its checksums":
    "Two sequential captured builds precede checksum, facade restoration and staged-build verification; both variants exceeded the former 60s case limit.",
  "packages/apack-cli/tests/build/dependency-graph.integration.spec.ts > still fails when two independent packs declare the same entity":
    "A rival pack build precedes a separate public CLI collision refusal and its diagnostic assertions; the combined case exceeded 60s.",
  "packages/apack-cli/tests/commands/scaffold.integration.spec.ts > fails the build on an unresolvable dependency":
    "Separate public build and archive refusals verify the diagnostic and retained incumbent; their combined case exceeded 60s.",
  "packages/apack-cli/tests/commands/add-extensions.integration.spec.ts > generates flow helpers for the kebab-case step that typecheck with tsc":
    "Step scaffolding/regeneration, explicit code generation and a separate TypeScript program run sequentially; affected acceptance measured 51.5s against the old 60s aggregate.",
  "packages/apack-cli/tests/commands/add-extensions.integration.spec.ts > refuses a version it already declares on that line, leaving the manifest as it was":
    "After the immediate duplicate refusal, app-line migration scaffolding/regeneration, explicit generation and a separate typecheck run sequentially.",
  "packages/apack-cli/tests/commands/facade-report.integration.spec.ts > checks the verified current build without changing generated files":
    "Publishing the newly authored report requires a cold build before passive from-build inspection and unchanged-file assertions.",
  "packages/apack-cli/tests/build/frontend-resources.integration.spec.ts > recovers a missing nested stylesheet while retaining the accepted build":
    "After the separate startup hook, replacement, missing-input refusal and repair each need a bounded request/build followed by the unchanged notification check.",
  "packages/apack-cli/tests/build/watch-publication.integration.spec.ts > publishes source and manifest edits together and retains the incumbent after refusal":
    "After initial setup, changed, refused and repaired builds each have separate request/compiler/notification bounds, retaining host reload and incumbent assertions.",
  "packages/apack-cli/tests/build/watch-publication.integration.spec.ts > follows retargeted manifest links through refusal, repair and atomic replacement":
    "A malformed-manifest preflight refusal keeps its original 20s bound; repair and atomic replacement then use separate request/build/notification bounds.",
};

/** Every override in the repo's spec files, with the size it has to fit inside */
function overrides(): (TimeoutOverride & { size?: Size; budget?: number })[] {
  const specs = UNIT_SUITES.flatMap(suite => specFilesUnder(path.join(REPO_ROOT, 'packages', suite.dir, 'tests')));
  const helpers = repoFiles().filter(file => file.includes('/tests/_support/') && file.endsWith('.ts'))
    .map(file => path.join(REPO_ROOT, file));
  return [...new Set([...specs, ...helpers])]
    .flatMap((file) => timeoutOverrides(file, REPO_ROOT))
    .map((override) => {
      // Shared helpers have no runnable target; each override requires an explicit reason.
      if (override.file.includes('/tests/_support/')) return override;
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
      .filter((override) => override.budget === undefined || override.ms === undefined || override.ms > override.budget)
      .filter((override) => !(overrideKey(override) in TIMEOUT_EXCEPTIONS))
      .map((override) => `${override.file}:${override.line} ${override.runner} sets ${override.ms === undefined ? 'a timeout this cannot evaluate' : `${override.ms / 1000}s`}; `
        + (override.budget === undefined ? 'shared helper deadlines require explicit review'
          : `a ${override.size} target allows ${override.budget / 1000}s`));
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

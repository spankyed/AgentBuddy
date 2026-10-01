// The step table's own shape, which is a different question from what each step reads.
//
// Nothing here opens a file in the repo: every case is answered from `CHAIN_STEPS`, `UNIT_SUITES` and the
// npm scripts, by asking whether the table agrees with itself — that a pool declares what its projects
// declare, that a step keeping its own cache says so, that a recorded artifact has both of its halves.
// `chain-inputs.spec.ts` is the other half of the split: whether a step's declared inputs cover the files
// that step actually reads, which is answered by walking the tree and is where the cost lives.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { BUILD_UNITS, buildScriptFor, inputFiles, NOT_A_BUILD_INPUT, repoRelative, REPO_ROOT, type BuildUnit } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, INTEGRATION_SUITES, suiteInputs, type ChainStep } from '../../../scripts/lib/chain-steps.ts';
import { UNIT_SUITES, type UnitSuite } from '../../../scripts/lib/unit-suites.ts';
import { reachableText, rootScripts } from '../../../scripts/lib/npm-scripts.ts';
import { TYPECHECK_LEGS } from '../../../scripts/lib/typecheck-legs.ts';
import { poolUnitFor } from '../../../scripts/lib/unit-pool.ts';
import { relativeSpecifiers, resolveRelative } from '../../../scripts/lib/module-graph.ts';
import { PACKAGE_DIRS } from '../../../scripts/lib/workspace-deps.ts';
import { population } from '@abuddy/sdk/testing';

/**
 * A vitest config as vitest resolves it, rather than as a regular expression reads it.
 *
 * Both of the checks below used to match the file's text. The unit one anchored its pattern to the start of
 * a line and so happened to skip a commented-out project; the integration one, written from it later, did
 * not — and commenting a project out dropped five specs from the chain while all 46 cases here passed. A
 * config is a module that exports an object, so the object is what to ask.
 */
const resolvedConfig = async (rel: string): Promise<{ test?: {
  projects?: string[];
  poolOptions?: { threads?: { maxThreads?: unknown }; forks?: { maxForks?: unknown } };
} }> => (await import(path.join(REPO_ROOT, rel))).default;

const projectsOf = async (rel: string): Promise<string[]> => {
  const projects = (await resolvedConfig(rel)).test?.projects ?? [];
  expect(projects.length, `${rel} resolved to no projects, so any comparison against it is vacuous`).toBeGreaterThan(0);
  return projects;
};

// `build:app` is an enumeration of workspaces, which is the shape that goes stale silently: a workspace that
// gains a `build` script simply would not be built by the chain, and nothing would say so. The set is
// derivable from the manifests, so it is checked rather than trusted. `@app/default-setup` is the one
// exclusion, and it is not an exception so much as a division of labour: `compile` runs that exact command,
// and a second run of it rewrote the `dist` five steps read, which is what made a warm chain uncacheable.
describe('the chain builds every workspace that has a build', () => {
  const OWNED_BY_COMPILE = '@app/default-setup';

  it('names them all in build:app, or leaves them to compile', () => {
    const root = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };
    const named = new Set([...root.scripts['build:app'].matchAll(/-w (\S+)/g)].map(([, name]) => name));

    const withBuild = PACKAGE_DIRS.flatMap((dir) => {
      const manifest = path.join(REPO_ROOT, 'packages', dir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { name: string; scripts?: Record<string, string> };
      return pkg.scripts?.build ? [pkg.name] : [];
    });

    const unbuilt = withBuild.filter((name) => name !== OWNED_BY_COMPILE && !named.has(name));
    expect(unbuilt, 'add these to build:app, or say which step builds them').toEqual([]);
    const gone = [...named].filter((name) => !withBuild.includes(name));
    expect(gone, 'build:app names these and they have no build script').toEqual([]);
    expect(named.has(OWNED_BY_COMPILE), 'compile already runs this workspace\'s build; a second run thrashes the cache').toBe(false);
  });
});

// Nested caches that can disagree, which is the defect this pair of checks exists for.
//
// A pool is two caches over one body of work: the chain stamps the step, `scripts/lib/unit-pool.ts` stamps
// each project. Such a pair is only sound when the inner layer's inputs **cover** the outer's — anything the
// outer treats as a reason to run must be a reason for some inner unit to run. Both directions fail, and
// differently, so both are checked.
//
// Narrower than its projects and the chain caches the step while a project inside it is stale: that project
// never runs again. Wider and the step goes stale for a reason no project can see, so it runs, asks each
// project, finds them all fresh, prints "all N project(s) up to date" and stamps green having tested
// nothing. That one happened: four runner files were declared on the step and on no project, and the file
// deciding what the pool runs was the one file the pool could not notice changing.
//
// The second check reads what the pool *actually fingerprints* rather than `suiteInputs` directly. Both are
// derived from it today, so comparing the step with `suiteInputs` would also pass — but it would keep
// passing if the pool started fingerprinting something else, which is the divergence that matters. The
// pool's fingerprint lives in its own module precisely so a spec can ask it: the script runs `main()` on
// import.
describe('a pool step and its projects cache on the same inputs', () => {
  const poolStep = (kind: 'host' | 'pack'): ChainStep => CHAIN_STEPS.find((s) => s.name === `test:unit:${kind}`)!;
  const projects = (kind: 'host' | 'pack'): UnitSuite[] => UNIT_SUITES.filter((suite) => suite.kind === kind);

  it.each(['host', 'pack'] as const)('%s reads everything its projects read', (kind) => {
    const declared = new Set(poolStep(kind).inputs);
    const missing = projects(kind)
      .flatMap((suite) => suiteInputs(suite).filter((input) => !declared.has(input)).map((input) => `${suite.workspace} reads ${input}`));
    expect([...new Set(missing)]).toEqual([]);
  });

  it.each(['host', 'pack'] as const)('%s declares nothing its projects cannot see', (kind) => {
    const fingerprinted = new Set(projects(kind).flatMap((suite) => poolUnitFor(suite).inputs.map(repoRelative)));
    const unseen = poolStep(kind).inputs.filter((input) => !fingerprinted.has(input));
    expect(unseen, 'the step would go stale for these and every project would still read fresh, so it would run '
      + 'and test nothing: put them in suiteInputs, where both cache layers read them').toEqual([]);
  });
});

// One chain step runs every expensive half, and which packages those are is derived from the configs each
// one has. The step's inputs follow that derivation; the root config that pools them cannot, being a file
// `check:specifiers` reads as text — so a package that gains an integration config would have its specs
// hashed into the step's cache key and never run. This is the half that has to be checked rather than
// derived, and it moved from the script's `-w` flags to the pool's projects when the three runs became one.
describe('the integration step runs every suite that has an expensive half', () => {
  it('names them all in the pooled config', async () => {
    const named = (await projectsOf('vitest.integration.config.ts'))
      .map((project) => /packages\/([\w-]+)\//.exec(project)?.[1] ?? project);
    expect(named.sort()).toEqual(INTEGRATION_SUITES.map((suite) => suite.dir).sort());
  });

  // The pool is what the root script runs; naming the projects and then running something else would pass
  // the check above over a file nothing reads
  it('is what the root script runs', () => {
    const scripts = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['test:integration']).toContain('--config vitest.integration.config.ts');
    expect(scripts['test:integration'], 'and the guard each package pretest used to provide')
      .toContain('packages:ensure');
  });
});

// `--all` has to arrive somewhere that honours it.
//
// A step declaring `forceArgs` claims its command takes them, and nothing at run time can tell whether it
// did: a command that ignores an argument it does not know looks exactly like one that skipped its cache and
// found nothing to do. That is the shape of the bug this field was added for, so the claim is checked against
// the script rather than trusted.
describe('a step that declares forceArgs runs something that reads them', () => {
  const declaring = CHAIN_STEPS.filter((step) => step.forceArgs !== undefined);

  it('there are some, so this check is not vacuous', () => {
    expect(declaring.map((step) => step.name)).not.toEqual([]);
  });

  it.each(declaring.map((step) => step.name))('%s', (name) => {
    const step = CHAIN_STEPS.find((candidate) => candidate.name === name)!;
    const scripts = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;
    const named = [...(scripts[name] ?? '').matchAll(/\b(scripts\/[\w./-]+\.(?:ts|mjs))/g)].map(([, file]) => file);
    expect(named, `${name} declares forceArgs and its npm script runs no scripts/ file, so nothing can read them`).not.toEqual([]);
    const text = named.map((file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8')).join('\n');
    const unread = (step.forceArgs ?? []).filter((flag) => !text.includes(`'${flag}'`));
    expect(unread, `${name} passes these under --all and ${named.join(', ')} never reads them`).toEqual([]);
  });
});

// The root vitest config lists its projects literally, because `check:specifiers` reads it as text and
// cannot read a computed list. This is the guard that the literal is the host suites and nothing else — a
// pack project appearing here would resolve workspace source instead of the published dist, silently.
describe('the root pool lists exactly the host suites', () => {
  it('matches UNIT_SUITES', async () => {
    const host = UNIT_SUITES.filter((suite) => suite.kind === 'host').map((suite) => `packages/${suite.dir}`);
    expect(await projectsOf('vitest.config.ts')).toEqual(host);
  });
});

/**
 * The cap the pooled run's width depends on, which nothing asserted.
 *
 * `poolOptions` is process-wide, so it belongs to the root config and a per-project copy is read by nobody
 * — `unit-suites.ts` records the same thing measured for `poolOptions.execArgv` one pool along. Both halves
 * matter here: without the root value the pool silently runs at full width, which is 52.4s against 48.2s
 * measured, and a per-package copy would look like the cap while doing nothing.
 */
describe('the integration pool runs at the width it says it does', () => {
  it('caps the workers in the config that is read for it', async () => {
    const pool = (await resolvedConfig('vitest.integration.config.ts')).test?.poolOptions;
    expect(pool?.threads?.maxThreads, 'threads').toBe('50%');
    expect(pool?.forks?.maxForks, 'forks').toBe('50%');
  });

  it('carries no per-project copy, which would be read by nobody', async () => {
    for (const project of await projectsOf('vitest.integration.config.ts')) {
      expect((await resolvedConfig(project)).test?.poolOptions, `${project} declares poolOptions, which is `
        + 'process-wide and set at the root: this one is inert and reads as protection').toBeUndefined();
    }
  });
});

// The other half of `forceArgs`: a step that keeps a cache must say so.
//
// The guard above checks that a step declaring `forceArgs` runs something that reads them. It cannot catch
// the case that actually happened — a step with a cache of its own and no `forceArgs` at all, where `--all`
// runs the step, the step consults its own stamps, finds nothing to do and returns green. Two unit pools
// did that with 2634 tests behind them.
//
// A step's runner reads stamps if it, or a `scripts/lib` module it imports, names one of the freshness
// functions. That is derivable, so it is derived rather than listed.
describe('a step whose runner reads stamps declares forceArgs', () => {
  /** Naming any of these means the runner consults a stamp store, so the chain's --all has to reach it */
  const STAMP_READERS = ['unitStaleReason', 'stalePackageUnits', 'ensurePackagesBuilt', 'poolStampFor'];

  /**
   * Steps that read stamps and take no `forceArgs` on purpose. An entry that stops applying is reported.
   */
  const KEEPS_ITS_CACHE_UNDER_ALL: Record<string, string> = {
    'packages:ensure': 'forcing it would turn the 18 nested ensurePackagesBuilt() calls a chain makes into 18 builds behind one lock; the packages keep their own content-addressed stamps, which package-freshness.spec.ts covers, and "regardless of its stamp" means the chain\'s stamps',
  };

  const scripts = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;

  /** The runner's own text, plus any `./lib` module it imports — where the freshness calls actually live */
  function runnerText(stepName: string): string {
    const named = [...(scripts[stepName] ?? '').matchAll(/\b(scripts\/[\w./-]+\.(?:ts|mjs))/g)].map(([, file]) => file);
    const seen = new Set(named);
    for (const file of named) {
      const full = path.join(REPO_ROOT, file);
      if (!fs.existsSync(full)) continue;
      for (const specifier of relativeSpecifiers(full)) {
        const target = resolveRelative(full, specifier);
        if (target !== undefined) seen.add(repoRelative(target));
      }
    }
    return [...seen].filter((file) => fs.existsSync(path.join(REPO_ROOT, file)))
      .map((file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8')).join('\n');
  }

  const readsStamps = CHAIN_STEPS.filter((step) => {
    const text = runnerText(step.name);
    return STAMP_READERS.some((fn) => text.includes(fn));
  });

  it('there are some, so this check is not vacuous', () => {
    expect(readsStamps.map((step) => step.name)).not.toEqual([]);
  });

  it.each(readsStamps.map((step) => step.name))('%s', (name) => {
    const step = CHAIN_STEPS.find((candidate) => candidate.name === name)!;
    if (KEEPS_ITS_CACHE_UNDER_ALL[name] !== undefined) {
      expect(step.forceArgs, `${name} is listed as keeping its cache under --all, so it must declare none`).toBeUndefined();
      return;
    }
    expect(step.forceArgs, `${name}'s runner consults its own stamps, so --all would run it and it would skip its work: give it forceArgs, or list it with why not`).toBeDefined();
  });

  it('lists no exception that has stopped reading stamps', () => {
    const stale = Object.keys(KEEPS_ITS_CACHE_UNDER_ALL).filter((name) => !readsStamps.some((step) => step.name === name));
    expect(stale, 'these no longer consult a stamp store; drop them').toEqual([]);
  });
});

/**
 * The chain runs every recorded artifact's check.
 *
 * An `<artifact>:check` that nothing runs is a recorded file free to go stale with every gate green, and with
 * CI off the chain is the only gate. Two of them were in exactly that state until 2026-09-27 — `schema:check`,
 * which holds the manifest schema published with the SDK, and `facade:check` — each named only by
 * `.github/workflows/ci.yml`, whose triggers are commented out. `packages:check` had been the same. Three
 * instances of one thing nobody could see is what makes this a check rather than a sweep somebody repeats.
 *
 * It asks what a step *invokes*, not what its text mentions: `check-import-specifiers.ts` prints `api:check` in
 * a message, and a search over the reachable text would read that as the chain running it. The walk is
 * `reachableText` from `scripts/lib/npm-scripts.ts`, which `check:tiers` uses for its own question — one
 * follower, so the two cannot disagree about what a step reaches.
 *
 * A check counts as run when its own `<workspace>:<name>` is invoked **or** the bare `<name>` is: root
 * `lint:check` fans out with `-ws`, which no `-w <name>` pattern can follow, and an artifact's exception is
 * about the artifact rather than about each workspace the root script delegates to.
 */
/**
 * A recorded artifact has both halves.
 *
 * The convention is that `<artifact>:check` and `<artifact>:update` carry the same noun, and root CLAUDE.md
 * gives the reason: "an artifact with only an update is one nothing will notice has gone stale". Until this,
 * that rule was prose — `sdk-modules:update` had no check for as long as it has existed, and the only thing
 * standing between it and a silent staleness was a spec in another package that happens to compare the file.
 *
 * One direction only. Requiring an `:update` for every `:check` would buy an exceptions list and nothing
 * else: `lint:check` pairs with `lint:fix` and `packages:check` with `packages:build`, both under the
 * `<action>:<variant>` shape, and neither records a file that can go stale.
 */
describe('a recorded artifact has both halves', () => {
  const scriptsByManifest = (): { where: string; scripts: Record<string, string> }[] =>
    [{ where: 'root', file: path.join(REPO_ROOT, 'package.json') },
      ...PACKAGE_DIRS.map((dir) => ({ where: dir, file: path.join(REPO_ROOT, 'packages', dir, 'package.json') }))]
      .map(({ where, file }) => ({ where, scripts: (JSON.parse(fs.readFileSync(file, 'utf-8')) as
        { scripts?: Record<string, string> }).scripts ?? {} }));

  it('gives every `:update` the `:check` that notices it has gone stale', () => {
    const manifests = population('the manifests to read', scriptsByManifest(), { atLeast: 10 });
    const updates = manifests.flatMap(({ where, scripts }) => Object.keys(scripts)
      .filter((name) => name.endsWith(':update'))
      .map((name) => ({ where, noun: name.slice(0, -':update'.length), scripts })));
    expect(updates.length, 'no `:update` script was found, so this would pass over nothing').toBeGreaterThan(3);
    const unchecked = updates
      .filter(({ noun, scripts }) => scripts[`${noun}:check`] === undefined)
      .map(({ where, noun }) => `${where}'s ${noun}:update`);
    expect(unchecked, 'these rewrite a committed file and nothing named for that artifact re-derives it. Add '
      + 'the `:check` half — it may be a one-line wrapper for a spec that already compares it, as '
      + 'seed-parity:check is').toEqual([]);
  });
});

describe("the chain runs every artifact's check", () => {
  /** A `:check` script the chain does not run, and why. An entry that stops applying is reported. */
  const NOT_RUN_BY_THE_CHAIN: Record<string, string> = {
    'api:check': 'API Extractor over three packages, 55s; `api:stamp` is its 0.6s proxy inside typecheck, and '
      + 'api-reports.ts checks that proxy against itself, which is what catches an input nobody listed',
    // These two are commands over a rule a spec already asserts, so the artifact is checked and the script is
    // a way to ask by hand. Both say so themselves: `spec-cost.ts` records that `scripts/lib/spec-cost.ts`
    // holds what it and `suite-split.spec.ts` share, "so a spec and this command cannot disagree".
    'seed-parity:check': 'a wrapper for `npm test -- tests/seeds`; those specs run in test:unit:pack',
    'sdk-modules:check': 'a wrapper for `sdk-bridge-drift.spec.ts`, which compares the generated file against a fresh render; it runs in test:unit:host',
    'flow-export:check': 'a wrapper for `npm test -- tests/extensions/steps/export-example.spec.ts`; that spec runs in test:unit:pack, where it compares the flow DSL example rather than recording it',
    'spec-cost:check': 'reads the records and runs nothing; suite-split.spec.ts asserts the same rule from '
      + 'scripts/lib/spec-cost.ts, and it runs in test:unit:host',
  };

  /** Every `<artifact>:check` in the repo, as the label of the manifest declaring it and the script's name */
  const checkScripts = (): { where: string; name: string }[] => {
    const manifests = [path.join(REPO_ROOT, 'package.json'),
      ...PACKAGE_DIRS
        .map((dir) => path.join(REPO_ROOT, 'packages', dir, 'package.json'))
        .filter((file) => fs.existsSync(file))];
    return manifests.flatMap((file) => {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf-8')) as { name?: string; scripts?: Record<string, string> };
      const where = file === path.join(REPO_ROOT, 'package.json') ? 'root' : pkg.name ?? file;
      return Object.keys(pkg.scripts ?? {}).filter((name) => name.endsWith(':check')).map((name) => ({ where, name }));
    });
  };

  const invokedByTheChain = (): Set<string> => {
    const all = rootScripts();
    const invoked = new Set<string>();
    for (const step of CHAIN_STEPS) for (const name of reachableText(step.name, all).invoked) invoked.add(name);
    // `reachableText` follows `npm run` one level, out of a script's own text, and deliberately not out of the
    // files it runs — a text scan cannot tell a command from a mention, and a loose answer here would say a
    // check runs when nothing runs it. `typecheck` moved its commands into a module, so the module says what it
    // runs rather than being read for it.
    for (const leg of TYPECHECK_LEGS) {
      const [, name, workspace] = /npm run ([\w:-]+)(?:.*-w\s+(\S+))?/.exec(leg.command) ?? [];
      if (name === undefined) continue;
      invoked.add(name);
      if (workspace !== undefined) invoked.add(`${workspace}:${name}`);
    }
    return invoked;
  };

  it('leaves none of them unrun', () => {
    const invoked = invokedByTheChain();
    const unrun = checkScripts()
      .filter(({ where, name }) => !invoked.has(name) && !invoked.has(`${where}:${name}`))
      .filter(({ name }) => NOT_RUN_BY_THE_CHAIN[name] === undefined)
      .map(({ where, name }) => `${where}'s ${name}`);
    expect(unrun, 'nothing in the chain runs these, so what they record can go stale with every gate green: '
      + 'add them to a step that already reads what they read, or list them with why not').toEqual([]);
  });

  it('lists no exception that has stopped applying', () => {
    const declared = checkScripts();
    const invoked = invokedByTheChain();
    const stale = Object.keys(NOT_RUN_BY_THE_CHAIN).flatMap((name) => {
      const found = declared.filter((script) => script.name === name);
      if (found.length === 0) return [`${name}: no package declares it any more`];
      return found.every(({ where }) => invoked.has(name) || invoked.has(`${where}:${name}`))
        ? [`${name}: the chain runs it now, so it needs no exception`] : [];
    });
    expect(stale).toEqual([]);
  });

  /** What stops the cases above passing over an empty list */
  it('finds the checks to ask about', () => {
    const found = checkScripts();
    expect(found.length).toBeGreaterThan(5);
    expect(found.map(({ name }) => name), 'schema:check is one of the two this check was written for')
      .toContain('schema:check');
  });
});

/**
 * A build unit declares the modules its build script imports.
 *
 * `BuildUnit.inputs` is a hand-written list of what a build reads, and a list of someone else's inputs is a
 * guess — the same shape that let `api:stamp` pass over an input nobody had listed. Measured 2026-09-27: the
 * three `compiled()` units declared `scripts/build-package.ts` and not
 * `@abuddy/host/build/published-manifest`, which it imports and which derives the manifest they stage. Editing
 * that module left all three staged trees stale while every stamp read fresh.
 *
 * Derived, so it holds for the next module too: follow the script's imports and require the closure to be
 * inside what the unit declares. A subset check, like `gives every step the files its own script names` above —
 * it proves a unit reads what it declares, never that it declares nothing extra, which over-declaring is the
 * harmless direction.
 */
describe('a build unit declares the modules its build script imports', () => {
  /** The options `scripts/tsconfig.json` compiles these scripts with, so the walk resolves as they do */
  const RESOLUTION: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    // How a repo script reaches `@abuddy/host/build/…` at all: the condition names each package's source
    customConditions: ['@abuddy/source'],
    allowImportingTsExtensions: true,
  };

  /** A module of this repo, as against a dependency or a built copy of one */
  const firstParty = (file: string): boolean =>
    file.startsWith(REPO_ROOT + path.sep) && !file.split(path.sep).includes('node_modules');

  /**
   * Every first-party module these entries import, transitively, repo-relative.
   *
   * `ts.preProcessFile` rather than a parse: it is TypeScript's own scanner for exactly this question, and it
   * reads `import`, `export … from`, `import()` and `require()` without building a program.
   */
  const closureOf = (entries: readonly string[]): string[] => {
    const seen = new Set<string>();
    const queue = [...entries];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file) || !fs.existsSync(file)) continue;
      seen.add(file);
      for (const { fileName } of ts.preProcessFile(fs.readFileSync(file, 'utf-8'), true, true).importedFiles) {
        const resolved = ts.resolveModuleName(fileName, file, RESOLUTION, ts.sys).resolvedModule?.resolvedFileName;
        if (resolved !== undefined && firstParty(resolved)) queue.push(resolved);
      }
    }
    return [...seen].map(repoRelative);
  };

  /**
   * The script to walk from, `buildScriptFor` (`@abuddy/host/build/packages-built`) — a workspace's own
   * `build:package`, and deliberately **not** the unit's declared inputs, which are the thing under test.
   * Deriving the entry from that list made this case vacuous, and a mutation found it: drop
   * `scripts/build-package.ts` from `compiled()` and there was no entry left to walk from, so the check passed
   * for having nothing to check. `package-freshness.spec.ts` reads the same function to decide which units
   * inline host source, so the two cannot disagree about how a unit is built.
   */
  const buildScriptOf = (workspace: string): string => path.join(REPO_ROOT, buildScriptFor(workspace));

  /**
   * Not `coveredBy` above: that one takes a chain step, whose inputs are repo-relative by design, and joins
   * them to the root. A `BuildUnit`'s are absolute, and `path.join` does not reset on an absolute second
   * argument — it doubles the root, covers nothing, and this case then reports every module including its own
   * entry. Which is what it did.
   */
  const unitCovers = (unit: BuildUnit): Set<string> =>
    new Set(unit.inputs.flatMap((input) => inputFiles(input)));

  it.each(Object.keys(BUILD_UNITS))('%s', (workspace) => {
    const covered = unitCovers(BUILD_UNITS[workspace]!);
    const missing = closureOf([buildScriptOf(workspace)])
      // A module that decides *whether* to build cannot change what the build emits, so it is deliberately not
      // an input — `package-freshness.spec.ts` refuses one, and this demanded one on the day it landed. That
      // spec is also where an entry going stale shows up, since it fails the moment a unit names one; only one
      // of the two entries is even reachable from a build script, the other being the command over them.
      .filter((file) => NOT_A_BUILD_INPUT[file] === undefined)
      .filter((file) => !covered.has(file));
    expect(missing,
      `${workspace}'s build imports these and does not declare them, so editing one leaves its output stale while its stamp reads fresh`)
      .toEqual([]);
  });

  /**
   * An entry nobody reaches is a claim nobody revisits, which every other exception table in this repo reports.
   *
   * Two ways to qualify, because the two entries qualify differently: `packages-built.ts` is *imported* by a
   * build script, and `scripts/ensure-packages-built.ts` is the command that calls the builds — no build script
   * imports it, and `packages:ensure` declares it as its own input. An entry that is neither is describing
   * nothing. Getting this predicate wrong is how it was first written: requiring an import reported the command.
   */
  it('lists no NOT_A_BUILD_INPUT entry that nothing reaches', () => {
    const imported = new Set(Object.keys(BUILD_UNITS).flatMap((workspace) => closureOf([buildScriptOf(workspace)])));
    const declared = new Set(CHAIN_STEPS.flatMap((step) => step.inputs));
    const orphans = Object.keys(NOT_A_BUILD_INPUT)
      .filter((file) => !imported.has(file) && !declared.has(file))
      .map((file) => `${file}: no build script imports it and no chain step declares it`);
    expect(orphans, 'an exception for something nothing reads describes nothing').toEqual([]);
  });

  /** What stops the case above passing by walking nothing */
  it('follows each build script past itself', () => {
    const shallow = Object.keys(BUILD_UNITS).flatMap((workspace) => {
      const closure = closureOf([buildScriptOf(workspace)]);
      return closure.length > 1 ? [] : [`${workspace}'s closure is ${closure.length} files`];
    });
    expect(shallow, 'a closure of one file is the entry alone, which means the walk resolved nothing').toEqual([]);
  });
});

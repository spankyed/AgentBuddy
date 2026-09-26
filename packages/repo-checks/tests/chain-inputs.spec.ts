// Every tracked source file is an input to some chain step, or is named here with a reason. Caching a step
// on its declared inputs is only as sound as that list: a file no step names is a file whose change skips
// every check, silently, and with CI off the chain is the only gate. `BUILD_UNITS` never needed this —
// it covers five packages whose builds read their own trees — where a chain step reads whatever its script
// happens to reach, which is not visible from the step's name.
//
// It asks git rather than walking the tree, so an ignored file is not mistaken for an untracked source, and
// resolves a step's inputs through `inputFiles` — the walk a fingerprint is taken over — so the guard and
// the cache key cannot disagree about what an input covers.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputFiles, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, INTEGRATION_SUITES, SUITE_READS, suiteInputs, type ChainStep } from '../../../scripts/lib/chain-steps.ts';
import { UNIT_SUITES, type UnitSuite } from '../../../scripts/lib/unit-suites.ts';
import { poolUnitFor } from '../../../scripts/lib/unit-pool.ts';

/** Tracked code no chain step reads, and why. An entry that stops applying is reported, not ignored. */
const NOT_A_CHAIN_INPUT: Record<string, string> = {
  'electron-builder.mjs': 'packaging config, read by npm run build-prod — which is not a chain step',
  'build/prod/diagnostics.mjs': 'runs inside a packaged app, not during any check',
  'build/prod/verify-node-modules.mjs': 'packaging check; the chain has its own in the cli suite',
  'packages/abuddy-ears/bench/ears.bench.ts': 'npm run bench -w @abuddy/ears, measured against its own baseline',
  'docs/archive/research/claude_code_headless_ex.ts': 'an archived transcript that happens to end in .ts',
  // The production packaging and release path. The chain builds the app (`build:app`) and never packages,
  // signs or releases it, so none of this runs in any step — listed per file rather than as a `build/`
  // prefix so that something chain-relevant landing there has to be noticed.
  'build/build.sh': 'npm run build-prod; packaging, which no chain step does',
  'build/prod/clean.sh': 'part of build-prod',
  'build/prod/run.sh': 'part of build-prod',
  'build/prod/verify-signing.sh': 'checks a signed artifact, which only build-prod produces',
  'build/release/release.sh': 'the release path, which the chain never runs',
  'build/release/beta-tag.sh': 'the release path; its rule is covered by release-beta-rule.test.sh',
  'build/release/unrelease.sh': 'the release path',
  'build/resources/gen-icons.sh': 'regenerates committed icons by hand',
  'native/speech/macos/build.sh': 'builds the native speech helper, which build-prod invokes',
};

// `.sh` included: three of the chain's steps *are* shell scripts, so leaving the extension out meant the
// coverage claim skipped the files that drive tier 3 entirely.
const CODE = /\.(ts|tsx|vue|mts|cts|mjs|cjs|js|sh)$/;

const trackedCode = (): string[] =>
  execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\n').filter((file) => file !== '' && CODE.test(file));

/** Every tracked file the steps' inputs reach, resolved the way a fingerprint resolves them */
const coveredBy = (steps: readonly { inputs: readonly string[] }[]): Set<string> => {
  const covered = new Set<string>();
  for (const step of steps) for (const input of step.inputs) for (const file of inputFiles(path.join(REPO_ROOT, input))) covered.add(file);
  return covered;
};

describe('the chain reads every source file', () => {
  it('has no tracked code that no step names', () => {
    const covered = coveredBy(CHAIN_STEPS);
    const missing = trackedCode().filter((file) => !covered.has(file) && !(file in NOT_A_CHAIN_INPUT));
    expect(missing, 'add these to a step\'s inputs, or to NOT_A_CHAIN_INPUT with a reason').toEqual([]);
  });

  // A list of exceptions is only honest while each one is still an exception
  it('lists no exception that has stopped applying', () => {
    const covered = coveredBy(CHAIN_STEPS);
    const stale = Object.keys(NOT_A_CHAIN_INPUT).filter((file) => {
      if (!fs.existsSync(path.join(REPO_ROOT, file))) return true;
      return covered.has(file);
    });
    expect(stale, 'these are gone or are now a step input; drop them from NOT_A_CHAIN_INPUT').toEqual([]);
  });

  // Coverage is repo-wide: it proves *some* step reads a file, not that the right one does. Steps overlap
  // honestly — `typecheck` reads `tests/` because it compiles the E2E specs — so dropping `tests/e2e` from
  // the E2E step leaves it covered and the check above green. This is the per-step half, and it is what can
  // be derived: a path the step's own npm script names is a path that step reads, so it must be an input.
  it('gives every step the files its own script names', () => {
    const scripts = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;
    const missing: string[] = [];
    for (const step of CHAIN_STEPS) {
      const covered = coveredBy([step]);
      const command = scripts[step.name === 'test' ? 'test' : step.name] ?? '';
      for (const [, named] of command.matchAll(/\b((?:tests|scripts)\/[\w./-]+\.(?:sh|ts|mjs))/g)) {
        if (!covered.has(named)) missing.push(`${step.name} runs ${named} and does not declare it`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('gives every step inputs that exist', () => {
    const empty = CHAIN_STEPS.filter((step) => step.inputs.every((input) => !fs.existsSync(path.join(REPO_ROOT, input))));
    expect(empty.map((step) => step.name), 'a step whose every input is missing is cached on nothing').toEqual([]);
  });
});

// A suite whose own specs name build output must declare that it reads it. This is deliberately a subset
// check and not an equality one: a scan of spec text can prove a suite reads the tree, never that it does
// not. `@app/api`'s specs never name the pack's `dist` — they boot the app runtime and host code resolves
// the path — so an equality check called it independent, it ran beside `compile` under three lanes, and it
// failed. `SUITE_READS`' doc comment carries the measurement that is the authority, and the command that
// reproduces it. What this catches is the cheap half: a spec that starts naming the tree outright.
describe('a unit suite whose specs name build output declares it', () => {
  // Every spec in the suite except this one. The patterns below are written out here, so scanning this
  // file finds them and reports whichever suite happens to hold it — which, since the move to
  // @app/repo-checks, is a suite that reads neither tree. A pattern's definition is not evidence about
  // anyone.
  const sources = (dir: string): string[] => {
    const root = path.join(REPO_ROOT, 'packages', dir, 'tests');
    if (!fs.existsSync(root)) return [];
    return inputFiles(root)
      .map((file) => path.join(REPO_ROOT, file))
      .filter((file) => file !== import.meta.filename)
      .map((file) => fs.readFileSync(file, 'utf-8'));
  };
  // Naming `@abuddy/testing` means loading its built bundle — except in `@abuddy/testing`'s own suite, where
  // its specs name it because it is what they are about, and import its `src/` rather than the bundle. A
  // detector must not read a package's own name as evidence about it; the same mistake as scanning the file
  // that declares these patterns.
  const readsPackages = (dir: string, texts: string[]): boolean => {
    const pretest = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf-8')) as
      { scripts?: Record<string, string> }).scripts?.pretest ?? '';
    if (pretest.includes('ensure-packages-built')) return true;
    return dir !== 'abuddy-testing' && texts.some((text) => text.includes('@abuddy/testing'));
  };
  const readsPack = (texts: string[]): boolean =>
    texts.some((text) => /PACK_DIR|default-setup['"`, )\]]*,?\s*['"`]dist|default-setup\/dist/.test(text));

  it('leaves none of them undeclared', () => {
    const undeclared: string[] = [];
    for (const { dir } of UNIT_SUITES) {
      const texts = sources(dir);
      const declared = SUITE_READS[dir] ?? {};
      if (readsPackages(dir, texts) && declared.packages !== true) undeclared.push(`${dir} reads the built packages`);
      if (readsPack(texts) && declared.pack !== true) undeclared.push(`${dir} reads the built-in pack's dist`);
    }
    expect(undeclared, 'add these to SUITE_READS in scripts/lib/chain-steps.ts').toEqual([]);
  });

  // There is deliberately no check that a declared reader also needs the step that writes what it reads:
  // `POOL_STEPS` derives `needs` from this same table, so the two cannot disagree and such a test could
  // never fail. The declaration is the single point of truth, which is why getting it right is measured.

});

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

    const withBuild = fs.readdirSync(path.join(REPO_ROOT, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const manifest = path.join(REPO_ROOT, 'packages', entry.name, 'package.json');
        if (!fs.existsSync(manifest)) return [];
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

// Every gitignored input has to be accounted for.
//
// Git already knows what is generated, which makes it the one source of truth nobody has to maintain. A
// gitignored file among a step's inputs was written by *something*, and there are only two honest cases:
// a step you depend on declares it as an output, or you declare that you read around it. Anything else is
// one of the two failures this repo has now produced three times — an undeclared dependency, which races
// under lanes, or churn that stops the step ever caching.
//
// This is the preventive half. `willNotCache` in the chain's summary is the empirical half, and catches
// what no declaration can anticipate; this catches what can be known before anything runs.
describe('a gitignored input belongs to someone', () => {
  const ignoredRoots = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
    { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\n').filter(Boolean).map((entry) => entry.replace(/\/$/, ''));
  const isIgnored = (file: string): boolean => ignoredRoots.some((root) => file === root || file.startsWith(`${root}/`));

  const byName = new Map(CHAIN_STEPS.map((step) => [step.name, step]));
  const ancestorsOf = (name: string, seen = new Set<string>()): Set<string> => {
    for (const need of byName.get(name)?.needs ?? []) {
      if (seen.has(need)) continue;
      seen.add(need);
      ancestorsOf(need, seen);
    }
    return seen;
  };

  it.each(CHAIN_STEPS.map((step) => step.name))('%s', (name) => {
    const step = byName.get(name)!;
    const accountedFor = [
      ...step.outputs ?? [],
      ...step.excludes ?? [],
      ...[...ancestorsOf(name)].flatMap((need) => byName.get(need)?.outputs ?? []),
    ];
    const unaccounted = [...new Set(step.inputs.flatMap((input) => inputFiles(path.join(REPO_ROOT, input))))]
      .filter((file) => isIgnored(file))
      .filter((file) => !accountedFor.some((owned) => file === owned || file.startsWith(`${owned}/`)));

    expect([...new Set(unaccounted.map((file) => file.split('/').slice(0, 5).join('/')))],
      `${name} hashes generated files nobody declares: depend on the step that writes them, or list them in \`excludes\` with why this step reads around them`)
      .toEqual([]);
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
    const fingerprinted = new Set(projects(kind).flatMap((suite) => poolUnitFor(suite).inputs.map((input) => path.relative(REPO_ROOT, input))));
    const unseen = poolStep(kind).inputs.filter((input) => !fingerprinted.has(input));
    expect(unseen, 'the step would go stale for these and every project would still read fresh, so it would run '
      + 'and test nothing: put them in suiteInputs, where both cache layers read them').toEqual([]);
  });
});

// One chain step runs every expensive half, and which packages those are is derived from the configs each
// one has. The step's inputs follow that derivation; the npm script it runs cannot, being text — so a
// package that gains an integration config would have its specs hashed into the step's cache key and never
// run. This is the half that has to be checked rather than derived.
describe('the integration step runs every suite that has an expensive half', () => {
  it('names them all in test:integration', () => {
    const scripts = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;
    const named = [...scripts['test:integration'].matchAll(/-w (\S+)/g)].map(([, name]) => name);
    expect(named.sort()).toEqual(INTEGRATION_SUITES.map((suite) => suite.workspace).sort());
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
  it('matches UNIT_SUITES', () => {
    const config = fs.readFileSync(path.join(REPO_ROOT, 'vitest.config.ts'), 'utf-8');
    const listed = [...config.matchAll(/^\s*'(packages\/[\w-]+)',$/gm)].map(([, dir]) => dir);
    const host = UNIT_SUITES.filter((suite) => suite.kind === 'host').map((suite) => `packages/${suite.dir}`);
    expect(listed).toEqual(host);
  });
});

// A step that reads what another step writes has to depend on it.
//
// `orderedSteps` sorts on `needs` alone, so declaring the path in `inputs` says nothing about ordering: the
// two can run in either order, or together in a lane. This existed, caught `test:integration` reading the
// built-in pack's dist while depending only on `packages:ensure`, and was then deleted by accident in
// `e0c22075f` while that section was being rewritten. It is back, and wider.
//
// Wider because the version that was deleted asked only whether an input was *at or under* another step's
// output. The case it could not see is an input that *contains* one — `typecheck` declaring `tests` while
// the E2E suite writes `tests/screenshots` — and that is exactly the defect that then went unnoticed for a
// day, costing 34s of every warm chain. Both directions are the same mistake seen from either end.
//
// `excludes` is honoured: a step that declares it reads around a tree is not reading it.
describe('a step that reads what another writes depends on it', () => {
  const byName = new Map(CHAIN_STEPS.map((step) => [step.name, step]));
  const ancestorsOf = (name: string, seen = new Set<string>()): Set<string> => {
    for (const need of byName.get(name)?.needs ?? []) {
      if (seen.has(need)) continue;
      seen.add(need);
      ancestorsOf(need, seen);
    }
    return seen;
  };
  /** One path covers another when they are equal or the second lies under the first */
  const covers = (outer: string, inner: string): boolean => outer === inner || inner.startsWith(`${outer}/`);

  it('names the dependency, not just the path', () => {
    const missing: string[] = [];
    for (const step of CHAIN_STEPS) {
      const ancestors = ancestorsOf(step.name);
      for (const producer of CHAIN_STEPS) {
        if (producer.name === step.name || ancestors.has(producer.name)) continue;
        for (const output of producer.outputs ?? []) {
          // Read around it deliberately, which is what `excludes` says
          if ((step.excludes ?? []).some((excluded) => covers(excluded, output))) continue;
          // Either end: the input is under the output, or the input is a tree containing it
          const touching = step.inputs.filter((input) => covers(output, input) || covers(input, output));
          if (touching.length > 0) missing.push(`${step.name} declares ${touching[0]}, which ${producer.name} writes (${output}), and does not need it`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
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
      for (const [, rel] of fs.readFileSync(full, 'utf-8').matchAll(/from '(\.\/[\w./-]+\.ts)'/g)) {
        seen.add(path.join(path.dirname(file), rel));
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

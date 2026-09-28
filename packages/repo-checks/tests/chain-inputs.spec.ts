// Every tracked source file is an input to some chain step, or is named here with a reason. Caching a step
// on its declared inputs is only as sound as that list: a file no step names is a file whose change skips
// every check, silently, and with CI off the chain is the only gate. `BUILD_UNITS` never needed this —
// it covers five packages whose builds read their own trees — where a chain step reads whatever its script
// happens to reach, which is not visible from the step's name.
//
// It asks git rather than walking the tree, so an ignored file is not mistaken for an untracked source, and
// resolves a step's inputs through `inputFiles` — the walk a fingerprint is taken over — so the guard and
// the cache key cannot disagree about what an input covers.
//
// `BUILD_UNITS` gets the same treatment at the bottom of this file, and used to be excused from it here on
// the grounds that it "covers five packages whose builds read their own trees". That was not true: a build
// script imports modules, and three units were missing the one their staging is derived from.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { BUILD_UNITS, buildScriptFor, covers, inputFiles, NOT_A_BUILD_INPUT, repoRelative, REPO_ROOT, type BuildUnit } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, INTEGRATION_SUITES, SUITE_READS, suiteInputs, type ChainStep } from '../../../scripts/lib/chain-steps.ts';
import { UNIT_SUITES, type UnitSuite } from '../../../scripts/lib/unit-suites.ts';
import { reachableText, rootScripts } from '../../../scripts/lib/npm-scripts.ts';
import { TYPECHECK_LEGS } from '../../../scripts/lib/typecheck-legs.ts';
import { poolUnitFor } from '../../../scripts/lib/unit-pool.ts';

/** Tracked code no chain step reads, and why. An entry that stops applying is reported, not ignored. */
const NOT_A_CHAIN_INPUT: Record<string, string> = {
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
  // be derived: a path the step *reaches* is a path that step reads, so it must be an input.
  //
  // Reaches, not names. This used to scan the step's own script text for a `tests/` or `scripts/` path, which
  // sees nothing through a delegation: `compile` runs `npm run facade:check -w @app/default-setup`, whose
  // script names `scripts/facade-report.ts`, and that went undeclared for a commit. `reachableText` follows
  // `npm run`, `-w` and the files a script names, and is the same walk `check:tiers` uses for its own
  // question.
  /**
   * A linter walks a directory, so the files it reads are not the files its command names — `oxlint .` names one
   * path and reads a hundred. `reachableText` answers what a script *names*, which is the right answer to its own
   * question and no answer to this one, so the case above sees nothing here: it also cannot follow into
   * `TYPECHECK_LEGS`, because the legs are data this imports rather than text a script spells.
   *
   * Measured before this existed: the root `lint:check` grew from `oxlint scripts tests` to `oxlint .` minus two
   * directories, which took in three packaging modules that `typecheck` did not declare — so an unused binding in
   * `build/prod/diagnostics.mjs` failed `lint:check` while the chain planned `typecheck` as cached.
   *
   * `lint:check` lints in two passes and both are derived here. The root one is `oxlint .` minus `docs/**` and
   * the CLI's scaffold templates (`lint-scope.spec.ts` holds that second exclusion, which nothing else reads —
   * this case does not, because `typecheck` declares `templates` among its inputs whether it is linted or not);
   * the other is the script run in each workspace, from that package's directory — which is why a
   * target resolves against a base rather than the repo root. Expanding a script's text is not enough to see the
   * second: the root script's own first clause *is* the fan-out, and `expanded` substitutes each `npm run` once,
   * so the workspace passes stayed invisible and a package-root `.mjs` no step declared went unnoticed until
   * someone read the command by hand.
   *
   * Everything a pass depends on is derived from the thing that decides it, because a pass this cannot see is a
   * pass nothing checks and there is no assertion that catches the *absence* of one. So the workspaces come from
   * the root `workspaces` field rather than a listing of `packages/` that agrees with it today, and both
   * spellings of the fan-out are followed — `-ws` over all of them and `-w <name>` over the ones it names.
   *
   * Derived from the command, not restated: the targets and the `--ignore-pattern`s are parsed out of the same
   * string the leg runs, so narrowing the lint scope narrows what this demands. A shape it cannot read fails
   * rather than passing over whatever it did not understand. The one thing it reads and discards is
   * `--ignore-path .gitignore`, because everything it considers comes from `git ls-files` and a gitignored file
   * is not tracked; any other ignore file is exclusions it cannot account for, and fails.
   *
   * The renderer's `&& eslint .` half is not derived — its ignores live in `eslint.config.ts`, not in the
   * command — and it needs no derivation: it walks the tree the oxlint call in that same script already covers.
   */
  it('gives the step that lints the files its linter walks', () => {
    const all = rootScripts();
    /** A leg's command with each `npm run <name>` it spells expanded once, which is where the oxlint call lives */
    const expanded = (command: string): string => command.replace(/npm run ([\w:-]+)/g, (whole, name: string) => all[name] ?? whole);
    const VALUED = new Set(['-D', '--deny', '-A', '--allow', '-W', '--warn', '-c', '--config', '--ignore-path', '--ignore-pattern']);
    // What oxlint parses, which is narrower than `CODE`: a shell script is tracked code and no linter's input
    const LINTS = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx|vue)$/;
    const lintable = trackedCode().filter((file) => LINTS.test(file));
    const clauses = (command: string): string[] => command.split('&&');
    const isOxlintCall = (clause: string): boolean => /(^|\s)oxlint(\s|$)/.test(clause);

    /** The tracked files one oxlint call walks. `base` is the package directory it runs from, empty at the root */
    const walkedBy = (call: string, base: string): Set<string> => {
      const tokens = call.trim().split(/\s+/);
      const args = tokens.slice(tokens.indexOf('oxlint') + 1);
      const targets: string[] = [];
      const ignores: string[] = [];
      for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]!;
        if (VALUED.has(arg)) {
          const value = args[i + 1];
          expect(value, `\`${arg}\` ends \`${call.trim()}\` with nothing to read`).toBeDefined();
          if (arg === '--ignore-pattern') ignores.push(value!.replace(/^['"]|['"]$/g, ''));
          if (arg === '--ignore-path') expect(value, `this only reads \`--ignore-path .gitignore\`, whose exclusions are already absent from git ls-files`).toBe('.gitignore');
          i += 1;
          continue;
        }
        if (!arg.startsWith('-')) targets.push(arg);
      }
      expect(targets, `no target read out of \`${call.trim()}\``).not.toEqual([]);
      const under = (relative: string): string => (relative === '.' ? base : base === '' ? relative : `${base}/${relative}`);
      const prefixes = targets.map(under);
      const ignored = ignores.map((pattern) => {
        const dir = /^([\w./-]+)\/\*\*$/.exec(pattern)?.[1];
        expect(dir, `this only reads a \`dir/**\` ignore pattern, and got \`${pattern}\``).toBeDefined();
        return `${under(dir!)}/`;
      });
      const walked = new Set<string>();
      for (const file of lintable) {
        if (!prefixes.some((prefix) => prefix === '' || file === prefix || file.startsWith(`${prefix}/`))) continue;
        if (ignored.some((prefix) => file.startsWith(prefix))) continue;
        walked.add(file);
      }
      return walked;
    };

    const rootManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { workspaces?: readonly string[] };
    const workspaces = (rootManifest.workspaces ?? []).flatMap((glob) => {
      const dir = /^([\w./-]+)\/\*$/.exec(glob)?.[1];
      expect(dir, `this only reads a \`dir/*\` workspace glob, and got \`${glob}\``).toBeDefined();
      return fs
        .readdirSync(path.join(REPO_ROOT, dir!), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(REPO_ROOT, dir!, entry.name, 'package.json')))
        .map((entry) => `${dir}/${entry.name}`);
    });
    expect(workspaces, 'the root `workspaces` field named none, so every workspace pass would be invisible').not.toEqual([]);
    const manifests = new Map(workspaces.map((workspace) => [
      workspace,
      JSON.parse(fs.readFileSync(path.join(REPO_ROOT, workspace, 'package.json'), 'utf-8')) as { name?: string; scripts?: Record<string, string> },
    ]));

    /** The script a clause fans out, and the workspaces it reaches; `undefined` when the clause fans out nothing */
    const fanOut = (clause: string): { readonly script: string; readonly at: readonly string[] } | undefined => {
      const script = /npm run ([\w:-]+)/.exec(clause)?.[1];
      if (script === undefined) return undefined;
      if (/(^|\s)(-ws|--workspaces)(\s|$)/.test(clause)) return { script, at: workspaces };
      const named = [...clause.matchAll(/(?:^|\s)(?:-w|--workspace)\s+(\S+)/g)].map((match) => match[1]!);
      if (named.length === 0) return undefined;
      return {
        script,
        at: named.map((one) => {
          const found = workspaces.find((workspace) => manifests.get(workspace)!.name === one);
          expect(found, `\`-w ${one}\` names no workspace`).toBeDefined();
          return found!;
        }),
      };
    };

    const passes: { readonly at: string; readonly call: string; readonly files: Set<string> }[] = [];
    for (const leg of TYPECHECK_LEGS) {
      for (const clause of clauses(expanded(leg.command))) {
        if (isOxlintCall(clause)) passes.push({ at: '', call: clause, files: walkedBy(clause, '') });
        const fan = fanOut(clause);
        if (fan === undefined) continue;
        for (const workspace of fan.at) {
          const script = manifests.get(workspace)!.scripts?.[fan.script];
          if (script === undefined) continue;
          for (const call of clauses(script).filter(isOxlintCall)) passes.push({ at: workspace, call, files: walkedBy(call, workspace) });
        }
      }
    }

    // Per pass, never per total: the workspace passes are nine tenths of the files, so a floor over the sum
    // would be cleared by the root pass alone if the fan-out silently stopped expanding — which is the way
    // this went wrong before it derived the fan-out at all.
    for (const pass of passes) {
      expect(pass.files.size, `\`${pass.call.trim()}\`${pass.at === '' ? '' : ` in ${pass.at}`} derived no file, so it demands nothing`).toBeGreaterThan(0);
    }
    expect(passes.some((pass) => pass.at === ''), 'no root oxlint call was derived').toBe(true);
    expect(passes.some((pass) => pass.at !== ''), 'no workspace oxlint call was derived — the fan-out stopped being followed').toBe(true);

    const linted = new Set(passes.flatMap((pass) => [...pass.files]));
    const step = CHAIN_STEPS.find((candidate) => candidate.name === 'typecheck')!;
    const covered = coveredBy([step]);
    const missing = [...linted].filter((file) => !covered.has(file)).sort();
    expect(missing, 'typecheck runs lint over these and declares none of them, so it caches over their changes').toEqual([]);
  });

  it('gives every step the files its script reaches', () => {
    const all = rootScripts();
    const missing = CHAIN_STEPS.flatMap((step) => {
      const covered = coveredBy([step]);
      return [...reachableText(step.name, all).files]
        // A module that only decides *whether* to do the work cannot change what the step accepts, so a step
        // reaching one need not declare it — the same list `package-freshness.spec.ts` reads
        .filter((file) => NOT_A_BUILD_INPUT[file] === undefined)
        .filter((file) => !covered.has(file))
        .map((file) => `${step.name} reaches ${file} and does not declare it`);
    });
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
      .filter((file) => !accountedFor.some((owned) => covers(owned, file)));

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
    const fingerprinted = new Set(projects(kind).flatMap((suite) => poolUnitFor(suite).inputs.map(repoRelative)));
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
describe("the chain runs every artifact's check", () => {
  /** A `:check` script the chain does not run, and why. An entry that stops applying is reported. */
  const NOT_RUN_BY_THE_CHAIN: Record<string, string> = {
    'api:check': 'API Extractor over three packages, 55s; `api:stamp` is its 0.6s proxy inside typecheck, and '
      + 'api-reports.ts checks that proxy against itself, which is what catches an input nobody listed',
    // These two are commands over a rule a spec already asserts, so the artifact is checked and the script is
    // a way to ask by hand. Both say so themselves: `spec-cost.ts` records that `scripts/lib/spec-cost.ts`
    // holds what it and `suite-split.spec.ts` share, "so a spec and this command cannot disagree".
    'seed-parity:check': 'a wrapper for `npm test -- tests/seeds`; those specs run in test:unit:pack',
    'spec-cost:check': 'reads the records and runs nothing; suite-split.spec.ts asserts the same rule from '
      + 'scripts/lib/spec-cost.ts, and it runs in test:unit:host',
  };

  /** Every `<artifact>:check` in the repo, as the label of the manifest declaring it and the script's name */
  const checkScripts = (): { where: string; name: string }[] => {
    const manifests = [path.join(REPO_ROOT, 'package.json'),
      ...fs.readdirSync(path.join(REPO_ROOT, 'packages'))
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

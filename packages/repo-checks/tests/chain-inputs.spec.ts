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
import { BUILD_UNITS, covers, inputFiles, NOT_A_BUILD_INPUT, repoRelative, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, dependsOn, SUITE_READS } from '../../../scripts/lib/chain-steps.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';
import { reachableText, rootScripts } from '../../../scripts/lib/npm-scripts.ts';
import { TYPECHECK_LEGS } from '../../../scripts/lib/typecheck-legs.ts';
import { PACKAGE_DIRS } from '../../../scripts/lib/workspace-deps.ts';
import { repoFiles } from './_support/repo-files.ts';

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
// coverage claim skipped the files that drive the app entirely.
const CODE = /\.(ts|tsx|vue|mts|cts|mjs|cjs|js|sh)$/;

const trackedCode = (): string[] =>
  repoFiles().filter((file) => CODE.test(file));

/**
 * The walk under one declared path, memoised for this file.
 *
 * Nine call sites ask for the same paths — four whole-chain coverage sweeps and the guide checks — and the
 * repo-wide suites declare every source tree, so the same directories were walked over and over. Safe to
 * memoise here and nowhere else: a spec run is one moment, and nothing in it writes to the tree.
 */
const walked = new Map<string, readonly string[]>();
const filesUnder = (input: string): readonly string[] => {
  const found = walked.get(input) ?? inputFiles(path.join(REPO_ROOT, input));
  walked.set(input, found);
  return found;
};

/** Every tracked file the steps' inputs reach, resolved the way a fingerprint resolves them */
const coveredBy = (steps: readonly { inputs: readonly string[] }[]): Set<string> => {
  const covered = new Set<string>();
  for (const step of steps) for (const input of step.inputs) for (const file of filesUnder(input)) covered.add(file);
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
  // script named a repo file — `scripts/facade-report.ts`, until the report became a CLI command — and that
  // went undeclared for a commit. `reachableText` follows
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

    // The one definition of which workspaces there are, which refuses a glob whose workspaces it could not name
    const workspaces = PACKAGE_DIRS.map((dir) => `packages/${dir}`);
    expect(workspaces, 'no workspace was derived, so every workspace pass would be invisible').not.toEqual([]);
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
    // `lint:check` is its own chain step now; it was a leg of `typecheck` when this case was written
    const step = CHAIN_STEPS.find((candidate) => candidate.name === 'lint:check')!;
    expect(step, 'no step runs the lint, so this would pass over nothing').toBeDefined();
    const covered = coveredBy([step]);
    const missing = [...linted].filter((file) => !covered.has(file)).sort();
    expect(missing, 'lint:check walks these and declares none of them, so it caches over their changes').toEqual([]);
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
/**
 * A step that drives the Playwright fixture reads `@abuddy/testing`'s built bundle — the code that
 * launches Electron, finds the main window and bypasses onboarding. It reaches it by *package name*,
 * never by path, so every other check in this file is blind to the edge: they read a step's text for
 * paths, and there is no path to read.
 *
 * Measured 2026-09-30, before this existed. One change to the fixture's source, one rebuild, three
 * steps that run it: `test:packaged-authoring`, which declares the bundle, reported
 * `changed packages/abuddy-testing/dist/package/dist/index.js`; `test:smoke` and
 * `test:external-pack:app` both reported `cached`. A gate that skips when the thing it drives has
 * changed is not a gate, and `test:smoke` exists to be the one gate on whether the app starts.
 */
describe('a step that drives the app fixture declares the bundle it drives', () => {
  // How a script reaches the fixture: Playwright directly, the CLI's own `test`, or the CLI held in a
  // variable (`"$ABUDDY" test`, which `tests/scripts/test-external-pack-app.sh` uses). The third is not
  // optional — without it this watched two steps and not the one it was written for.
  //
  // The same three shapes `check:tiers` looks for (`APP_MARKERS`), and deliberately **not** the same
  // rule: that one asks whether a step launches an app, so it exempts `--contract`, which starts none.
  // This asks whether a step reads the bundle, and `abuddy test --contract` does — the harness it runs
  // is published from it. Keep the shapes in step; the lookahead is where the two questions differ.
  const DRIVES_THE_APP = /playwright\s+test\b|\babuddy["']?\s+test\b|\$\{?ABUDDY\}?"?\s+test\b/;
  const fixture = BUILD_UNITS['@abuddy/testing'].outputs.map(repoRelative);
  const all = rootScripts();
  // Only the cacheable ones: a step that never caches cannot cache over anything, so the rule has no
  // subject there. `test` is the one that drives the app and declares no bundle, and carries its reason
  // for never caching instead
  const drivers = CHAIN_STEPS
    .filter((step) => step.neverCachedBecause === undefined)
    .filter((step) => DRIVES_THE_APP.test(reachableText(step.name, all).text));

  it('finds the steps that drive it, so this is not a check over nothing', () => {
    expect(drivers.map((step) => step.name).sort()).not.toEqual([]);
  });

  it('leaves none of them caching over it', () => {
    const undeclared = drivers.flatMap((step) => {
      const covered = (output: string) => step.inputs.some((input) => output === input || output.startsWith(`${input}/`));
      return fixture.filter((output) => !covered(output)).map((output) => `${step.name} runs ${output} and does not declare it`);
    });
    expect(undeclared).toEqual([]);
  });
});

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
    const step = byName.get(name);
    for (const need of step ? dependsOn(step) : []) {
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
    const step = byName.get(name);
    for (const need of step ? dependsOn(step) : []) {
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





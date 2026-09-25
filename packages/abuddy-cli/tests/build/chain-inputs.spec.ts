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
import { CHAIN_STEPS, SUITE_READS, type ChainStep } from '../../../../scripts/lib/chain-steps.ts';
import { UNIT_SUITES } from '../../../../scripts/lib/unit-suites.ts';

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
  const sources = (dir: string): string[] => {
    const root = path.join(REPO_ROOT, 'packages', dir, 'tests');
    return fs.existsSync(root) ? inputFiles(root).map((file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8')) : [];
  };
  const readsPackages = (dir: string, texts: string[]): boolean => {
    const pretest = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf-8')) as
      { scripts?: Record<string, string> }).scripts?.pretest ?? '';
    return pretest.includes('ensure-packages-built') || texts.some((text) => text.includes('@abuddy/testing'));
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
  // `UNIT_STEPS` derives `needs` from this same table, so the two cannot disagree and such a test could
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

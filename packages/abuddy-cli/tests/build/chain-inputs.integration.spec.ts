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
};

const CODE = /\.(ts|tsx|vue|mts|cts|mjs|cjs|js)$/;

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

// The one direction of drift that is silent. A unit suite that reads no build output declares no dependency
// on a build step, so it is cached against its own source alone — correct, right up until one of its specs
// starts loading `@abuddy/testing`'s bundle or the built-in pack's `dist`. From then on it would keep
// getting cache hits against a key that never saw what it reads. What a spec reads is not in a manifest, so
// the list in `chain-steps.ts` is written; this scans for the two markers and fails when it has gone stale.
describe('unit suites that read build output say so', () => {
  const sources = (dir: string): string[] => {
    const root = path.join(REPO_ROOT, 'packages', dir, 'tests');
    return fs.existsSync(root) ? inputFiles(root).map((file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8')) : [];
  };
  /** Its pretest builds the packages, or a spec loads the one @abuddy package that always resolves its bundle */
  const readsPackages = (dir: string, texts: string[]): boolean => {
    const pretest = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf-8')) as
      { scripts?: Record<string, string> }).scripts?.pretest ?? '';
    return pretest.includes('ensure-packages-built') || texts.some((text) => text.includes('@abuddy/testing'));
  };
  /** A spec reaches into the built-in pack's build output */
  const readsPack = (texts: string[]): boolean =>
    texts.some((text) => /PACK_DIR|default-setup['"`, )\]]*,?\s*['"`]dist|default-setup\/dist/.test(text));

  it.each(UNIT_SUITES.map((suite) => suite.dir))('%s', (dir) => {
    const texts = sources(dir);
    const declared = SUITE_READS[dir] ?? {};
    expect({ packages: readsPackages(dir, texts), pack: readsPack(texts) },
      `${dir}'s specs and SUITE_READS disagree about what it reads`)
      .toEqual({ packages: declared.packages === true, pack: declared.pack === true });
  });
});

// `inputs` and `needs` are two halves of one claim and nothing made them agree. A step that reads what
// another step writes has to run after it, and saying so in `inputs` does not say so to `orderedSteps`,
// which sorts on `needs` alone. Until this was added `test:integration` declared the built-in pack's `dist`
// and needed only `packages:ensure`: it ran after `compile` because of where it sat in the table, which is
// not a guarantee. The check is derivable, so it is a check rather than a review note.
describe('a step that reads another step\'s output depends on it', () => {
  /** Everything `step` transitively needs */
  const ancestorsOf = (step: ChainStep, seen = new Set<string>()): Set<string> => {
    for (const need of step.needs) {
      if (seen.has(need)) continue;
      seen.add(need);
      ancestorsOf(CHAIN_STEPS.find((s) => s.name === need)!, seen);
    }
    return seen;
  };

  it('names it in needs, not only in inputs', () => {
    const missing: string[] = [];
    for (const step of CHAIN_STEPS) {
      const ancestors = ancestorsOf(step);
      for (const producer of CHAIN_STEPS) {
        if (producer.name === step.name || ancestors.has(producer.name)) continue;
        // A declared input that is one of the producer's outputs, or sits under one
        const read = (producer.outputs ?? []).filter((out) =>
          step.inputs.some((input) => input === out || input.startsWith(`${out}/`)));
        if (read.length > 0) missing.push(`${step.name} declares ${read.join(', ')}, which ${producer.name} writes, but does not need it`);
      }
    }
    expect(missing).toEqual([]);
  });
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

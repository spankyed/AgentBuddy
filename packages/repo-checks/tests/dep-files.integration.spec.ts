import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputFiles, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS } from '../../../scripts/lib/chain-steps.ts';
import { ENSURE, namedByScript, scopeOf, TYPECHECK_LEGS } from '../../../scripts/lib/typecheck-legs.ts';
import { PACKAGE_DIRS } from '../../../scripts/lib/workspace-deps.ts';
import { UNIT_SUITES, unitStepName } from '../../../scripts/lib/unit-suites.ts';
import { depFileNames, readsOf, sourceOf, untrustworthy } from '../../../scripts/lib/dep-files.ts';
import { population } from '@abuddy/sdk/testing';

/**
 * The compiler reports what it read, and what `typecheck` declares has to cover it.
 *
 * This is the affordable stand-in for hermeticity. A sandbox would *fail* an undeclared read; nothing here
 * can, so the next best thing is to ask the tool afterwards and compare. Every other input check in this
 * repo compares a declaration against another declaration — the module graph, the manifest — and this one
 * compares it against an observation, which is the only one of them that can catch a read nobody modelled.
 *
 * It is evidence-dependent by nature: a dep file exists only where the leg has run. A fresh clone has
 * none, and the cases below say so rather than passing over an empty set.
 */
const tsVersion = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'node_modules/typescript/package.json'), 'utf-8')) as { version: string }).version;

describe('the compiler says what it read', () => {
  /**
   * Which legs this can speak for, named rather than implied.
   *
   * The gate below is only as wide as the evidence, and one leg produces none: `typecheck:fe` writes build
   * infos that record no program at all, because a solution-style config records its references and the
   * referenced configs do the compiling. Asserting the list keeps that honest in both directions — a leg
   * quietly losing its dep file shows up here, and so does one gaining it.
   */
  it('says which legs it can speak for, so the gate is not wider than its evidence', () => {
    const owners = new Set(depFileNames()
      .map((file) => PACKAGE_DIRS.find((dir) => file === dir)
        ?? PACKAGE_DIRS.filter((dir) => file.startsWith(`${dir}-`)).sort((a, b) => b.length - a.length)[0])
      .filter((dir): dir is string => dir !== undefined));
    const legs = TYPECHECK_LEGS.filter((leg) => leg.name !== 'packages:ensure');
    const uncovered = legs
      .filter((leg) => { const scope = scopeOf(leg); return scope !== 'repo' && !scope.some((dir) => owners.has(dir)); })
      .map((leg) => leg.name)
      .sort();
    expect(uncovered, 'the legs no dep file speaks for — change this list only with the reason why')
      .toEqual(['typecheck:fe']);
  });

  it('finds dep files to read, or says plainly that there is no evidence here', () => {
    const found = depFileNames();
    if (found.length === 0) {
      expect.fail('no dep file in node_modules/.cache/tsbuildinfo: run npm run typecheck once, '
        + 'then this can check what the compiler read. An empty run is not a passing one.');
    }
    population('dep files', found, { atLeast: 10 });
    expect(found.flatMap((name) => readsOf(name) ?? []).length, 'every dep file is empty of repo files')
      .toBeGreaterThan(100);
  });

  /**
   * The gate. `typecheck` declares `EVERY_SOURCE` and the build outputs, which is broad on purpose, and
   * the question is whether broad is *enough* — a file the compiler reads that no input covers is a step
   * reporting `cached` over work that changed.
   */
  /**
   * Case is folded on both sides, because TypeScript records a lowercased path on a case-insensitive
   * filesystem — `baseform.vue` for `BaseForm.vue`. Comparing as written reported eleven declared files
   * as undeclared. Folding can only make this more permissive, so the case below rules out the one way
   * that could hide something: two tracked files differing only by case.
   */
  it('declares no two files that differ only by case, so folding it below hides nothing', () => {
    const declared = CHAIN_STEPS.flatMap((step) => step.inputs).flatMap((input) => inputFiles(path.join(REPO_ROOT, input)));
    const byFolded = new Map<string, Set<string>>();
    for (const file of declared) byFolded.set(file.toLowerCase(), (byFolded.get(file.toLowerCase()) ?? new Set()).add(file));
    expect([...byFolded.values()].filter((group) => group.size > 1).map((group) => [...group]),
      'these collide when case is folded').toEqual([]);
  });

  /**
   * The gate, per leg rather than per chain.
   *
   * Each typecheck leg is its own step now, with inputs derived from the scope it declares, and the dep
   * file is the only thing that can say whether that scope is wide enough. A leg reading a file its own
   * step does not declare is a step reporting `cached` over work that changed — and because the scopes
   * are narrow, this is the check that makes narrowing them safe.
   *
   * Which leg a dep file belongs to is `covering`'s answer, below.
   */
  /**
   * Every dep file is traced to the config that named it, so none reaches the fallback by accident.
   *
   * The fallback — a repo-scoped leg answering for a dep file no workspace owns — is right for `scripts` and
   * `tests` and wrong for everything else, and it is silent: a dep file this cannot place is checked against
   * `lint:check`, which declares the tree and so vouches for anything. Without this case, a config that
   * stopped declaring `tsBuildInfoFile`, or wrote it somewhere new, would quietly loosen the gate above
   * rather than fail here.
   */
  it('traces every dep file to the tsconfig that named it', () => {
    const placed = depFileNames().map((depFile) => ({ depFile, source: sourceOf(depFile) }));
    expect(placed.length, 'no dep files, so this would pass over nothing').toBeGreaterThan(10);
    expect(placed.filter(({ source }) => source === undefined).map(({ depFile }) => depFile),
      'no tsconfig under a workspace or at the repo level declares these names').toEqual([]);
    // The ones with no workspace are exactly the repo-level configs, which is what licenses the fallback
    expect(placed.filter(({ source }) => source?.workspace === undefined).map(({ source }) => source?.config).sort())
      .toEqual([path.join('scripts', 'tsconfig.json'), path.join('tests', 'tsconfig.json')]);
  });

  /**
   * The legs that *own* this dep file, and the repo-wide ones only when none does.
     *
     * **A repo-wide leg is not an answer about the leg that compiles the file.** `lint:check` declares the
     * whole tree, so with it in the covering set every read of anything was vouched for by something — which
     * is how `typecheck:main` and `typecheck:preload` came to compile `types/*.d.ts` without declaring them,
     * cached through an edit to a file they were reading, with this check green. The fallback is for a dep
     * file no package owns (`scripts`, `tests`), where a repo-scoped leg genuinely is the compiler.
     *
     * **Ownership comes from the script, not from `scopeOf`, and that is the whole point.** A leg's `scope`
     * is its cache key, which wants to be *wide* — every file it reads — while ownership wants to be
     * *narrow*: only what it compiles. Reading one field for both meant widening a key made a leg vouch for
     * reads it never compiles, so the honest declaration could not be made. It cost two answers before it
     * was split: `packages:ensure` owned six dep files it only builds, and `repo-checks` and
     * `publish-checks` owned none at all, because the leg that compiles them declares `scope: 'repo'` for
     * its key and so was not in the owning set — they were being vouched for by `lint:check`, the very
     * hole this case was tightened to close.
     */
  const covering = (depFile: string) => {
    const dir = sourceOf(depFile)?.workspace;
    const owning = dir === undefined ? [] : TYPECHECK_LEGS.filter((leg) => namedByScript(leg.name).dirs.includes(dir));
    return owning.length > 0 ? owning : TYPECHECK_LEGS.filter((leg) => scopeOf(leg) === 'repo');
  };

  /**
   * The split itself, pinned on the one leg where the two answers differ today.
   *
   * `packages:ensure` declares a `scope` naming the five packages it builds — a correct cache key, since it
   * re-runs when any of them changes — and its script names none of them, because it compiles none of them.
   * Read ownership off the key and it vouches for five dep files whose reads it never made; read it off the
   * script and it vouches for nothing. Switch `covering` back to `scopeOf` and this is what says so.
   */
  it('asks the script which leg compiles a dep file, not the leg\'s cache key', () => {
    const ensure = TYPECHECK_LEGS.find((leg) => leg.name === ENSURE)!;
    expect(scopeOf(ensure), 'its key names the packages it builds, which is what makes this a difference')
      .toContain('abuddy-sdk');
    expect(namedByScript(ENSURE).dirs, 'and its script names none of them, because it compiles none').toEqual([]);
    expect(covering('abuddy-sdk').map((leg) => leg.name)).not.toContain(ENSURE);
  });

  it('leaves nothing a leg read outside what that leg declares', () => {
    const missing = depFileNames().flatMap((depFile) => {
      const reads = readsOf(depFile) ?? [];
      const legs = covering(depFile);
      if (legs.length === 0) return [`${depFile}: no leg declares it, so nothing re-runs on what it read`];
      // Any one *owning* leg is enough, and that is the only ambiguity the rule is for: a package can have
      // several configs — `api`, `api-test`, `api-scripts` — and which leg compiles which is not derivable
      // from the name. It was never meant to let a leg that merely walks the tree answer for one that compiles
      const declared = legs.map((leg) => {
        const step = CHAIN_STEPS.find((candidate) => candidate.name === leg.name);
        const files = (step?.inputs ?? []).flatMap((input) => inputFiles(path.join(REPO_ROOT, input)));
        const skips = (step?.excludes ?? []).map((skip) => skip.toLowerCase());
        return { files: new Set(files.map((file) => file.toLowerCase())), skips };
      });
      return reads
        .map((file) => file.toLowerCase())
        .filter((file) => fs.existsSync(path.join(REPO_ROOT, file)))
        .filter((file) => !declared.some(({ files, skips }) =>
          files.has(file) || skips.some((skip) => file === skip || file.startsWith(`${skip}/`))))
        .slice(0, 5)
        .map((file) => `${depFile} read ${file}, which no leg covering it declares`);
    });
    expect([...new Set(missing)], 'the compiler read these and nothing re-runs the leg when they change')
      .toEqual([]);
  });
});

/**
 * And the dep file is a proxy, so it is checked against itself.
 *
 * A proxy records what it believes its inputs were, which is a guess about someone else's behaviour.
 * `api:stamp` is the repo's other one and was bitten by exactly that — an input missing from its key let a
 * change pass the stamp and the whole chain — so the rule it left behind is that a proxy needs a
 * self-check rather than only a comparison.
 */
describe('a dep file is checked against itself before it is believed', () => {
  /**
   * Against the compiler *that workspace* resolves. `packages/main` and `packages/preload` pin typescript
   * to an exact version and carry their own copy, so a check against the repo's called their dep files
   * untrustworthy — the check being coarser than its subject rather than a finding about the files.
   */
  it('trusts one written by the compiler its own workspace resolves', () => {
    for (const name of depFileNames()) {
      expect(readsOf(name), `${name} is refused, so something it was written by has moved`).toBeDefined();
    }
  });

  it('is asked against a version, and says so when that version is not the one', () => {
    const [name] = depFileNames();
    expect(untrustworthy(name!, { version: tsVersion })).toBeNull();
  });

  /**
   * And the reader applies it, rather than leaving it to whoever remembers.
   *
   * This is the half that was missing: `untrustworthy` existed, the gate above called `readsOf`, and
   * nothing joined them — so a dep file from another compiler would have been compared against in
   * silence. The check belongs in the reader for the reason `CLAUDE.md` gives about reset hatches: one
   * that a caller has to invoke is one a caller will forget.
   */
  it('reads nothing out of a dep file it would not trust', () => {
    const [name] = depFileNames();
    expect(readsOf(name!), 'the fixture is unreadable, so the case below proves nothing').toBeDefined();

    const file = path.join(REPO_ROOT, 'node_modules/.cache/tsbuildinfo', `${name!}.tsbuildinfo`);
    const original = fs.readFileSync(file, 'utf-8');
    try {
      const info = JSON.parse(original) as Record<string, unknown>;
      fs.writeFileSync(file, JSON.stringify({ ...info, version: '0.0.0-another-compiler' }));
      expect(readsOf(name!), 'a read set from another compiler describes another program').toBeUndefined();
    } finally {
      fs.writeFileSync(file, original);
    }
    expect(readsOf(name!), 'the fixture was not restored').toBeDefined();
  });

  it('refuses one written by another compiler, naming the version', () => {
    const [name] = depFileNames();
    expect(untrustworthy(name!, { version: '0.0.0-not-installed' }))
      .toMatch(/written by TypeScript .*, and 0\.0\.0-not-installed is installed/);
  });

  it('refuses one recorded under different options, naming which moved', () => {
    const [name] = depFileNames();
    expect(untrustworthy(name!, { version: tsVersion, options: { strict: 'not-what-it-ran-with' } }))
      .toMatch(/different options \(strict\)/);
  });

  // The cold-tree case, which is the one that must not read as "it read nothing"
  it('refuses a name it has no file for, rather than reporting an empty read set', () => {
    expect(readsOf('no-such-leg')).toBeUndefined();
    expect(untrustworthy('no-such-leg', { version: tsVersion })).toMatch(/has not run in this checkout/);
  });

  /**
   * Why `typecheck:fe` is on the uncovered list, as a fact rather than a claim.
   *
   * The renderer *does* write build infos — three, under `packages/renderer/node_modules/.tmp` — and they
   * record no program at all: no `fileNames` key, because a solution-style config records its references
   * and the referenced configs do the compiling. So there is nothing to read, and pointing the reader at
   * that directory would buy a leg's worth of silence rather than a leg's worth of evidence. If these
   * ever grow a `fileNames`, this case fails and the gate can widen.
   */
  it('finds no program recorded in the renderer build infos, which is why its leg is uncovered', () => {
    const dir = path.join(REPO_ROOT, 'packages/renderer/node_modules/.tmp');
    const found = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.tsbuildinfo')) : [];
    expect(found.length, 'the renderer writes no build info here any more; this case has lost its subject')
      .toBeGreaterThan(0);
    for (const file of found) {
      const info = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as { fileNames?: unknown };
      expect(info.fileNames, `${file} now records a program; the reader could read it`).toBeUndefined();
    }
  });
});

/**
 * And the same question of the whole chain: which steps has anything looked at.
 *
 * Three answers, and the third is the one worth naming. A **dep file** is the compiler reporting what it
 * read — an observation, the only kind of evidence here that can catch an input nobody modelled. The
 * **module graph** is `suite-reads` walking a suite's specs, which is a declaration checked against
 * another declaration. And for the rest there is **nothing per-step**: builds, shell scenarios and
 * Playwright runs have no tool that reports their reads, and syscall tracing was reasoned out of scope
 * (`docs/archive/plans/one-action-cache.md`) because it cannot tell a read that matters from a stat
 * during module resolution.
 *
 * Those nine are covered only by `chain-inputs`' coverage question — every tracked file is *some* step's
 * input — which cannot catch a step declaring too little. That is a real gap and this is a record of it,
 * not a gate over it: the list is asserted so it cannot drift in prose, so a step gaining observation
 * shows up, and so a new step that nothing watches has to be added here deliberately.
 *
 * `typecheck:fe` is in this list and in the one above for the same reason.
 */
describe('what has looked at a step at all', () => {
  const observation = (): { byDepFile: string[]; byGraph: string[]; byNothing: string[] } => {
    const owners = new Set(depFileNames()
      .filter((file) => readsOf(file) !== undefined)
      .map((file) => PACKAGE_DIRS.find((dir) => file === dir)
        ?? PACKAGE_DIRS.filter((dir) => file.startsWith(`${dir}-`)).sort((a, b) => b.length - a.length)[0])
      .filter((dir): dir is string => dir !== undefined));
    const byDepFile = new Set(TYPECHECK_LEGS
      .filter((leg) => { const scope = scopeOf(leg); return scope === 'repo' || scope.some((dir) => owners.has(dir)); })
      .map((leg) => leg.name));
    // A pool's specs are walked by `suite-reads`, which is the other kind of evidence
    const byGraph = new Set([...new Set(UNIT_SUITES.map(unitStepName)), 'test:integration']);
    const named = (take: (name: string) => boolean): string[] =>
      CHAIN_STEPS.filter((step) => take(step.name)).map((step) => step.name).sort();
    return {
      byDepFile: named((name) => byDepFile.has(name)),
      byGraph: named((name) => byGraph.has(name)),
      byNothing: named((name) => !byDepFile.has(name) && !byGraph.has(name)),
    };
  };

  it('has looked at most of them, so the list below is a remainder and not the whole table', () => {
    const { byDepFile, byGraph, byNothing } = observation();
    expect(byDepFile.length, 'no step is covered by a dep file').toBeGreaterThan(10);
    expect(byGraph.length, 'no step is covered by the module graph').toBeGreaterThan(2);
    expect(byDepFile.length + byGraph.length + byNothing.length, 'the three answers do not partition the table')
      .toBe(CHAIN_STEPS.length);
  });

  it('names the steps nothing verifies per-step', () => {
    expect(observation().byNothing,
      'a step here is one whose declared inputs nothing checks against what it touched. Add to this list '
      + 'only a step no tool can report on, and take one out when something can').toEqual([
      'build:app',
      'compile',
      'packages:check',
      'test',
      'test:external-pack:app',
      'test:external-pack:contract',
      'test:packaged-authoring',
      'test:smoke',
      'typecheck:fe',
    ]);
  });
});

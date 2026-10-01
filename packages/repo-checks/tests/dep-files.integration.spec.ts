import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputFiles, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS } from '../../../scripts/lib/chain-steps.ts';
import { TYPECHECK_LEGS } from '../../../scripts/lib/typecheck-legs.ts';
import { PACKAGE_DIRS } from '../../../scripts/lib/workspace-deps.ts';
import { depFileNames, readsOf, untrustworthy } from '../../../scripts/lib/dep-files.ts';
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
   * The leg a dep file belongs to is derived from its name: TypeScript writes one per tsconfig and each
   * is named for its package, so `abuddy-ears` is the package and `api-test` is `api`'s second config. A
   * name matching no package is repo-level (`scripts`, `tests`) and is checked against the legs that
   * declare the whole tree.
   */
  it('leaves nothing a leg read outside what that leg declares', () => {
    const owner = (depFile: string): string | undefined => PACKAGE_DIRS.find((dir) => depFile === dir)
      ?? PACKAGE_DIRS.filter((dir) => depFile.startsWith(`${dir}-`)).sort((a, b) => b.length - a.length)[0];

    const covering = (depFile: string) => {
      const dir = owner(depFile);
      return TYPECHECK_LEGS.filter((leg) => (dir === undefined ? leg.scope === 'repo' : leg.scope === 'repo' || leg.scope.includes(dir)));
    };

    const missing = depFileNames().flatMap((depFile) => {
      const reads = readsOf(depFile) ?? [];
      const legs = covering(depFile);
      if (legs.length === 0) return [`${depFile}: no leg declares it, so nothing re-runs on what it read`];
      // Any one covering leg is enough: the file is compiled by whichever of them runs it
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
  it('trusts one written by the installed compiler under the options it is asked about', () => {
    for (const name of depFileNames()) {
      expect(untrustworthy(name, { version: tsVersion }), name).toBeNull();
    }
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
});

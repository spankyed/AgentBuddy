// What `npm run typecheck` runs, as data.
//
// Separate from `scripts/typecheck.ts` for the same reason `chain-steps.ts` is separate from `chain.ts`: that
// module runs the checks when imported, so nothing may import it to ask a question. `chain-inputs.spec.ts`
// asks one — whether anything in the chain runs `schema:check` and `exports:check`, which are reachable only
// through here — and importing the runner for that answer cost 11s of collection time before this split.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { rootScripts } from './npm-scripts.ts';
import { PACKAGE_DIRS } from './workspace-deps.ts';

export interface Leg {
  /** What `npm run` calls it, and what a failure is reported as */
  readonly name: string;
  /** Spelled out rather than derived — see the header */
  readonly command: string;
  /**
   * What this leg checks, **only where its script cannot say**.
   *
   * Absent is the common case and the right one: twelve of these legs name their workspace in the script
   * itself (`--workspace`, or `tsc -p packages/x`), so `scopeOf` reads it from there and a declaration
   * would be a second copy of a fact — which is what this field was until 2026-10, all eighteen of them.
   *
   * Declare one when the script names nothing usable, and the entry is then a claim with something to say:
   * `'repo'` for a leg that walks the whole tree, or a list for one whose subject the command line does not
   * mention. `scopeOf` refuses a leg with neither, because an empty scope means empty inputs, and a step
   * with empty inputs depends on nothing, sorts first and never goes stale.
   */
  readonly scope?: readonly string[] | 'repo';
  /**
   * Files this leg's compiler reads that its `scope` cannot name — repo-root files belonging to no
   * workspace, and a file in a workspace this leg does not own.
   *
   * Three legs have any. `typecheck:be`'s three programs each resolve through the root `package.json`,
   * which `scope: ['api']` cannot express. `typecheck:main` and `typecheck:preload` compile `types/`, the
   * repo-root ambient declarations — and `preload` reaches one file further, because `types/speech.d.ts`
   * re-exports from `@abuddy/sdk`'s source while `packages/preload/package.json` declares no dependency on
   * it, so `workspaceDeps` cannot find the edge.
   *
   * **Naming one file rather than its directory is safe here, and only because the gate watches.** If
   * `speech-event.d.ts` grows an import, the dep file reports the new read and
   * `dep-files.integration.spec.ts` fails until this says so. Widening `scope` instead would be worse than
   * imprecise: that spec derives which leg *owns* a dep file from `scope`, so adding `abuddy-sdk` here would
   * let this leg vouch for reads of the whole SDK that it never compiles.
   *
   * Declared rather than derived from the dep file, for the reason a dep file is never a key — it records
   * what was read *last* time, so a leg that starts reading one would not be invalidated by the thing it
   * started reading.
   *
   * It exists because the root manifest left `ROOT`: when every step declared it, this was covered by
   * accident. `dep-files.integration.spec.ts` is what found that gap and the `types/` one, and what keeps
   * this list honest.
   */
  readonly alsoReads?: readonly string[];
  /**
   * What it costs alone, measured 2026-09-27 on an idle machine. It feeds `budgetFor`, which bounds a leg at
   * four times this and floors at 60s — so the short legs all land on the floor, which is the right bound for
   * them anyway. Re-measure rather than raise one: a bound nobody will wait for is the same as no bound.
   */
  readonly seconds: number;
}

/** The one ordering constraint: every other leg reads what it builds */
export const ENSURE = 'packages:ensure';

/**
 * Every leg, in the order a failure is reported in — which is this order and not the order they finish, so a
 * run reads the same way twice.
 *
 * `packages:ensure` first because `check:specifiers`, `api:stamp` and `typecheck:pack` read the built packages.
 * Everything else is independent, and that is the claim this file makes by running them at once: nothing here
 * writes what another leg reads. The checks are all `--check`/`--noEmit` halves, which is what makes that
 * plausible, and `--lanes 1` is how to test it if a leg ever starts behaving differently in company.
 */
export const TYPECHECK_LEGS: readonly Leg[] = [
  { name: ENSURE, command: 'npm run packages:ensure', scope: ['abuddy-ears', 'abuddy-sdk', 'abuddy-ui', 'abuddy-cli', 'abuddy-testing'], seconds: 0.3 },
  { name: 'typecheck:fe', command: 'npm run typecheck:fe', seconds: 6.2 },
  { name: 'typecheck:be', command: 'npm run typecheck:be', alsoReads: ['package.json'], seconds: 3.4 },
  { name: 'typecheck:ears', command: 'npm run typecheck:ears', seconds: 0.8 },
  { name: 'typecheck:sdk', command: 'npm run typecheck:sdk', seconds: 1.1 },
  { name: 'typecheck:host', command: 'npm run typecheck:host', seconds: 1.3 },
  { name: 'typecheck:ui', command: 'npm run typecheck:ui', seconds: 2.0 },
  { name: 'check:specifiers', command: 'npm run check:specifiers', scope: 'repo', seconds: 2.7 },
  { name: 'exports:check', command: 'npm run exports:check', seconds: 1 },
  { name: 'schema:check', command: 'npm run schema:check', seconds: 0.5 },
  { name: 'api:stamp', command: 'npm run api:stamp', scope: 'repo', seconds: 0.7 },
  { name: 'typecheck:scripts', command: 'npm run typecheck:scripts', scope: 'repo', seconds: 4 },
  { name: 'typecheck:cli', command: 'npm run typecheck:cli', seconds: 2.7 },
  { name: 'typecheck:pack', command: 'npm run typecheck:pack', seconds: 4.8 },
  // Both compile `../../types/**/*.d.ts` through their own tsconfig `include`
  { name: 'typecheck:main', command: 'npm run typecheck:main', alsoReads: ['types'], seconds: 1.0 },
  { name: 'typecheck:preload', command: 'npm run typecheck:preload',
    alsoReads: ['types', 'packages/abuddy-sdk/src/fe/speech-event.d.ts'], seconds: 0.8 },
  { name: 'check:tiers', command: 'npm run check:tiers', scope: 'repo', seconds: 0.3 },
  { name: 'lint:check', command: 'npm run lint:check', scope: 'repo', seconds: 1.7 },
];

/**
 * What a leg's own script names, and what of it this could not resolve — both, because the second is the
 * reason the first can be trusted as a cache key.
 *
 * **A parse that drops what it does not understand is the failure a declaration was guarding against.**
 * This read every `--workspace` and kept the ones that mapped to a package directory, which is a silent
 * narrowing: a scope short one workspace is a step that does not re-run when that workspace changes, and
 * nothing says so. Unresolved mentions are carried out of here instead, and `scopeOf` refuses rather than
 * answering with the remainder — the one property that makes deriving this no weaker than declaring it.
 *
 * Memoised for this process: the scripts are a file the chain reads once, and a leg's answer cannot change
 * inside one run. Nothing resets it, because nothing rewrites `package.json` mid-run — and a reset hatch is
 * a thing to forget (root `CLAUDE.md`, on caches).
 */
interface ScriptScope { readonly dirs: readonly string[]; readonly unresolved: readonly string[] }
let scriptScopes: Map<string, ScriptScope> | undefined;
function namedByScript(leg: string): ScriptScope {
  if (scriptScopes === undefined) {
    const all = rootScripts();
    const nameToDir = new Map(PACKAGE_DIRS.map((dir) => [
      (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf-8')) as { name: string }).name,
      dir,
    ]));
    scriptScopes = new Map(Object.entries(all).map(([name, command]) => {
      const mentions = [
        ...[...command.matchAll(/--workspace[= ]([^\s]+)|(?:^|\s)-w[= ]([^\s]+)/g)]
          .map((hit) => ({ as: 'workspace' as const, named: hit[1] ?? hit[2]! })),
        // `tsc -p packages/x` and `cd packages/x` name a directory where no `-w` does
        ...[...command.matchAll(/(?:tsc -p|cd) packages\/([^\s/]+)/g)]
          .map((hit) => ({ as: 'directory' as const, named: hit[1]! })),
      ];
      const resolve = ({ as, named }: { as: 'workspace' | 'directory'; named: string }): string | undefined =>
        (as === 'workspace' ? nameToDir.get(named) : (PACKAGE_DIRS.includes(named) ? named : undefined));
      return [name, {
        dirs: [...new Set(mentions.map(resolve).filter((dir): dir is string => dir !== undefined))].sort(),
        unresolved: mentions.filter((m) => resolve(m) === undefined).map((m) => m.named).sort(),
      }] as const;
    }));
  }
  return scriptScopes.get(leg) ?? { dirs: [], unresolved: [] };
}

/**
 * What a leg checks: what it declares, or what its script names.
 *
 * **The parse was already trusted before it was used for this.** `typecheck-legs.spec.ts` ran it to hold
 * each declared scope to the script, which made twelve of the eighteen declarations a second copy of a fact
 * the script already carried. A fact with two records is the thing this chain stopped keeping, so the
 * declaration went and the parse stayed.
 *
 * **It refuses rather than defaulting**, which is the whole safety argument. A leg whose script names no
 * workspace and declares no scope would otherwise get an empty one: empty inputs, so it depends on nothing,
 * sorts first, and never goes stale again. That is a silently-always-cached step, which is strictly worse
 * than a loud failure here — and the three legs with no dep file behind them (`typecheck:fe`, `:main`,
 * `:preload`) are exactly the ones nothing else would catch it for.
 */
export function scopeOf(leg: Leg): readonly string[] | 'repo' {
  if (leg.scope !== undefined) return leg.scope;
  const { dirs, unresolved } = namedByScript(leg.name);
  // Refused, not answered with what was understood: a scope short one workspace is a step that stops
  // re-running when that workspace changes, and the narrowing leaves no trace
  if (unresolved.length > 0) {
    throw new Error(`${leg.name}: its script names ${unresolved.join(', ')}, which this cannot resolve to a workspace — declare a scope on the leg rather than deriving a shorter one`);
  }
  if (dirs.length === 0) {
    throw new Error(`${leg.name}: its script names no workspace, so declare a scope on the leg (or 'repo' if it walks the tree)`);
  }
  return dirs;
}

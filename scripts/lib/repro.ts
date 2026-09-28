// What `npm run check:repro` compares, and how. The orchestration — running the builds — is
// `scripts/repro.ts`; everything here is pure enough for a spec to drive without building anything, which is
// the only way the comparison gets a firing case at all (two full builds is not a unit test).
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUILD_UNITS, REPO_ROOT, type BuildUnit } from '@abuddy/host/build/packages-built';
import { PACK_OUTPUTS } from './chain-steps.ts';
import { repoRelative } from './import-populations.ts';

/** One path whose bytes did not survive a second build of the same input */
export interface Difference {
  readonly path: string;
  readonly kind: 'changed' | 'appeared' | 'disappeared';
}

/**
 * The trees a build writes, derived from the two places that already say so rather than listed again here: the
 * five `BUILD_UNITS` (each `dist` and its publish tree) and `PACK_OUTPUTS` (default-setup's `dist` and its
 * generated sources). A list of someone else's outputs is a guess, and this one would go stale the first time
 * a package is added.
 *
 * Both arguments are injectable because that is the only honest way to watch the emptiness guard fire: a spec
 * hands in an empty map and asserts it throws, rather than trusting a branch nothing takes.
 */
export function reproPaths(
  units: Record<string, BuildUnit> = BUILD_UNITS,
  packOutputs: readonly string[] = PACK_OUTPUTS,
  root = REPO_ROOT,
): string[] {
  const fromUnits = Object.values(units).flatMap((unit) => unit.outputs.map((out) => repoRelative(root, out)));
  const all = [...new Set([...fromUnits, ...packOutputs])].sort();
  if (all.length === 0) {
    throw new Error('check:repro derived no output paths from BUILD_UNITS or PACK_OUTPUTS, so it would compare '
      + 'nothing and pass. Something moved one of those declarations.');
  }
  return all;
}

/**
 * Every file under those paths, by sha256. A missing path contributes nothing rather than throwing: a build
 * that has not run yet is the caller's problem to report, and the *second* snapshot missing what the first had
 * is a `disappeared` difference, which is the more useful way to say it.
 */
export function snapshot(paths: readonly string[], root = REPO_ROOT): Map<string, string> {
  const hashes = new Map<string, string>();
  const walk = (absolute: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch {
      return; // not there, or not a directory — a single file is handled by the caller below
    }
    for (const entry of entries) {
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) hashes.set(repoRelative(root, child), crypto.createHash('sha256').update(fs.readFileSync(child)).digest('hex'));
    }
  };
  for (const relative of paths) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) continue;
    if (fs.statSync(absolute).isDirectory()) walk(absolute);
    else hashes.set(relative, crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'));
  }
  return hashes;
}

/**
 * Outputs measured as irreproducible, with the cause, so a difference at one of them is reported rather than
 * failing the run. Everything else failing is the point of the check.
 *
 * **All three are TypeScript's declaration emit, not a bundler** — which is the opposite of what
 * `docs/archive/plans/pack-runtime-nondeterminism.md` predicted, and was found by this check's first run
 * (2026-09-28). `tsc` prints the members of a union in an order that varies between runs, so a key union
 * comes out `"topic" | "status"` one time and `"status" | "topic"` the next. Measured over six builds:
 * `action-defs.d.ts` took five distinct hashes, and the other two flipped together once.
 *
 * **Intermittent, so a listed path agreeing on a given run means nothing** — which is why a stale entry here
 * is reported and not failed, unlike every other exception table in this repo. Re-measure over several runs
 * before deleting one.
 */
export const KNOWN_IRREPRODUCIBLE: Readonly<Record<string, string>> = {
  'packages/default-setup/dist/defs/monaco/action-defs.d.ts':
    "tsc declaration emit orders a union's members differently between runs; five hashes in six builds",
  'packages/default-setup/dist/types/pack-types.d.ts':
    'the facade bundle, same tsc union ordering; flips with snapshot.json, which records its hash',
  'packages/default-setup/dist/snapshot.json':
    'records a hash of the facade bundle above, so it moves whenever that does',
};

/** The differences that fail a run, and the ones a recorded cause explains */
export function partition(differences: readonly Difference[]): { failing: Difference[]; known: Difference[] } {
  return {
    failing: differences.filter((d) => !(d.path in KNOWN_IRREPRODUCIBLE)),
    known: differences.filter((d) => d.path in KNOWN_IRREPRODUCIBLE),
  };
}

/** What the second build did to the first's output, sorted so a report reads the same way twice */
export function compare(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): Difference[] {
  const differences: Difference[] = [];
  for (const [file, hash] of before) {
    if (!after.has(file)) differences.push({ path: file, kind: 'disappeared' });
    else if (after.get(file) !== hash) differences.push({ path: file, kind: 'changed' });
  }
  for (const file of after.keys()) {
    if (!before.has(file)) differences.push({ path: file, kind: 'appeared' });
  }
  return differences.sort((a, b) => a.path.localeCompare(b.path));
}

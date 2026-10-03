/**
 * Writing a measured step cost back into the table it is declared in.
 *
 * `seconds` is a **sample** in this repo's taxonomy (root `CLAUDE.md`, "Three kinds of recorded
 * artifact"): it records a measurement, so it cannot re-derive itself and neither a `:check` that
 * recomputes nor a firing case is available to it. What a sample needs instead is hysteresis on the
 * record, which is `movedBeyondBand`, and a refusal to record a run that was measuring the machine,
 * which is `refusesAsBusy` — both in `measure.ts`, both already carrying spec-cost's reasoning.
 *
 * It stays in the table rather than moving to a JSON file, which was decided twice for the same reason:
 * thirteen entries, now twenty-nine, read by whoever opens the step they describe. The defect was never
 * where the numbers live, it was that nothing wrote them — the naming rule says an artifact with only an
 * update is one nothing notices has gone stale, and this one had neither half. `driftReport` is the
 * check and has been all along; this is the update.
 *
 * **The splice is verified before it is made.** A number is found by locating the declaration that owns
 * it and reading the digits at that exact span; if what is there is not what was read, the whole file is
 * left alone. That is `specifiers:fix`'s rule, for its reason: a rewriter that is wrong about a span
 * corrupts a file rather than failing.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { STEP_TABLES } from './chain-steps.ts';

/** A step cost that moved far enough to record */
export interface SecondsEdit {
  readonly step: string;
  readonly from: number;
  readonly to: number;
  readonly file: string;
}


/** Where a step's own `seconds` sits: inside the object literal that names it, in one of two tables. */
function inObjectLiteral(source: string, step: string): { at: number; digits: string } | undefined {
  const name = source.indexOf(`name: '${step}'`);
  if (name === -1) return undefined;
  // Bounded by the next entry, so a step with no `seconds` cannot borrow the next one's
  const nextEntry = source.indexOf("{ name: '", name + 1);
  const found = /seconds: (\d+(?:\.\d+)?)/.exec(source.slice(name, nextEntry === -1 ? undefined : nextEntry));
  if (found === undefined || found === null) return undefined;
  return { at: name + found.index + 'seconds: '.length, digits: found[1]! };
}

/**
 * And the three pooled steps, whose cost is a key in `POOL_SECONDS` rather than a field on the step.
 *
 * `test:integration` is here because it is pooled like the other two — it carried its own `seconds: 60`
 * beside `POOL_SECONDS.integration` until 2026-10-02, and a rewrite of the literal left the other record
 * behind. Both were read as a kill budget then, which is what made the drift a hazard rather than a
 * wrong line of output; deadlines are declared classes now, and the duplication is still worth refusing.
 */
function inPoolSeconds(source: string, step: string): { at: number; digits: string } | undefined {
  const kind = /^test:(?:unit:(host|pack)|(integration))$/.exec(step)?.slice(1).find((one) => one !== undefined);
  if (kind === undefined) return undefined;
  const table = source.indexOf('POOL_SECONDS');
  if (table === -1) return undefined;
  const found = new RegExp(`${kind}: (\\d+(?:\\.\\d+)?)`).exec(source.slice(table));
  if (found === null) return undefined;
  return { at: table + found.index + `${kind}: `.length, digits: found[1]! };
}

/**
 * The rewrite, as a pure function of the sources — which is what makes its two refusals testable.
 *
 * Returns the edits and the new text of each file it touched. Throws rather than returning a partial
 * result when a step's declaration is not in exactly one place, or when the span does not hold what it
 * was read to hold. A rewriter that is wrong about a span corrupts a file rather than failing, so it
 * fails.
 */
export function planSecondsEdits(
  sources: ReadonlyMap<string, string>,
  measured: ReadonlyMap<string, number>,
  declared: ReadonlyMap<string, number>,
  moved: (recorded: number | undefined, now: number) => boolean,
): { edits: SecondsEdit[]; sources: Map<string, string> } {
  const next = new Map(sources);
  const edits: SecondsEdit[] = [];

  for (const [step, now] of [...measured].sort()) {
    const was = declared.get(step);
    if (!moved(was, now)) continue;
    const found = [...next].flatMap(([file, source]) => {
      const at = inObjectLiteral(source, step) ?? inPoolSeconds(source, step);
      return at === undefined ? [] : [{ file, ...at }];
    });
    if (found.length !== 1) {
      throw new Error(`recordSeconds: ${step}'s cost is declared in ${found.length} places, not one `
        + `(${found.map((one) => one.file).join(', ') || 'none'}) — the table moved and this did not`);
    }
    const [{ file, at, digits }] = found as [{ file: string; at: number; digits: string }];
    const source = next.get(file)!;
    if (source.slice(at, at + digits.length) !== digits) {
      throw new Error(`recordSeconds: ${file} does not hold '${digits}' where ${step}'s cost was read; nothing written`);
    }
    next.set(file, source.slice(0, at) + String(now) + source.slice(at + digits.length));
    edits.push({ step, from: was ?? Number.NaN, to: now, file });
  }
  return { edits, sources: next };
}

/** The two tables a step's cost can be declared in, under the name this module's callers know them by */
export const SECONDS_TABLES = STEP_TABLES;

/** `planSecondsEdits` against the real tables, written back only if every splice held */
export function recordSeconds(measured: ReadonlyMap<string, number>, declared: ReadonlyMap<string, number>,
  moved: (recorded: number | undefined, now: number) => boolean): SecondsEdit[] {
  const read = new Map(SECONDS_TABLES.map((file) => [file, fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8')]));
  const { edits, sources } = planSecondsEdits(read, measured, declared, moved);
  if (edits.length > 0) for (const [file, source] of sources) fs.writeFileSync(path.join(REPO_ROOT, file), source);
  return edits;
}

/**
 * What each spec file took in the run that just happened, read back from that run's own output.
 *
 * Three consumers: the pool prints its slowest files, a `@slow:` marker on a spec that is no longer slow
 * fails the step, and `spec:dry` prices a plan from the last run on this machine. All three are answered
 * from one run on one machine, which is the whole reason this can exist at all — `spec-cost.json` recorded
 * a millisecond per spec in git and compared it across runs and machines against a fixed edge, and the
 * quantity turned out not to be one number: a spec reads 2.8s in the fast pool and 0.64s in the integration
 * pool, so each half's reading demanded a move the other took back.
 *
 * **The asymmetry is what makes one of the three a gate.** Load inflates a duration — measured 1.27x
 * median, 2.03x p90, 3.29x max — so it can hide a stale marker and cannot invent one. A marked spec that
 * reads fast is therefore a fact about the spec, and is failed; an unmarked spec that reads slow may be a
 * fact about the machine, and is only ever reported. Swapping those two directions is the mistake that
 * cost the deleted subsystem its window, its band and its two idle floors.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONFIG_BY_HALF, HALVES, halfOfPath, specFiles, type Half } from './spec-halves.ts';
import { UNIT_SUITES, type UnitSuite } from './unit-suites.ts';

// eslint-disable-next-line no-control-regex -- vitest colours its output and this reads it back
const ANSI = /\u001B\[[0-9;]*m/g;

/**
 * A reporter line for a whole file: the mark, an optional project label, the path, the test count and the
 * time. The count is what distinguishes a file's line from a test's, which carries neither it nor a path.
 *
 * The label is optional because vitest prints one only when a run covers more than one project, and both
 * of its spellings reduce to one token here — `|name|` when colour is off, and ` name ` in a background
 * colour when it is on, which the strip above leaves as bare text. Matching the path by its extension
 * rather than by position is what lets one pattern read both.
 */
const FILE = /^\s*[✓×↓❯]\s+(?:(\S+)\s+)?(\S+\.(?:spec|test)\.ts)\s+\([^)]*\)\s+([\d.]+)(ms|s)\b/;

/**
 * Which quantile of a half counts as its slow tail.
 *
 * Dimensionless on purpose: a file and the bar it is measured against come out of the same run, so a run
 * that was slow throughout moves both and the comparison survives it. That is the property a millisecond
 * could not have, and it is why the gate needs no idle floor — correlated movement cancels.
 *
 * Measured 2026-10-05 over 414 files, the five marked specs clear the fast half's p90 by 5.2x to 32.7x,
 * where a fixed 2,500ms left two of them 13% clear. **If this ever does fail on a spec that is still
 * genuinely slow, deepen the quantile** — the fix is never to record a reading, which is the subsystem
 * this replaced.
 */
export const SLOW_QUANTILE = 0.9;

/**
 * A duration in the unit it reads best in, which for a fast half's median of 16ms is not seconds.
 *
 * One formatter rather than one per caller: the pool's ranking and `spec:dry`'s total print the same
 * quantity, and `(ms / 1000).toFixed(1)` rendered most of a fast half as `0.0s`.
 */
export const asDuration = (ms: number): string => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`);

/**
 * When a run measured something, on the clock of whoever is reading it.
 *
 * A record's `measuredAt` is UTC, which is right for a stored field and wrong for a printed one: slicing
 * the ISO string drops the `Z`, and the result reads as wall-clock time. Observed four hours out on the
 * box that wrote it, under the words "measured here" — and past 20:00 at UTC-4 it printed tomorrow's date.
 * The whole purpose of the value is how stale the answer is, which is a question about the reader's clock.
 */
export const asLocalTime = (iso: string): string => {
  const at = new Date(iso);
  // An unparseable stamp is handed back as it came: this is a label, and a reader seeing the raw field is
  // better served than one seeing `NaN-NaN-NaN`
  if (Number.isNaN(at.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

/**
 * The marker a slow spec carries in its header, with its reason after the colon.
 *
 * Both comment spellings, because a header is written either way: a run of `//` lines, or a block whose
 * body lines open with `*`. Reading only the first ignored the marker on every spec that opens with a
 * block — 14 of 326 — and ignored it *silently*, so a contributor following the documented convention got
 * a marker nothing read and nothing reported. The trailing-delimiter branch is for a one-line block.
 */
const SLOW_MARKER = /^(?:\/\/|\*|\/\*+)\s*@slow:\s*(.+?)\s*(?:\*\/)?$/;

export interface FileDuration {
  /** The suite's directory under `packages/`, which is what a cache key and an input path need */
  readonly dir: string;
  /** The spec's path relative to its package, as the reporter prints it */
  readonly file: string;
  readonly half: Half;
  readonly ms: number;
}

/**
 * Which suite a reported file belongs to, from the label where there is one and from the path where there
 * is not.
 *
 * The two cover each other exactly, which is why both are here: a label is printed only when a run covers
 * two or more projects, and a path is ambiguous only when two covered suites hold the same relative path.
 * One pair does — `tests/source-layout.spec.ts` is in both `api` and `renderer` — and a run covering both
 * is a two-project run, so it has labels. A run with no label covers one suite, where the path cannot be
 * ambiguous at all.
 */
function suiteOf(label: string | undefined, file: string, covered: readonly UnitSuite[], root: string): UnitSuite | undefined {
  if (label !== undefined) {
    const named = label.replace(/\|/g, '');
    const found = covered.find((suite) => suite.workspace === named);
    if (found !== undefined) return found;
  }
  const holding = covered.filter((suite) => fs.existsSync(path.join(root, 'packages', suite.dir, file)));
  return holding.length === 1 ? holding[0] : undefined;
}

/**
 * Every file the run reported, attributed to the suite that holds it.
 *
 * Refuses a line it cannot attribute rather than dropping it. A silent drop here is a file missing from the
 * ranking, from the gate's population and from the cache at once, with nothing saying so — and the one way
 * it can happen is vitest changing how it labels a project, which this repo has already been bitten by
 * once (`projectsThatRan` read only the uncoloured spelling and reported all eleven projects absent).
 */
export function fileDurations(output: string, covered: readonly UnitSuite[], root: string): FileDuration[] {
  const rows: FileDuration[] = [];
  for (const raw of output.replace(ANSI, '').split('\n')) {
    const match = FILE.exec(raw);
    if (match === null) continue;
    const [, label, file, amount, unit] = match as unknown as [string, string | undefined, string, string, string];
    const suite = suiteOf(label, file, covered, root);
    if (suite === undefined) {
      throw new Error(`the run reported ${file}${label === undefined ? '' : ` under ${label}`} and it belongs to none of the ${covered.length} suite(s) this run covered — a project label or a spec's location has moved, and reading past it would drop the file from the ranking, the gate and the cache at once`);
    }
    rows.push({ dir: suite.dir, file, half: halfOfPath(file), ms: unit === 's' ? Number(amount) * 1000 : Number(amount) });
  }
  return rows;
}

/** The nearest-rank quantile of a set of readings, which needs at least one */
export function quantileOf(values: readonly number[], q: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

/**
 * The bar a file has to clear to be in its half's slow tail, per half and never across both.
 *
 * The two halves are different populations rather than two ends of one: measured 2026-10-05, the fast
 * half's median is 16ms against the integration half's 4,870ms, and its p90 0.6s against 25.3s.
 *
 * **What that buys today is the ranking, not the gate.** Each pool measures one half, so nothing in this
 * repo yet calls this with both in hand; asked of all 413 files at once the bar is 1.7s rather than 25.3s,
 * because the fast half outnumbers the other fifteen to one, and all five markers clear it either way. So
 * the split is construction, and the edit that would make it load-bearing is a run covering both halves —
 * one vitest invocation over both configs, or an integration half that grows to a comparable size. What it
 * does change now is which files a combined ranking would name: the five slowest of all 413 are all
 * integration files, so a single ranking would never show a slow fast-half spec at all.
 */
export const tailBar = (rows: readonly FileDuration[], half: Half, q = SLOW_QUANTILE): number | undefined =>
  quantileOf(rows.filter((row) => row.half === half).map((row) => row.ms), q);

/**
 * The slowest files of a half, which is what the run prints.
 *
 * Bounded rather than thresholded: a tenth of a half is above its own p90 by construction, which is ~38
 * files of the fast half and far too many to read. What this adds to what vitest already printed is the
 * ordering — vitest prints every file's time, in the order they finished.
 */
export const slowestFiles = (rows: readonly FileDuration[], half: Half, limit = 5): FileDuration[] =>
  rows.filter((row) => row.half === half).sort((a, b) => b.ms - a.ms).slice(0, limit);

/**
 * The reason a spec says it is slow, from its header.
 *
 * The leading comment block only, so the marker is where a reader who opened the file because it was slow
 * will see it. A `@slow:` further down is not a header and is not read — which is deliberate, since the
 * one place it could otherwise appear is a test's own body, describing something else.
 *
 * **The header is whichever comment forms open the file**, a block and line comments in any order, since
 * that is what "the header" means to whoever is writing one. Stopping at the first line that was not a
 * `//` read a block-comment header as no header at all.
 */
export function slowReason(source: string): string | undefined {
  let inBlock = false;
  for (const line of source.split('\n')) {
    const text = line.trim();
    if (text === '') continue;
    const match = SLOW_MARKER.exec(text);
    if (match !== null) return match[1]!.trim();
    if (inBlock) {
      if (text.includes('*/')) inBlock = false;
      continue;
    }
    // A one-line block opens and closes on this line, so it leaves the header open for the next
    if (text.startsWith('/*')) {
      inBlock = !text.includes('*/');
      continue;
    }
    if (!text.startsWith('//')) return undefined;
  }
  return undefined;
}

/** How much of a file to read looking for its header, which is a comment block and a reason, never more */
const HEADER_BYTES = 2048;

/** Every spec in a package that carries the marker, by its path relative to that package */
export function markedSpecs(packageDir: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of specFiles(packageDir)) {
    const handle = fs.openSync(path.join(packageDir, file), 'r');
    try {
      const buffer = Buffer.alloc(HEADER_BYTES);
      const read = fs.readSync(handle, buffer, 0, HEADER_BYTES, 0);
      const reason = slowReason(buffer.subarray(0, read).toString('utf8'));
      if (reason !== undefined) found.set(file, reason);
    } finally {
      fs.closeSync(handle);
    }
  }
  return found;
}

export interface Placement {
  /** Marked and no longer in its half's tail: the one direction load cannot fabricate, so the one that fails */
  readonly stale: { readonly dir: string; readonly file: string; readonly ms: number; readonly bar: number; readonly reason: string }[];
  /**
   * Among a half's slowest few and carrying no marker: reported only, never failed.
   *
   * Bounded by the ranking rather than by the bar, because a tenth of a half is above its own p90 by
   * construction — 39 files of this repo's fast half, which is a list nobody reads. And reported rather
   * than failed because load inflates a duration, so this is the one of the two directions a busy machine
   * can fabricate.
   */
  readonly unmarked: FileDuration[];
  /** Halves this run measured but could not place anything in, with how many files it had */
  readonly unplaceable: { readonly half: Half; readonly files: number }[];
}

/**
 * Whether a half this run measured has a tail to place a file in at all.
 *
 * **A nearest-rank quantile of a small population is its maximum**, and then nothing is above the bar —
 * including the slowest file in it. So the question is not how many files a run needs but whether the one
 * it measured has anyone in its tail, which is the same question and is derived rather than picked: a
 * population floor would be a constant that happens to equal this, and would stop being equal to it the
 * day the quantile moved. Measured 2026-10-05, `publish-checks` alone is 4 files whose p90 is the slowest
 * of them, and `renderer` alone is 8.
 *
 * It matters because a pool run is partial by design — it runs the projects whose inputs moved — so a run
 * of one small project is the ordinary case rather than a corner.
 */
const placeable = (rows: readonly FileDuration[], half: Half, bar: number): boolean =>
  rows.some((row) => row.half === half && row.ms > bar);

/**
 * What a run says about its own `@slow:` markers.
 *
 * Only over the files the run actually reported: a pool runs the projects whose inputs moved, so a marked
 * spec in a project that did not run is not evidence either way and is absent from every list rather than
 * counted as passing. A half the run did not measure at all is absent too, rather than unplaceable — the
 * host pool never measures the integration half, and saying so on every run would be noise about a
 * question nobody asked.
 */
export function placementOf(
  rows: readonly FileDuration[],
  marked: ReadonlyMap<string, Map<string, string>>,
  { q = SLOW_QUANTILE, limit = 5 }: { q?: number; limit?: number } = {},
): Placement {
  const stale: Placement['stale'] = [];
  const unmarked: FileDuration[] = [];
  const unplaceable: Placement['unplaceable'] = [];
  const reasonOf = (row: FileDuration): string | undefined => marked.get(row.dir)?.get(row.file);
  for (const half of HALVES) {
    const bar = tailBar(rows, half, q);
    if (bar === undefined) continue;
    if (!placeable(rows, half, bar)) {
      unplaceable.push({ half, files: rows.filter((row) => row.half === half).length });
      continue;
    }
    for (const row of rows) {
      if (row.half !== half) continue;
      const reason = reasonOf(row);
      if (reason !== undefined && row.ms <= bar) stale.push({ dir: row.dir, file: row.file, ms: row.ms, bar, reason });
    }
    for (const row of slowestFiles(rows, half, limit)) {
      if (reasonOf(row) === undefined && row.ms > bar) unmarked.push(row);
    }
  }
  return { stale, unmarked, unplaceable };
}

/**
 * Where a run leaves what it measured, for `spec:dry` to price a plan from.
 *
 * Beside the package builds', the chain's and the pool's stamps, in the same cache directory, because what
 * it holds is the same kind of thing: a fact about this machine that no other machine's answer can stand
 * in for. It is not committed and has no `machine` field for the same reason — nothing can carry it off
 * this box, so nothing has to say which box it came from.
 */
export const durationCacheDir = (root: string): string => path.join(root, 'node_modules', '.cache', 'abuddy-spec-durations');

/**
 * Keyed by suite **and half**, because one suite's two halves are measured by different runs.
 *
 * One key for both would have the host pool's record of a suite clobber the integration pool's and back
 * again on every chain run — the same defect the pool's own stamps had until their key gained the half.
 */
const recordFor = (root: string, dir: string, half: Half): string => path.join(durationCacheDir(root), `${dir}.${half}.json`);

export interface DurationRecord {
  /** When the run that measured these finished, so a reader can say how old the answer is */
  readonly measuredAt: string;
  /** Milliseconds per spec, by its path relative to the package */
  readonly ms: Readonly<Record<string, number>>;
}

/** What the run measured, one record per suite and half it covered */
export function writeDurations(root: string, rows: readonly FileDuration[], measuredAt = new Date().toISOString()): void {
  const byRecord = new Map<string, FileDuration[]>();
  for (const row of rows) {
    const key = `${row.dir}\u0000${row.half}`;
    byRecord.set(key, [...byRecord.get(key) ?? [], row]);
  }
  for (const [key, held] of byRecord) {
    const [dir, half] = key.split('\u0000') as [string, Half];
    const file = recordFor(root, dir, half);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const ms = Object.fromEntries([...held].sort((a, b) => a.file.localeCompare(b.file)).map((row) => [row.file, row.ms]));
    fs.writeFileSync(file, `${JSON.stringify({ measuredAt, ms } satisfies DurationRecord, null, 2)}\n`);
  }
}

/**
 * What the last run measured, or `undefined` where no run on this machine has measured it.
 *
 * `undefined` for a corrupt or half-written file too: both mean "no evidence about what this costs", which
 * a caller has to be able to say anyway for a fresh clone. Nothing here is load-bearing enough to refuse
 * over — the answer `spec:dry` gives without it is the listing, which is the answer it gives at all.
 */
export function readDurations(root: string, dir: string, half: Half): DurationRecord | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(recordFor(root, dir, half), 'utf8');
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { measuredAt, ms } = parsed as Partial<DurationRecord>;
    if (typeof measuredAt !== 'string' || typeof ms !== 'object' || ms === null) return undefined;
    return { measuredAt, ms };
  } catch {
    return undefined;
  }
}

/**
 * Every record a run could write, which is what says a file in there answers for nobody.
 *
 * The writer prunes, as the chain's stamps and the pool's do: a cache that only grows is one where a name
 * collision with a suite long gone is a silent pass.
 */
export function pruneDurationCache(root: string): void {
  const dir = durationCacheDir(root);
  if (!fs.existsSync(dir)) return;
  // The halves a suite *has*, read from its own configs, rather than every half there is. A package with
  // one config can hold no integration record, so a cross product admits names no run would ever write and
  // a prune that admits them never removes them. `livePoolStamps` derives its set from the pools for the
  // same reason, and this is the same question asked of the configs the pools are themselves derived from.
  const live = new Set(UNIT_SUITES.flatMap((suite) => HALVES
    .filter((half) => fs.existsSync(path.join(root, 'packages', suite.dir, CONFIG_BY_HALF[half])))
    .map((half) => `${suite.dir}.${half}.json`)));
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.json') && !live.has(file)) fs.rmSync(path.join(dir, file));
  }
}

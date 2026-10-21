// What each chain step cost the last few times it passed on this machine — a reading, never a declaration.
//
// A step's cost orders nothing that decides pass or fail: it draws the critical path `--dry` and a run
// report, and it is the context a timeout message gives beside the deadline. So it is recorded rather than
// written by hand, in a window that is uncommitted and machine-local, like the specs' durations it shares
// its window code with (`spec-durations.ts`). Nothing compares it against an edge, so it needs no band,
// floor or machine field: a reading from this box describes this box, and no other box can read it.
import path from 'node:path';
import { prependToWindow, readWindow } from './spec-durations.ts';

/** One passing run's step costs, in milliseconds by step name */
export interface StepDurationRecord {
  readonly measuredAt: string;
  readonly ms: Readonly<Record<string, number>>;
}

/**
 * What a step with no reading yet is assumed to cost, in seconds — one neutral figure, so a fresh clone's
 * critical path is a shape rather than nothing, and says how many of its steps it assumed.
 */
export const UNREAD_STEP_SECONDS = 10;

export const stepDurationsFile = (root: string): string =>
  path.join(root, 'node_modules', '.cache', 'apack-step-durations', 'steps.json');

const sound = (value: unknown): StepDurationRecord | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const { measuredAt, ms } = value as Partial<StepDurationRecord>;
  return typeof measuredAt === 'string' && typeof ms === 'object' && ms !== null ? { measuredAt, ms } : undefined;
};

/**
 * Adds a run's readings to the window. The caller passes only steps that passed and were not killed: a
 * failure stops early and a kill's time is its deadline, and neither is what the step costs.
 */
export function recordStepDurations(root: string, ms: ReadonlyMap<string, number>, measuredAt = new Date().toISOString()): void {
  if (ms.size === 0) return;
  prependToWindow(stepDurationsFile(root), { measuredAt, ms: Object.fromEntries(ms) }, sound);
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Each step's median cost across the window, in seconds to a tenth — absent for a step never recorded here */
export function readStepSeconds(root: string): Map<string, number> {
  const readings = new Map<string, number[]>();
  for (const run of readWindow(stepDurationsFile(root), sound) ?? []) {
    for (const [step, ms] of Object.entries(run.ms)) readings.set(step, [...readings.get(step) ?? [], ms]);
  }
  return new Map([...readings].map(([step, ms]) => [step, Math.round(median(ms) / 100) / 10]));
}

/** The steps with their recorded cost, or `UNREAD_STEP_SECONDS` and their name in `unread` where there is none */
export function withRecordedSeconds<S extends { readonly name: string }>(
  steps: readonly S[],
  recorded: ReadonlyMap<string, number>,
): { steps: (S & { seconds: number })[]; unread: string[] } {
  const unread = steps.filter((step) => !recorded.has(step.name)).map((step) => step.name);
  return {
    steps: steps.map((step) => ({ ...step, seconds: recorded.get(step.name) ?? UNREAD_STEP_SECONDS })),
    unread,
  };
}

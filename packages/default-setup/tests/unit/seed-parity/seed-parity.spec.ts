// Parity gate for seeding: the rows default-setup's library, notes, actions and prompts seeds produce,
// compared against golden snapshots recorded from the pre-generic pipeline. Record them again only
// deliberately: UPDATE_SEED_GOLDEN=1 npx vitest run tests/unit/seed-parity
//
// Notes are the one intended difference (goal-generic-seed-compiler Decision 10): they now carry a
// sourceHash and follow the same change-tracking rules as every other entry. Their sourceHash field
// and seed counts are left out of the goldens, and the steps where the old pipeline overwrote notes
// are compared by the Decision 10 rules in notes-change-tracking.spec.ts instead.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { ImportMode, SeedCounts, SeedIncludeSet } from '@abuddy/sdk/utils';
import { untypedQx } from '@abuddy/sdk/ears';
import { dropAttribute, entityIds } from '@abuddy/sdk/testing';
import { compileSeeds, resetDatabase, seed, snapshot, type Snapshot } from './harness';

const GOLDEN_DIR = path.join(import.meta.dirname, '__golden__');
const UPDATE = process.env.UPDATE_SEED_GOLDEN === '1';

/**
 * Steps where the old pipeline rewrote existing notes (every re-seed, whatever the mode or hash) and
 * the Decision 10 rules leave them alone: compared by those rules in notes-change-tracking.spec.ts.
 * Wipe re-seeds leave notes out, so they aren't listed.
 */
export const NOTES_INTENDED_DIFFERENCES = new Set([
  ...['default', 'replace-on-collision', 'keep-existing'].flatMap((mode) => [`${mode}/unchanged`, `${mode}/changed`]),
  'untracked/untracked',
]);

type Step = { name: string; snapshot: Snapshot; counts: Record<string, SeedCounts> };

const compiled = new Map<string, string>();
async function compiledDir(sources: 'v1' | 'v2' | 'default-setup'): Promise<string> {
  if (!compiled.has(sources)) {
    const dir = await compileSeeds(sources);
    if (sources === 'v2') {
      // Actions and prompts come from the pack's own sources; change one of each so re-seeds see an edit
      for (const key of ['actions', 'prompts']) {
        const file = path.join(dir, `${key}.seed.json`);
        const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as { records: Array<Record<string, unknown>> };
        const [first] = data.records;
        data.records[0] = { ...first, description: `${first.description} (v2)`, sourceHash: `${first.sourceHash}-v2` };
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      }
    }
    compiled.set(sources, dir);
  }
  return compiled.get(sources)!;
}
afterAll(() => {
  for (const dir of compiled.values()) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A step's record in the golden file. Notes' sourceHash and counts are omitted (intended difference).
 * Action and prompt rows are large (function bodies), so they're recorded as a digest of the whole
 * normalized row plus the fields that identify them: still an exact comparison.
 */
function forGolden(step: Step, withNotes: boolean) {
  const digest = (row: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
  const rows = Object.fromEntries(
    Object.entries(step.snapshot.rows)
      .filter(([alias]) => withNotes || !alias.startsWith('Note:'))
      .map(([alias, row]) => {
        if (alias.startsWith('Action:') || alias.startsWith('Prompt:')) {
          return [alias, { label: row.label, description: row.description, sourceHash: row.sourceHash, rowSha256: digest(row) }];
        }
        if (!alias.startsWith('Note:')) return [alias, row];
        const { sourceHash: _omitted, ...rest } = row;
        return [alias, rest];
      }),
  );
  const isNote = (text: string) => text.includes('Note:');
  return {
    rows,
    relations: withNotes ? step.snapshot.relations : step.snapshot.relations.filter((r) => !isNote(r)),
    media: step.snapshot.media,
    counts: Object.fromEntries(Object.entries(step.counts).filter(([key]) => key !== 'notes')),
  };
}

function checkGolden(scenario: string, steps: Step[]) {
  const file = path.join(GOLDEN_DIR, `${scenario.replace(/\//g, '__')}.json`);
  const actual = Object.fromEntries(steps.map((step) => [
    step.name,
    forGolden(step, !NOTES_INTENDED_DIFFERENCES.has(`${scenario}/${step.name}`)),
  ]));
  if (UPDATE) {
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  expect(fs.existsSync(file), `missing golden ${path.relative(process.cwd(), file)}`).toBe(true);
  const golden = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, ReturnType<typeof forGolden>>;
  // The goldens hold the old pipeline's notes for every step; leave them out where the rules differ
  for (const [name, step] of Object.entries(golden)) {
    if (!NOTES_INTENDED_DIFFERENCES.has(`${scenario}/${name}`)) continue;
    step.rows = Object.fromEntries(Object.entries(step.rows).filter(([alias]) => !alias.startsWith('Note:')));
    step.relations = step.relations.filter((relation) => !relation.includes('Note:'));
  }
  expect(actual).toEqual(golden);
}

async function run(
  plan: Array<{ name: string; sources: 'v1' | 'v2' | 'default-setup'; mode?: ImportMode; include?: Record<string, SeedIncludeSet>; before?: () => void }>,
): Promise<Step[]> {
  resetDatabase();
  const steps: Step[] = [];
  for (const step of plan) {
    step.before?.();
    const counts = seed(await compiledDir(step.sources), { mode: step.mode, include: step.include });
    steps.push({ name: step.name, snapshot: snapshot(), counts });
  }
  return steps;
}

/** Drops the stored sourceHash from the first row of a type, making it look user-owned */
function untrack(aliasPrefix: string) {
  return () => {
    const current = snapshot();
    const alias = Object.keys(current.rows).find((a) => a.startsWith(aliasPrefix));
    if (!alias) throw new Error(`no ${aliasPrefix} row to untrack`);
    const id = resolveId(alias);
    dropAttribute(id as never, 'sourceHash');
  };
}

function resolveId(alias: string): string {
  const { rows } = snapshot();
  const [type] = alias.split(':');
  const target = rows[alias];
  for (const id of entityIds() as string[]) {
    if (!id.startsWith(`${type}-`)) continue;
    const row = (untypedQx(id as never).pickAll() as Array<Record<string, unknown>>)[0];
    const label = row?.name ?? row?.title ?? row?.label;
    if (label === (target.name ?? target.title ?? target.label)) return id;
  }
  throw new Error(`no row for ${alias}`);
}

const MODES: Array<ImportMode | undefined> = [undefined, 'replace-on-collision', 'keep-existing', 'wipe-and-replace'];

describe('seed parity (golden snapshots from the pre-generic pipeline)', () => {
  it.each(MODES.map((mode) => [mode ?? 'default']))('fresh, unchanged and changed re-seeds in mode %s', async (label) => {
    const mode = label === 'default' ? undefined : label as ImportMode;
    // The old notes seeder throws when it wipes nested notes (deleting a parent already deleted its
    // children), so wipe re-seeds leave notes out here; notes-change-tracking.spec.ts covers wiping them.
    const include = mode === 'wipe-and-replace' ? { notes: new Set<string>() } : undefined;
    const steps = await run([
      { name: 'fresh', sources: 'v1', mode },
      { name: 'unchanged', sources: 'v1', mode, include },
      { name: 'changed', sources: 'v2', mode, include },
    ]);
    checkGolden(label, steps);
  }, 120_000);

  it('leaves rows without a stored sourceHash alone (user-owned)', async () => {
    const steps = await run([
      { name: 'fresh', sources: 'v1' },
      {
        name: 'untracked',
        sources: 'v2',
        mode: 'replace-on-collision',
        before: () => {
          untrack('Document:Getting Started')();
          untrack('Action:')();
        },
      },
    ]);
    checkGolden('untracked', steps);
  }, 120_000);

  it('seeds only the included items', async () => {
    const steps = await run([
      {
        name: 'fresh',
        sources: 'v1',
        include: {
          library: new Set(['Guides']),
          notes: new Set(['Projects']),
          actions: new Set(['Set Instructions']),
          prompts: new Set<string>(),
        },
      },
    ]);
    checkGolden('include', steps);
  }, 120_000);

  it("seeds default-setup's own library, notes, actions and prompts", async () => {
    const steps = await run([{ name: 'fresh', sources: 'default-setup' }]);
    checkGolden('default-setup', steps);
  }, 120_000);
});

// Notes through the generic seed pipeline: markdown compiled into records, seeded by the SDK's
// generic seeder through default-setup's Note seed hooks.
// - Fresh seeds must produce the same notes rows as the pre-generic pipeline (the goldens).
// - Re-seeds follow goal-generic-seed-compiler Decision 10: notes carry a sourceHash, an unchanged or
//   missing stored hash leaves the row alone, keep-existing skips, wipe-and-replace works on nested notes.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileFormatEntry, type GenericSeedEntry, type SeedRecord } from '@abuddy/sdk/build';
import { createSeeder, seedHookRegistry } from '@abuddy/sdk/seed';
import type { ImportMode, SeedCounts, SeedIncludeSet } from '@abuddy/sdk/utils';
import { dropAttr, getAllEntities, qx } from '@abuddy/host/ears';
import { noteSeedHooks } from '@/features/notes/be/seed-hooks';
import { FIXTURES, PACK_DIR, resetDatabase, snapshot, type Snapshot } from './harness';

const manifest = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'abuddy.json'), 'utf-8'));
const manifestEntry = manifest.boot.seed.notes as string | GenericSeedEntry;

/** The manifest's notes entry once it is an object entry; until then, the entry it will become */
const NOTES_ENTRY: GenericSeedEntry = typeof manifestEntry === 'object' ? manifestEntry : {
  format: 'markdown-tree',
  entity: 'Note',
  identity: ['title', 'parent'],
  tree: { branch: 'index.md', relKind: 'contains' },
  fields: {
    title: { from: 'frontmatter.title', default: 'filename', type: 'string' },
    noteType: { from: 'frontmatter.type', default: 'document' },
    icon: { from: 'frontmatter.icon', default: null, type: 'string' },
    favorite: { from: 'frontmatter.favorite', default: false },
    hideCompletedChildren: { from: 'frontmatter.hideCompletedChildren', default: false },
    completed: { from: 'frontmatter.completed', default: false },
    content: { from: 'body' },
  },
};

const GOLDEN_DIR = path.join(import.meta.dirname, '__golden__');
const golden = (scenario: string) => JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, `${scenario}.json`), 'utf-8'));

const dirs: string[] = [];
const compiled = new Map<string, { dir: string; records: SeedRecord[] }>();
function compile(sources: 'v1' | 'v2' | 'default-setup') {
  if (!compiled.has(sources)) {
    const source = sources === 'default-setup'
      ? path.join(PACK_DIR, 'src/seeds/notes')
      : path.join(FIXTURES, sources, 'notes');
    const records = compileFormatEntry('notes', NOTES_ENTRY, source);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-seed-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'notes.seed.json'), JSON.stringify({ records }));
    compiled.set(sources, { dir, records });
  }
  return compiled.get(sources)!;
}

beforeAll(() => {
  if (!seedHookRegistry.get('Note')) seedHookRegistry.register('Note', noteSeedHooks as never, 'default-setup');
});
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

const seeder = createSeeder({ key: 'notes', identity: NOTES_ENTRY.identity, relKind: NOTES_ENTRY.tree?.relKind });
function seedNotes(sources: 'v1' | 'v2' | 'default-setup', options: { mode?: ImportMode; include?: SeedIncludeSet } = {}): SeedCounts {
  return seeder.seed({ compiledDir: compile(sources).dir, mode: options.mode, include: options.include, log: () => {} });
}

/** The notes part of a snapshot, as the goldens record it */
function notesOf(snap: Snapshot, { withHash = false } = {}) {
  return {
    rows: Object.fromEntries(
      Object.entries(snap.rows)
        .filter(([alias]) => alias.startsWith('Note:'))
        .map(([alias, row]) => {
          if (withHash) return [alias, row];
          const { sourceHash: _omitted, ...rest } = row;
          return [alias, rest];
        }),
    ),
    relations: snap.relations.filter((relation) => relation.includes('Note:')),
  };
}

/** Records flattened with the aliases the snapshot gives their rows */
function flatten(records: SeedRecord[], parent = ''): Array<{ alias: string; record: SeedRecord }> {
  return records.flatMap((record) => {
    const alias = `${parent || 'Note:'}${parent ? '/' : ''}${record.title}`;
    return [{ alias, record }, ...flatten(record.children ?? [], alias)];
  });
}

/** A row holds the record's seeded values */
function expectSeededValues(row: Record<string, unknown>, record: SeedRecord) {
  expect({
    title: row.title,
    content: row.content,
    noteType: row.noteType,
    icon: row.icon ?? null,
    completed: row.completed,
    favorite: row.favorite ?? false,
    hideCompletedChildren: row.hideCompletedChildren ?? false,
    sourceHash: row.sourceHash,
  }).toEqual({
    title: record.title,
    content: record.content,
    noteType: record.noteType,
    icon: record.icon,
    completed: record.completed,
    favorite: record.favorite,
    hideCompletedChildren: record.hideCompletedChildren,
    sourceHash: record.sourceHash,
  });
}

/**
 * The Decision 10 rules for a re-seed: an existing row is left as it was when its stored hash matches
 * the record's or is missing (or in keep-existing, with its subtree); otherwise it holds the record's
 * values. New records under a visited parent are created. A row left alone may still have its
 * displayOrder shifted: noteCommands.create moves siblings at or after a new note's position.
 */
function expectReseed(before: Snapshot, after: Snapshot, records: SeedRecord[], mode: ImportMode | undefined) {
  const skippedSubtrees: string[] = [];
  const unmoved = (row: Record<string, unknown> | undefined) => {
    if (!row) return row;
    const { displayOrder: _shifted, ...rest } = row;
    return rest;
  };
  for (const { alias, record } of flatten(records)) {
    const previous = before.rows[alias];
    const row = after.rows[alias];
    if (skippedSubtrees.some((root) => alias.startsWith(`${root}/`))) {
      expect(unmoved(row), `${alias} under a skipped subtree`).toEqual(unmoved(previous));
      continue;
    }
    if (!previous) {
      expect(row, `${alias} created`).toBeDefined();
      expectSeededValues(row, record);
    } else if (mode === 'keep-existing') {
      expect(unmoved(row), `${alias} kept`).toEqual(unmoved(previous));
      skippedSubtrees.push(alias);
    } else if (!previous.sourceHash || previous.sourceHash === record.sourceHash) {
      expect(unmoved(row), `${alias} left alone`).toEqual(unmoved(previous));
    } else {
      expectSeededValues(row, record);
    }
  }
}

describe('notes seeding (generic pipeline)', () => {
  it.each([
    ['default', undefined],
    ['replace-on-collision', 'replace-on-collision'],
    ['keep-existing', 'keep-existing'],
    ['wipe-and-replace', 'wipe-and-replace'],
  ] as const)('fresh seed in mode %s matches the pre-generic rows', (scenario, mode) => {
    resetDatabase();
    seedNotes('v1', { mode });
    expect(notesOf(snapshot())).toEqual(notesOf(golden(scenario).fresh));
  });

  it('seeds only the included notes, as before', () => {
    resetDatabase();
    seedNotes('v1', { include: new Set(['Projects']) });
    expect(notesOf(snapshot())).toEqual(notesOf(golden('include').fresh));
  });

  it("seeds default-setup's own notes, as before", () => {
    resetDatabase();
    seedNotes('default-setup');
    expect(notesOf(snapshot())).toEqual(notesOf(golden('default-setup').fresh));
  });

  it('stores a sourceHash on every seeded note', () => {
    resetDatabase();
    seedNotes('v1');
    const rows = notesOf(snapshot(), { withHash: true }).rows;
    expect(Object.keys(rows).length).toBeGreaterThan(0);
    for (const [alias, row] of Object.entries(rows)) expect(row.sourceHash, alias).toMatch(/^[0-9a-f]{16}$/);
  });

  it.each([undefined, 'replace-on-collision', 'keep-existing'] as const)('re-seeding unchanged sources in mode %s changes nothing', (mode) => {
    resetDatabase();
    seedNotes('v1', { mode });
    const before = snapshot();
    const counts = seedNotes('v1', { mode });
    expect(snapshot()).toEqual(before);
    // Four notes; keep-existing skips the two top-level notes with their subtrees
    expect(counts).toEqual({ created: 0, updated: 0, skipped: mode === 'keep-existing' ? 2 : 4 });
  });

  it.each([undefined, 'replace-on-collision', 'keep-existing'] as const)('re-seeding changed sources in mode %s follows the change-tracking rules', (mode) => {
    resetDatabase();
    seedNotes('v1', { mode });
    const before = snapshot();
    seedNotes('v2', { mode });
    expectReseed(before, snapshot(), compile('v2').records, mode);
  });

  it('leaves a note without a stored sourceHash alone (user-owned)', () => {
    resetDatabase();
    seedNotes('v1');
    const welcome = (getAllEntities() as string[]).find((id) =>
      id.startsWith('Note-') && (qx(id as never).pickAll() as Array<Record<string, unknown>>)[0]?.title === 'Welcome');
    dropAttr(welcome as never, 'sourceHash' as never);
    const before = snapshot();
    seedNotes('v2', { mode: 'replace-on-collision' });
    const after = snapshot();
    expect(after.rows['Note:Welcome'], 'the untracked note').toEqual(before.rows['Note:Welcome']);
    expectReseed(before, after, compile('v2').records, 'replace-on-collision');
  });

  it('wipes nested notes and seeds them again', () => {
    resetDatabase();
    seedNotes('v2');
    const freshV2 = notesOf(snapshot(), { withHash: true });
    resetDatabase();
    seedNotes('v1');
    const counts = seedNotes('v2', { mode: 'wipe-and-replace' });
    expect(counts.errors).toBeUndefined();
    expect(notesOf(snapshot(), { withHash: true })).toEqual(freshV2);
  });
});

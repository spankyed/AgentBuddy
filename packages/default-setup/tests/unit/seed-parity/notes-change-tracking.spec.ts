// Notes through the generic seed pipeline: markdown compiled into records, seeded by the SDK's
// generic seeder through default-setup's Note seed hooks.
// - Fresh seeds must produce the same notes rows as the goldens (first recorded from the pre-generic pipeline).
// - Re-seeds follow goal-generic-seed-compiler Decision 10: notes carry a sourceHash, an unchanged or
//   missing stored hash leaves the row alone, keep-existing skips, wipe-and-replace works on nested notes.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compileBuiltinFormat, type SeedFormatConfig, type SeedRecord } from '@abuddy/sdk/build';
import { createSeeder } from '@abuddy/sdk/seed';
import type { ImportMode, SeedCounts, SeedIncludeSet } from '@abuddy/sdk/utils';
import { untypedQx as qx } from '@abuddy/ears';
import { dropAttribute, entityIds } from '@abuddy/sdk/testing';
import { createEntityWithDefaults, type EARS } from '@/__generated__/ears';
import { FIXTURES, PACK_DIR, resetDatabase, snapshot, type Snapshot } from './harness';

const manifest = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'abuddy.json'), 'utf-8'));
/** default-setup's notes format; the test setup registers its Note seed hooks with the pack */
const NOTES_FORMAT = manifest.seedFormats.notes as SeedFormatConfig;

const GOLDEN_DIR = path.join(import.meta.dirname, '__golden__');
const golden = (scenario: string) => JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, `${scenario}.json`), 'utf-8'));

const dirs: string[] = [];
const compiled = new Map<string, { dir: string; records: SeedRecord[] }>();
function compile(sources: 'v1' | 'v2' | 'default-setup') {
  if (!compiled.has(sources)) {
    const source = sources === 'default-setup'
      ? path.join(PACK_DIR, 'src/seeds/notes')
      : path.join(FIXTURES, sources, 'notes');
    const records = compileBuiltinFormat('notes', NOTES_FORMAT, source);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-seed-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'seeds.json'), JSON.stringify({ version: 1, packId: 'default-setup', seeds: [] }));
    fs.writeFileSync(path.join(dir, 'notes.seed.json'), JSON.stringify({ records }));
    compiled.set(sources, { dir, records });
  }
  return compiled.get(sources)!;
}

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

const seeder = createSeeder({ key: 'notes', entities: ['Note'], identity: NOTES_FORMAT.identity, relKind: NOTES_FORMAT.tree?.relKind });
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

/** A row holds the record's seeded values, and noteCommands' defaults for the fields the record doesn't set */
function expectSeededValues(row: Record<string, unknown>, record: SeedRecord) {
  const defaults = { noteType: 'document', icon: null, completed: false, favorite: false, hideCompletedChildren: false };
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
    ...defaults,
    ...Object.fromEntries(Object.keys(defaults).filter((field) => record[field] !== undefined).map((field) => [field, record[field]])),
    title: record.title,
    content: record.content,
    sourceHash: record.sourceHash,
  });
}

/** The notes the fixtures' Welcome links to, as a user's notes (titled by their ids): links to missing notes are never unlinked */
const LINK_TARGETS = ['Note-external-plan', 'Note-external-roadmap'];
function addLinkTargets() {
  for (const id of LINK_TARGETS) createEntityWithDefaults('Note', { title: id }, undefined, id as EARS.EntityId);
}

/** A row's REFERENCES targets in a snapshot */
const referencesOf = (snap: Snapshot, alias: string) =>
  snap.relations.filter((relation) => relation.startsWith(`${alias} --references--> `)).map((relation) => relation.split(' --references--> ')[1]).sort();
/** The note ids a record's content links to */
const linksOf = (record: SeedRecord) => [...String(record.content ?? '').matchAll(/\]\(note:\/\/([^)]+)\)/g)].map((match) => `Note:${match[1]}`).sort();

/**
 * The Decision 10 rules for a re-seed: an existing row is left as it was when its stored hash matches
 * the record's or is missing (or in keep-existing, with its subtree); otherwise it holds the record's
 * values and references the notes its content links to. New records under a visited parent are created. A row left alone may still have its
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
    const unchanged = () => expect(referencesOf(after, alias), `${alias} references`).toEqual(referencesOf(before, alias));
    if (skippedSubtrees.some((root) => alias.startsWith(`${root}/`))) {
      expect(unmoved(row), `${alias} under a skipped subtree`).toEqual(unmoved(previous));
      unchanged();
      continue;
    }
    if (!previous) {
      expect(row, `${alias} created`).toBeDefined();
      expectSeededValues(row, record);
      expect(referencesOf(after, alias), `${alias} references`).toEqual(linksOf(record));
    } else if (mode === 'keep-existing') {
      expect(unmoved(row), `${alias} kept`).toEqual(unmoved(previous));
      unchanged();
      skippedSubtrees.push(alias);
    } else if (!previous.sourceHash || previous.sourceHash === record.sourceHash) {
      expect(unmoved(row), `${alias} left alone`).toEqual(unmoved(previous));
      unchanged();
    } else {
      expectSeededValues(row, record);
      expect(referencesOf(after, alias), `${alias} references`).toEqual(linksOf(record));
    }
  }
}

describe('notes seeding (generic pipeline)', () => {
  it.each([
    ['default', undefined],
    ['replace-on-collision', 'replace-on-collision'],
    ['keep-existing', 'keep-existing'],
    ['wipe-and-replace', 'wipe-and-replace'],
  ] as const)('fresh seed in mode %s matches the golden notes', (scenario, mode) => {
    resetDatabase();
    seedNotes('v1', { mode });
    expect(notesOf(snapshot())).toEqual(notesOf(golden(scenario).fresh));
  });

  it('seeds only the included notes', () => {
    resetDatabase();
    seedNotes('v1', { include: new Set(['Projects']) });
    expect(notesOf(snapshot())).toEqual(notesOf(golden('include').fresh));
  });

  it("seeds default-setup's own notes", () => {
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
    // Seven notes; keep-existing skips the two top-level notes with their subtrees
    expect(counts).toEqual({ created: 0, updated: 0, skipped: mode === 'keep-existing' ? 2 : 7 });
  });

  it.each([undefined, 'replace-on-collision', 'keep-existing'] as const)('re-seeding changed sources in mode %s follows the change-tracking rules', (mode) => {
    resetDatabase();
    addLinkTargets();
    seedNotes('v1', { mode });
    const before = snapshot();
    seedNotes('v2', { mode });
    const after = snapshot();
    expectReseed(before, after, compile('v2').records, mode);
    // Welcome's v2 content links to another note: the update moves its REFERENCES link
    expect(referencesOf(before, 'Note:Welcome')).toEqual(['Note:Note-external-plan']);
    expect(referencesOf(after, 'Note:Welcome')).toEqual([mode === 'keep-existing' ? 'Note:Note-external-plan' : 'Note:Note-external-roadmap']);
    // A change two folders down is seeded too
    expect(after.rows['Note:Projects/Archive/Old Task'].completed).toBe(mode !== 'keep-existing');
  });

  it('leaves a note without a stored sourceHash alone (user-owned)', () => {
    resetDatabase();
    addLinkTargets();
    seedNotes('v1');
    const welcome = (entityIds() as string[]).find((id) =>
      id.startsWith('Note-') && (qx(id as never).pickAll() as Array<Record<string, unknown>>)[0]?.title === 'Welcome');
    dropAttribute(welcome as never, 'sourceHash');
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

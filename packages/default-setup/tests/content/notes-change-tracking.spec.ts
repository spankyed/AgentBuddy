// Notes through the generic seed pipeline: markdown compiled into records, written by the SDK's
// generic applier through default-setup's Note content writers.
// - Fresh seeds must produce the same notes rows as the goldens (first recorded from the pre-generic pipeline).
// - Re-seeds follow goal-generic-seed-compiler Decision 10: notes carry a contentHash, an unchanged or
//   missing stored hash leaves the row alone, keep-existing skips, wipe-and-replace works on nested notes.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compileBuiltinFormat, type ContentFormatConfig, type ContentItem } from '@abuddy/sdk/build';
import { createFormatApplier } from '@abuddy/sdk/content';
import type { ApplyRecord, ImportMode, ApplyResult, ContentSelection } from '@abuddy/sdk/utils';
import { untypedQx as qx, untypedTx as tx } from '@abuddy/ears';
import { trash } from '@abuddy/sdk/repositories';
import { dropAttribute, entityIds } from '@abuddy/sdk/testing';
import { createEntityWithDefaults, type EARS } from '#generated/ears.ts';
import { FIXTURES, PACK_DIR, applyAfter, resetDatabase, snapshot, type Snapshot } from './harness.ts';

const manifest = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'abuddy.json'), 'utf-8'));
/** default-setup's notes format; the test setup registers its Note content writers with the pack */
const NOTES_FORMAT = manifest.content!.formats.notes as ContentFormatConfig;


const dirs: string[] = [];
const compiled = new Map<string, { dir: string; records: ContentItem[] }>();
function compile(sources: 'v1' | 'v2' | 'default-setup') {
  if (!compiled.has(sources)) {
    const source = sources === 'default-setup'
      ? path.join(PACK_DIR, 'src/content/notes')
      : path.join(FIXTURES, sources, 'notes');
    const records = compileBuiltinFormat('notes', NOTES_FORMAT, source);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-seed-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'content.json'), JSON.stringify({ version: 1, packId: 'default-setup', seeds: [] }));
    fs.writeFileSync(path.join(dir, 'notes.content.json'), JSON.stringify({ records }));
    compiled.set(sources, { dir, records });
  }
  return compiled.get(sources)!;
}

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

const applier = createFormatApplier({ key: 'notes', entities: ['Note'], identity: NOTES_FORMAT.identity, relKind: NOTES_FORMAT.tree?.relKind });

/**
 * **The record the apply reads and writes, carried from the run before**, as the app's boot carries it: the
 * merge answers "has the user changed this" from what the last apply wrote, so a case about an edited note
 * needs the two runs to be one sequence. `reset()` clears the database and the record together, since a
 * record describing entities that are gone is not a state the app can be in.
 */
let applied: ApplyRecord | undefined;
function reset(): void {
  resetDatabase();
  applied = undefined;
}

/**
 * The record's lifetime is the database's, so it is cleared where the harness empties the database. Without
 * this a case that did not reset first would read a record describing entities the last test left behind,
 * and every item would resolve as one the user had deleted.
 */
beforeEach(() => { applied = undefined; });
function seedNotes(
  sources: 'v1' | 'v2' | 'default-setup',
  options: { mode?: ImportMode; include?: ContentSelection; unrecorded?: boolean } = {},
): ApplyResult {
  applied = applyAfter(options.unrecorded ? undefined : applied);
  return applier.apply({
    compiledDir: compile(sources).dir,
    mode: options.mode,
    include: options.include,
    applied,
    log: () => {},
  });
}


/** The notes part of a snapshot, as the goldens record it */
/** Every Note row with this title, deleted ones included: a recreated note is a second id, not a changed row */
function notesTitled(title: string): EARS.EntityId[] {
  return (entityIds() as EARS.EntityId[]).filter((id) => id.startsWith('Note-')
    && (qx(id).pickAll() as Array<Record<string, unknown>>)[0]?.title === title);
}

function notesOf(snap: Snapshot, { withHash = false } = {}) {
  return {
    rows: Object.fromEntries(
      Object.entries(snap.rows)
        .filter(([alias]) => alias.startsWith('Note:'))
        .map(([alias, row]) => {
          if (withHash) return [alias, row];
          const { contentHash: _omitted, ...rest } = row;
          return [alias, rest];
        }),
    ),
    relations: snap.relations.filter((relation) => relation.includes('Note:')),
  };
}

/** Records flattened with the aliases the snapshot gives their rows */
function flatten(records: ContentItem[], parent = ''): Array<{ alias: string; record: ContentItem }> {
  return records.flatMap((record) => {
    const alias = `${parent || 'Note:'}${parent ? '/' : ''}${record.title}`;
    return [{ alias, record }, ...flatten(record.children ?? [], alias)];
  });
}

/** A row holds the record's seeded values, and noteCommands' defaults for the fields the record doesn't set */
function expectSeededValues(row: Record<string, unknown>, record: ContentItem) {
  const defaults = { noteType: 'document', icon: null, completed: false, favorite: false, hideCompletedChildren: false };
  expect({
    title: row.title,
    content: row.content,
    noteType: row.noteType,
    icon: row.icon ?? null,
    completed: row.completed,
    favorite: row.favorite ?? false,
    hideCompletedChildren: row.hideCompletedChildren ?? false,
    contentHash: row.contentHash,
  }).toEqual({
    ...defaults,
    ...Object.fromEntries(Object.keys(defaults).filter((field) => record[field] !== undefined).map((field) => [field, record[field]])),
    title: record.title,
    content: record.content,
    contentHash: record.contentHash,
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
const linksOf = (record: ContentItem) => [...String(record.content ?? '').matchAll(/\]\(note:\/\/([^)]+)\)/g)].map((match) => `Note:${match[1]}`).sort();

/**
 * The Decision 10 rules for a re-seed: an existing row is left as it was when its stored hash matches
 * the record's or is missing (or in keep-existing, with its subtree); otherwise it holds the record's
 * values and references the notes its content links to. New records under a visited parent are created. A row left alone may still have its
 * displayOrder shifted: noteCommands.create moves siblings at or after a new note's position.
 */
function expectReseed(before: Snapshot, after: Snapshot, records: ContentItem[], mode: ImportMode | undefined) {
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
    } else if (!previous.contentHash || previous.contentHash === record.contentHash) {
      expect(unmoved(row), `${alias} left alone`).toEqual(unmoved(previous));
      unchanged();
    } else {
      expectSeededValues(row, record);
      expect(referencesOf(after, alias), `${alias} references`).toEqual(linksOf(record));
    }
  }
}

describe('notes seeding (generic pipeline)', () => {
  it('stores a contentHash on every seeded note', () => {
    reset();
    seedNotes('v1');
    const rows = notesOf(snapshot(), { withHash: true }).rows;
    expect(Object.keys(rows).length).toBeGreaterThan(0);
    for (const [alias, row] of Object.entries(rows)) expect(row.contentHash, alias).toBeTruthy();
  });

  it.each([undefined, 'replace-on-collision', 'keep-existing'] as const)('re-seeding unchanged sources in mode %s changes nothing', (mode) => {
    reset();
    seedNotes('v1', { mode });
    const before = snapshot();
    const counts = seedNotes('v1', { mode });
    expect(snapshot()).toEqual(before);
    // Seven notes; keep-existing skips the two top-level notes with their subtrees
    expect(counts).toEqual({ created: 0, updated: 0, skipped: mode === 'keep-existing' ? 2 : 7 });
  });

  it.each([undefined, 'replace-on-collision', 'keep-existing'] as const)('re-seeding changed sources in mode %s follows the change-tracking rules', (mode) => {
    reset();
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

  it('leaves a note without a stored contentHash alone (user-owned)', () => {
    reset();
    addLinkTargets();
    seedNotes('v1');
    const welcome = (entityIds() as EARS.EntityId[]).find((id) =>
      id.startsWith('Note-') && (qx(id).pickAll() as Array<Record<string, unknown>>)[0]?.title === 'Welcome');
    // `find` can miss, and `dropAttribute(undefined)` drops nothing: the case would then seed, re-seed and
    // assert that an untracked note was left alone without ever having untracked one. The premise is checked.
    if (!welcome) throw new Error('no seeded Welcome note to untrack, so this case would assert nothing');
    dropAttribute(welcome, 'contentHash');
    const before = snapshot();
    seedNotes('v2', { mode: 'replace-on-collision' });
    const after = snapshot();
    expect(after.rows['Note:Welcome'], 'the untracked note').toEqual(before.rows['Note:Welcome']);
    expectReseed(before, after, compile('v2').records, 'replace-on-collision');
  });

  /**
   * **A note the user deleted is not seeded again.** Notes delete softly (`trash.move` marks the row and keeps
   * its `contentKey`), so the record of the deletion is on the row the applier searches for — but the applier used
   * a finder that hides deleted rows, missed it, missed it again by identity, and created a second note beside
   * the one in the trash. The lookup seeing deleted rows is what makes the rule hold for every content key,
   * rather than for whichever key someone noticed the symptom on.
   *
   * The assertion is that no *second* row appears: `snapshot()` reads with an unfiltered `qx`, so the trashed
   * row is still there either way, and a count is what tells "left alone" from "recreated".
   */
  it('leaves a note the user deleted alone, rather than seeding it again', () => {
    reset();
    addLinkTargets();
    seedNotes('v1');
    const welcome = notesTitled('Welcome');
    if (welcome.length !== 1) throw new Error(`expected one seeded Welcome note to delete, found ${welcome.length}`);
    trash.move([welcome[0]]);

    seedNotes('v2', { mode: 'replace-on-collision' });

    const after = notesTitled('Welcome');
    expect(after, 'the seed created a second Welcome beside the deleted one').toEqual(welcome);
    expect((qx(welcome[0]).pickAll() as Array<{ deleted?: boolean }>)[0]?.deleted, 'still the user\'s').toBe(true);
  });

  /**
   * **And its children are not visited**, which is a separate claim: they would be created under a deleted
   * parent, since that is what the applier would pass as their `parentId`. Only the parent is trashed here —
   * `noteCommands.delete` would trash the subtree, which would make the case pass for the wrong reason.
   *
   * `Projects/Archive/Old Task` is a child two levels down whose `completed` v2 changes, so "not visited"
   * is observable as the v1 value surviving a v2 seed.
   */
  it('does not seed the children of a note the user deleted', () => {
    reset();
    addLinkTargets();
    seedNotes('v1');
    const projects = notesTitled('Projects');
    if (projects.length !== 1) throw new Error(`expected one seeded Projects note to delete, found ${projects.length}`);
    const deepChild = snapshot().rows['Note:Projects/Archive/Old Task'];
    expect(deepChild, 'the fixture no longer has the child this case is about').toBeDefined();
    expect(deepChild.completed, 'v1 leaves it incomplete, which is what v2 changes').toBe(false);
    trash.move([projects[0]]);

    seedNotes('v2', { mode: 'replace-on-collision' });

    expect(notesTitled('Projects'), 'the deleted parent was seeded again').toEqual(projects);
    expect(snapshot().rows['Note:Projects/Archive/Old Task'].completed,
      'a child under a deleted parent was updated, so the applier descended into it').toBe(false);
  });

  /**
   * **A note the user deleted *outright* is not seeded again either.** Notes trash, so the two cases above
   * read the row itself; a flow or a library document is destroyed, and then nothing is left to read. What
   * answers for those is the applied content — a key the last apply wrote with no entity behind it now is
   * the user's deletion.
   *
   * Destroying the row rather than trashing it is the whole point of the case, so it uses `tx().destroy()`
   * directly: `trash.move` would leave the row the earlier cases are about and prove nothing new.
   */
  it('leaves a note the user deleted outright alone, given what the last apply wrote', () => {
    reset();
    addLinkTargets();
    seedNotes('v1');
    const welcome = notesTitled('Welcome');
    if (welcome.length !== 1) throw new Error(`expected one seeded Welcome note to delete, found ${welcome.length}`);
    tx(welcome[0]).destroy();
    expect(notesTitled('Welcome'), 'a destroyed row leaves nothing behind, which is the premise').toEqual([]);

    const counts = seedNotes('v2', { mode: 'replace-on-collision' });

    expect(notesTitled('Welcome'), 'the seed created the note the user deleted outright').toEqual([]);
    // The run did work on the other notes, so the empty result above is this rule rather than a seed that
    // imported nothing. The exemptions — no record, and wipe-and-replace — are in abuddy-sdk's applier spec
    expect(counts.updated, 'nothing was seeded at all, so the case above proves nothing').toBeGreaterThan(0);
  });

  it('wipes nested notes and seeds them again', () => {
    reset();
    seedNotes('v2');
    const freshV2 = notesOf(snapshot(), { withHash: true });
    reset();
    seedNotes('v1');
    const counts = seedNotes('v2', { mode: 'wipe-and-replace' });
    expect(counts.errors).toBeUndefined();
    expect(notesOf(snapshot(), { withHash: true })).toEqual(freshV2);
  });
});

// Entities someone edited survive a content change. Each apply records a hash per part of what it wrote, and
// a later apply with a changed contentHash writes only an item whose every part still holds that.
// Between the v1 and v2 fixtures, the Welcome note and the Getting Started document change.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findWhere } from '#generated/ears.ts';
import { repository } from '#generated/repository.ts';
import { apply as importContent, applyContent, compileContent, resetDatabase, snapshot } from './harness.ts';
import type { ApplyRecord } from '@abuddy/sdk/utils';
// No local row type: `findWhere` already returns the entity with its branded id and declared fields, and a
// `{ id: never; [field: string]: unknown }` alias discarded both — `never` is assignable to every parameter,
// so an id typed that way reaches any call unchecked.
const note = (title: string) => findWhere('Note', 'title', title)[0];
const document = (name: string) => findWhere('Document', 'name', name)[0];

const EDITS = {
  "a note's content": () => repository.noteCommands.update(note('Welcome').id, { content: 'My own words' }),
  "a document's content": () => {
    const doc = document('Getting Started');
    repository.libraryCommands.updateDocument(doc.id, doc.name, [{ type: 'text', content: 'My own words' }] as never, doc.tags ?? []);
  },
  "a document's tags": () => repository.libraryCommands.updateDocumentTags(document('Getting Started').id, ['mine']),
};

const dirs: string[] = [];
let v1: string;
let v2: string;
beforeAll(async () => {
  v1 = await compileContent('v1');
  v2 = await compileContent('v2');
  dirs.push(v1, v2);
});
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * **An apply, carrying the record forward**, which is how the app's boot runs it: what says whether the user
 * has changed an item is what the last apply wrote for it.
 */
let applied: ApplyRecord | undefined;
const apply = (dir: string, options: Parameters<typeof applyContent>[2] = {}) => {
  const run = applyContent(dir, applied, options);
  applied = run.record;
  return run.counts;
};
const reset = () => { resetDatabase(); applied = undefined; };

/**
 * The record's lifetime is the database's, so it is cleared where the harness empties the database. Without
 * this a case that did not reset first would read a record describing entities the last test left behind,
 * and every item would resolve as one the user had deleted.
 */
beforeEach(() => { applied = undefined; });

const edited = (key: string) => key.startsWith('a note') ? 'Note:Welcome' : 'Document:Getting Started';
const untouched = (key: string) => key.startsWith('a note') ? 'Document:Getting Started' : 'Note:Welcome';

describe('re-applying edited rows', () => {
  it('updates changed rows nobody edited', () => {
    reset();
    apply(v1);
    const before = snapshot();
    apply(v2, { mode: 'replace-on-collision' });
    const after = snapshot();
    expect(after.rows['Note:Welcome']).not.toEqual(before.rows['Note:Welcome']);
    expect(after.rows['Document:Getting Started']).not.toEqual(before.rows['Document:Getting Started']);
  });

  it.each(Object.keys(EDITS))('leaves %s edit in place and still updates the other changed rows', (key) => {
    reset();
    apply(v1);
    EDITS[key as keyof typeof EDITS]();
    const before = snapshot();
    const counts = apply(v2, { mode: 'replace-on-collision' });
    expect([counts.notes.errors, counts.library.errors]).toEqual([undefined, undefined]);
    const after = snapshot();
    expect(after.rows[edited(key)], 'the edited row').toEqual(before.rows[edited(key)]);
    expect(after.rows[untouched(key)], 'the unedited changed row').not.toEqual(before.rows[untouched(key)]);
  });

  it("keeps a field the record doesn't set and still updates the row", () => {
    reset();
    apply(v1);
    // The Welcome record sets favorite, not hideCompletedChildren or completed, so the apply doesn't own those
    repository.noteCommands.update(note('Welcome').id, { hideCompletedChildren: true, completed: true });
    apply(v2, { mode: 'replace-on-collision' });
    expect(snapshot().rows['Note:Welcome']).toMatchObject({ hideCompletedChildren: true, completed: true, content: expect.stringContaining('Hello again') });
  });

  it('applies every field a changed record sets, including false flags and the type', () => {
    reset();
    apply(v1);
    const v3 = withNote(v2, 'Welcome', { noteType: 'tasklist', favorite: false, hideCompletedChildren: false });
    expect(apply(v3, { mode: 'replace-on-collision' }).notes.errors).toBeUndefined();
    expect(snapshot().rows['Note:Welcome']).toMatchObject({ noteType: 'tasklist', favorite: false, hideCompletedChildren: false });
    // Recorded as the applier wrote it: the next change updates it again
    apply(withNote(v3, 'Welcome', { content: 'Third' }), { mode: 'replace-on-collision' });
    expect(snapshot().rows['Note:Welcome']).toMatchObject({ noteType: 'tasklist', content: 'Third' });
  });

  it("resets a field a changed record no longer sets to a new note's, and keeps fields its source never set", () => {
    reset();
    apply(v1);
    // The Task Two record never sets favorite: the user's favorite isn't the apply's to reset
    repository.noteCommands.update(note('Task Two').id, { favorite: true });
    const v3 = withNote(withNote(withNote(v1, 'Welcome', { icon: undefined }), 'task one', { completed: undefined }), 'Task Two', { content: 'Still open.' });
    expect(apply(v3, { mode: 'replace-on-collision' }).notes).toMatchObject({ updated: 3 });
    const rows = snapshot().rows;
    expect(rows['Note:Welcome'].icon ?? null).toBeNull();
    expect(rows['Note:Projects/task one']).toMatchObject({ completed: false });
    expect(rows['Note:Projects/Task Two']).toMatchObject({ favorite: true, content: 'Still open.' });
    // The reset fields aren't written any more: the user's value for them survives the next change
    repository.noteCommands.update(note('task one').id, { completed: true });
    expect(apply(withNote(v3, 'task one', { content: 'Done, really.' }), { mode: 'replace-on-collision' }).notes).toMatchObject({ updated: 1 });
    expect(snapshot().rows['Note:Projects/task one']).toMatchObject({ completed: true, content: 'Done, really.' });
  });

  it("changes a note's type through noteCommands: a task has no link in its parent's content", () => {
    reset();
    apply(v1);
    const projects = () => String(note('Projects').content);
    const taskTwo = note('Task Two').id;
    const asDocument = withNote(v1, 'Task Two', { noteType: 'document' });
    apply(asDocument, { mode: 'replace-on-collision' });
    expect(projects()).toContain(`(document://${taskTwo})`);
    expect(apply(withNote(asDocument, 'Task Two', { noteType: 'task' }), { mode: 'replace-on-collision' }).notes).toMatchObject({ updated: 1 });
    expect(note('Task Two')).toMatchObject({ noteType: 'task' });
    expect(projects()).not.toContain(`document://${taskTwo}`);
  });

  it('keeps updating a row an apply already updated', () => {
    reset();
    apply(v1);
    const fresh = snapshot();
    apply(v2, { mode: 'replace-on-collision' });
    apply(v1, { mode: 'replace-on-collision' });
    const after = snapshot();
    expect(after.rows['Note:Welcome']).toEqual(fresh.rows['Note:Welcome']);
    expect(after.rows['Document:Getting Started']).toMatchObject({ tags: fresh.rows['Document:Getting Started'].tags });
  });

  it('detects an edit made after an apply updated the row', () => {
    reset();
    apply(v1);
    apply(v2, { mode: 'replace-on-collision' });
    EDITS["a note's content"]();
    const before = snapshot();
    apply(v1, { mode: 'replace-on-collision' });
    expect(snapshot().rows['Note:Welcome']).toEqual(before.rows['Note:Welcome']);
  });

  it('finds renamed rows instead of applying a copy, and leaves them as renamed', () => {
    reset();
    apply(v1);
    repository.noteCommands.update(note('Welcome').id, { title: 'My welcome' });
    repository.noteCommands.update(note('Projects').id, { title: 'My projects' });
    repository.libraryCommands.renameItem(document('Getting Started').id, 'My guide', 'document');
    const before = snapshot();
    const counts = apply(v2, { mode: 'replace-on-collision' });
    const after = snapshot();
    expect([counts.notes.errors, counts.library.errors]).toEqual([undefined, undefined]);
    expect(after.rows['Note:Welcome'], 'no copy of the renamed note').toBeUndefined();
    expect(after.rows['Document:Getting Started'], 'no copy of the renamed document').toBeUndefined();
    expect(after.rows['Note:My welcome']).toEqual(before.rows['Note:My welcome']);
    expect(after.rows['Document:My guide']).toEqual(before.rows['Document:My guide']);
    // The renamed parent's children are still found under it, and v2's new child is created there
    expect(Object.keys(after.rows).filter((alias) => alias.startsWith('Note:')).sort()).toEqual([
      'Note:My projects', 'Note:My projects/2024', 'Note:My projects/Archive', 'Note:My projects/Archive/Old Task',
      'Note:My projects/Task Three', 'Note:My projects/Task Two', 'Note:My projects/task one', 'Note:My welcome',
    ]);
  });

  it("doesn't take another written item for one renamed to its name", () => {
    reset();
    apply(v1);
    repository.libraryCommands.deleteDocument(document('2024').id);
    const renamed = document('Getting Started').id;
    repository.libraryCommands.renameItem(renamed, '2024', 'document');

    apply(v2, { mode: 'replace-on-collision' });

    // The renamed document is still the one Getting Started's content wrote, found by its key and not by
    // its name; and the one the user deleted stays deleted, because the last apply wrote it
    const named = findWhere('Document', 'name', '2024');
    expect(named.map((row) => row.id)).toEqual([renamed]);

    /**
     * **An import reads no record, so it puts the pack's content back** — the deleted document is created
     * again and the renamed one takes its own content back, since nothing told the run which parts of it
     * the user had changed. That is what asking for a pack's data back means, and the one place in the app
     * where the user's work is replaced.
     */
    importContent(v2, { mode: 'replace-on-collision' });

    expect(findWhere('Document', 'name', '2024').map((row) => row.id), 'the deleted document, created again')
      .not.toEqual([renamed]);
    expect(findWhere('Document', 'name', 'Getting Started').map((row) => row.id), 'the renamed one, back to its own name')
      .toEqual([renamed]);
  });
});

type NoteRecord = Record<string, unknown> & { children?: NoteRecord[] };

/** A copy of a compiled directory with one note record's fields changed (an undefined field removed) and a new contentHash */
function withNote(dir: string, title: string, fields: Record<string, unknown>): string {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'edited-rows-'));
  dirs.push(copy);
  fs.cpSync(dir, copy, { recursive: true });
  const file = path.join(copy, 'notes.content.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as { records: NoteRecord[] };
  const change = (records: NoteRecord[]): NoteRecord[] => records.map((record) => record.title === title
    ? { ...record, ...fields, contentHash: `${record.contentHash}+${JSON.stringify(fields, (_key, value) => value === undefined ? null : value)}` }
    : { ...record, ...(record.children && { children: change(record.children) }) });
  data.records = change(data.records);
  fs.writeFileSync(file, JSON.stringify(data));
  return copy;
}

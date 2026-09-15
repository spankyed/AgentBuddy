// Seeded rows someone edited survive a seed change. The seeder records what it wrote to each row's
// seeded fields; a re-seed with a changed sourceHash updates only rows whose fields still hold it.
// Between the v1 and v2 fixtures, the Welcome note and the Getting Started document change.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findWhere } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';
import { compileSeeds, resetDatabase, seed, snapshot } from './harness';

type Row = { id: never; [field: string]: unknown };
const note = (title: string) => findWhere('Note' as never, 'title', title)[0] as Row;
const document = (name: string) => findWhere('Document' as never, 'name', name)[0] as Row;

const EDITS = {
  "a note's content": () => repository.noteCommands.update(note('Welcome').id, { content: 'My own words' }),
  "a document's content": () => {
    const doc = document('Getting Started');
    repository.libraryCommands.updateDocument(doc.id, doc.name as string, [{ type: 'text', content: 'My own words' }] as never, doc.tags as string[]);
  },
  "a document's tags": () => repository.libraryCommands.updateDocumentTags(document('Getting Started').id, ['mine']),
};

const dirs: string[] = [];
let v1: string;
let v2: string;
beforeAll(async () => {
  v1 = await compileSeeds('v1');
  v2 = await compileSeeds('v2');
  dirs.push(v1, v2);
}, 120_000);
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

const edited = (key: string) => key.startsWith('a note') ? 'Note:Welcome' : 'Document:Getting Started';
const untouched = (key: string) => key.startsWith('a note') ? 'Document:Getting Started' : 'Note:Welcome';

describe('re-seeding edited rows', () => {
  it('updates changed rows nobody edited', () => {
    resetDatabase();
    seed(v1);
    const before = snapshot();
    seed(v2, { mode: 'replace-on-collision' });
    const after = snapshot();
    expect(after.rows['Note:Welcome']).not.toEqual(before.rows['Note:Welcome']);
    expect(after.rows['Document:Getting Started']).not.toEqual(before.rows['Document:Getting Started']);
  });

  it.each(Object.keys(EDITS))('leaves %s edit in place and still updates the other changed rows', (key) => {
    resetDatabase();
    seed(v1);
    EDITS[key as keyof typeof EDITS]();
    const before = snapshot();
    const counts = seed(v2, { mode: 'replace-on-collision' });
    expect([counts.notes.errors, counts.library.errors]).toEqual([undefined, undefined]);
    const after = snapshot();
    expect(after.rows[edited(key)], 'the edited row').toEqual(before.rows[edited(key)]);
    expect(after.rows[untouched(key)], 'the unedited changed row').not.toEqual(before.rows[untouched(key)]);
  }, 60_000);

  it("keeps a field the record doesn't set and still updates the row", () => {
    resetDatabase();
    seed(v1);
    // The Welcome record sets favorite, not hideCompletedChildren or completed, so the seed doesn't own those
    repository.noteCommands.update(note('Welcome').id, { hideCompletedChildren: true, completed: true });
    seed(v2, { mode: 'replace-on-collision' });
    expect(snapshot().rows['Note:Welcome']).toMatchObject({ hideCompletedChildren: true, completed: true, content: expect.stringContaining('Revised content.') });
  });

  it('applies every field a changed record sets, including false flags and the type', () => {
    resetDatabase();
    seed(v1);
    const v3 = withNote(v2, 'Welcome', { noteType: 'tasklist', favorite: false, hideCompletedChildren: false });
    expect(seed(v3, { mode: 'replace-on-collision' }).notes.errors).toBeUndefined();
    expect(snapshot().rows['Note:Welcome']).toMatchObject({ noteType: 'tasklist', favorite: false, hideCompletedChildren: false });
    // Recorded as the seeder wrote it: the next change updates it again
    seed(withNote(v3, 'Welcome', { content: 'Third' }), { mode: 'replace-on-collision' });
    expect(snapshot().rows['Note:Welcome']).toMatchObject({ noteType: 'tasklist', content: 'Third' });
  });

  it('keeps updating a row a seed already updated', () => {
    resetDatabase();
    seed(v1);
    const fresh = snapshot();
    seed(v2, { mode: 'replace-on-collision' });
    seed(v1, { mode: 'replace-on-collision' });
    const after = snapshot();
    expect(after.rows['Note:Welcome']).toEqual(fresh.rows['Note:Welcome']);
    expect(after.rows['Document:Getting Started']).toMatchObject({ tags: fresh.rows['Document:Getting Started'].tags });
  });

  it('detects an edit made after a seed updated the row', () => {
    resetDatabase();
    seed(v1);
    seed(v2, { mode: 'replace-on-collision' });
    EDITS["a note's content"]();
    const before = snapshot();
    seed(v1, { mode: 'replace-on-collision' });
    expect(snapshot().rows['Note:Welcome']).toEqual(before.rows['Note:Welcome']);
  });

  it('finds renamed rows instead of seeding a copy, and leaves them as renamed', () => {
    resetDatabase();
    seed(v1);
    repository.noteCommands.update(note('Welcome').id, { title: 'My welcome' });
    repository.noteCommands.update(note('Projects').id, { title: 'My projects' });
    repository.libraryCommands.renameItem(document('Getting Started').id, 'My guide', 'document');
    const before = snapshot();
    const counts = seed(v2, { mode: 'replace-on-collision' });
    const after = snapshot();
    expect([counts.notes.errors, counts.library.errors]).toEqual([undefined, undefined]);
    expect(after.rows['Note:Welcome'], 'no copy of the renamed note').toBeUndefined();
    expect(after.rows['Document:Getting Started'], 'no copy of the renamed document').toBeUndefined();
    expect(after.rows['Note:My welcome']).toEqual(before.rows['Note:My welcome']);
    expect(after.rows['Document:My guide']).toEqual(before.rows['Document:My guide']);
    // The renamed parent's children are still found under it, and v2's new child is created there
    expect(Object.keys(after.rows).filter((alias) => alias.startsWith('Note:')).sort()).toEqual([
      'Note:My projects', 'Note:My projects/Task Three', 'Note:My projects/Task Two', 'Note:My projects/task one', 'Note:My welcome',
    ]);
  });

  it("doesn't take another seeded row for a record because it was renamed to that record's name", () => {
    resetDatabase();
    seed(v1);
    repository.libraryCommands.deleteDocument(document('2024').id);
    repository.libraryCommands.renameItem(document('Getting Started').id, '2024', 'document');
    seed(v2, { mode: 'replace-on-collision' });
    // The deleted document is seeded again, beside the renamed one
    expect(findWhere('Document' as never, 'name', '2024')).toHaveLength(2);
  });
});

/** A copy of a compiled directory with one root note record's fields changed (and a new sourceHash) */
function withNote(dir: string, title: string, fields: Record<string, unknown>): string {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'edited-rows-'));
  dirs.push(copy);
  fs.cpSync(dir, copy, { recursive: true });
  const file = path.join(copy, 'notes.seed.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as { records: Array<Record<string, unknown>> };
  data.records = data.records.map((record) => record.title === title ? { ...record, ...fields, sourceHash: `${record.sourceHash}+${JSON.stringify(fields)}` } : record);
  fs.writeFileSync(file, JSON.stringify(data));
  return copy;
}

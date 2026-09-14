// Seeded rows someone edited survive a seed change. The seeder records what it wrote to each row's
// seeded fields; a re-seed with a changed sourceHash updates only rows whose fields still hold it.
// Between the v1 and v2 fixtures, the Welcome note and the Getting Started document change.
import * as fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dropAttr, findWhere } from '@abuddy/host/ears';
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
    // The Welcome record has no favorite, so the seed doesn't own it
    repository.noteCommands.update(note('Welcome').id, { favorite: true });
    seed(v2, { mode: 'replace-on-collision' });
    expect(snapshot().rows['Note:Welcome']).toMatchObject({ favorite: true, content: expect.stringContaining('Revised content.') });
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

  it("leaves rows alone whose seeded values weren't recorded (seeded before edits were detected)", () => {
    resetDatabase();
    seed(v1);
    dropAttr(note('Welcome').id, 'seededFields' as never);
    dropAttr(document('Getting Started').id, 'seededFields' as never);
    const before = snapshot();
    const counts = seed(v2, { mode: 'replace-on-collision' });
    const after = snapshot();
    expect(after.rows['Note:Welcome']).toEqual(before.rows['Note:Welcome']);
    expect(after.rows['Document:Getting Started']).toEqual(before.rows['Document:Getting Started']);
    expect([counts.notes.errors, counts.library.errors]).toEqual([undefined, undefined]);
  });
});

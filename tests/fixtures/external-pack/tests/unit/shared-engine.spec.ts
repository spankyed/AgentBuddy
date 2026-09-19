// One EARS engine: a row written through @abuddy/ears, imported directly, reads back through the SDK's services
// with default-setup's repository, which default-setup's runtime registered on its own @abuddy/ears
import { describe, expect, it } from 'vitest';
import { tx } from '@abuddy/ears';
import { services } from '@abuddy/sdk/services';
import { startApp } from '@abuddy/testing/harness';

type NoteQueries = { byIdDTO(id: string): { id: string; title: string } | undefined };

describe('the engine a pack imports', () => {
  it("is the one the SDK and its dependencies' runtimes use", () => {
    const id = tx('Note').batchPut({ title: 'Written through @abuddy/ears', content: '' }).id();
    const noteQueries = (services.repository as unknown as { noteQueries: NoteQueries }).noteQueries;
    expect(noteQueries.byIdDTO(id)).toMatchObject({ id, title: 'Written through @abuddy/ears' });
  });

  it('is the one the memos system writes to and reads back from', async () => {
    const app = await startApp({ systems: ['memos'] });
    await app.connect();
    await app.send('memos', { type: 'ADD_MEMO_NOTE', text: 'a memo note' });
    const added = await app.nextEmit('memos', 'MEMO_NOTE_ADDED');
    expect(added.note).toMatchObject({ id: expect.stringMatching(/^Note-/), title: 'a memo note' });
  });
});

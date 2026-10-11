// One EARS engine: a row written through @apackdev/ears, imported directly, reads back through default-setup's
// repository, which default-setup's runtime registered on its own @apackdev/ears — and the SDK's services object
// reaches that same registration rather than a copy of it
import { describe, expect, it } from 'vitest';
import { untypedTx } from '@apackdev/ears';
import { services } from '@apackdev/sdk/services';
import { startApp } from '@apackdev/testing/harness';
import { repository } from '#generated/repository.ts';

describe('the engine a pack imports', () => {
  it("is the one the SDK and its dependencies' runtimes use", () => {
    const id = untypedTx('Note').batchPut({ title: 'Written through @apackdev/ears', content: '' }).id();
    // Typed, through the facade codegen writes: this pack's repositories and its dependencies'
    expect(repository.noteQueries.byIdDTO(id)).toMatchObject({ id, title: 'Written through @apackdev/ears' });
    expect(services.repository.noteQueries, "the SDK's services reach a different registry").toBe(repository.noteQueries);
  });

  it('is the one the memos system writes to and reads back from', async () => {
    const app = await startApp({ systems: ['memos'] });
    await app.connect();
    await app.send('memos', { type: 'ADD_MEMO_NOTE', text: 'a memo note' });
    const added = await app.nextEmit('memos', 'MEMO_NOTE_ADDED');
    expect(added.note).toMatchObject({ id: expect.stringMatching(/^Note-/), title: 'a memo note' });
  });
});

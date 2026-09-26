// The memos system under the app's bus: its startup data on connect, and a memo added from the client
import { describe, expect, it } from 'vitest';
import { importSeeds, startApp } from '@abuddy/testing/harness';
import { repository } from '#generated/repository';

describe('memos system', () => {
  it('sends the seeded memos when a client connects', async () => {
    await importSeeds();
    const app = await startApp({ systems: ['memos'] });
    await app.connect();
    const connected = await app.nextEmit('memos', 'MEMOS_CONNECTED');
    expect((connected.memos as Array<{ text: string }>).map((memo) => memo.text.trim())).toContain('Seeded from markdown');
  });

  it('stores a memo a client adds and sends it back', async () => {
    const app = await startApp({ systems: ['memos'] });
    await app.connect();
    await app.send('memos', { type: 'ADD_MEMO', text: 'from a unit test' });
    const added = await app.nextEmit('memos', 'MEMO_ADDED');
    expect(added.memo).toMatchObject({ text: 'from a unit test' });
    expect(repository.memoQueries.all().map((memo) => memo.text)).toContain('from a unit test');
  });
});

// The pack's memo flow, run on default-setup's brain and action step (the dependency's runtime)
import { describe, expect, it } from 'vitest';
import { seedPack, startApp } from '@abuddy/testing/harness';
import { repository } from '#generated/repository';

describe('memo flow', () => {
  it('stores the memo a memo.requested event carries', async () => {
    await seedPack({ keys: ['actions', 'flows'] });
    // The pack's flows have no root flow of their own (in the app, default-setup's is): the test names it
    const app = await startApp({ systems: ['brain', 'settings'], rootFlow: 'Memo Flow' });

    const run = await app.runFlow('Memo Flow', { event: 'memo.requested', data: { text: 'from a flow' } });

    expect(run.steps).toEqual([expect.objectContaining({ label: 'add-memo', status: 'completed', params: { text: 'from a flow' } })]);
    expect(repository.memoQueries.all().map((memo) => memo.text)).toEqual(['from a flow']);
  });
});

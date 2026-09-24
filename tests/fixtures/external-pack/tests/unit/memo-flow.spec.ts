// The pack's memo flow, run on default-setup's brain and action step (the dependency's runtime)
import { describe, expect, it } from 'vitest';
import { importFlows, importSeeds, startApp } from '@abuddy/testing/harness';
import { entry, keepAlive, subflow } from '#generated/flow-helpers';
import { repository } from '#generated/repository';

describe('memo flow', () => {
  it('stores the memo a memo.requested event carries', async () => {
    await importSeeds({ keys: ['actions', 'flows'] });
    // A root flow hosting the pack's flow, as the app's root flow hosts long-running flows
    importFlows({ 'Root Flow': { root: true, tracks: [entry([subflow('Memo Flow')], [keepAlive()])] } });
    const app = await startApp({ systems: ['default-setup/brain', 'host/settings'] });

    const run = await app.runFlow('Memo Flow', { event: 'memo.requested', data: { text: 'from a flow' } });

    expect(run.steps).toEqual([expect.objectContaining({ label: 'add-memo', status: 'completed', params: { text: 'from a flow' } })]);
    expect(repository.memoQueries.all().map((memo) => memo.text)).toEqual(['from a flow']);
  });
});

// A flow that uses every step this pack registers, at non-default values.
//
// Shared by two things that must not describe different flows: `export-fidelity.spec.ts`, which round-trips it
// and asserts the graph comes back the same, and `export-example.spec.ts`, which records its export as the
// golden a seed-flow author reads. Changing it moves both, which is why the golden is re-recorded deliberately.
//
// Every option is set to a *non-default* value on purpose: a field set to its default round-trips to the same
// value even when nothing carries it, so a case would pass while covering nothing. Measured — with
// `outputType: 'json'` here, deleting it from transform's decompile left the fidelity spec green.
import { action, actionCode, branch, create, entry, fire, keepAlive, kill, llm, on, query, subflow, transform, update } from '#generated/flow-helpers.ts';

export const EVERY_STEP_FLOW = {
  Every: {
    root: true,
    tracks: [
      entry([keepAlive()]),
      on('go', [[
        action('Send', { label: 'send', description: 'd', map: { to: '$.event.data.to' }, params: { x: 1 } }),
        actionCode('return ctx.a + 1', { label: 'compute' }),
        llm('Summarise', { label: 'sum', temperature: 0.2, maxTokens: 10 }),
        query('what?', { as: 'results' }),
        create('Note', { params: { content: 'c' } }),
        update('$.note', { params: { content: 'c' }, onMissing: 'ignore' }),
        transform('return 1', { outputType: 'text' }),
        fire('ping', { scope: 'global', payload: { a: 1 } }),
        subflow('Every', { inherit: false }),
        branch([{ if: 'ok == true', steps: [kill()] }], [keepAlive()]),
      ]]),
    ],
  },
};

// A feature's system as its pack registers it: it accepts its machine's events and those the manifest adds.
import { describe, expect, it } from 'vitest';
import { setup } from 'xstate';
import { defineSystem, packSystem, SYSTEM_EVENT_TYPES } from '../../src/framework/index.ts';

const spec = defineSystem<{ incoming: { type: 'ADD_MEMO' }; outgoing: { type: 'MEMO_ADDED' } }>();
const machine = setup({ types: spec.types }).createMachine({ on: { ADD_MEMO: { actions: () => {} } } });

describe('packSystem', () => {
  it('uses declared inputs and the shared lifecycle protocol, without inferring its inbox from handlers', () => {
    expect(packSystem({ spec, machine }, { incoming: ['SYNC', 'ADD_MEMO'] }))
      .toEqual({ machine, receives: ['SYNC', 'ADD_MEMO', ...SYSTEM_EVENT_TYPES] });
    expect(packSystem({ spec, machine }, { incoming: [] }).receives).not.toContain('ADD_MEMO');
  });

});

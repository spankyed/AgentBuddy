// A feature's system as its pack registers it: the system is sent to by the feature's id, so the id defineSystem
// gave it must be that id, and it accepts its machine's events and those the manifest adds.
import { describe, expect, it } from 'vitest';
import { setup } from 'xstate';
import { defineSystem, packSystem } from '../../src/framework/index.ts';

const spec = defineSystem('memos')<{ type: 'ADD_MEMO' }, { type: 'MEMO_ADDED' }>();
const machine = setup({ types: spec.types }).createMachine({ on: { ADD_MEMO: { actions: () => {} } } });

describe('packSystem', () => {
  it("accepts its machine's events and the ones the manifest adds, once each", () => {
    expect(packSystem({ spec, machine }, 'memos', { incoming: ['SYNC', 'ADD_MEMO'] }))
      .toEqual({ machine, receives: ['ADD_MEMO', 'SYNC'] });
  });

  it('marks an early system', () => {
    expect(packSystem({ spec, machine }, 'memos', { early: true }).early).toBe(true);
    expect(packSystem({ spec, machine }, 'memos')).not.toHaveProperty('early');
  });

  it('refuses a system defineSystem gave another feature\'s id', () => {
    expect(() => packSystem({ spec, machine }, 'notes'))
      .toThrow('The system of feature "notes" is defined as "memos": defineSystem takes the feature\'s id');
  });
});

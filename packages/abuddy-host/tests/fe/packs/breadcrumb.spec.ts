import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { computeCrumbs } from '../../../src/fe/shell/index.ts';
import packsState from '../../../src/fe/packs/machine.ts';

// Without a breadcrumb of its own, the trail falls back to the machine's id, which is the ref `host/packs`
describe('the Packs tab', () => {
  it('reads "Packs" in the breadcrumb trail', () => {
    const actor = createActor(packsState).start();
    try {
      expect(computeCrumbs(actor.getSnapshot()).crumbs.map(c => c.label)).toEqual(['Packs']);
    } finally {
      actor.stop();
    }
  });
});

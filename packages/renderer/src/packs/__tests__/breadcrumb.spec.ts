import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { computeCrumbs } from '../../core/actors/route-trailer';
import packsState from '../state';

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

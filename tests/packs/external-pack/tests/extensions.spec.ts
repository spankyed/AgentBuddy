// What a pack other than the shipped one gets out of the `extensions` grammar. This pack is the only
// fixture that declares a step, a trigger, an artifact and a block, and it exists because nothing did:
// four defects in that grammar — a facet that never reached the backend, a trigger scaffold that did not
// compile, a track builder typed against the shipped pack's two trigger fields, and a warning on every
// step-less build — were all invisible while `default-setup` was the only pack exercising it.
import { describe, expect, it } from 'vitest';
import { stepRegistry } from '@abuddy/sdk/steps';
import { artifactRegistry } from '@abuddy/sdk/artifacts';
import { blockRegistry } from '@abuddy/sdk/blocks';
import { pulseTriggerBuild } from '../src/extensions/steps/pulse/trigger.ts';

describe("a pack's declared steps", () => {
  it('reach the backend registration with the facets the backend reads', () => {
    expect(stepRegistry.getBuild('stamp')).toBeDefined();
    expect(stepRegistry.getRuntime('stamp')?.handler).toBeTypeOf('function');
    expect(stepRegistry.getTrigger('pulse')?.trackField).toBe('pulse');
    expect(stepRegistry.isTrigger('pulse')).toBe(true);

    // The frontend facet is the renderer's and is registered there, not here
    expect(stepRegistry.getFE('stamp')).toBeUndefined();
  });

  it('start a new node with the label and fields their node facet declares', () => {
    expect(stepRegistry.createNodeDefaults('stamp')).toEqual({ nodeType: 'stamp', label: 'Stamp', note: 'stamped' });
    expect(stepRegistry.createNodeDefaults('pulse')).toEqual({ nodeType: 'pulse', label: 'Pulse', interval: '5m' });
  });

  /**
   * The invariant worth holding for any trigger: adding one to a flow creates a node from its defaults and
   * nothing else, and the trigger's own `validate` then runs on what was written. A required field left out
   * of the defaults is a trigger nobody can add — which is exactly what the shipped pack's `schedule` became
   * when its defaults stopped reaching the backend.
   */
  it("gives a trigger defaults that satisfy the trigger's own validator", () => {
    const fresh = stepRegistry.createNodeDefaults('pulse');

    expect(pulseTriggerBuild.validate!(fresh)).toEqual({ valid: true, errors: [] });
  });
});

describe("a pack's declared artifacts and blocks", () => {
  it('are registered by type', () => {
    expect(artifactRegistry.has('stamp')).toBe(true);
    expect(blockRegistry.has('stamp')).toBe(true);
  });
});

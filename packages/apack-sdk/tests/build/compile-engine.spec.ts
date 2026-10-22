// Flow compiling and decompiling use a private engine and the step definitions they're given: they work with no
// engine bound and no app bound, and leave a bound one (the app's, a test's) as it was
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEarsEngine } from '@apackdev/ears';
import { _bindEars, boundEars, untypedQx } from '@apackdev/sdk/ears';
import { ROOT_FLOW_ROLE } from '../../src/types/sdk-entities.ts';
import { EARS } from '../../src/types/entities.ts';
import { _isHostBound } from '../../src/runtime/host-runtime.ts';
import { createRoundTrip } from './helpers/round-trip.ts';
import { flows } from './helpers/fixtures.ts';
import { ALL_TEST_STEPS } from './helpers/test-steps.ts';

const rt = createRoundTrip(ROOT_FLOW_ROLE, ALL_TEST_STEPS);

beforeEach(() => rt.beforeEach());
afterEach(() => {
  rt.afterEach();
  _bindEars(undefined);
});

describe('a flow compile', () => {
  it('runs with no engine bound and no app bound', () => {
    expect(_isHostBound()).toBe(false);
    expect(() => boundEars()).toThrow('No EARS engine is bound');
    expect(rt.roundTrip(flows.simple)).toHaveProperty('Simple');
    expect(() => boundEars()).toThrow('No EARS engine is bound');
  });

  it("leaves the bound engine's data untouched, and compiles into its own", () => {
    const installed = createEarsEngine({ isEntityType: (name) => name === EARS.Entity.Flow });
    _bindEars(installed);
    const appFlow = untypedQx(EARS.Entity.Flow).count() === 0 && installed.create(EARS.Entity.Flow).set('label', 'Mine').id();
    const before = installed.getAllEntities();

    expect(rt.roundTrip(flows.simple)).toHaveProperty('Simple');

    expect(boundEars()).toBe(installed);
    expect(installed.getAllEntities()).toEqual(before);
    expect(untypedQx(EARS.Entity.Flow).pick(['label'])).toEqual([{ id: appFlow, label: 'Mine' }]);
    expect(rt.engine().qx(EARS.Entity.Flow).pick(['label'])).toEqual([{ id: expect.any(String), label: 'Simple' }]);
  });
});

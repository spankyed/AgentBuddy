// Flow compiling and decompiling use a private engine and the step definitions they're given: they work with no
// engine installed and no app bound, and leave an installed one (the app's, a test's) as it was
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEarsEngine, installEngine, installedEngine, untypedQx } from '@abuddy/ears';
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
  installEngine(undefined);
});

describe('a flow compile', () => {
  it('runs with no engine installed and no app bound', () => {
    expect(_isHostBound()).toBe(false);
    expect(() => installedEngine()).toThrow('No EARS engine is installed');
    expect(rt.roundTrip(flows.simple)).toHaveProperty('Simple');
    expect(() => installedEngine()).toThrow('No EARS engine is installed');
  });

  it("leaves the installed engine's data untouched, and compiles into its own", () => {
    const installed = createEarsEngine({ isEntityType: (name) => name === EARS.Entity.Flow });
    installEngine(installed.query);
    const appFlow = untypedQx(EARS.Entity.Flow).count() === 0 && installed.query.tx(EARS.Entity.Flow).put('label', 'Mine').id();
    const before = installed.query.getAllEntities();

    expect(rt.roundTrip(flows.simple)).toHaveProperty('Simple');

    expect(installedEngine()).toBe(installed.query);
    expect(installed.query.getAllEntities()).toEqual(before);
    expect(untypedQx(EARS.Entity.Flow).pick(['label'])).toEqual([{ id: appFlow, label: 'Mine' }]);
    expect(rt.engine().query.qx(EARS.Entity.Flow).pick(['label'])).toEqual([{ id: expect.any(String), label: 'Simple' }]);
  });
});

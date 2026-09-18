// Everything default-setup contributes arrives in its registrations: importing its generated entries registers
// nothing. Its seeders are the backend registration's `seeders`, its DSL types the frontend registration's `dslTypes`.
import { afterAll, describe, expect, it, vi } from 'vitest';
import { startFeTestRuntime } from '@abuddy/sdk/testing';
import { registeredSeedKeys } from '@abuddy/sdk/utils';
import { getDslTypes } from '@abuddy/sdk/fe';
import { registration } from '../../src/__generated__/pack-entry';

// A frontend with no pack registered, where a DSL type registered on import would show
afterAll(startFeTestRuntime());

describe("default-setup's generated entries", () => {
  it('carry its seeders in the registration, and a fresh import registers none', async () => {
    const registered = registeredSeedKeys('default-setup');
    expect(registered).toEqual(['actions', 'prompts', 'flows', 'library', 'notes', 'settings']);
    expect(registration.seeders?.map((seeder) => seeder.key)).toEqual(registered);

    // A fresh import builds its own seeders and registers none: the registered keys don't move
    vi.resetModules();
    const fresh = await import('../../src/__generated__/seeders');
    expect(fresh.seeders).not.toBe(registration.seeders);
    expect(fresh.seeders.map((seeder) => seeder.key)).toEqual(registered);
    expect(registeredSeedKeys('default-setup')).toEqual(registered);
  });

  it('carry its DSL types for the frontend registration, and importing them registers none', async () => {
    const { dslTypes } = await import('../../src/__generated__/dsl-types-fe');
    expect(Object.keys(dslTypes)).toEqual(['action', 'prompt', 'database']);
    expect(dslTypes.action).toMatchObject({ prefix: 'action:', schema: expect.stringContaining('declare') });
    expect(getDslTypes().size).toBe(0);
  });
});

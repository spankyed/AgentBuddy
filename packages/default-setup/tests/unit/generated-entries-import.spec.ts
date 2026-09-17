// Everything default-setup contributes arrives in its registrations: importing its generated entries registers
// nothing. Its seeders are the backend registration's `seeders`, its DSL types the frontend registration's `dslTypes`.
import { afterAll, describe, expect, it, vi } from 'vitest';
import { bindFeHost, type FePackRegistryView } from '@abuddy/sdk/runtime';
import { boundHost, unbindFeHost } from '@abuddy/sdk/runtime/internals';
import { getDslTypes } from '@abuddy/sdk/fe';
import { registration } from '../../src/__generated__/pack-entry';

// A frontend with no pack registered, where a DSL type registered on import would show
const noFrontends: FePackRegistryView = {
  designation: () => undefined, step: () => undefined, steps: () => [], artifact: () => undefined, artifacts: () => [],
  block: () => undefined, blocks: () => [], plugins: () => [], defaultPlugin: () => undefined, tiptapPlugins: () => [],
  appExtension: () => undefined, dslTypes: () => new Map(),
};
bindFeHost({ application: {} as never, secrets: {} as never, transport: {} as never, packs: noFrontends });
afterAll(() => unbindFeHost());

describe("default-setup's generated entries", () => {
  it('carry its seeders in the registration, and a fresh import registers none', async () => {
    const registered = boundHost().packs.seeders('default-setup');
    expect(registered).toBe(registration.seeders);
    expect(registered.map((seeder) => seeder.key)).toEqual(['actions', 'prompts', 'flows', 'library', 'notes', 'settings']);

    vi.resetModules();
    const fresh = await import('../../src/__generated__/seeders');
    expect(fresh.seeders).not.toBe(registered);
    expect(fresh.seeders.map((seeder) => seeder.key)).toEqual(registered.map((seeder) => seeder.key));
    expect(boundHost().packs.seeders('default-setup')).toBe(registered);
  });

  it('carry its DSL types for the frontend registration, and importing them registers none', async () => {
    const { dslTypes } = await import('../../src/__generated__/dsl-types-fe');
    expect(Object.keys(dslTypes)).toEqual(['action', 'prompt', 'database']);
    expect(dslTypes.action).toMatchObject({ prefix: 'action:', schema: expect.stringContaining('declare') });
    expect(getDslTypes().size).toBe(0);
  });
});

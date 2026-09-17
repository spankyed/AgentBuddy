// A designation comes only from a pack's abuddy.json, which the host registers: packs read roles, and the
// functions that write them aren't on the entries packs import.
import { describe, expect, it } from 'vitest';
import * as sdk from '../../src/index.ts';
import * as sdkFe from '../../src/fe/index.ts';

describe('designations on the pack-facing entries', () => {
  it.each([['@abuddy/sdk', sdk], ['@abuddy/sdk/fe', sdkFe]] as const)('%s exports the reads and not the writers', (_entry, mod) => {
    expect(mod).toHaveProperty('getDesignated');
    expect(mod).toHaveProperty('hasDesignation');
    expect(mod).not.toHaveProperty('registerDesignations');
    expect(mod).not.toHaveProperty('unregisterDesignations');
  });
});

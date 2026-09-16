// The SDK's service delegates reach the host's implementations once registerHostServices has run
import { describe, expect, it } from 'vitest';
import { getHostModule } from '@abuddy/sdk/runtime';
import { HOST_SERVICES, registerHostServices } from '../../src/services/index.ts';

describe('registerHostServices', () => {
  it('registers each host-implemented service under its key in services', () => {
    registerHostServices();
    for (const [key, implementation] of Object.entries(HOST_SERVICES)) expect(getHostModule(key)).toBe(implementation);
  });
});

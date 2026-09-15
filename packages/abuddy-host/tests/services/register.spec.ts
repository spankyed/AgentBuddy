// Every service packs reach through `services` that the host implements is registered where its SDK delegate reads it
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getHostModule } from '@abuddy/sdk/runtime';
import { appData, HOST_SERVICE_MODULES, inference, registerHostServices, traceStore } from '../../src/services/index.ts';

describe('registerHostServices', () => {
  it('registers appData, traceStore and inference as the host modules their SDK delegates read', () => {
    registerHostServices();
    expect(getHostModule('app-data')).toBe(appData);
    expect(getHostModule('trace-store')).toBe(traceStore);
    expect(getHostModule('inference')).toBe(inference);
    expect(Object.keys(HOST_SERVICE_MODULES).sort()).toEqual(['app-data', 'inference', 'trace-store']);
  });

  it('registers every host module a service delegate in @abuddy/sdk/services reads', () => {
    // One file per service (contract + delegate); index.ts wires them into `services`, models.ts is data
    const servicesDir = path.join(__dirname, '..', '..', '..', 'abuddy-sdk', 'src', 'services');
    const read = fs.readdirSync(servicesDir)
      .filter((file) => file.endsWith('.ts') && !['index.ts', 'models.ts'].includes(file))
      .flatMap((file) => [...fs.readFileSync(path.join(servicesDir, file), 'utf-8').matchAll(/getHostModule<[^>]*>\('([^']+)'\)/g)].map((m) => m[1]));
    expect([...new Set(read)].sort()).toEqual(Object.keys(HOST_SERVICE_MODULES).sort());
  });
});

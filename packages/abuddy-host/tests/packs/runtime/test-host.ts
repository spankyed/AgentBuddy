// The host the pack runtime runs on in these specs: the SDK's in-memory app (its logger reports to
// testRootEvents) with an app version for hostVersion ranges, the host's entity types (AppState) and the registry
// the runtime registers packs in, bound for the SDK's lookups. Import it before the modules under test.
import { startTestRuntime } from '@abuddy/sdk/testing';
import { HOST_ENTITY_TYPES } from '../../../src/app-state/index.ts';
import { createPackRegistry } from '../../../src/packs/pack-registration.ts';

/** The app version packs' hostVersion ranges are checked against */
export const TEST_APP_VERSION = '1.0.0';

/** The registered packs the pack runtime works on */
export const registry = createPackRegistry();

startTestRuntime({ appVersion: TEST_APP_VERSION, entityTypes: HOST_ENTITY_TYPES, packs: registry });

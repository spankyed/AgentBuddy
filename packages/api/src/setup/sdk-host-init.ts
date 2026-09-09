import { registerHostModule } from '@abuddy/sdk/runtime';
import { initRpc } from '@abuddy/sdk/rpc';
import { initEARSRuntime } from '@abuddy/sdk/ears';
import * as attributeStorage from '@/core/ears/attribute-storage';
import * as lmdbQuery from '@/core/persistence/lmdb/query';
import * as hydrateSharded from '@/core/persistence/partitioning/hydrate-sharded';
import * as loggerMod from '@/core/shared/debug/logger';
import * as trpcMod from '@/core/router/trpc';
import * as busEmitter from '@/core/router/bus-emitter';
import * as routerEvents from '@/core/router/events';
import * as pathsMod from '@/core/shared/paths';
import * as mediaMod from '@/core/host-modules/media';
import * as exportMod from '@/core/host-modules/export';
import * as resolveCliMod from '@/core/host-modules/resolve-cli';
import * as systemErrorsMod from '@/core/shared/system-errors';
import * as seedMod from '@/core/host-modules/seed';
import * as lifecycleMod from '@/core/shared/lifecycle';
import * as eventEmitterMod from '@/services/event-emitter';
import servicesMod from '@/services';
import * as versionMod from '@/version';
import { getRegisteredEntityTypes } from '@/core/packs/pack-registration';

// EARS engine lives in SDK; inject persistence (done at attribute-storage import)
// and entity type checker
initEARSRuntime({
  isEntityType: (v: string) => getRegisteredEntityTypes().has(v),
  // persistence already injected by attribute-storage module load (setPersistence call)
});

registerHostModule('attribute-storage', attributeStorage);
registerHostModule('lmdb-query', lmdbQuery);
registerHostModule('hydrate-sharded', hydrateSharded);
registerHostModule('logger', loggerMod);
registerHostModule('trpc', trpcMod);
registerHostModule('bus-emitter', busEmitter);
initRpc();
registerHostModule('router-events', routerEvents);
registerHostModule('paths', pathsMod);
registerHostModule('media', mediaMod);
registerHostModule('export', exportMod);
registerHostModule('resolve-cli', resolveCliMod);
registerHostModule('system-errors', systemErrorsMod);
registerHostModule('seed', seedMod);
registerHostModule('lifecycle', lifecycleMod);
registerHostModule('event-emitter', eventEmitterMod);
registerHostModule('services', servicesMod);
registerHostModule('version', versionMod);

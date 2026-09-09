// Registration
export {
  registerPack, registerHostSystem,
  getRegisteredSystems, buildRegisteredEventValidationMap,
  getRegisteredEntityTypes, getRegisteredEARS, getRegisteredEARSPolicy,
  getRegisteredServices, getRegisteredMigrations,
  getBootHooks, runRegisteredBootSeeds,
  getPackContributions,
} from './pack-registration';
export type { PackRegistration, PackBootHooks, PackEARS, PackMigration, PackContributions } from './pack-registration';

// Discovery
export {
  discoverBuiltInPacks, discoverPacks,
  getPacksDir, reconcileExternalRegistry,
} from './pack-discovery';
export type { BuiltInPackInfo, PackManifest, PackPluginDefinition } from './pack-discovery';

// Registry (JSON file CRUD)
export {
  readPackRegistry, writePackRegistry,
  addToRegistry, removeFromRegistry,
} from './pack-registry';
export type { PackRegistryEntry } from './pack-registry';

// Installer
export {
  installPack, installPackFromLocal, installPackFromUrl, installPackFromGitHub,
  uninstallPack,
} from './pack-installer';
export type { InstallResult } from './pack-installer';

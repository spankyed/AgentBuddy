// Registration: the registered packs, an instance per app (the composition root), test file or build
export { createPackRegistry } from './pack-registration.ts';
export type { PackRegistry, PackRegistration, PackBootHooks, PackEARS, PackMigration, PackExtensions, PackInfo } from './pack-registration.ts';

// Loading pack runtime code on the loader's own @abuddy/sdk
export { withModuleBridge } from './module-bridge.ts';

// Discovery
export {
  discoverBuiltInPacks, discoverPacks, enabledExternalPacks, installedPacks,
} from './pack-discovery.ts';
export type { BuiltInPackInfo, DiscoveredPack, InstalledPack, PackManifest } from './pack-discovery.ts';

// Installed packs (JSON file CRUD)
export {
  readInstalledPacks, updateInstalledPacks,
  addInstalledPack, removeInstalledPack,
} from './installed-packs.ts';
export type { PackRecord, InstalledPacksRecord } from './installed-packs.ts';

// Installer
export {
  installPack, installPackFromLocal, installPackFromGitHub,
  uninstallPack, isHostCompatible,
} from './pack-installer.ts';
export { recordHostVersion, readHostVersion } from './host-info.ts';
export { prepareHostDataDirs } from './staging.ts';

// Updater
export { checkForUpdates, getAvailableUpdates } from './pack-updater.ts';

// Pack layout (build output, release archive and installed layout)
export {
  PACK_LAYOUT_VERSION, PACK_LAYOUT,
  stagePack, verifyPack, readPackIntegrity, isPackLayout,
  packFrontendFiles,
  createPackArchive, extractPackArchive, packArchiveName,
  publishHostPackOutput,
  pruneHostPackOutputs,
} from './pack-layout.ts';
export type { PackIntegrity, LoadedPackEntry } from './pack-layout.ts';

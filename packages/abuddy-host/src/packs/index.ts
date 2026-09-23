// Registration: the registered packs, an instance per app (the composition root), test file or build
export { createPackRegistry } from './registry.ts';
export type { PackRegistry, PackRegistryOptions, PackRegistration, PackBootHooks, PackEARS, PackMigration, PackExtensions, PackInfo, PackOrigin } from './registry.ts';

// Loading pack runtime code on the loader's own @abuddy/sdk
export { withModuleBridge } from './module-bridge.ts';

// Discovery
export {
  discoverBuiltInPacks, discoverPacks, enabledExternalPacks, installedPacks,
} from './discovery.ts';
export type { BuiltInPackInfo, DiscoveredPack, InstalledPack, PackManifest } from './discovery.ts';

// Installed packs (JSON file CRUD)
export {
  readInstalledPacks, writeInstalledPacks, packRecord, packRecords, disabledPackIds,
  recordInstalled, setPackEnabled, recordUpdateCheck, recordUpdateInstalled, recordSeedOutcomes, forgetPack,
} from './installed.ts';
export type { PackRecord } from './installed.ts';

/**
 * The log lines a test harness reads to tell what became of a pack.
 *
 * A pack's backend leaves no other trace a test can see: an external pack with no frontend registers no
 * plugin, and the loaded-packs the renderer is served leave out packs with no frontend files. So the log
 * is the signal, and these are the sentences it is made of — imported by both the code that writes them
 * and `@abuddy/testing`, so that rewording one is a change to the other and not a suite that fails
 * somewhere else saying something untrue.
 */
export { PACK_LOAD_MESSAGES, packRegistered, packLoadFailed } from './load-messages.ts';

// Installer
export {
  installPack, installPackFromLocal, installPackFromGitHub,
  uninstallPack, isHostCompatible,
} from './installer.ts';
export { recordHostInfo, readHostInfo, type HostInfo } from './host-info.ts';
export { prepareHostDataDirs } from './staging.ts';

// Updater
export { checkForUpdates, getAvailableUpdates } from './updater.ts';

// Pack layout (build output, release archive and installed layout)
export {
  PACK_LAYOUT_VERSION, PACK_LAYOUT,
  stagePack, verifyPack, readPackIntegrity, isPackLayout,
  packFrontendFiles,
  createPackArchive, extractPackArchive, packArchiveName,
  publishHostPackOutput,
  pruneHostPackOutputs,
  getLoadedPackEntries, getPacksWithClientLoadedFrontends,
} from './layout.ts';
export type { PackIntegrity, LoadedPackEntry } from './layout.ts';

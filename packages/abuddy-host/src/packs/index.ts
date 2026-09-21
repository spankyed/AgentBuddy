// Registration: the registered packs, an instance per app (the composition root), test file or build
export { createPackRegistry } from './pack-registration.ts';
export type { PackRegistry, PackRegistration, PackBootHooks, PackEARS, PackMigration, PackExtensions, PackInfo, PackOrigin } from './pack-registration.ts';

// Loading pack runtime code on the loader's own @abuddy/sdk
export { withModuleBridge } from './module-bridge.ts';

// Discovery
export {
  discoverBuiltInPacks, discoverPacks, enabledExternalPacks, installedPacks,
} from './pack-discovery.ts';
export type { BuiltInPackInfo, DiscoveredPack, InstalledPack, PackManifest } from './pack-discovery.ts';

// Installed packs (JSON file CRUD)
export {
  readInstalledPacks, writeInstalledPacks, packRecord, packRecords, disabledPackIds,
  recordInstalled, setPackEnabled, recordUpdateCheck, recordUpdateInstalled, recordSeedOutcomes, forgetPack,
} from './installed-packs.ts';
export type { PackRecord } from './installed-packs.ts';

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
  getLoadedPackEntries, getPacksWithClientLoadedFrontends,
} from './pack-layout.ts';
export type { PackIntegrity, LoadedPackEntry } from './pack-layout.ts';

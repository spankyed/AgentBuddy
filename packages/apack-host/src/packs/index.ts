// Registration: the registered packs, an instance per app (the composition root), test file or build
export { createPackRegistry } from './registry.ts';
export type { PackRegistry, PackRegistryOptions, PackRegistration, PackBootHooks, PackEARS, PackMigration, PackExtensions, InstalledPackSummary, PackOrigin } from './registry.ts';

// Loading pack runtime code on the loader's own @apackdev/sdk
export { withModuleBridge } from './module-bridge.ts';

// Discovery
export {
  discoverPacks, installedPacks,
} from './discovery.ts';
export type { DiscoveredPack, InstalledPack, PackManifest } from './discovery.ts';
export { createContributionCatalog, readInstalledContributionCatalog } from './catalog.ts';
export type { PackCatalogEntry, PackCatalogSource, PackCatalogSnapshot, SourcePackDeclaration } from './catalog.ts';

// Installed packs (JSON file CRUD)
export {
  readInstalledPacks, writeInstalledPacks, packRecord, packRecords, disabledPackIds,
  recordInstalled, setPackEnabled, recordUpdateCheck, recordUpdateInstalled, recordApplyOutcomes,
} from './installed.ts';
export type { PackRecord } from './installed.ts';

/**
 * The log lines a test harness reads to tell what became of a pack.
 *
 * A pack's backend leaves no other trace a test can see: an external pack with no frontend registers no
 * plugin, and the loaded-packs the renderer is served leave out packs with no frontend files. So the log
 * is the signal, and these are the sentences it is made of — imported by both the code that writes them
 * and `@apackdev/testing`, so that rewording one is a change to the other and not a suite that fails
 * somewhere else saying something untrue.
 */
export { PACK_LOAD_MESSAGES, packRegistered, packLoadFailed } from './load-messages.ts';

// Installer
export {
  installPack, installPackFromLocal, installPackFromGitHub, installShippedPacks, type ShippedPackInstall,
  uninstallPack, isHostCompatible,
} from './installer.ts';
export { recordHostCompatibility, readHostCompatibility, type HostCompatibility } from './host-info.ts';
export { prepareHostDataDirs } from './staging.ts';

// Updater
export { checkForUpdates, getAvailableUpdates, findLatestRelease } from './updater.ts';
export type { ReleaseCandidate } from './updater.ts';

// Pack layout (build output, release archive and installed layout)
export {
  PACK_LAYOUT_VERSION, PACK_LAYOUT,
  sealPackBuild, stagePack, verifyPack, readPackIntegrity, readPackArtifact, isPackLayout,
  packFrontendFiles,
  packArtifactRevision, readPackAsset,
  createPackArchive, extractPackArchive, packArchiveName,
  getLoadedPackEntries, getPacksWithClientLoadedFrontends,
  staleBuildOutput,
} from './layout.ts';
export type { PackIntegrity, PackArtifact, LoadedPackEntry } from './layout.ts';

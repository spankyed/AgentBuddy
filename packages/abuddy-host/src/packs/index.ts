// Registration
export {
  registerPack, unregisterPack, registerHostSystem,
  getRegisteredSystems, buildRegisteredEventValidationMap,
  getRegisteredEntityTypes, getRegisteredEARS, getRegisteredEARSPolicy,
  getRegisteredServices, getRegisteredMigrations,
  getBootHooks, getPackBootHooks, runRegisteredBootSeeds,
  getPackContributions,
} from './pack-registration.ts';
export type { PackRegistration, PackBootHooks, PackEARS, PackMigration, PackContributions, PackInfo } from './pack-registration.ts';

// Discovery
export {
  discoverBuiltInPacks, discoverPacks, reconcileExternalRegistry,
} from './pack-discovery.ts';
export type { BuiltInPackInfo, PackManifest } from './pack-discovery.ts';

// Registry (JSON file CRUD)
export {
  readPackRegistry, writePackRegistry, modifyRegistry,
  addToRegistry, removeFromRegistry,
} from './pack-registry.ts';
export type { PackRegistryEntry } from './pack-registry.ts';

// Installer
export {
  installPack, installPackFromLocal, installPackFromUrl, installPackFromGitHub,
  uninstallPack, checkDependencies, isHostCompatible, sweepStaleStagingDirs,
} from './pack-installer.ts';
export type { InstallResult } from './pack-installer.ts';
export { recordHostVersion, readHostVersion } from './host-info.ts';

// Updater
export { checkForUpdates, getAvailableUpdates } from './pack-updater.ts';

// Bundle (build output, release archive and installed layout)
export {
  BUNDLE_FORMAT_VERSION, BUNDLE_PATHS,
  stageBundle, verifyBundle, readBundleInfo, isBundleDir, hasBuiltBundleSections,
  resolveBundleManifest, resolvePackSeedsDir,
  createBundleArchive, extractBundleArchive, bundleArchiveName, sha256File,
  publishHostPackArtifacts,
} from './bundle.ts';
export type { BundleInfo } from './bundle.ts';
export { findLatestRelease } from './pack-updater.ts';
export type { UpdateCheckResult, ReleaseCandidate } from './pack-updater.ts';

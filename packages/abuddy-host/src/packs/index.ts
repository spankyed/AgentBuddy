// Registration
export {
  registerPack, unregisterPack, registerHostSystem,
  getRegisteredSystems, buildRegisteredEventValidationMap,
  getRegisteredEntityTypes, getRegisteredEARS, getRegisteredEARSPolicy,
  getRegisteredServices, getRegisteredMigrations,
  getBootHooks, getPackBootHooks, runRegisteredBootSeeds,
  getPackContributions,
} from './pack-registration.js';
export type { PackRegistration, PackBootHooks, PackEARS, PackMigration, PackContributions, PackInfo } from './pack-registration.js';

// Discovery
export {
  discoverBuiltInPacks, discoverPacks, reconcileExternalRegistry,
} from './pack-discovery.js';
export type { BuiltInPackInfo, PackManifest } from './pack-discovery.js';

// Registry (JSON file CRUD)
export {
  readPackRegistry, writePackRegistry, modifyRegistry,
  addToRegistry, removeFromRegistry,
} from './pack-registry.js';
export type { PackRegistryEntry } from './pack-registry.js';

// Installer
export {
  installPack, installPackFromLocal, installPackFromUrl, installPackFromGitHub,
  uninstallPack, checkDependencies, isHostCompatible,
} from './pack-installer.js';
export type { InstallResult } from './pack-installer.js';
export { recordHostVersion, readHostVersion } from './host-info.js';

// Updater
export { checkForUpdates, getAvailableUpdates } from './pack-updater.js';

// Bundle (build output, release archive and installed layout)
export {
  BUNDLE_FORMAT_VERSION, BUNDLE_PATHS,
  stageBundle, verifyBundle, readBundleInfo, isBundleDir, hasBuiltBundleSections,
  resolveBundleManifest, resolvePackSeedsDir,
  createBundleArchive, extractBundleArchive, bundleArchiveName, sha256File,
  publishHostPackArtifacts,
} from './bundle.js';
export type { BundleInfo } from './bundle.js';
export { findLatestRelease } from './pack-updater.js';
export type { UpdateCheckResult, ReleaseCandidate } from './pack-updater.js';

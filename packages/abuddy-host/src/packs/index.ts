// Registration: the registered packs, an instance per app (the composition root), test file or build
export { createPackRegistry } from './pack-registration.ts';
export type { PackRegistry, PackRegistration, PackBootHooks, PackEARS, PackMigration, PackContributions, PackInfo } from './pack-registration.ts';

// Loading pack runtime code on the loader's own @abuddy/sdk
export { withModuleBridge } from './module-bridge.ts';

// Discovery
export {
  discoverBuiltInPacks, discoverPacks, reconcileExternalRegistry,
} from './pack-discovery.ts';
export type { BuiltInPackInfo, PackManifest } from './pack-discovery.ts';

// Registry (JSON file CRUD)
export {
  readPackRegistry, modifyRegistry,
  addToRegistry, removeFromRegistry,
} from './pack-registry.ts';
export type { PackRegistryEntry } from './pack-registry.ts';

// Installer
export {
  installPack, installPackFromLocal, installPackFromGitHub,
  uninstallPack, isHostCompatible,
} from './pack-installer.ts';
export { recordHostVersion, readHostVersion } from './host-info.ts';
export { prepareHostDataDirs } from './staging.ts';

// Updater
export { checkForUpdates, getAvailableUpdates } from './pack-updater.ts';

// Bundle (build output, release archive and installed layout)
export {
  BUNDLE_FORMAT_VERSION, BUNDLE_PATHS,
  stageBundle, verifyBundle, readBundleInfo, isBundleDir,
  packFrontendFiles,
  createBundleArchive, extractBundleArchive, bundleArchiveName,
  publishHostPackArtifacts,
  pruneHostPackArtifacts,
} from './bundle.ts';
export type { BundleInfo, PackBundleEntry } from './bundle.ts';

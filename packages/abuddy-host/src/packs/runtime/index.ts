// The pack runtime the app runs: loading, lifecycle, reload, seeding and the host packs system.
// The @abuddy/host/packs barrel (which the CLI imports) never imports this.
export {
  loadAppPacks, loadBuiltInPacks, refreshBuiltInPackInfo,
  builtInRuntimeEntry, loadBuiltInRuntime,
  loadExternalPacks, loadSingleExternalPack, registerExternalPacks, clearPackRequireCache,
} from './loader.ts';
export type { BuiltInRuntime } from './loader.ts';
export { withHostResolution, getBridgedSdkSpecifiers } from './bridge.ts';
export type { LoadedPack, LoadProblemSink, PackLoadProblem } from './loader.ts';
export { activatePack, teardownPack } from './lifecycle.ts';
export { reloadPackById } from './reload.ts';
export { computePackSeedHash, seedPacks, type PackSeedTarget } from './seed.ts';
export type { PackImportFailure } from './seed.ts';
export { startPacks } from './start.ts';
export { activationProblem } from './activation-outcome.ts';

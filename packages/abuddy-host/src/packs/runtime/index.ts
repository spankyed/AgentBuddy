// The pack runtime the app runs: loading, lifecycle, reload, seeding and the host packs system.
// The @abuddy/host/packs barrel (which the CLI imports) never imports this.
export {
  loadBuiltInPacks, getBuiltInPackInfos, refreshBuiltInPackInfo,
  builtInRuntimeEntry, loadBuiltInRuntime,
  loadExternalPacks, loadSingleExternalPack, registerExternalPacks, clearPackRequireCache,
} from './loader.ts';
export type { BuiltInRuntime, BundledPackLoaders, LoadBuiltInPacksOptions } from './loader.ts';
export { withHostResolution, getBridgedSdkSpecifiers } from './bridge.ts';
export {
  getLoadedPacks, setLoadedPacks, updateLoadedPack, removeLoadedPack, getPacksWithClientLoadedFrontends,
  setBuiltInPacksForRegistry, getPackBundleEntries,
} from './loaded-packs.ts';
export type { LoadedPack } from './loaded-packs.ts';
export { activatePack, teardownPack } from './lifecycle.ts';
export { reloadExternalPack, reloadBuiltInPack } from './reload.ts';
export { computePackSeedHash, seedPackData, orchestrateDeclarativeSeed } from './seed.ts';
export type { PackSeedFailure } from './seed.ts';
export { startPacks } from './start.ts';
export { createPacksSystem, packsEvents, packsSpec, packs, setBuiltInPacks } from './packs-system.ts';
export { activationProblem } from './activation-outcome.ts';

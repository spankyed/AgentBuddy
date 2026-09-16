// ⚠️  NODE-ONLY barrel — re-exports modules that use fs, path, child_process, process.env.
// FE-reachable SDK modules must NEVER import from this barrel; import from
// '@abuddy/sdk/utils/pure' (or a specific sub-path like './compare-versions') instead.
import { getHostModule } from '../runtime/host.ts';

// --- Pure utilities (environment-agnostic, re-exported for backend convenience) ---
export * from './pure.ts';

// --- Paths (direct) ---
export {
  getUserDataPath, getDataDirPath,
  getLmdbPath, getVolatileLmdbPath, getSecretsFilePath, getMediaPath,
  ensureDirectoryExists, createExportDir,
  resolvePath,
} from './paths.ts';

// --- Media (direct) ---
export {
  extractMediaRefs, copyMediaByRef, rewriteMediaUrls, copyFlatMedia,
  resolveMedia, readMediaBuffer, extractAndResolveImages, extractImageParts, stripMediaRefs,
  restoreJsonMediaRefs, restoreMarkdownMediaRefs,
} from './media.ts';
export type { MediaRef, ResolvedMedia, ImagePart } from './media.ts';

// --- Export utilities (direct) ---
export {
  writeExportJson, writeExportFile, stripInternalFields,
  toSlug, uniqueFilename,
} from './export.ts';

// --- Resolve CLI (direct) ---
export {
  resolveForService, resolveCliPath, testCli,
  isCliName, clearCliPathCache,
} from './resolve-cli.ts';
export type { CliName } from './resolve-cli.ts';

// --- Seed (direct) ---
export {
  registerSeeders, unregisterSeeders, seedData, seedCollection,
  loadJSON, shouldSeedAll, filterByInclude,
} from './seed.ts';
export type { SeedCounts, SeedIncludeSet, ImportMode, SeederContext, Seeder } from './seed.ts';

// --- Lifecycle (direct) ---
export { registerShutdownHook, runShutdownHooks, runShutdownHooksForKey, removeShutdownHooksForKey } from './lifecycle.ts';

// --- Version (host-injected) ---
let _versionMod: any;
function versionMod() { if (!_versionMod) _versionMod = getHostModule('version'); return _versionMod; }

export function getAppVersion(): string { return versionMod().APP_VERSION; }

// --- Migrations (host-injected) ---
let _migrationsMod: any;
function migrationsMod() { if (!_migrationsMod) _migrationsMod = getHostModule('migrations'); return _migrationsMod; }

export function runMigrations(): void { return migrationsMod().runMigrations(); }

// ⚠️  NODE-ONLY barrel — re-exports modules that use fs, path, child_process, process.env.
// FE-reachable SDK modules must NEVER import from this barrel; import from
// '@abuddy/sdk/utils/pure' (or a specific sub-path like './compare-versions') instead.
import { getHostModule } from '../runtime/host.js';

// --- Pure utilities (environment-agnostic, re-exported for backend convenience) ---
export * from './pure.js';

// --- Paths (direct) ---
export {
  getUserDataPath, getSearchIndicesPath, getModelsCachePath,
  getLmdbPath, getVolatileLmdbPath, getSecretsLmdbPath, getMediaPath,
  ensureDirectoryExists, createExportDir,
  getIndexPath, getIndexFilePath, getIndexMetadataPath, getIndexMappingsPath,
  resolvePath,
} from './paths.js';

// --- Media (direct) ---
export {
  extractMediaRefs, copyMediaByRef, rewriteMediaUrls, copyFlatMedia,
  resolveMedia, readMediaBuffer, extractAndResolveImages, stripMediaRefs,
  restoreJsonMediaRefs, restoreMarkdownMediaRefs,
} from './media.js';
export type { MediaRef, ResolvedMedia } from './media.js';

export interface ImagePart {
  type: 'image'
  image: Buffer
  mimeType: string
}

import { extractMediaRefs as _extractMediaRefs, readMediaBuffer as _readMediaBuffer } from './media.js';

export function extractImageParts(markdown: string): ImagePart[] {
  return _extractMediaRefs(markdown)
    .map((ref) => _readMediaBuffer(ref))
    .filter((img): img is NonNullable<typeof img> => img !== null)
    .map((img) => ({
      type: 'image' as const,
      image: img.data,
      mimeType: img.mimeType,
    }));
}

// --- Export utilities (direct) ---
export {
  writeExportJson, writeExportFile, stripInternalFields,
  toSlug, uniqueFilename,
} from './export.js';

// --- Resolve CLI (direct) ---
export {
  resolveForService, resolveCliPath, testCli,
  isCliName, clearCliPathCache,
} from './resolve-cli.js';
export type { CliName } from './resolve-cli.js';

// --- Seed (direct) ---
export {
  registerSeeder, seedData, seedCollection,
  loadJSON, shouldSeedAll, filterByInclude,
} from './seed.js';
export type { SeedCounts, SeedIncludeSet, ImportMode, SeederContext, Seeder } from './seed.js';

// --- Lifecycle (direct) ---
export { registerShutdownHook, runShutdownHooks, runShutdownHooksForKey, removeShutdownHooksForKey } from './lifecycle.js';

// --- System Errors (host-injected) ---
let _systemErrorsMod: any;
function systemErrorsMod() { if (!_systemErrorsMod) _systemErrorsMod = getHostModule('system-errors'); return _systemErrorsMod; }

export function reportSystemError(...args: any[]): void { return systemErrorsMod().reportSystemError(...args); }

// --- Version (host-injected) ---
let _versionMod: any;
function versionMod() { if (!_versionMod) _versionMod = getHostModule('version'); return _versionMod; }

export function getAppVersion(): string { return versionMod().APP_VERSION; }

// --- Migrations (host-injected) ---
let _migrationsMod: any;
function migrationsMod() { if (!_migrationsMod) _migrationsMod = getHostModule('migrations'); return _migrationsMod; }

export function runMigrations(): void { return migrationsMod().runMigrations(); }

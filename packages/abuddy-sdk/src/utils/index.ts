// ⚠️  NODE-ONLY barrel — re-exports modules that use fs, path, child_process, process.env.
// FE-reachable SDK modules must NEVER import from this barrel; import from
// '@abuddy/sdk/utils/pure' (or a specific sub-path like './compare-versions') instead.

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

// --- Seed (direct) ---
export {
  seedData, seedCollection,
  loadJSON, shouldSeedAll, filterByInclude,
} from './seed.ts';
export type { SeedCounts, SeedIncludeSet, ImportMode, SeederContext, Seeder } from './seed.ts';


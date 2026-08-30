import { getHostModule } from '../runtime/host';

// --- Paths ---
let _pathsMod: any;
function pathsMod() { if (!_pathsMod) _pathsMod = getHostModule('paths'); return _pathsMod; }

export function getMediaPath(...args: any[]): string { return pathsMod().getMediaPath(...args); }
export function getLmdbPath(...args: any[]): string { return pathsMod().getLmdbPath(...args); }
export function getVolatileLmdbPath(...args: any[]): string { return pathsMod().getVolatileLmdbPath(...args); }
export function getSecretsLmdbPath(...args: any[]): string { return pathsMod().getSecretsLmdbPath(...args); }
export function createExportDir(parentDir: string, systemName: string): string { return pathsMod().createExportDir(parentDir, systemName); }
export function ensureDirectoryExists(dirPath: string): void { return pathsMod().ensureDirectoryExists(dirPath); }

// --- Media ---
let _mediaMod: any;
function mediaMod() { if (!_mediaMod) _mediaMod = getHostModule('media'); return _mediaMod; }

export function extractMediaRefs(...args: any[]): any[] { return mediaMod().extractMediaRefs(...args); }
export function copyMediaByRef(...args: any[]): any { return mediaMod().copyMediaByRef(...args); }
export function rewriteMediaUrls(...args: any[]): string { return mediaMod().rewriteMediaUrls(...args); }
export function copyFlatMedia(...args: any[]): any { return mediaMod().copyFlatMedia(...args); }
export function resolveMedia(...args: any[]): any { return mediaMod().resolveMedia(...args); }
export function readMediaBuffer(...args: any[]): any { return mediaMod().readMediaBuffer(...args); }
export function extractAndResolveImages(...args: any[]): any[] { return mediaMod().extractAndResolveImages(...args); }
export function stripMediaRefs(...args: any[]): string { return mediaMod().stripMediaRefs(...args); }
export function restoreJsonMediaRefs(...args: any[]): { content: string; mediaRestored: number } { return mediaMod().restoreJsonMediaRefs(...args); }
export function restoreMarkdownMediaRefs(...args: any[]): { content: string; mediaRestored: number } { return mediaMod().restoreMarkdownMediaRefs(...args); }
export type MediaRef = any;

// --- Export ---
let _exportMod: any;
function exportMod() { if (!_exportMod) _exportMod = getHostModule('export'); return _exportMod; }

export function writeExportJson(outputDir: string, filename: string, data: unknown): string { return exportMod().writeExportJson(outputDir, filename, data); }
export function writeExportFile(dir: string, filename: string, content: string): string { return exportMod().writeExportFile(dir, filename, content); }
export function stripInternalFields<T extends object>(items: T[]): Record<string, unknown>[] {
  return exportMod().stripInternalFields(items);
}
export function toSlug(text: string): string { return exportMod().toSlug(text); }
export function uniqueFilename(name: string, existingNames: Set<string>): string { return exportMod().uniqueFilename(name, existingNames); }

// --- Resolve CLI ---
let _cliMod: any;
function cliMod() { if (!_cliMod) _cliMod = getHostModule('resolve-cli'); return _cliMod; }

export function resolveForService(name: string): Promise<string> {
  return cliMod().resolveForService(name);
}
export function testCli(...args: any[]): any { return cliMod().testCli(...args); }
export function isCliName(name: string): boolean { return cliMod().isCliName(name); }
export function clearCliPathCache(): void { return cliMod().clearCliPathCache(); }

// --- Rename / Remove Mapping ---

export type Rename = { from: string; to: string };
export type ChangeBlock<T = any> = {
  renames?: Rename[];
  removed?: Array<T | string>;
};

export const toMap = (r?: Rename[]) =>
  new Map<string, string>(r?.map(({ from, to }) => [from, to]) ?? []);

export const toIdentifierSet = <T = any>(
  removed?: Array<T | string>,
  keyExtractor: (item: T) => string = (item: any) => item.name,
) =>
  new Set<string>((removed ?? []).map(x =>
    typeof x === 'string' ? x : keyExtractor(x as T)
  ));

export const mapScalar = (
  val: string | undefined,
  renames: Map<string, string>,
  removed: Set<string>,
  fallback?: () => string | undefined,
): string | undefined => {
  if (!val) return val;
  const renamed = renames.get(val);
  if (renamed) return renamed;
  if (removed.has(val)) return fallback?.();
  return val;
};

export const mapArray = (
  vals: string[] | undefined,
  renames: Map<string, string>,
  removed: Set<string>,
): { next: string[]; changed: boolean } => {
  if (!vals?.length) return { next: vals ?? [], changed: false };
  let changed = false;
  const next = vals
    .map(v => {
      if (removed.has(v)) {
        changed = true;
        return null;
      }
      const n = renames.get(v);
      if (n && n !== v) {
        changed = true;
        return n;
      }
      return v;
    })
    .filter(Boolean) as string[];
  return { next, changed };
};

// --- Random ID ---
let _randomIdMod: any;
function randomIdMod() { if (!_randomIdMod) _randomIdMod = getHostModule('random-id'); return _randomIdMod; }

export interface RandomIdOptions {
  prefix?: string;
  counterSafe?: boolean;
  length?: number;
  includeTimestamp?: boolean;
}

export function randomId(opt?: RandomIdOptions): string { return randomIdMod().randomId(opt); }

// --- Binary Operator ---
let _binaryOpMod: any;
function binaryOpMod() { if (!_binaryOpMod) _binaryOpMod = getHostModule('binary-operator'); return _binaryOpMod; }

export const BinaryOperator: any = new Proxy({} as any, {
  get(_, prop: string) { return binaryOpMod().BinaryOperator[prop]; },
});

// --- Change Detection ---
let _changeDetectionMod: any;
function changeDetectionMod() { if (!_changeDetectionMod) _changeDetectionMod = getHostModule('change-detection'); return _changeDetectionMod; }

export type DiffResult<T> =
  | null
  | { renames: Array<{ from: string; to: string }>; added: T[]; removed: T[] };

export function detectChanges<T>(
  prev: T[] | undefined,
  next: T[] | undefined,
  id: (x: T) => string,
  key: (x: T) => string,
): DiffResult<T> {
  return changeDetectionMod().detectChanges(prev, next, id, key);
}

// --- Display Name ---
let _displayNameMod: any;
function displayNameMod() { if (!_displayNameMod) _displayNameMod = getHostModule('display-name'); return _displayNameMod; }

export function toDisplayName(slug: string): string { return displayNameMod().toDisplayName(slug); }

// --- System Errors ---
let _systemErrorsMod: any;
function systemErrorsMod() { if (!_systemErrorsMod) _systemErrorsMod = getHostModule('system-errors'); return _systemErrorsMod; }

export function reportSystemError(...args: any[]): void { return systemErrorsMod().reportSystemError(...args); }

// --- Seed ---
let _seedMod: any;
function seedMod() { if (!_seedMod) _seedMod = getHostModule('seed'); return _seedMod; }

export interface SeedCounts {
  created: number;
  updated: number;
  skipped: number;
}

export type SeedIncludeSet = true | ReadonlySet<string>;

export type ImportMode = 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace';

export interface SeederContext {
  compiledDir: string;
  include?: SeedIncludeSet;
  mode?: ImportMode;
  log: (...args: any[]) => void;
}

export interface Seeder {
  key: string;
  seed(ctx: SeederContext): SeedCounts;
}

export function registerSeeder(seeder: Seeder): void { return seedMod().registerSeeder(seeder); }

export function seedData(options: {
  compiledDir: string;
  include?: Record<string, SeedIncludeSet | undefined>;
  mode?: ImportMode;
  verbose?: boolean;
}): Record<string, SeedCounts> { return seedMod().seedData(options); }

export function seedCollection<T>(opts: {
  file: string;
  label: string;
  getKey: (item: T) => string;
  findExisting: (item: T) => { id: string } | undefined;
  create: (item: T) => void;
  update: (id: string, item: T) => void;
  log: (...args: any[]) => void;
  include?: SeedIncludeSet;
  mode?: ImportMode;
  wipe?: () => void;
  getSourceHash?: (item: T) => string | undefined;
  getExistingSourceHash?: (existing: { id: string }) => string | undefined;
}): SeedCounts { return seedMod().seedCollection(opts); }

export function loadJSON<T = unknown>(filePath: string): T | null { return seedMod().loadJSON(filePath); }
export function shouldSeedAll(inc?: SeedIncludeSet): boolean { return seedMod().shouldSeedAll(inc); }
export function filterByInclude<T>(items: T[], getKey: (item: T) => string, inc?: SeedIncludeSet): T[] {
  return seedMod().filterByInclude(items, getKey, inc);
}

// --- Lifecycle ---
let _lifecycleMod: any;
function lifecycleMod() { if (!_lifecycleMod) _lifecycleMod = getHostModule('lifecycle'); return _lifecycleMod; }

export function registerShutdownHook(fn: () => void | Promise<void>): void { return lifecycleMod().registerShutdownHook(fn); }
export function runShutdownHooks(): Promise<void> { return lifecycleMod().runShutdownHooks(); }

// --- Version ---
let _versionMod: any;
function versionMod() { if (!_versionMod) _versionMod = getHostModule('version'); return _versionMod; }

export function getAppVersion(): string { return versionMod().APP_VERSION; }

// --- Migrations ---
let _migrationsMod: any;
function migrationsMod() { if (!_migrationsMod) _migrationsMod = getHostModule('migrations'); return _migrationsMod; }

export function runMigrations(): void { return migrationsMod().runMigrations(); }

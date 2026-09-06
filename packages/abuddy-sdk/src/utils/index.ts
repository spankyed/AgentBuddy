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

export interface ImagePart {
  type: 'image'
  image: Buffer
  mimeType: string
}

export function extractImageParts(markdown: string): ImagePart[] {
  return extractMediaRefs(markdown)
    .map((ref: any) => readMediaBuffer(ref))
    .filter((img: any): img is NonNullable<typeof img> => img !== null)
    .map((img: any) => ({
      type: 'image' as const,
      image: img.data,
      mimeType: img.mimeType,
    }));
}

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

// ─── Random ID (pure, no host dependency) ────────────────────────────

export interface RandomIdOptions {
  prefix?: string;
  counterSafe?: boolean;
  length?: number;
  includeTimestamp?: boolean;
}

const DIGITS = Array.from({ length: 36 }, (_, i) => i.toString(36));
const toBase36 = (num: number) => {
  let n = num >>> 0;
  let out = '';
  do { out = DIGITS[n % 36] + out; n = Math.floor(n / 36); } while (n);
  return out;
};

const getRand64 = (): string => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new BigUint64Array(1);
    crypto.getRandomValues(arr);
    return arr[0].toString(36);
  }
  const hi = (Math.random() * 0xffffffff) >>> 0;
  const lo = (Math.random() * 0xffffffff) >>> 0;
  return (BigInt(hi) << 32n | BigInt(lo)).toString(36);
};

let counter = 0;
const nextCounter = () => { counter = (counter + 1) & 0xfff; return counter; };

export function randomId(opt: RandomIdOptions = {}): string {
  const { prefix = '', counterSafe = false, length, includeTimestamp = true } = opt;
  const ts = includeTimestamp ? Date.now().toString(36) : '';
  const cnt = counterSafe ? toBase36(nextCounter()) : '';
  const rand = getRand64();
  let core = ts + cnt + rand;
  if (length && core.length > length) core = core.slice(0, length);
  return prefix ? prefix + core : core;
}

// ─── JSONPath-like Value Extraction (pure, no host dependency) ───────

export function extractValueByPath(source: any, path: string): any {
  if (!path || path === '$') return source;
  const cleanPath = path.startsWith('$.') ? path.slice(2) : path;
  const segments = cleanPath.split('.');

  let current = source;
  for (const segment of segments) {
    if (current == null) return undefined;

    const selector = segment.match(/^(\w+)\[(\w+)=([^\]]+)\]$/);
    if (selector) {
      const [, arrayName, field, value] = selector;
      const arr = current[arrayName];
      if (!Array.isArray(arr)) return undefined;
      current = arr.find((item: any) => item?.[field] === value);
    } else {
      current = current[segment];
    }
  }
  return current;
}

// ─── Binary Operator (pure enum, no host dependency) ─────────────────

export enum BinaryOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  GREATER_THAN_OR_EQUALS = 'greater_than_or_equals',
  LESS_THAN_OR_EQUALS = 'less_than_or_equals',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  MATCHES = 'matches',
  IS_EMPTY = 'is_empty',
  IS_NULL = 'is_null',
}

// ─── Change Detection (pure, no host dependency) ─────────────────────

export type DiffResult<T> =
  | null
  | { renames: Array<{ from: string; to: string }>; added: T[]; removed: T[] };

export const detectChanges = <T>(
  prev: T[] | undefined,
  next: T[] | undefined,
  id: (x: T) => string,
  key: (x: T) => string,
): DiffResult<T> => {
  if (!prev || !next) return null;
  const prevById = new Map(prev.map(x => [id(x), x]));
  const nextById = new Map(next.map(x => [id(x), x]));
  const nextIdByKey = new Map(next.map(x => [key(x), id(x)]));
  const renames = prev
    .filter(p => !nextById.has(id(p)))
    .map(p => ({ from: id(p), to: nextIdByKey.get(key(p)) }))
    .filter((r): r is { from: string; to: string } => !!r.to && !prevById.has(r.to));
  const fromSet = new Set(renames.map(r => r.from));
  const toSet   = new Set(renames.map(r => r.to));
  const added   = next.filter(x => !prevById.has(id(x)) && !toSet.has(id(x)));
  const removed = prev.filter(x => !nextById.has(id(x)) && !fromSet.has(id(x)));
  return renames.length || added.length || removed.length ? { renames, added, removed } : null;
};

export const detectAllArrayChanges = (prev: any, next: any): Record<string, DiffResult<any>> | null => {
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') return null;
  const changes: Record<string, DiffResult<any>> = {};
  const detectInObject = (prevObj: any, nextObj: any, path: string[] = []) => {
    for (const key in nextObj) {
      const prevVal = prevObj?.[key];
      const nextVal = nextObj[key];
      if (Array.isArray(nextVal) && Array.isArray(prevVal)) {
        if (nextVal.length > 0 && typeof nextVal[0] === 'object') {
          const diff = detectArrayChanges(prevVal, nextVal);
          if (diff) changes[[...path, key].join('.') || key] = diff;
        }
      } else if (typeof nextVal === 'object' && nextVal !== null && !Array.isArray(nextVal)) {
        detectInObject(prevVal, nextVal, [...path, key]);
      }
    }
  };
  detectInObject(prev, next);
  return Object.keys(changes).length > 0 ? changes : null;
};

const detectArrayChanges = (prev: any[], next: any[]): DiffResult<any> => {
  if (!prev.length || !next.length) return null;
  if (typeof prev[0] !== 'object' || typeof next[0] !== 'object') return null;
  const idFields = ['id', 'label', 'name', 'key', 'code'];
  const idField = idFields.find(f => prev[0].hasOwnProperty(f));
  if (!idField) return null;
  const matchFields = ['color', 'value', 'icon'];
  const matchField = matchFields.find(f => prev[0].hasOwnProperty(f)) || idField;
  return detectChanges(prev, next, item => String(item[idField]), item => String(item[matchField]));
};

// ─── Display Name (pure, no host dependency) ─────────────────────────

export function toDisplayName(str: string): string {
  return str.replace(/-/g, ' ');
}

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

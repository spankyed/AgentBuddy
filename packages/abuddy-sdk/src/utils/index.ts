import { getHostModule } from '../runtime/host';

// --- Paths (direct) ---
export {
  getUserDataPath, getSearchIndicesPath, getModelsCachePath,
  getLmdbPath, getVolatileLmdbPath, getSecretsLmdbPath, getMediaPath,
  ensureDirectoryExists, createExportDir,
  getIndexPath, getIndexFilePath, getIndexMetadataPath, getIndexMappingsPath,
  resolvePath,
} from './paths';

// --- Media (direct) ---
export {
  extractMediaRefs, copyMediaByRef, rewriteMediaUrls, copyFlatMedia,
  resolveMedia, readMediaBuffer, extractAndResolveImages, stripMediaRefs,
  restoreJsonMediaRefs, restoreMarkdownMediaRefs,
} from './media';
export type { MediaRef, ResolvedMedia } from './media';

export interface ImagePart {
  type: 'image'
  image: Buffer
  mimeType: string
}

import { extractMediaRefs as _extractMediaRefs, readMediaBuffer as _readMediaBuffer } from './media';

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
} from './export';

// --- Resolve CLI (direct) ---
export {
  resolveForService, resolveCliPath, testCli,
  isCliName, clearCliPathCache,
} from './resolve-cli';
export type { CliName } from './resolve-cli';

// --- Seed (direct) ---
export {
  registerSeeder, seedData, seedCollection,
  loadJSON, shouldSeedAll, filterByInclude,
} from './seed';
export type { SeedCounts, SeedIncludeSet, ImportMode, SeederContext, Seeder } from './seed';

// --- Shared utilities (moved from API core/shared) ---

export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;

export type MaybeArr<T> = T | readonly T[];
export function asArr<T>(v: MaybeArr<T>): readonly T[] {
  return (Array.isArray(v) ? v : [v]) as readonly T[];
}

export const entries = <T extends Record<string, unknown>>(obj: T) =>
  Object.entries(obj) as Array<[keyof T, T[keyof T]]>

export function compareVersions(a: string, b: string): number {
  const [ax, bx] = [a, b].map(v => v.split('.').map(Number));
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const diff = (ax[i] ?? 0) - (bx[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

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

// --- System Errors (host-injected) ---
let _systemErrorsMod: any;
function systemErrorsMod() { if (!_systemErrorsMod) _systemErrorsMod = getHostModule('system-errors'); return _systemErrorsMod; }

export function reportSystemError(...args: any[]): void { return systemErrorsMod().reportSystemError(...args); }

// --- Lifecycle (direct) ---
export { registerShutdownHook, runShutdownHooks } from './lifecycle';

// --- Version (host-injected) ---
let _versionMod: any;
function versionMod() { if (!_versionMod) _versionMod = getHostModule('version'); return _versionMod; }

export function getAppVersion(): string { return versionMod().APP_VERSION; }

// --- Migrations (host-injected) ---
let _migrationsMod: any;
function migrationsMod() { if (!_migrationsMod) _migrationsMod = getHostModule('migrations'); return _migrationsMod; }

export function runMigrations(): void { return migrationsMod().runMigrations(); }

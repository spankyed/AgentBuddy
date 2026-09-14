import * as fs from 'node:fs';
import * as path from 'node:path';
import { sourceHash } from '../compile-utils.ts';
import { compileMarkdownTree, type MarkdownItem } from './markdown-tree.ts';

/**
 * One item a seed entry seeds: an entity row's fields, tagged with its entity type, plus its
 * children for trees. `sourceHash` decides whether a re-seed updates an existing row.
 */
export interface SeedRecord {
  entity?: string;
  sourceHash?: string;
  children?: SeedRecord[];
  [field: string]: unknown;
}

/** The compiled form of a generically seeded entry: `<key>.seed.json` */
export interface CompiledSeedFile {
  records: SeedRecord[];
}

/** Record keys that describe the record rather than being written as fields */
export const RECORD_KEYS: ReadonlySet<string> = new Set(['entity', 'children']);

/** Where a field's value comes from in a markdown item */
export type SeedFieldSource = 'body' | 'filename' | 'path' | `frontmatter.${string}`;

export interface SeedFieldSpec {
  from: SeedFieldSource;
  /** Used when the source is absent. The string `"filename"` means the item's display name. */
  default?: unknown;
  /** `"string"` coerces a present, non-null value to a string (YAML reads `title: 2024` as a number) */
  type?: 'string';
}

export interface SeedTreeSpec {
  /** A directory's own file (e.g. `index.md`), giving the directory's frontmatter and body */
  branch?: string;
  /** The entity type directories seed; defaults to the entry's `entity` */
  branchEntity?: string;
  /** The relation from a parent row to each child row */
  relKind?: string;
}

/** A `boot.seed` object entry for a non-specialty key */
export interface GenericSeedEntry {
  path?: string;
  format?: 'markdown-tree' | 'json';
  /** The entity types the entry seeds; omitted, the entry is compiled but not seeded */
  entity?: string | string[];
  /** Fields matched to find an existing row; `parent` means the tree parent */
  identity?: string[];
  tree?: SeedTreeSpec;
  fields?: Record<string, SeedFieldSpec>;
  /** A directory under `path` copied to `media/<key>/`; `media/<file>` links are rewritten to `media://<id>/<file>` */
  media?: string;
  /** A pack module whose default export compiles `path` into records */
  compiler?: string;
  /** A pack module exporting `seed(ctx)`, replacing the generic seeder */
  seeder?: string;
}

/** What a compiler module's default export receives */
export interface SeedCompileContext {
  key: string;
  /** Absolute path of the entry's `path` */
  path: string;
  packDir: string;
  entry: GenericSeedEntry;
}

export type SeedCompilerModule = (context: SeedCompileContext) => SeedRecord[] | Promise<SeedRecord[]>;

/** The entity types an entry seeds */
export function entryEntities(entry: GenericSeedEntry): string[] {
  const own = entry.entity === undefined ? [] : Array.isArray(entry.entity) ? entry.entity : [entry.entity];
  const branch = entry.tree?.branchEntity;
  return [...new Set(branch ? [...own, branch] : own)];
}

function fieldValue(item: MarkdownItem, spec: SeedFieldSpec): unknown {
  let value: unknown;
  if (spec.from === 'body') value = item.body;
  else if (spec.from === 'filename') value = item.displayName;
  else if (spec.from === 'path') value = item.path;
  else value = item.frontmatter[spec.from.slice('frontmatter.'.length)];
  if (value === undefined) value = spec.default === 'filename' ? item.displayName : spec.default;
  if (spec.type === 'string' && value !== undefined && value !== null) value = String(value);
  return value;
}

/** The default `sourceHash`: a record's fields, plus its children's hashes for a branch */
export function defaultSourceHash(record: SeedRecord): string {
  const fields = Object.fromEntries(Object.entries(record).filter(([key]) => !RECORD_KEYS.has(key) && key !== 'sourceHash'));
  return record.children
    ? sourceHash({ ...fields, children: record.children.map((child) => child.sourceHash) })
    : sourceHash(fields);
}

/** Fills in `sourceHash` (children first) where a record has none */
export function withSourceHashes(records: SeedRecord[]): SeedRecord[] {
  return records.map((record) => {
    const children = record.children ? withSourceHashes(record.children) : undefined;
    const withChildren = children ? { ...record, children } : record;
    return withChildren.sourceHash ? withChildren : { ...withChildren, sourceHash: defaultSourceHash(withChildren) };
  });
}

function markdownRecords(items: MarkdownItem[], entry: GenericSeedEntry, entity: string | undefined): SeedRecord[] {
  const branchEntity = entry.tree?.branchEntity ?? entity;
  return items.map((item) => {
    const fields = Object.fromEntries(
      Object.entries(entry.fields ?? {})
        .map(([name, spec]) => [name, fieldValue(item, spec)] as const)
        .filter(([, value]) => value !== undefined),
    );
    const recordEntity = item.kind === 'branch' ? branchEntity : entity;
    return {
      ...(recordEntity && { entity: recordEntity }),
      ...fields,
      ...(item.kind === 'branch' && { children: markdownRecords(item.children, entry, entity) }),
    };
  });
}

/** Compiles a `format` entry's source into records */
export function compileFormatEntry(key: string, entry: GenericSeedEntry, sourcePath: string): SeedRecord[] {
  const entity = typeof entry.entity === 'string' ? entry.entity : undefined;
  if (entry.format === 'markdown-tree') {
    const items = compileMarkdownTree(sourcePath, { branch: entry.tree?.branch, recursive: entry.tree !== undefined });
    return withSourceHashes(markdownRecords(items, entry, entity));
  }
  if (entry.format === 'json') {
    if (!fs.existsSync(sourcePath)) return [];
    const data = JSON.parse(fs.readFileSync(sourcePath, 'utf-8')) as unknown;
    const records = Array.isArray(data) ? data : (data as { records?: unknown }).records;
    if (!Array.isArray(records)) throw new Error(`Seed "${key}": ${path.basename(sourcePath)} must hold an array of records`);
    const tag = (items: SeedRecord[]): SeedRecord[] => items.map((record) => ({
      ...record,
      ...(record.entity === undefined && entity && { entity }),
      ...(record.children && { children: tag(record.children) }),
    }));
    return withSourceHashes(tag(records as SeedRecord[]));
  }
  throw new Error(`Seed "${key}": unknown format "${String(entry.format)}"`);
}

/** Checks each record's entity type against the entry's declared entities */
export function checkRecordEntities(key: string, entry: GenericSeedEntry, records: SeedRecord[]): string[] {
  const allowed = entryEntities(entry);
  const errors: string[] = [];
  const visit = (items: SeedRecord[], trail: string) => items.forEach((record, index) => {
    const at = `${trail}[${index}]`;
    if (allowed.length === 0) {
      if (record.entity !== undefined) errors.push(`Seed "${key}" ${at}: has entity "${record.entity}", but the entry declares no entity`);
    } else if (record.entity === undefined || !allowed.includes(record.entity)) {
      errors.push(`Seed "${key}" ${at}: entity ${record.entity === undefined ? 'is missing' : `"${record.entity}" isn't one of ${allowed.join(', ')}`}`);
    }
    if (record.children) visit(record.children, `${at}.children`);
  });
  visit(records, 'records');
  return errors;
}

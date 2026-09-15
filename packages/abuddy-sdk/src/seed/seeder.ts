import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EARS } from '../types/entities.ts';
import { destroyEntity } from '../ears/index.ts';
import { getAttr, updateAttr } from '../ears/attribute-storage.ts';
import { tx } from '../ears/transaction.ts';
import { qx } from '../ears/query.ts';
import { createEntityWithDefaults, updateEntity } from '../ears/transaction-helpers.ts';
import { findAll, findByIdRaw, findWhere } from '../ears/query-helpers.ts';
import { getMediaPath, loadJSON, shouldSeedAll, type Seeder, type SeederContext, type SeedCounts } from '../utils/index.ts';
import { seedPath } from '../build/manifest.ts';
import { SEED_INDEX_FILE, type SeedIndex } from '../build/seed-compiler.ts';
import { RECORD_KEYS, recordLabel, type CompiledSeedFile, type SeedRecord } from '../build/seeds/records.ts';
import { seedHookRegistry, type SeedHookContext, type SeedHookMatch, type SeedHooks } from './hooks.ts';

export interface SeederOptions {
  key: string;
  /** Fields matched to find an existing row (`parent` = the tree parent); entity types with a `find` hook ignore it */
  identity?: string[];
  /** The relation from a parent row to each child row */
  relKind?: string;
  /** The entry copies media: `media/<file>` links are rewritten to `media://<id>/<file>` */
  media?: boolean;
}

const DEFAULT_REL_KIND = 'contains';
/** What the seeder last wrote to a row: the record's field names and a hash of their stored values */
const SEEDED_FIELDS = 'seededFields' as EARS.AttrKind;
/** Which record a seeded row came from, independent of fields a user can change (a renamed row keeps it) */
export const SEED_KEY = 'seedKey' as EARS.AttrKind;
const SOURCE_HASH = 'sourceHash' as EARS.AttrKind;
const MEDIA_LINK_RE = /!\[([^\]]*)\]\((media\/([^)]+))\)/g;

interface SeededFields {
  fields: string[];
  hash: string;
}

function fieldsOf(record: SeedRecord): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !RECORD_KEYS.has(key)));
}

/** The fields the seeder tracks for a record: every field it sets but its sourceHash */
function seededFieldNames(record: SeedRecord): string[] {
  return Object.keys(fieldsOf(record)).filter((field) => field !== 'sourceHash').sort();
}

function hashValues(values: unknown[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 16);
}

function hashStoredFields(id: EARS.EntityId, fields: string[]): string {
  return hashValues(fields.map((field) => getAttr(id, field as EARS.AttrKind) ?? null));
}

/**
 * The pack that compiled a seeds directory, from its seeds.json. Seed keys start with it, so two
 * packs' records with the same entry key and identity never share a row.
 */
export function seedingPackId(compiledDir: string): string {
  const index = loadJSON<Partial<SeedIndex>>(path.join(compiledDir, SEED_INDEX_FILE));
  if (!index?.packId) {
    throw new Error(`${path.join(compiledDir, SEED_INDEX_FILE)} doesn't name the pack that compiled these seeds: rebuild the pack with abuddy build`);
  }
  return index.packId;
}

/** A record's place in its entry: the entry key, then each ancestor's and its own entity and identity */
export function childSeedKey(parentKey: string, record: SeedRecord, identity: readonly string[]): string {
  const fields = identity.filter((name) => name !== 'parent');
  const values = fields.length > 0 ? fields.map((name) => record[name] ?? null) : [recordLabel(record, identity)];
  return `${parentKey}/${encodeURIComponent(JSON.stringify([record.entity ?? null, ...values]))}`;
}

/** A seed key names the seeding pack before the entry key */
export const seedKeyPrefix = (packId: string) => `${packId}:`;

/** Records the row's seeded values, so a later seed can tell whether anything else changed them */
function stampSeededFields(id: EARS.EntityId, record: SeedRecord): void {
  const fields = seededFieldNames(record);
  updateAttr(id, SEEDED_FIELDS, { fields, hash: hashStoredFields(id, fields) } satisfies SeededFields);
}

/** The row's seeded fields still hold what the seeder wrote */
function holdsSeededValues(id: EARS.EntityId, seeded: SeededFields): boolean {
  return hashStoredFields(id, seeded.fields) === seeded.hash;
}

/**
 * Seeds `<key>.seed.json` records: finds each record's existing row, creates, updates or skips it,
 * and walks children under their parent row.
 * - `keep-existing` skips an existing row and its subtree.
 * - Otherwise a row with no stored hash is user-owned and left alone. A row whose stored hash matches
 *   the record's is left alone. A row whose hash differs is updated when its seeded fields still hold
 *   what the seeder wrote, and left alone when they don't, or weren't recorded (edited). Children are
 *   still visited.
 * - `wipe-and-replace` removes every row of the entry's entity types first.
 */
export function createSeeder(options: SeederOptions): Seeder {
  const { key, identity = [], relKind = DEFAULT_REL_KIND } = options;

  return {
    key,
    seed(ctx: SeederContext): SeedCounts {
      const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
      const file = loadJSON<CompiledSeedFile>(seedPath(ctx.compiledDir, key));
      if (!file) {
        ctx.log(`  ${key} file not found, skipping`);
        return counts;
      }
      const packId = seedingPackId(ctx.compiledDir);
      const records = shouldSeedAll(ctx.include)
        ? file.records
        : file.records.filter((record) => (ctx.include as ReadonlySet<string>).has(recordLabel(record, identity)));
      if (records.length === 0 && !shouldSeedAll(ctx.include)) return counts;

      if (ctx.mode === 'wipe-and-replace') {
        wipe(file.records);
        ctx.log(`  ${key} wiped`);
      }

      const mediaDir = options.media ? path.join(ctx.compiledDir, 'media', key) : undefined;
      const errors: string[] = [];

      /**
       * The row seeded from this record, however it's been renamed since; otherwise a row without a seed
       * key that matches by identity (a user's row with its name), so a seed never adds a copy beside it.
       */
      const find = (record: SeedRecord, seedKey: string, context: SeedHookContext, hooks?: SeedHooks): SeedHookMatch | undefined => {
        const keyed = record.entity ? findWhere<{ id: EARS.EntityId; sourceHash?: string }>(record.entity as EARS.Entity, SEED_KEY as string, seedKey)[0] : undefined;
        if (keyed) return { id: keyed.id, sourceHash: keyed.sourceHash };
        const match = findByIdentity(record, context, hooks);
        if (!match) return undefined;
        // A row carrying another record's seed key (or another pack's) isn't this record's, whatever its name
        return getAttr(match.id, SEED_KEY) === null ? match : undefined;
      };

      const findByIdentity = (record: SeedRecord, context: SeedHookContext, hooks?: SeedHooks): SeedHookMatch | undefined => {
        if (hooks?.find) return hooks.find(record, context);
        const fields = identity.filter((name) => name !== 'parent');
        if (fields.length === 0) throw new Error(`Seed "${key}": entity "${record.entity}" has no find hook, so the entry needs "identity"`);
        const [first, ...rest] = fields;
        const candidates = findWhere<Record<string, unknown> & { id: EARS.EntityId }>(record.entity as EARS.Entity, first, record[first])
          .filter((row) => rest.every((name) => row[name] === record[name]));
        const match = identity.includes('parent')
          ? candidates.find((row) => qx(row.id).linksTo(relKind, undefined, false).ids()[0] === context.parentId)
          : candidates[0];
        return match && { id: match.id, sourceHash: match.sourceHash };
      };

      const create = (record: SeedRecord, context: SeedHookContext, hooks?: SeedHooks): EARS.EntityId => {
        if (hooks?.create) return hooks.create(record, context);
        const row = createEntityWithDefaults(record.entity as EARS.Entity, fieldsOf(record));
        if (context.parentId) tx(context.parentId).link(relKind, row.id);
        return row.id;
      };

      const update = (id: EARS.EntityId, record: SeedRecord, context: SeedHookContext, hooks?: SeedHooks) => {
        if (hooks?.update) hooks.update(id, record, context);
        else updateEntity(id, fieldsOf(record));
      };

      /** Hooks' repository commands may not store sourceHash; change tracking needs it, the seeded values and the seed key */
      const stamp = (id: EARS.EntityId, record: SeedRecord, seedKey: string) => {
        if (record.sourceHash && getAttr(id, SOURCE_HASH) !== record.sourceHash) updateAttr(id, SOURCE_HASH, record.sourceHash);
        stampSeededFields(id, record);
        updateAttr(id, SEED_KEY, seedKey);
      };

      /**
       * Updates a row to the record. EARS writes can't be rolled back, so when the update throws part
       * way, the row keeps its previous sourceHash and is stamped with what it holds now: it isn't
       * taken for edited, and the next seed updates it again.
       */
      const updateTracked = (existing: SeedHookMatch, record: SeedRecord, context: SeedHookContext, seedKey: string, hooks?: SeedHooks) => {
        try {
          update(existing.id, restoreMedia(record, existing.id, mediaDir, ctx.log).record, context, hooks);
        } catch (err) {
          updateAttr(existing.id, SOURCE_HASH, existing.sourceHash);
          stampSeededFields(existing.id, record);
          throw err;
        }
        stamp(existing.id, record, seedKey);
      };

      const visit = (items: SeedRecord[], parentId: EARS.EntityId | undefined, parentKey: string) => {
        items.forEach((record, index) => {
          const context: SeedHookContext = { parentId, index };
          const hooks = record.entity ? seedHookRegistry.get(record.entity) : undefined;
          const label = recordLabel(record, identity);
          const seedKey = childSeedKey(parentKey, record, identity);
          try {
            const existing = find(record, seedKey, context, hooks);
            if (existing) {
              if (ctx.mode === 'keep-existing') {
                counts.skipped++;
                ctx.log(`  ${key} skipped (existing): ${label}`);
                return;
              }
              const seeded = getAttr(existing.id, SEEDED_FIELDS) as SeededFields | null;
              if (!existing.sourceHash) {
                counts.skipped++;
                ctx.log(`  ${key} skipped (untracked): ${label}`);
              } else if (existing.sourceHash === record.sourceHash) {
                counts.skipped++;
                ctx.log(`  ${key} skipped: ${label}`);
              } else if (!seeded || !holdsSeededValues(existing.id, seeded)) {
                counts.skipped++;
                ctx.log(`  ${key} skipped (edited): ${label}`);
              } else {
                updateTracked(existing, record, context, seedKey, hooks);
                counts.updated++;
                ctx.log(`  ${key} updated: ${label}`);
              }
              if (record.children) visit(record.children, existing.id, seedKey);
              return;
            }
            const id = create(record, context, hooks);
            const restored = restoreMedia(record, id, mediaDir, ctx.log);
            if (restored.count > 0) update(id, restored.record, context, hooks);
            stamp(id, record, seedKey);
            counts.created++;
            ctx.log(`  ${key} created: ${label}`);
            if (record.children) visit(record.children, id, seedKey);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`${record.entity ?? key} "${label}": ${message}`);
            counts.skipped++;
          }
        });
      };

      visit(records, undefined, `${seedKeyPrefix(packId)}${key}`);
      if (errors.length > 0) counts.errors = errors;
      return counts;
    },
  };
}

/** Removes every row of the records' entity types, deepest types first (children before parents) */
function wipe(records: SeedRecord[]): void {
  const depth = new Map<string, number>();
  const measure = (items: SeedRecord[], level: number) => {
    for (const record of items) {
      if (record.entity) depth.set(record.entity, Math.max(depth.get(record.entity) ?? -1, level));
      if (record.children) measure(record.children, level + 1);
    }
  };
  measure(records, 0);
  const types = [...depth.entries()].sort((a, b) => b[1] - a[1]).map(([entity]) => entity);
  for (const entity of types) {
    const hooks = seedHookRegistry.get(entity);
    for (const row of findAll<{ id: EARS.EntityId }>(entity as EARS.Entity)) {
      // Removing a parent may already have removed this row
      if (!findByIdRaw(row.id)) continue;
      if (hooks?.remove) hooks.remove(row.id);
      else destroyEntity(row.id);
    }
  }
}

/** Copies media a record links to into the row's media folder and rewrites the links */
function restoreMedia(
  record: SeedRecord,
  id: EARS.EntityId,
  mediaDir: string | undefined,
  log: (...args: unknown[]) => void,
): { record: SeedRecord; count: number } {
  if (!mediaDir) return { record, count: 0 };
  let count = 0;
  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') {
      let text = value;
      for (const match of value.matchAll(MEDIA_LINK_RE)) {
        const filename = match[3];
        const source = path.join(mediaDir, filename);
        if (!fs.existsSync(source)) continue;
        const destination = path.join(getMediaPath(), id);
        fs.mkdirSync(destination, { recursive: true });
        fs.copyFileSync(source, path.join(destination, filename));
        log(`    media copied: ${filename}`);
        text = text.split(`media/${filename}`).join(`media://${id}/${filename}`);
        count++;
      }
      return text;
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    return value;
  };
  const rewritten = Object.fromEntries(
    Object.entries(record).map(([field, value]) => [field, field === 'children' ? value : rewrite(value)]),
  ) as SeedRecord;
  return { record: rewritten, count };
}

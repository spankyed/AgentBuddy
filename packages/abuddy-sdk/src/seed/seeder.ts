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
import { RECORD_KEYS, type CompiledSeedFile, type SeedRecord } from '../build/seeds/records.ts';
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
const MEDIA_LINK_RE = /!\[([^\]]*)\]\((media\/([^)]+))\)/g;

/** A record's label: what include sets and previews name it by */
export function recordLabel(record: SeedRecord, identity: readonly string[] = []): string {
  const field = identity.find((name) => name !== 'parent');
  return String((field ? record[field] : undefined) ?? record.name ?? record.title ?? record.label ?? '');
}

function fieldsOf(record: SeedRecord): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !RECORD_KEYS.has(key)));
}

/**
 * Seeds `<key>.seed.json` records: finds each record's existing row, creates, updates or skips it,
 * and walks children under their parent row.
 * - `keep-existing` skips an existing row and its subtree.
 * - Otherwise an existing row is updated only when its stored `sourceHash` differs from the record's;
 *   a row with no stored hash is user-owned and skipped. Children are still visited.
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

      const find = (record: SeedRecord, context: SeedHookContext, hooks?: SeedHooks): SeedHookMatch | undefined => {
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

      /** Hooks' repository commands may not store sourceHash; change tracking needs it */
      const stampHash = (id: EARS.EntityId, record: SeedRecord) => {
        if (record.sourceHash && getAttr(id, 'sourceHash' as EARS.AttrKind) !== record.sourceHash) {
          updateAttr(id, 'sourceHash' as EARS.AttrKind, record.sourceHash);
        }
      };

      const visit = (items: SeedRecord[], parentId: EARS.EntityId | undefined) => {
        items.forEach((record, index) => {
          const context: SeedHookContext = { parentId, index };
          const hooks = record.entity ? seedHookRegistry.get(record.entity) : undefined;
          const label = recordLabel(record, identity);
          try {
            const existing = find(record, context, hooks);
            if (existing) {
              if (ctx.mode === 'keep-existing') {
                counts.skipped++;
                ctx.log(`  ${key} skipped (existing): ${label}`);
                return;
              }
              if (!existing.sourceHash || existing.sourceHash === record.sourceHash) {
                counts.skipped++;
                ctx.log(`  ${key} skipped${existing.sourceHash ? '' : ' (untracked)'}: ${label}`);
              } else {
                update(existing.id, restoreMedia(record, existing.id, mediaDir, ctx.log).record, context, hooks);
                stampHash(existing.id, record);
                counts.updated++;
                ctx.log(`  ${key} updated: ${label}`);
              }
              if (record.children) visit(record.children, existing.id);
              return;
            }
            const id = create(record, context, hooks);
            const restored = restoreMedia(record, id, mediaDir, ctx.log);
            if (restored.count > 0) update(id, restored.record, context, hooks);
            stampHash(id, record);
            counts.created++;
            ctx.log(`  ${key} created: ${label}`);
            if (record.children) visit(record.children, id);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`${record.entity ?? key} "${label}": ${message}`);
            counts.skipped++;
          }
        });
      };

      visit(records, undefined);
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
        text = text.split(`media/${filename}`).join(`media://${id}/${filename}`);
        count++;
        log(`    media copied: ${filename}`);
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

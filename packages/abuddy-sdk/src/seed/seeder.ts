import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EARS } from '../types/entities.ts';
import { destroyEntity, installedEngine as ears, tx, untypedQx as qx } from '@abuddy/ears';
import { getMediaPath, loadJSON, shouldSeedAll, type Seeder, type SeederContext, type SeedCounts } from '../utils/index.ts';
import { seedPath } from '../build/manifest.ts';
import { seedingPackId } from '../utils/seed.ts';
import { RECORD_KEYS, recordLabel, type CompiledSeedFile, type SeedRecord } from '../build/seeds/records.ts';
import { seedHookRegistry, type SeedHookContext, type SeedHookMatch, type SeedHooks } from './hooks.ts';

export interface SeederOptions {
  key: string;
  /** The entity types the entry seeds (the format's `entity`): what `wipe-and-replace` removes */
  entities: string[];
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
  return hashValues(fields.map((field) => ears().getAttr(id, field as EARS.AttrKind) ?? null));
}

/** A record's place in its entry: the entry key, then each ancestor's and its own entity and identity */
export function childSeedKey(parentKey: string, record: SeedRecord, identity: readonly string[]): string {
  const fields = identity.filter((name) => name !== 'parent');
  const values = fields.length > 0 ? fields.map((name) => record[name] ?? null) : [recordLabel(record, identity)];
  return `${parentKey}/${encodeURIComponent(JSON.stringify([record.entity ?? null, ...values]))}`;
}

/** A seed key names the seeding pack before the entry key */
export const seedKeyPrefix = (packId: string) => `${packId}:`;

/** Records the row's values for the seeded fields, so a later seed can tell whether anything else changed them */
function stampSeededFields(id: EARS.EntityId, fields: string[]): void {
  tx(id).update(SEEDED_FIELDS, { fields, hash: hashStoredFields(id, fields) } satisfies SeededFields);
}

/** The row's seeded fields still hold what the seeder wrote */
function holdsSeededValues(id: EARS.EntityId, seeded: SeededFields): boolean {
  return hashStoredFields(id, seeded.fields) === seeded.hash;
}

/**
 * Marks a row seeded before the seeder recorded what it wrote as unedited, so the next seed of changed
 * data updates it once more instead of skipping it as edited. A migration calls this for rows that still
 * carry a `sourceHash`; without it every row seeded by an older version stays frozen for good.
 *
 * It records an empty field list, which reads back as unedited whatever the row now holds: the values
 * the old seeder wrote weren't recorded, so there is nothing to compare against. That makes the next
 * update overwrite an edit the user made before this ran — and it clears no fields, since none are
 * recorded as seeded. The update re-stamps the row with its real fields, and edits are honoured from
 * then on.
 */
export function markSeededRowUnedited(id: EARS.EntityId): void {
  tx(id).update(SEEDED_FIELDS, { fields: [], hash: hashValues([]) } satisfies SeededFields);
}

/**
 * Seeds `<key>.seed.json` records: finds each record's existing row, creates, updates or skips it,
 * and walks children under their parent row.
 * - `keep-existing` skips an existing row and its subtree.
 * - Otherwise a row with no stored hash is user-owned and left alone. A row whose stored hash matches
 *   the record's is left alone. A row whose hash differs is updated when its seeded fields still hold
 *   what the seeder wrote, and left alone when they don't, or weren't recorded (edited). Children are
 *   still visited.
 * - `wipe-and-replace` first removes every row of the entry's entity types, whoever created it (other
 *   packs' rows and the user's too), even when the file has no records of a type.
 * - A row another record's seed claimed (another pack's, or another entry's of this pack) isn't this
 *   record's, unless the entity's hooks set `container`: then it's reused as the record's parent, counted
 *   as skipped and left as its seed wrote it, in every mode but `wipe-and-replace`.
 */
export function createSeeder(options: SeederOptions): Seeder {
  const { key, entities, identity = [], relKind = DEFAULT_REL_KIND } = options;

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
        wipe(entities, file.records);
        ctx.log(`  ${key} wiped`);
      }

      const mediaDir = options.media ? path.join(ctx.compiledDir, 'media', key) : undefined;
      const errors: string[] = [];

      /**
       * The row seeded from this record, however it's been renamed since; otherwise a row without a seed
       * key that matches by identity (a user's row with its name), so a seed never adds a copy beside it.
       * A container another record seeded (another pack's, or another entry's) is reused as a parent
       * (`reused`): its children are seeded under it and the row itself is left alone.
       */
      const find = (record: SeedRecord, seedKey: string, context: SeedHookContext, hooks?: SeedHooks): { match?: SeedHookMatch; reused?: boolean } => {
        const keyed = record.entity ? ears().findWhere<{ id: EARS.EntityId; sourceHash?: string }>(record.entity as EARS.Entity, SEED_KEY as string, seedKey)[0] : undefined;
        if (keyed) return { match: { id: keyed.id, sourceHash: keyed.sourceHash } };
        const match = findByIdentity(record, context, hooks);
        if (!match) return {};
        const owner = ears().getAttr(match.id, SEED_KEY) as string | null;
        if (owner === null) return { match };
        // The keyed lookup missed, so the row is another record's: a container holds this record's children too
        if (hooks?.container) return { match, reused: true };
        // A row carrying another record's seed key (or another pack's) isn't this record's, whatever its name
        return {};
      };

      const findByIdentity = (record: SeedRecord, context: SeedHookContext, hooks?: SeedHooks): SeedHookMatch | undefined => {
        if (hooks?.find) return hooks.find(record, context);
        const fields = identity.filter((name) => name !== 'parent');
        if (fields.length === 0) throw new Error(`Seed "${key}": entity "${record.entity}" has no find hook, so the entry needs "identity"`);
        const [first, ...rest] = fields;
        const candidates = ears().findWhere<Record<string, unknown> & { id: EARS.EntityId }>(record.entity as EARS.Entity, first, record[first])
          .filter((row) => rest.every((name) => row[name] === record[name]));
        const match = identity.includes('parent')
          ? candidates.find((row) => qx(row.id).linksTo(relKind, undefined, false).ids()[0] === context.parentId)
          : candidates[0];
        return match && { id: match.id, sourceHash: match.sourceHash };
      };

      const create = (record: SeedRecord, context: SeedHookContext, hooks?: SeedHooks): EARS.EntityId => {
        if (hooks?.create) return hooks.create(record, context);
        const row = ears().createEntityWithDefaults(record.entity as EARS.Entity, fieldsOf(record));
        if (context.parentId) tx(context.parentId).link(relKind, row.id);
        return row.id;
      };

      /** Without a hook, fields the record no longer sets are dropped */
      const update = (id: EARS.EntityId, record: SeedRecord, context: SeedHookContext, hooks?: SeedHooks) => {
        if (hooks?.update) hooks.update(id, record, context);
        else ears().updateEntity(id, { ...fieldsOf(record), ...Object.fromEntries(context.clearedFields.map((field) => [field, null])) });
      };

      /** Hooks' repository commands may not store sourceHash; change tracking needs it, the seeded values and the seed key */
      const stamp = (id: EARS.EntityId, record: SeedRecord, seedKey: string) => {
        if (record.sourceHash && ears().getAttr(id, SOURCE_HASH) !== record.sourceHash) tx(id).update(SOURCE_HASH, record.sourceHash);
        stampSeededFields(id, seededFieldNames(record));
        tx(id).update(SEED_KEY, seedKey);
      };

      /**
       * Updates a row to the record, resetting the fields its previous seed set that the record no
       * longer sets. EARS writes can't be rolled back, so when the update throws part way, the row keeps
       * its previous sourceHash and seeded fields, stamped with what they hold now: it isn't taken for
       * edited, the next seed updates it again, and a field the record newly sets isn't recorded as
       * seeded while it holds a user's value.
       */
      const updateTracked = (existing: SeedHookMatch, seeded: SeededFields, record: SeedRecord, context: SeedHookContext, seedKey: string, hooks?: SeedHooks) => {
        const recordFields = new Set(seededFieldNames(record));
        const clearedFields = seeded.fields.filter((field) => !recordFields.has(field));
        try {
          update(existing.id, restoreMedia(record, existing.id, mediaDir, ctx.log).record, { ...context, clearedFields }, hooks);
        } catch (err) {
          tx(existing.id).update(SOURCE_HASH, existing.sourceHash);
          stampSeededFields(existing.id, seeded.fields);
          throw err;
        }
        stamp(existing.id, record, seedKey);
      };

      /**
       * Creates a row for the record and stamps it. A row left unstamped would be taken for a user's
       * (untracked) forever, so when copying its media or stamping it throws, the row is removed and the
       * next seed creates it again.
       */
      const createTracked = (record: SeedRecord, context: SeedHookContext, seedKey: string, hooks?: SeedHooks): EARS.EntityId => {
        const id = create(record, context, hooks);
        try {
          const restored = restoreMedia(record, id, mediaDir, ctx.log);
          if (restored.count > 0) update(id, restored.record, context, hooks);
          stamp(id, record, seedKey);
        } catch (err) {
          if (hooks?.remove) hooks.remove(id);
          else destroyEntity(id);
          if (mediaDir) fs.rmSync(path.join(getMediaPath(), id), { recursive: true, force: true });
          throw err;
        }
        return id;
      };

      const visit = (items: SeedRecord[], parentId: EARS.EntityId | undefined, parentKey: string) => {
        items.forEach((record, index) => {
          const context: SeedHookContext = { parentId, index, clearedFields: [] };
          const hooks = record.entity ? seedHookRegistry.get(record.entity) : undefined;
          const label = recordLabel(record, identity);
          const seedKey = childSeedKey(parentKey, record, identity);
          try {
            const { match: existing, reused } = find(record, seedKey, context, hooks);
            if (existing) {
              // A container another record seeded stays that record's: it isn't updated, stamped or re-keyed,
              // and its children are seeded in every mode (keep-existing skips only the ones that exist)
              if (reused) {
                counts.skipped++;
                ctx.log(`  ${key} skipped (another seed's container): ${label}`);
                if (record.children) visit(record.children, existing.id, seedKey);
                return;
              }
              if (ctx.mode === 'keep-existing') {
                counts.skipped++;
                ctx.log(`  ${key} skipped (existing): ${label}`);
                return;
              }
              const seeded = ears().getAttr(existing.id, SEEDED_FIELDS) as SeededFields | null;
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
                updateTracked(existing, seeded, record, context, seedKey, hooks);
                counts.updated++;
                ctx.log(`  ${key} updated: ${label}`);
              }
              if (record.children) visit(record.children, existing.id, seedKey);
              return;
            }
            const id = createTracked(record, context, seedKey, hooks);
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

/**
 * Removes every row of the entity types. Types the records nest deeper go first (children before
 * parents); a type the records don't hold goes after the others unless its hooks make it a container,
 * which goes last.
 */
function wipe(entities: string[], records: SeedRecord[]): void {
  const depth = new Map<string, number>();
  const measure = (items: SeedRecord[], level: number) => {
    for (const record of items) {
      if (record.entity) depth.set(record.entity, Math.max(depth.get(record.entity) ?? -1, level));
      if (record.children) measure(record.children, level + 1);
    }
  };
  measure(records, 0);
  const rank = (entity: string) => depth.get(entity) ?? (seedHookRegistry.get(entity)?.container ? -2 : -1);
  const types = [...entities].sort((a, b) => rank(b) - rank(a));
  for (const entity of types) {
    const hooks = seedHookRegistry.get(entity);
    for (const row of ears().findAll<{ id: EARS.EntityId }>(entity as EARS.Entity)) {
      // Removing a parent may already have removed this row
      if (!ears().findByIdRaw(row.id)) continue;
      if (hooks?.remove) hooks.remove(row.id);
      else destroyEntity(row.id);
    }
  }
}

/** `file` lies under `root`, both already resolved: a `..` step or another root puts it outside */
function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== '' && relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative);
}

/**
 * Copies media a record links to into the row's media folder and rewrites the links. A link whose file
 * would resolve outside the compiled media folder, or be written outside the row's, is left as it is:
 * a compiled seeds directory can come from anywhere (Settings → Import pack seeds).
 */
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
        const source = path.resolve(mediaDir, filename);
        const destination = path.join(getMediaPath(), id);
        const target = path.resolve(destination, filename);
        if (!isInside(path.resolve(mediaDir), source) || !isInside(path.resolve(destination), target)) {
          log(`    media skipped (outside the media folder): ${filename}`);
          continue;
        }
        if (!fs.existsSync(source)) continue;
        // A symbolic link in the compiled media can still point elsewhere
        if (!isInside(fs.realpathSync(mediaDir), fs.realpathSync(source))) {
          log(`    media skipped (links outside the media folder): ${filename}`);
          continue;
        }
        fs.mkdirSync(destination, { recursive: true });
        fs.copyFileSync(source, target);
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

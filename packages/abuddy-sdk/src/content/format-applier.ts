import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EARS } from '../types/entities.ts';
import { destroyEntity, findRelations, installedEngine as ears, untypedTx, untypedQx as qx } from '@abuddy/ears';
import { _getMediaPath, loadJSON, selectsAll, type ContentApplier, type ApplyContext, type ApplyResult, type AppliedItem } from '../utils/index.ts';
import { resolve, resolveRemoval, type LiveEntity } from './merge.ts';
import { seedPath } from '../build/manifest.ts';
import { contentPackId } from '../utils/apply.ts';
import { RECORD_KEYS, itemLabel, type CompiledContentFile, type ContentItem } from '../build/content/items.ts';
import { _contentWriterRegistry, type ContentWriteContext, type ContentMatch, type ContentWriter } from './writers.ts';
import { errorMessage } from '../utils/shared.ts';
import type { ContentEditPolicy } from '../build/manifest-schema.ts';

export interface FormatApplierOptions {
  key: string;
  /** The entity types the entry seeds (the format's `entity`): what `wipe-and-replace` removes */
  entities: string[];
  /** Fields matched to find an existing row (`parent` = the tree parent); entity types with a `find` hook ignore it */
  identity?: string[];
  /** The relation from a parent row to each child row */
  relKind?: string;
  /** The entry copies media: `media/<file>` links are rewritten to `media://<id>/<file>` */
  media?: boolean;
  /** The entry's `onUserEdit`; see `ContentSourceSchema`. `theirs` (the default) raises no offer */
  onUserEdit?: ContentEditPolicy;
}

const DEFAULT_REL_KIND = 'contains';
/** Which item a written entity came from, independent of fields a user can change (a renamed entity keeps it) */
export const CONTENT_KEY = 'contentKey' as EARS.AttrKind;
export const CONTENT_HASH = 'contentHash' as EARS.AttrKind;
const MEDIA_LINK_RE = /!\[([^\]]*)\]\((media\/([^)]+))\)/g;

function fieldsOf(record: ContentItem): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !RECORD_KEYS.has(key)));
}

/** The fields the applier tracks for a record: every field it sets but its contentHash */
function trackedFieldNames(record: ContentItem): string[] {
  return Object.keys(fieldsOf(record)).filter((field) => field !== 'contentHash').sort();
}

/** The digest every hash here is taken with: one for a whole item, one per part */
export function hashValues(values: unknown[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 16);
}

/**
 * A hash per field, read from the entity (`AppliedItem.parts`, `@abuddy/sdk/utils`). The path of a field's
 * part is the field's name.
 *
 * **Only the fields the applier wrote**, which is why this takes the list rather than reading the entity's
 * keys: a hash over everything stored would move when the user or another pack adds an attribute, and read
 * as our edit.
 */
function fieldParts(id: EARS.EntityId, fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field, hashValues([ears().getAttr(id, field as EARS.AttrKind) ?? null])]));
}

/**
 * The parts of a recorded item whose value in the database is no longer what we wrote.
 *
 * For an entity the generic applier wrote; a flow's parts are read by `driftedGraphParts`
 * (`flow-applier.ts`), since the shapes are produced by different walks.
 */
export function driftedFieldParts(item: AppliedItem, id: EARS.EntityId): string[] {
  const live = fieldParts(id, Object.keys(item.parts));
  return Object.keys(item.parts).filter((path) => live[path] !== item.parts[path]).sort();
}

/** A record's place in its entry: the entry key, then each ancestor's and its own entity and identity */
export function childContentKey(parentKey: string, record: ContentItem, identity: readonly string[]): string {
  const fields = identity.filter((name) => name !== 'parent');
  const values = fields.length > 0 ? fields.map((name) => record[name] ?? null) : [itemLabel(record, identity)];
  return `${parentKey}/${encodeURIComponent(JSON.stringify([record.entity ?? null, ...values]))}`;
}

/** A seed key names the seeding pack before the entry key */
export const contentKeyPrefix = (packId: string) => `${packId}:`;

/**
 * A content key as something to show someone — `actions / Action "CDX: Start Server"`.
 *
 * The key already holds everything a reader needs: each level after the entry key is the entity type and
 * the identity values that name the item, which is why nothing has to be stored beside it to say what an
 * item *is*. This is the one reader of that format, so `childContentKey` above and this stay together.
 *
 * **Total by construction**, because its callers are diagnostics: a segment it cannot take apart is shown
 * as it is rather than throwing in the middle of a log line.
 */
export function describeContentKey(key: string): string {
  const colon = key.indexOf(':');
  return (colon === -1 ? key : key.slice(colon + 1)).split('/').map((segment, index) => {
    if (index === 0) return segment;
    try {
      // `childContentKey` writes `[entity, ...identity values]`, and an absent value as null
      const [entity, ...values] = JSON.parse(decodeURIComponent(segment)) as unknown[];
      const named = values.map((value) => (typeof value === 'string' ? `"${value}"` : JSON.stringify(value)));
      return [entity, ...named].filter((part) => part !== null).join(' ');
    } catch {
      return segment;
    }
  }).join(' / ');
}

/**
 * The entry a content key belongs to and the label of its top-level item — what asking for that one item
 * back takes (`importCompiledContent`'s `include`, which names an entry key and the labels under it).
 *
 * It reads the same two things `describeContentKey` renders, from the same two writers
 * (`childContentKey`, `contentKeyPrefix`), and is total for the same reason: a key it cannot take apart is
 * one nothing can be selected from, which it says by handing back nothing.
 *
 * **The label is the *top-level* item's**, which is the whole of what a selection can address: a selection
 * filters the compiled file's own records, and a child is written by the walk under whichever parent it
 * belongs to. So restoring a child restores the item it is part of, which is what an item is.
 */
export function contentKeySelection(key: string): { entryKey: string; label: string } | undefined {
  const colon = key.indexOf(':');
  const [entryKey, firstChild] = (colon === -1 ? key : key.slice(colon + 1)).split('/');
  if (!entryKey || !firstChild) return undefined;
  try {
    const [, label] = JSON.parse(decodeURIComponent(firstChild)) as unknown[];
    return typeof label === 'string' ? { entryKey, label } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Records that this run's content declares `key` (`ApplyRecord.defined`, `@abuddy/sdk/utils`).
 *
 * **It is the content that declares a key, never the walk.** A writer calls this over everything its
 * compiled file holds, before it writes anything, because what the removals are computed from is the
 * difference between the keys the last apply wrote and the keys this pack ships — and the walk is full of
 * decisions that stop it short of an item it means to keep.
 */
export const defineKey = (ctx: ApplyContext, key: string): void => { ctx.applied?.defined.add(key); };

/**
 * Records what this run wrote for one item (`ApplyRecord.written`).
 *
 * **Only for an item the run actually wrote.** An item it skipped keeps whatever the last run recorded, and
 * carrying that forward is the caller's — so this is not the counterpart of `defineKey`, which fires for
 * every key the content declares whatever the outcome.
 */
export const recordApplied = (ctx: ApplyContext, key: string, item: AppliedItem): void => { ctx.applied?.written.set(key, item); };

/**
 * Seeds `<key>.seed.json` records: finds each record's existing row, creates, updates or skips it,
 * and walks children under their parent row.
 * - `keep-existing` skips an existing row and its subtree.
 * - Otherwise a row with no stored hash is user-owned and left alone. A row whose stored hash matches
 *   the record's is left alone. A row whose hash differs is updated when its seeded fields still hold
 *   what the applier wrote, and left alone when they don't, or weren't recorded (edited). Children are
 *   still visited.
 * - `wipe-and-replace` first removes every row of the entry's entity types, whoever created it (other
 *   packs' rows and the user's too), even when the file has no records of a type.
 * - A row another record's seed claimed (another pack's, or another entry's of this pack) isn't this
 *   record's, unless the entity's hooks set `container`: then it's reused as the record's parent, counted
 *   as skipped and left as its seed wrote it, in every mode but `wipe-and-replace`.
 */
export function createFormatApplier(options: FormatApplierOptions): ContentApplier {
  const { key, entities, identity = [], relKind = DEFAULT_REL_KIND } = options;

  return {
    key,
    apply(ctx: ApplyContext): ApplyResult {
      const counts: ApplyResult = { created: 0, updated: 0, skipped: 0 };
      const file = loadJSON<CompiledContentFile>(seedPath(ctx.compiledDir, key));
      if (!file) {
        ctx.log(`  ${key} file not found, skipping`);
        return counts;
      }
      const packId = contentPackId(ctx.compiledDir);
      const rootKey = `${contentKeyPrefix(packId)}${key}`;
      const records = selectsAll(ctx.include)
        ? file.records
        : file.records.filter((record) => (ctx.include as ReadonlySet<string>).has(itemLabel(record, identity)));

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
      const find = (record: ContentItem, contentKey: string, context: ContentWriteContext, hooks?: ContentWriter): { match?: ContentMatch; reused?: boolean; deleted?: boolean } => {
        /**
         * **The keyed lookup sees deleted rows, and that is the whole of how a seed knows the user removed
         * one.** `qx` carries no filter; the finders do (`@abuddy/ears`' `query-helpers.ts`, `!isDeleted`),
         * so `findWhere` here hid exactly the row that answers "did the user delete this" — a soft-deleted
         * row keeps the `contentKey` this is searching for. With it hidden, `findByIdentity` missed too (same
         * filter) and the record was created again: a fresh copy beside the one in the trash, every time the
         * pack's compiled seeds changed.
         *
         * **It reaches only as far as the feature's delete does.** A row destroyed rather than trashed leaves
         * nothing carrying a seed key, so the record is created again and nothing here can tell that it ever
         * existed — the entity's own delete is what decides which it is (`trash.move` against `destroy()`).
         */
        const keyed = record.entity
          ? qx(record.entity as EARS.Entity).where(CONTENT_KEY as string, contentKey)
            .pickAll()[0] as { id: EARS.EntityId; contentHash?: string; deleted?: boolean } | undefined
          : undefined;
        if (keyed) return { match: { id: keyed.id, contentHash: keyed.contentHash }, deleted: keyed.deleted === true };
        const match = findByIdentity(record, context, hooks);
        if (!match) return {};
        const owner = ears().getAttr(match.id, CONTENT_KEY) as string | null;
        if (owner === null) return { match };
        // The keyed lookup missed, so the row is another record's: a container holds this record's children too
        if (hooks?.container) return { match, reused: true };
        // A row carrying another record's seed key (or another pack's) isn't this record's, whatever its name
        return {};
      };

      const findByIdentity = (record: ContentItem, context: ContentWriteContext, hooks?: ContentWriter): ContentMatch | undefined => {
        if (hooks?.find) return hooks.find(record, context);
        const fields = identity.filter((name) => name !== 'parent');
        if (fields.length === 0) throw new Error(`Seed "${key}": entity "${record.entity}" has no find hook, so the entry needs "identity"`);
        const [first, ...rest] = fields;
        const candidates = ears().findWhere<Record<string, unknown> & { id: EARS.EntityId }>(record.entity as EARS.Entity, first, record[first])
          .filter((row) => rest.every((name) => row[name] === record[name]));
        const match = identity.includes('parent')
          ? candidates.find((row) => qx(row.id).linksTo(relKind, undefined, false).ids()[0] === context.parentId)
          : candidates[0];
        return match && { id: match.id, contentHash: match.contentHash };
      };

      const create = (record: ContentItem, context: ContentWriteContext, hooks?: ContentWriter): EARS.EntityId => {
        if (hooks?.create) return hooks.create(record, context);
        const row = ears().createEntityWithDefaults(record.entity as EARS.Entity, fieldsOf(record));
        if (context.parentId) untypedTx(context.parentId).link(relKind, row.id);
        return row.id;
      };

      /** Without a hook, fields the record no longer sets are dropped */
      const update = (id: EARS.EntityId, record: ContentItem, context: ContentWriteContext, hooks?: ContentWriter) => {
        if (hooks?.update) hooks.update(id, record, context);
        else ears().updateEntity(id, { ...fieldsOf(record), ...Object.fromEntries(context.clearedFields.map((field) => [field, null])) });
      };

      /** Hooks' repository commands may not store contentHash; the merge needs it, the parts and the key */
      const stamp = (id: EARS.EntityId, record: ContentItem, contentKey: string) => {
        if (record.contentHash && ears().getAttr(id, CONTENT_HASH) !== record.contentHash) untypedTx(id).update(CONTENT_HASH, record.contentHash);
        untypedTx(id).update(CONTENT_KEY, contentKey);
        // The one place the entity, the record and the fields just written are all in hand, so the one place
        // a per-part record of them can be taken
        recordApplied(ctx, contentKey, {
          entityType: record.entity,
          contentHash: record.contentHash,
          parts: fieldParts(id, trackedFieldNames(record)),
        });
      };

      /**
       * Updates an entity to the record, resetting the fields the last apply set that the record no longer
       * sets. EARS writes can't be rolled back, so when the update throws part way, the entity keeps its
       * previous `contentHash` and its entry is re-taken over the fields that entry named: it isn't read as
       * the user's edit, the next apply updates it again, and a field the record newly sets isn't recorded
       * as ours while it holds a user's value.
       *
       * **An item with no entry is one we are adopting**, so there is no previous field list: nothing is
       * cleared, and a failed update records nothing rather than recording an empty item — leaving it
       * unrecorded is what makes the next apply adopt it again rather than read it as a deletion.
       */
      const updateTracked = (existing: ContentMatch, applied: AppliedItem | undefined, record: ContentItem, context: ContentWriteContext, contentKey: string, hooks?: ContentWriter) => {
        const recordFields = new Set(trackedFieldNames(record));
        const wrote = Object.keys(applied?.parts ?? {});
        const clearedFields = wrote.filter((field) => !recordFields.has(field));
        try {
          update(existing.id, restoreMedia(record, existing.id, mediaDir, ctx.log).record, { ...context, clearedFields }, hooks);
        } catch (err) {
          untypedTx(existing.id).update(CONTENT_HASH, existing.contentHash);
          if (applied) {
            recordApplied(ctx, contentKey, {
              entityType: record.entity,
              ...(typeof existing.contentHash === 'string' && { contentHash: existing.contentHash }),
              parts: fieldParts(existing.id, wrote),
            });
          }
          throw err;
        }
        stamp(existing.id, record, contentKey);
      };

      /**
       * Creates an entity for the record and stamps it. One left unstamped would be read as the user's
       * forever, so when copying its media or stamping it throws, the entity is removed and the next apply
       * creates it again.
       */
      const createTracked = (record: ContentItem, context: ContentWriteContext, contentKey: string, hooks?: ContentWriter): EARS.EntityId => {
        const id = create(record, context, hooks);
        try {
          const restored = restoreMedia(record, id, mediaDir, ctx.log);
          if (restored.count > 0) update(id, restored.record, context, hooks);
          stamp(id, record, contentKey);
        } catch (err) {
          if (hooks?.remove) hooks.remove(id);
          else destroyEntity(id);
          if (mediaDir) fs.rmSync(path.join(_getMediaPath(), id), { recursive: true, force: true });
          /**
           * The entity is gone, so the record must not name it: an entry with no entity is what a later apply
           * reads as the user having deleted it.
           *
           * **Nothing reaches this with an entry recorded today**, because `stamp` is the last statement in
           * the `try` above — media restore and the update before it both throw before anything is recorded,
           * where this is a no-op. The edit that makes it fire is a statement added after `stamp`, or a
           * `remove` hook that throws; mutate it by moving `stamp` one line earlier.
           */
          ctx.applied?.written.delete(contentKey);
          throw err;
        }
        return id;
      };

      const remove = (id: EARS.EntityId, hooks?: ContentWriter) => {
        if (hooks?.remove) hooks.remove(id);
        else destroyEntity(id);
      };

      /**
       * **Every key this entry's content declares, derived from the content and not from the walk.**
       *
       * It has to be the content: the walk reaches an item and then decides, and several of those decisions
       * stop it — the mode says to keep what is there, the user deleted the item, an entry failed to
       * validate, a hook threw. A key the walk never reached is still a key the pack ships, and reading
       * "not reached" as "no longer shipped" is how the removal pass below would delete the very subtree
       * each of those branches exists to protect.
       *
       * So this runs once, over every item in the file, before anything is written. A selection is not
       * excluded either: what a run was asked to write is a different question from what the pack declares.
       */
      const declare = (items: ContentItem[] | undefined, parentKey: string) => {
        for (const record of items ?? []) {
          const contentKey = childContentKey(parentKey, record, identity);
          defineKey(ctx, contentKey);
          declare(record.children, contentKey);
        }
      };

      const visit = (items: ContentItem[], parentId: EARS.EntityId | undefined, parentKey: string) => {
        items.forEach((record, index) => {
          const context: ContentWriteContext = { parentId, index, clearedFields: [] };
          const hooks = record.entity ? _contentWriterRegistry.get(record.entity) : undefined;
          const label = itemLabel(record, identity);
          const contentKey = childContentKey(parentKey, record, identity);
          try {
            const { match: existing, reused, deleted } = find(record, contentKey, context, hooks);
            const applied = ctx.applied?.before.get(contentKey);
            const live: LiveEntity | undefined = existing && {
              contentHash: existing.contentHash,
              ...(deleted === true && { trashed: true }),
              ...(reused === true && { foreignContainer: true }),
            };
            const { resolution, parts, offer } = resolve({
              applied,
              ...(record.contentHash !== undefined && { incoming: record.contentHash }),
              ...(live !== undefined && { live }),
              ...(ctx.mode !== undefined && { mode: ctx.mode }),
              ...(options.onUserEdit !== undefined && { onUserEdit: options.onUserEdit }),
              ...(ctx.force === true && { force: true }),
              drifted: () => (applied && existing ? driftedFieldParts(applied, existing.id) : []),
            });

            if (resolution === 'create') {
              const id = createTracked(record, context, contentKey, hooks);
              counts.created++;
              ctx.log(`  ${key} created: ${label}`);
              if (record.children) visit(record.children, id, contentKey);
              return;
            }

            /**
             * **The user removed it, which settles every other question.** An entity carrying this item's key
             * and marked deleted is one we created and the user threw away, and a key the last apply wrote
             * with no entity behind it now is one they destroyed outright. Recreating either is the one
             * outcome nobody wants.
             *
             * **Its children are not visited either way**, since they would be created under a parent that is
             * deleted or gone. `wipe-and-replace` never reaches here: `wipe` removed the entities first, the
             * deleted ones with them, which is what that mode means.
             */
            if (resolution === 'absent-by-deletion') {
              counts.skipped++;
              ctx.log(`  ${key} skipped (${existing ? 'deleted' : 'removed'}): ${label}`);
              return;
            }
            // The mode says to leave whatever is there alone, which includes its subtree
            if (resolution === 'kept') {
              counts.skipped++;
              ctx.log(`  ${key} skipped (existing): ${label}`);
              return;
            }

            if (resolution === 'fast-forward') {
              updateTracked(existing!, applied, record, context, contentKey, hooks);
              counts.updated++;
              ctx.log(`  ${key} updated: ${label}`);
            } else {
              counts.skipped++;
              if (resolution === 'conflict') {
                if (offer) {
                  ctx.applied?.offers.set(contentKey, {
                    kind: 'update', parts: parts ?? [],
                    ...(record.contentHash !== undefined && { contentHash: record.contentHash }),
                  });
                }
                ctx.log(`  ${key} skipped (edited: ${(parts ?? []).join(', ')}): ${label}`);
              } else if (resolution === 'user-owned') {
                ctx.log(`  ${key} skipped (untracked): ${label}`);
              } else if (resolution === 'foreign-container') {
                // A container another item wrote stays that item's: it isn't updated, stamped or re-keyed,
                // and its children are written under it in every mode
                ctx.log(`  ${key} skipped (another item's container): ${label}`);
              } else {
                ctx.log(`  ${key} skipped: ${label}`);
              }
            }
            if (record.children) visit(record.children, existing!.id, contentKey);
          } catch (err) {
            const message = errorMessage(err);
            errors.push(`${record.entity ?? key} "${label}": ${message}`);
            counts.skipped++;
          }
        });
      };

      /** The entity one of this entry's keys names, found as a later apply finds one */
      const entityOf = (item: AppliedItem, itemKey: string) => item.entityType
        ? qx(item.entityType as EARS.Entity).where(CONTENT_KEY as string, itemKey)
          .pickAll()[0] as { id: EARS.EntityId; contentHash?: string; deleted?: boolean } | undefined
        : undefined;

      /**
       * A container holding entities this entry did not write — another pack's documents filed under a shared
       * folder, or the user's. Removing the folder would take their content with it, and it is not ours to
       * remove.
       */
      const holdsOthers = (id: EARS.EntityId, prefix: string): boolean =>
        findRelations({ sourceEntity: id }).some((relation) => {
          const childKey = ears().getAttr(relation.targetEntity as EARS.EntityId, CONTENT_KEY) as string | null;
          return childKey === null || !childKey.startsWith(prefix);
        });

      /**
       * The items this entry wrote that its content no longer declares: removed while they are still ours,
       * kept and flagged once the user has edited one.
       *
       * **A content key whose file did not load contributes none**, which is structural rather than checked:
       * `apply` returns above before reaching this, so a key that said nothing is never diffed against. And
       * an import carries no record at all, so asking for a pack's data back never removes anything —
       * which is the whole of what makes removal an apply's act.
       */
      const removals = () => {
        const record = ctx.applied;
        if (!record) return;
        const prefix = `${rootKey}/`;
        // A parent's key is a prefix of its children's, so sorted is parents first
        const gone = [...record.before.keys()].filter((k) => k.startsWith(prefix) && !record.defined.has(k)).sort();
        const verdicts = gone.map((itemKey) => {
          const item = record.before.get(itemKey)!;
          const entity = entityOf(item, itemKey);
          const hooks = item.entityType ? _contentWriterRegistry.get(item.entityType) : undefined;
          const live: LiveEntity | undefined = entity && entity.deleted !== true
            ? {
              contentHash: entity.contentHash,
              ...(hooks?.container === true && holdsOthers(entity.id, prefix) && { foreignContainer: true }),
            }
            : undefined;
          return {
            itemKey,
            item,
            hooks,
            ...resolveRemoval({
              applied: item,
              ...(live !== undefined && { live }),
              ...(options.onUserEdit !== undefined && { onUserEdit: options.onUserEdit }),
              drifted: () => (entity ? driftedFieldParts(item, entity.id) : []),
            }),
          };
        });
        /**
         * Removal follows the parent chain, so keeping a child keeps the entities above it.
         *
         * Looking only within `gone` is complete: `declare` walks the content's tree, so a declared child
         * implies a declared parent, and a key in `gone` therefore has no declared descendants.
         */
        const keptUnder = (itemKey: string) => verdicts.some((v) => v.resolution !== 'remove' && v.itemKey.startsWith(`${itemKey}/`));
        for (const verdict of verdicts) {
          if (verdict.resolution === 'removed-but-edited') {
            if (verdict.offer) record.offers.set(verdict.itemKey, { kind: 'removed', parts: verdict.parts ?? [] });
            ctx.log(`  ${key} kept (dropped from the content, and edited): ${verdict.itemKey}`);
            continue;
          }
          if (verdict.resolution === 'foreign-container') {
            ctx.log(`  ${key} kept (dropped from the content, and holds another item's): ${verdict.itemKey}`);
            continue;
          }
          if (keptUnder(verdict.itemKey)) {
            ctx.log(`  ${key} kept (dropped from the content, and holds an item the user edited): ${verdict.itemKey}`);
            continue;
          }
          try {
            // Resolved again: removing a parent may already have removed this one
            const entity = entityOf(verdict.item, verdict.itemKey);
            // An entity the user has already thrown away is theirs to restore, so only the entry goes:
            // destroying the trashed copy would take the undo with it
            if (entity && entity.deleted !== true) remove(entity.id, verdict.hooks);
            record.removed.add(verdict.itemKey);
            ctx.log(`  ${key} removed (dropped from the content): ${verdict.itemKey}`);
          } catch (err) {
            errors.push(`${verdict.item.entityType ?? key} "${verdict.itemKey}": ${errorMessage(err)}`);
          }
        }
      };

      declare(file.records, rootKey);
      visit(records, undefined, rootKey);
      removals();
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
function wipe(entities: string[], records: ContentItem[]): void {
  const depth = new Map<string, number>();
  const measure = (items: ContentItem[], level: number) => {
    for (const record of items) {
      if (record.entity) depth.set(record.entity, Math.max(depth.get(record.entity) ?? -1, level));
      if (record.children) measure(record.children, level + 1);
    }
  };
  measure(records, 0);
  const rank = (entity: string) => depth.get(entity) ?? (_contentWriterRegistry.get(entity)?.container ? -2 : -1);
  const types = [...entities].sort((a, b) => rank(b) - rank(a));
  for (const entity of types) {
    const hooks = _contentWriterRegistry.get(entity);
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
  record: ContentItem,
  id: EARS.EntityId,
  mediaDir: string | undefined,
  log: (...args: unknown[]) => void,
): { record: ContentItem; count: number } {
  if (!mediaDir) return { record, count: 0 };
  let count = 0;
  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') {
      let text = value;
      for (const match of value.matchAll(MEDIA_LINK_RE)) {
        const filename = match[3];
        const source = path.resolve(mediaDir, filename);
        const destination = path.join(_getMediaPath(), id);
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
  ) as ContentItem;
  return { record: rewritten, count };
}

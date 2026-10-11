// What a pack's content last wrote to the user's data: one entity per pack, beside the app's own state and
// the settings row. Only host code reads and writes it; packs never see it.
//
// It lives in the database rather than in a file beside installed-packs.json because it describes user data,
// so a backup has to carry it: restore a backup without it and every entity reads as either the user's own or
// as one they deleted, which is how a merge would destroy exactly the data the restore was for. The primary
// partition is what `exportDatabase` copies, and a new entity type lands there by default.
import { untypedTx, untypedQx } from '@apack/ears';
import type { EARS } from '@apack/sdk';
import type { AppliedItem, ContentOffer } from '@apack/sdk/utils';

/** The entity type the host declares for a pack's applied content */
export const APPLIED_CONTENT_ENTITY = 'AppliedContent';

/**
 * One entity per pack. A pack id may hold a dash (`default-setup`), which is safe: an entity's type is the
 * text before its *first* dash, so the type still reads as `AppliedContent`.
 */
const idOf = (packId: string) => `${APPLIED_CONTENT_ENTITY}-${packId}` as EARS.EntityId;

export interface AppliedContent {
  /**
   * The compiled content this was applied from (`contentRevision`'s output). It is the apply's skip gate:
   * equal to what the pack's directory holds now, and with nothing outstanding from a failed run, there is
   * nothing an apply could do differently.
   */
  revision: string;
  /** One entry per item we have written, by content key */
  items: Record<string, AppliedItem>;
}

const FIELDS = ['revision', 'items'] as const satisfies readonly (keyof AppliedContent)[];

/**
 * As in `AppState`: a field the interface has and this list lacks is written and then always reads as its
 * default, with no type error. This makes the omission a build failure naming the field.
 */
type UnreadField = Exclude<keyof AppliedContent, (typeof FIELDS)[number]>;
const _everyFieldIsRead: [UnreadField] extends [never] ? true : UnreadField = true;
void _everyFieldIsRead;

function stored(packId: string): Partial<AppliedContent> | undefined {
  return untypedQx(idOf(packId)).pickOne([...FIELDS]) as Partial<AppliedContent> | undefined ?? undefined;
}

/**
 * What resolving one item's offer does to its entry, and the three are the whole of it.
 *
 * `taken` and `deleted` are what the write left behind: the apply (or the delete) has already changed the
 * database, so the entry's offer is simply gone — a taken item is re-stamped by the write itself and a
 * deleted one has nothing left to describe. `dismissed` is the one that stores something: the hash the user
 * declined, which is what keeps a later release from offering the same version again.
 */
export type OfferResolution =
  /** The user took the pack's version; the write re-stamped the entry, so only the offer has to go */
  | { choice: 'taken' }
  /** The user kept theirs, against the version they were shown */
  | { choice: 'dismissed'; contentHash?: string }
  /** The user deleted an item the pack had dropped: the entry describes nothing now */
  | { choice: 'deleted' };

export const appliedContent = {
  /** A pack's applied content; nothing recorded reads as no revision and no items */
  get: (packId: string): AppliedContent => {
    const row = stored(packId) ?? {};
    return { revision: row.revision ?? '', items: row.items ?? {} };
  },

  /**
   * Moves a pack's applied content forward: the entry of every item this apply **wrote** replaces what was
   * there, and every other entry is **kept as it was** — the entity still holds what we wrote before, so that
   * is what its entry still describes.
   *
   * **Nothing is dropped unless `dropped` names it.** An entry whose key the pack's content no longer
   * declares is how a later apply knows the pack removed that item; dropping it on its own would make a
   * removal indistinguishable from content that was never shipped. What `dropped` carries is the items an
   * apply *finished* removing — the entity is gone and the content no longer declares it, so there is
   * nothing left for the entry to describe, and keeping it would have every later apply recompute the same
   * removal.
   */
  record: (packId: string, next: {
    /** Absent leaves the revision where it is, which an import does: it is not what the pack now declares */
    revision?: string;
    wrote: ReadonlyMap<string, AppliedItem>;
    dropped?: Iterable<string>;
    /** The decisions this run left the user (`ApplyRecord.offers`), by content key */
    offers?: ReadonlyMap<string, ContentOffer>;
    /**
     * Every key the run's content declared (`ApplyRecord.defined`): the keys whose offer this run **answers
     * for**, so one it did not raise again is cleared.
     *
     * Without it an offer would outlive the drift it describes — the user edits an action, takes the new
     * version, and the entry still says they have a decision to take. A key the run never reached (an entry
     * whose compiled file would not load) is in neither list and keeps whatever it held, which is the same
     * rule the removals follow.
     */
    reached?: Iterable<string>;
  }): void => {
    const items = { ...appliedContent.get(packId).items, ...Object.fromEntries(next.wrote) };
    for (const key of next.reached ?? []) {
      const item = items[key];
      if (item?.offer) items[key] = { ...item, offer: undefined };
    }
    for (const [key, offer] of next.offers ?? []) {
      const item = items[key];
      if (item) items[key] = { ...item, offer };
    }
    for (const key of next.dropped ?? []) delete items[key];
    const write = stored(packId) === undefined
      ? untypedTx(idOf(packId), true).put('entityType', APPLIED_CONTENT_ENTITY)
      : untypedTx(idOf(packId));
    if (next.revision !== undefined) write.update('revision', next.revision);
    write.update('items', items);
  },

  /**
   * Records what the user decided about one item's offer.
   *
   * It writes no entity: taking a version and deleting an item are both done by whoever called this, and
   * what is left is the record of the decision. An unknown key is a no-op — the pack may have been applied
   * again between the view drawing the offer and the user clicking it.
   */
  resolveOffer: (packId: string, key: string, resolution: OfferResolution): void => {
    const current = appliedContent.get(packId);
    const item = current.items[key];
    if (!item) return;
    const items = { ...current.items };
    if (resolution.choice === 'deleted') delete items[key];
    else if (resolution.choice === 'taken') items[key] = { ...item, offer: undefined };
    else items[key] = { ...item, offer: undefined, ...(resolution.contentHash !== undefined && { dismissed: resolution.contentHash }) };
    untypedTx(idOf(packId)).update('items', items);
  },
};

// What a pack's content last wrote to the user's data: one entity per pack, beside the app's own state and
// the settings row. Only host code reads and writes it; packs never see it.
//
// It lives in the database rather than in a file beside installed-packs.json because it describes user data,
// so a backup has to carry it: restore a backup without it and every entity reads as either the user's own or
// as one they deleted, which is how a merge would destroy exactly the data the restore was for. The primary
// partition is what `exportDatabase` copies, and a new entity type lands there by default.
import { untypedTx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import type { AppliedItem } from '@abuddy/sdk/utils';

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
  }): void => {
    const items = { ...appliedContent.get(packId).items, ...Object.fromEntries(next.wrote) };
    for (const key of next.dropped ?? []) delete items[key];
    const write = stored(packId) === undefined
      ? untypedTx(idOf(packId), true).put('entityType', APPLIED_CONTENT_ENTITY)
      : untypedTx(idOf(packId));
    if (next.revision !== undefined) write.update('revision', next.revision);
    write.update('items', items);
  },
};

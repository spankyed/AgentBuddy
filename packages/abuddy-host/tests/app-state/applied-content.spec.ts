// What a pack's applied content does with the decisions an apply leaves the user: it records them, clears the
// ones a later apply answered for, and keeps what the user decided. The apply that produces them is covered in
// `packs/runtime/loader.spec.ts`; this is the record's own half.
import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestData, startTestRuntime } from '@abuddy/sdk/testing';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { appliedContent } from '../../src/app-state/applied-content.ts';
import type { AppliedItem, ContentOffer } from '@abuddy/sdk/utils';

startTestRuntime({ entityTypes: HOST_ENTITY_TYPES });

const PACK = 'memo-pack';
const KEY = 'memo-pack:actions/echo';
const item = (over: Partial<AppliedItem> = {}): AppliedItem => ({ entityType: 'Action', contentHash: 'v1', parts: { actionFn: 'aaaa' }, ...over });
const offer: ContentOffer = { kind: 'update', parts: ['actionFn'], contentHash: 'v2' };
const stored = (key = KEY) => appliedContent.get(PACK).items[key];

beforeEach(() => resetTestData());

describe('the decisions a pack’s applied content holds', () => {
  it('records an offer against the item it is about', () => {
    appliedContent.record(PACK, { revision: 'r1', wrote: new Map([[KEY, item()]]) });
    appliedContent.record(PACK, { revision: 'r2', wrote: new Map(), offers: new Map([[KEY, offer]]), reached: [KEY] });

    expect(stored()).toMatchObject({ contentHash: 'v1', offer });
  });

  /**
   * **An offer the next apply did not raise again is cleared.** Without that it would outlive the drift it
   * describes: the user edits an item, takes the new version, and the entry still says they have something
   * to decide. `reached` is what makes that distinguishable from a key the run never got to.
   */
  it('clears an offer the next apply answered for, and keeps one it never reached', () => {
    const other = 'memo-pack:notes/welcome';
    appliedContent.record(PACK, { wrote: new Map([[KEY, item()], [other, item({ entityType: 'Note' })]]) });
    appliedContent.record(PACK, { wrote: new Map(), offers: new Map([[KEY, offer], [other, offer]]), reached: [KEY, other] });

    appliedContent.record(PACK, { wrote: new Map(), reached: [KEY] });

    expect(stored()?.offer, 'the apply reached it and raised nothing').toBeUndefined();
    expect(stored(other)?.offer, 'an entry whose key the run never declared keeps what it held').toEqual(offer);
  });

  /**
   * **"Keep mine" stores the hash they were shown**, which is what keeps a release that leaves this item
   * alone silent and lets a release that changes it ask again (the merge's half is in
   * `abuddy-sdk/tests/content/merge.spec.ts`).
   */
  it('records what the user decided, and drops the entry of one they deleted', () => {
    appliedContent.record(PACK, { wrote: new Map([[KEY, item()]]), offers: new Map([[KEY, offer]]), reached: [KEY] });

    appliedContent.resolveOffer(PACK, KEY, { choice: 'dismissed', contentHash: 'v2' });
    expect(stored()).toMatchObject({ dismissed: 'v2' });
    expect(stored()?.offer, 'and the decision is taken').toBeUndefined();

    appliedContent.resolveOffer(PACK, KEY, { choice: 'deleted' });
    expect(stored(), 'nothing is left for the entry to describe').toBeUndefined();
  });

  /** A pack applied again between the view drawing an offer and the user clicking it has no entry to write */
  it('does nothing for a key the record no longer holds', () => {
    expect(() => appliedContent.resolveOffer(PACK, KEY, { choice: 'taken' })).not.toThrow();
    expect(appliedContent.get(PACK).items).toEqual({});
  });
});

// The applied content against the two fingerprints it is meant to replace, over this pack's real compiled
// content. Phase 1 of docs/plans/pack-content-apply.md writes that record and reads nothing from it, so this
// is the whole of what says the model is right before anything depends on it.
//
// The subject is derived from the compiled index rather than listed here: a spec that reports nothing may have
// looked at nothing, and the index is what declares what there is to look at.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { driftedFieldParts, driftedGraphParts } from '@abuddy/sdk/seed';
import { importCompiledSeeds, type AppliedItem, type AppliedReport } from '@abuddy/sdk/utils';
import { SEED_INDEX_FILE } from '@abuddy/sdk/build';
import { untypedQx as qx, untypedTx as tx, type EARS } from '@abuddy/ears';
import { PACK_DIR, keyRecordAfter } from './harness.ts';

/** This pack's compiled seeds, as its build wrote them */
const BUILT = path.join(PACK_DIR, 'dist', 'runtime', 'seeds');

interface IndexEntry { key: string; seeded?: boolean; count?: number }
const index = (): { seeds: IndexEntry[] } => JSON.parse(fs.readFileSync(path.join(BUILT, SEED_INDEX_FILE), 'utf-8'));

/** The keys the build says it seeds, and how many items each holds — the declaration this spec derives from */
const seededEntries = () => index().seeds.filter((entry) => entry.seeded);

const dirs: string[] = [];
/** The copies, made once: a spec file's tests share them, and only the database is per test */
const made = new Map<string, string>();

/**
 * The built artifacts in a scratch directory, optionally with one entry's `sourceHash`es bumped so a re-apply
 * has something to do. Copied rather than compiled: `compilePack` would run esbuild once per action and once
 * per prompt for content the build has already produced.
 */
function compiledDir({ bump = false } = {}): string {
  const memo = made.get(String(bump));
  if (memo) return memo;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'applied-content-'));
  made.set(String(bump), dir);
  dirs.push(dir);
  for (const file of fs.readdirSync(BUILT)) {
    const body = fs.readFileSync(path.join(BUILT, file), 'utf-8');
    fs.writeFileSync(path.join(dir, file), bump && file !== SEED_INDEX_FILE ? bumpHashes(body) : body);
  }
  return dir;
}

/** Every `sourceHash` in a compiled artifact, at any depth, made different without changing anything else */
function bumpHashes(body: string): string {
  return JSON.stringify(JSON.parse(body), (key, value) =>
    key === 'sourceHash' && typeof value === 'string' ? `${value}-bumped` : value);
}

function apply(dir: string, before: ReadonlySet<string> = new Set()) {
  const keyRecord = keyRecordAfter(before);
  const applied: AppliedReport = { written: new Map() };
  const counts = importCompiledSeeds({ compiledDir: dir, mode: 'replace-on-collision', keyRecord, applied });
  return { keyRecord, applied, counts };
}

/** The entity one content key names, found the way a later apply would find it */
function entityFor(key: string, item: AppliedItem): EARS.EntityId | undefined {
  const rows = qx(item.entityType as EARS.Entity).where('seedKey' as string, key).pickAll() as Array<{ id: EARS.EntityId }>;
  return rows[0]?.id;
}

const attr = <T,>(id: EARS.EntityId, name: string): T | null =>
  (qx([id]).pickAll()[0] as Record<string, unknown> | undefined)?.[name] as T | null ?? null;

const isFlow = (item: AppliedItem) => item.entityType === 'Flow';
const drifted = (item: AppliedItem, id: EARS.EntityId) =>
  isFlow(item) ? driftedGraphParts(item, id) : driftedFieldParts(item, id);

let first: ReturnType<typeof apply>;

/**
 * **Applied per test, not once for the file**: `setupPackTests` empties the database in its own `beforeEach`,
 * so anything seeded in a `beforeAll` is gone before the first case runs.
 */
beforeEach(() => {
  expect(fs.existsSync(BUILT), 'the built seeds are missing: run npm run compile').toBe(true);
  first = apply(compiledDir());
});

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the applied content over this pack’s real content', () => {
  it('records an item for everything the build says it seeds', () => {
    const entries = seededEntries();
    const declared = entries.reduce((total, entry) => total + (entry.count ?? 0), 0);

    expect(entries.map((entry) => entry.key).sort(), 'the pack stopped seeding a key this spec covers')
      .toEqual(['actions', 'flows', 'library', 'notes', 'prompts']);
    expect(declared, 'the index declares nothing, so every case here would pass over nothing').toBeGreaterThan(50);
    expect(first.applied.written.size, 'an entry per declared item').toBe(declared);
    expect([...first.applied.written].filter(([, item]) => Object.keys(item.parts).length === 0), 'an entry with no parts')
      .toEqual([]);
  });

  /**
   * **On a first apply the two records are the same set**, built by different code in the same run: the keys
   * the content defined (`keyRecord`, which `packSeedKeys` holds) and the items it wrote. They diverge once
   * anything is skipped, which the re-apply case below shows.
   */
  it('wrote an item for every key the content defined', () => {
    expect(new Set(first.applied.written.keys())).toEqual(first.keyRecord.defined);
  });

  /**
   * **The parts cover the fields the entity's own digest covers.** Two walks — the parts off the entity per
   * field, `seededFields.fields` off the compiled record — so their agreeing is a claim, not a restatement.
   * Reported as one object so a failure names every item rather than the first.
   */
  it('covers the same fields seededFields does, for every item that has one', () => {
    const disagree: Record<string, { parts: string[]; seededFields: string[] }> = {};
    let compared = 0;
    for (const [key, item] of first.applied.written) {
      if (isFlow(item)) continue;
      const id = entityFor(key, item);
      const seeded = id && attr<{ fields: string[] }>(id, 'seededFields');
      if (!id || !seeded) continue;
      compared++;
      const parts = Object.keys(item.parts).sort();
      if (JSON.stringify(parts) !== JSON.stringify([...seeded.fields].sort())) {
        disagree[key] = { parts, seededFields: seeded.fields };
      }
    }
    expect(compared, 'no item had a seededFields to compare against').toBeGreaterThan(50);
    expect(disagree, "the parts cover fields seededFields doesn't, or miss ones it has").toEqual({});
  });

  /** And for a flow, against the three lists `seededGraph` keeps */
  it("covers the same nodes seededGraph does, for every flow", () => {
    const flows = [...first.applied.written].filter(([, item]) => isFlow(item));
    expect(flows.length, 'no flow was recorded').toBeGreaterThan(0);

    for (const [key, item] of flows) {
      const id = entityFor(key, item)!;
      const graph = attr<{ nodeFields: Record<string, string[]>; relKinds: string[] }>(id, 'seededGraph')!;
      const nodes = Object.keys(item.parts).filter((part) => part.startsWith('node:')).sort();
      expect(nodes, `${key}'s node parts`).toEqual(Object.keys(graph.nodeFields).map((node) => `node:${node}`).sort());
      expect(item.parts.edges, `${key} records its wiring`).toBeDefined();
      expect(graph.relKinds.length, `${key} wrote relations for its edges part to cover`).toBeGreaterThan(0);
    }
  });

  /** Nothing reads as the user's the moment it was written, or every case above would pass over noise */
  it('agrees with the database it just wrote', () => {
    const stale: Record<string, string[]> = {};
    const missing: string[] = [];
    let compared = 0;
    for (const [key, item] of first.applied.written) {
      const id = entityFor(key, item);
      if (!id) { missing.push(key); continue; }
      compared++;
      const parts = drifted(item, id);
      if (parts.length > 0) stale[key] = parts;
    }
    expect(missing, 'an entry names an entity nothing can find by its content key').toEqual([]);
    expect(compared, 'nothing was compared, so this case proves nothing').toBe(first.applied.written.size);
    expect(stale, 'an item drifted from the database the same run wrote').toEqual({});
  });

  /**
   * **The one thing the parts do that the digest cannot: say which piece moved.** `seededFields` can only
   * report that something in the item changed, which is what freezes a whole flow over one edited field.
   */
  it('names the one field the user changed, where seededFields only says something moved', () => {
    const [key, item] = [...first.applied.written].find(([, candidate]) => !isFlow(candidate)
      && Object.keys(candidate.parts).length > 2)!;
    const id = entityFor(key, item)!;
    const field = Object.keys(item.parts).find((part) => typeof attr(id, part) === 'string')!;
    const digestBefore = attr<{ hash: string }>(id, 'seededFields')!.hash;

    tx(id).update(field, 'what the user typed instead');

    expect(drifted(item, id), 'exactly the edited field').toEqual([field]);
    expect(attr<{ hash: string }>(id, 'seededFields')!.hash, 'the digest is stored, so it has not moved')
      .toBe(digestBefore);
  });

  /**
   * **A re-apply writes only what it changed**, so the two records stop being the same set — which is why the
   * entries of the items it skipped are the caller's to carry forward.
   */
  it('writes only the items a re-apply touched, and defines every key regardless', () => {
    const again = apply(compiledDir(), first.keyRecord.defined);

    expect(again.keyRecord.defined, 'every key is defined again').toEqual(first.keyRecord.defined);
    expect(again.applied.written.size, 'an unchanged apply wrote nothing').toBe(0);
  });
});

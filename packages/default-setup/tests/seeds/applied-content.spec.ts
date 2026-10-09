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
import { importCompiledSeeds, type AppliedItem } from '@abuddy/sdk/utils';
import { SEED_INDEX_FILE } from '@abuddy/sdk/build';
import { untypedQx as qx, type EARS } from '@abuddy/ears';
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

interface Variant {
  /** Every `sourceHash` made different, so a re-apply has something to write */
  bump?: boolean;
  /** One field of the first action, given a new value */
  change?: [field: string, value: string];
}

/**
 * The built artifacts in a scratch directory, in a given variant. Copied rather than compiled: `compilePack`
 * would run esbuild once per action and once per prompt for content the build has already produced.
 */
function compiledDir(variant: Variant = {}): string {
  const memo = made.get(JSON.stringify(variant));
  if (memo) return memo;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'applied-content-'));
  made.set(JSON.stringify(variant), dir);
  dirs.push(dir);
  for (const file of fs.readdirSync(BUILT)) {
    const body = fs.readFileSync(path.join(BUILT, file), 'utf-8');
    fs.writeFileSync(path.join(dir, file), file === SEED_INDEX_FILE ? body : vary(file, body, variant));
  }
  return dir;
}

function vary(file: string, body: string, { bump, change }: Variant): string {
  const parsed = JSON.parse(body) as { records?: Array<Record<string, unknown>> };
  if (change && file === 'actions.seed.json' && parsed.records?.[0]) parsed.records[0][change[0]] = change[1];
  return JSON.stringify(parsed, (key, value) =>
    bump && key === 'sourceHash' && typeof value === 'string' ? `${value}-bumped` : value);
}

function apply(dir: string, before: ReadonlySet<string> = new Set()) {
  const keyRecord = keyRecordAfter(before);
  const applied = new Map<string, AppliedItem>();
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

/** The parts whose hash differs between two runs' records of the same item */
function moved(before: Map<string, AppliedItem>, after: Map<string, AppliedItem>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, item] of after) {
    const was = before.get(key);
    if (!was) continue;
    const parts = [...new Set([...Object.keys(item.parts), ...Object.keys(was.parts)])]
      .filter((path) => item.parts[path] !== was.parts[path]).sort();
    if (parts.length > 0) out[key] = parts;
  }
  return out;
}

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
    expect(first.applied.size, 'an entry per declared item').toBe(declared);
    expect([...first.applied].filter(([, item]) => Object.keys(item.parts).length === 0), 'an entry with no parts')
      .toEqual([]);
  });

  /**
   * **On a first apply the two records are the same set**, built by different code in the same run: the keys
   * the content defined (`keyRecord`, which `packSeedKeys` holds) and the items it wrote. They diverge once
   * anything is skipped, which the re-apply case below shows.
   */
  it('wrote an item for every key the content defined', () => {
    expect(new Set(first.applied.keys())).toEqual(first.keyRecord.defined);
  });

  /**
   * **The parts cover the fields the entity's own digest covers.** Two walks — the parts off the entity per
   * field, `seededFields.fields` off the compiled record — so their agreeing is a claim, not a restatement.
   * Reported as one object so a failure names every item rather than the first.
   */
  it('covers the same fields seededFields does, for every item that has one', () => {
    const disagree: Record<string, { parts: string[]; seededFields: string[] }> = {};
    let compared = 0;
    for (const [key, item] of first.applied) {
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
    const flows = [...first.applied].filter(([, item]) => isFlow(item));
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

  /**
   * **The same content applied twice records the same parts.** Only `sourceHash` differs between the two
   * runs, so every item is written again over values that did not change — and a derivation that read the
   * wrong thing, or read it unstably, would show up here as a part that moved.
   */
  it('records the same parts for the same content, applied twice', () => {
    const again = apply(compiledDir({ bump: true }), first.keyRecord.defined);

    expect(again.applied.size, 'the bumped hashes did not cause a rewrite').toBe(first.applied.size);
    expect(moved(first.applied, again.applied), 'a part moved for content that did not').toEqual({});
  });

  /**
   * **And exactly one part moves when exactly one field's content does** — which is the whole of what the
   * parts add over the digest on the entity, which can only say that something in the item changed.
   */
  it('moves one part when one field of the content changes', () => {
    const again = apply(compiledDir({ bump: true, change: ['description', 'rewritten upstream'] }), first.keyRecord.defined);

    const changes = moved(first.applied, again.applied);
    expect(Object.keys(changes), 'one item changed, so one item has a moved part').toHaveLength(1);
    expect(Object.values(changes)[0], 'and only the field that changed').toEqual(['description']);
  });

  /**
   * **A re-apply writes only what it changed**, so the two records stop being the same set — which is why the
   * entries of the items it skipped are the caller's to carry forward.
   */
  it('writes only the items a re-apply touched, and defines every key regardless', () => {
    const again = apply(compiledDir(), first.keyRecord.defined);

    expect(again.keyRecord.defined, 'every key is defined again').toEqual(first.keyRecord.defined);
    expect(again.applied.size, 'an unchanged apply wrote nothing').toBe(0);
  });
});

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { EARS } from '@/core/types';
import { openEnvAt, type LmdbDbs } from '@/persistence/lmdb/envs';
import { makeLmdbAdapter } from '@/persistence/lmdb/adapter';
import { LmdbQuery, decodeAttr } from '@/persistence/lmdb/query';
import { makePolicy, type Partition } from '@/persistence/partitioning/policy';
import type { PersistenceSink } from '@/persistence/partitioning/base-sink';

// Must mock before importing sharded-router (it imports getAttr at module level)
vi.mock('@/core/ears/attribute-storage', () => ({
  getAttr: vi.fn(() => null),
}));

// Import after mock is set up
const { makeShardedPersistence } = await import('@/persistence/partitioning/sharded-router');

function tmpDir(label: string) {
  return path.join(os.tmpdir(), `vitest-persistence-${label}-${crypto.randomBytes(4).toString('hex')}`);
}

// ---------------------------------------------------------------------------
// A. LMDB Adapter
// ---------------------------------------------------------------------------
describe('LMDB Adapter', () => {
  let dbs: LmdbDbs;
  let dir: string;

  beforeAll(() => {
    dir = tmpDir('adapter');
    dbs = openEnvAt(dir);
  });

  afterAll(() => {
    try { dbs.entities.close(); dbs.attrs.close(); dbs.relations.close(); dbs.root.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('onPutAttr throws without entireArray parameter', () => {
    const adapter = makeLmdbAdapter(dbs);
    expect(() => adapter.onPutAttr('kind', 'Entity-1', 0, 'val'))
      .toThrow('onPutAttr requires entireArray');
    adapter.close?.();
  });

  it('onPutAttr succeeds with entireArray', () => {
    const adapter = makeLmdbAdapter(dbs);
    expect(() => adapter.onPutAttr('kind', 'Entity-1', 0, 'val', ['val']))
      .not.toThrow();
    adapter.close?.();
  });

  it('close() flushes pending writes synchronously', () => {
    const adapter = makeLmdbAdapter(dbs);
    adapter.onCreateEntity('Entity-flush', 'TestType');
    adapter.onPutAttrArray?.('attr1', 'Entity-flush', ['v1', 'v2']);
    adapter.close?.();

    // Data should be readable after close
    const rec = dbs.entities.get('Entity-flush');
    expect(rec).toBeTruthy();
    expect(rec.type).toBe('TestType');
  });

  it('rejects forbidden \\x1F separator in keys', () => {
    const adapter = makeLmdbAdapter(dbs);
    expect(() => adapter.onPutAttr('bad\x1Fkey', 'Entity-1', 0, 'v', ['v']))
      .toThrow('forbidden separator');
    adapter.close?.();
  });

  it.each([
    { src: 'undefined', tgt: 'Document-1', label: '"undefined" as src' },
    { src: 'Document-1', tgt: 'undefined', label: '"undefined" as tgt' },
    { src: 'null', tgt: 'Document-1', label: '"null" as src' },
    { src: 'Document-1', tgt: 'null', label: '"null" as tgt' },
    { src: '', tgt: 'Document-1', label: 'empty src' },
    { src: 'Document-1', tgt: '', label: 'empty tgt' },
    { src: 'nohyphen', tgt: 'Document-1', label: 'no-hyphen src' },
    { src: 'Document-1', tgt: 'nohyphen', label: 'no-hyphen tgt' },
  ])('onAddRelation warns + returns silently on invalid input: $label', ({ src, tgt }) => {
    const adapter = makeLmdbAdapter(dbs);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    adapter.onAddRelation('Relation-bad', 'TEST', src, tgt, null);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[LMDB] Invalid'));
    spy.mockRestore();
    adapter.close?.();
  });

  it('onUpdateRelation warns on non-existent relation', () => {
    const adapter = makeLmdbAdapter(dbs);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    adapter.onUpdateRelation('Relation-nonexistent', { info: 'test' });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('missing relId'),
      expect.anything()
    );
    spy.mockRestore();
    adapter.close?.();
  });

  it.each([
    { patch: { src: 'undefined' }, label: 'src="undefined"' },
    { patch: { tgt: 'undefined' }, label: 'tgt="undefined"' },
    { patch: { src: 'null' }, label: 'src="null"' },
    { patch: { tgt: 'null' }, label: 'tgt="null"' },
    { patch: { src: 'nohyphen' }, label: 'src without hyphen' },
    { patch: { tgt: 'nohyphen' }, label: 'tgt without hyphen' },
  ])('onUpdateRelation warns on invalid src/tgt values: $label', ({ patch }) => {
    const adapter = makeLmdbAdapter(dbs);
    // First create a valid relation so onUpdateRelation finds it
    adapter.onAddRelation('Relation-valid', 'TEST', 'Doc-1', 'Doc-2', null);
    adapter.close?.(); // flush to DB

    const adapter2 = makeLmdbAdapter(dbs);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    adapter2.onUpdateRelation('Relation-valid', patch);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[LMDB] Invalid'));
    spy.mockRestore();
    adapter2.close?.();
  });
});

// ---------------------------------------------------------------------------
// B. Sharded Router
// ---------------------------------------------------------------------------
describe('Sharded Router', () => {
  let dirs: { primary: string; volatileBackup: string; secrets: string };
  let envs: Record<Partition, LmdbDbs>;
  let sinks: Record<Partition, PersistenceSink>;
  let policy: ReturnType<typeof makePolicy>;
  let sharded: ReturnType<typeof makeShardedPersistence>;

  beforeAll(() => {
    dirs = {
      primary: tmpDir('shard-primary'),
      volatileBackup: tmpDir('shard-volatile'),
      secrets: tmpDir('shard-secrets'),
    };
    envs = {
      primary: openEnvAt(dirs.primary),
      volatileBackup: openEnvAt(dirs.volatileBackup),
      secrets: openEnvAt(dirs.secrets),
    };
    policy = makePolicy({
      excludedEntityTypes: new Set([EARS.Entity.TNode]),
      secretEntityTypes: new Set([EARS.Entity.Secret]),
    });
    sinks = {
      primary: makeLmdbAdapter(envs.primary),
      volatileBackup: makeLmdbAdapter(envs.volatileBackup),
      secrets: makeLmdbAdapter(envs.secrets),
    };
    sharded = makeShardedPersistence(policy, sinks);
  });

  afterAll(() => {
    sharded.close?.();
    for (const db of Object.values(envs)) {
      try { db.entities.close(); db.attrs.close(); db.relations.close(); db.root.close(); } catch {}
    }
    for (const d of Object.values(dirs)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('onDropAttr throws without entireArray', () => {
    expect(() => (sharded as any).onDropAttr('kind', 'Document-1', 0))
      .toThrow('onDropAttr requires entireArray');
  });

  it('onUpdateRelation throws on null/empty src or tgt in patch', () => {
    sharded.onCreateEntity('Document-a', 'Document');
    sharded.onCreateEntity('Document-b', 'Document');
    sharded.onAddRelation('Relation-1', 'TEST', 'Document-a', 'Document-b', null);

    expect(() => sharded.onUpdateRelation('Relation-1', { src: null as any }))
      .toThrow('patch.src is empty');
    expect(() => sharded.onUpdateRelation('Relation-1', { tgt: '' }))
      .toThrow('patch.tgt is empty');
  });

  it.each([
    { src: '', tgt: 'Document-1', label: 'empty src' },
    { src: null as any, tgt: 'Document-1', label: 'null src' },
    { src: 'Document-1', tgt: '', label: 'empty tgt' },
    { src: 'Document-1', tgt: undefined as any, label: 'undefined tgt' },
    { src: 123 as any, tgt: 'Document-1', label: 'non-string src' },
  ])('seedRelationMetadata warns on invalid input: $label', ({ src, tgt }) => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sharded.seedRelationMetadata('Relation-seed', 'TEST', src, tgt);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[Sharded] Invalid'));
    spy.mockRestore();
  });

  it('getRelMeta() returns independent Map copies', () => {
    const m1 = sharded.getRelMeta();
    const m2 = sharded.getRelMeta();
    expect(m1).not.toBe(m2);
    m1.set('fake', { kind: 'x', src: 'x', tgt: 'x' });
    expect(sharded.getRelMeta().has('fake')).toBe(false);
  });

  it('getErrorStats() aggregates from all sinks', () => {
    const stats = sharded.getErrorStats?.();
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('errorCount');
    expect(typeof stats!.errorCount).toBe('number');
  });

  it('best-effort update broadcasts to all sinks for unknown relId', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Should not throw
    expect(() =>
      sharded.onUpdateRelation('Relation-unknown', { info: { x: 1 } })
    ).not.toThrow();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('unknown relId'),
      expect.anything()
    );
    spy.mockRestore();
  });

  it('best-effort removal broadcasts to all sinks for unknown relId', () => {
    // Should not throw even for completely unknown relation
    expect(() => sharded.onRemoveRelation('Relation-mystery')).not.toThrow();
  });

  it('cleans relation caches on entity destroy', () => {
    sharded.onCreateEntity('Document-d1', 'Document');
    sharded.onCreateEntity('Document-d2', 'Document');
    sharded.onAddRelation('Relation-cd1', 'REF', 'Document-d1', 'Document-d2', null);

    const before = sharded.getRelMeta();
    expect(before.has('Relation-cd1')).toBe(true);

    sharded.onDestroyEntity('Document-d1');

    const after = sharded.getRelMeta();
    expect(after.has('Relation-cd1')).toBe(false);
  });

  it('system continues working after encountering invalid data', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Feed bad data
    sharded.seedRelationMetadata('Relation-bad1', 'TEST', '', 'Document-1');
    spy.mockRestore();

    // Valid operations should still work
    sharded.onCreateEntity('Document-ok', 'Document');
    sharded.onCreateEntity('Document-ok2', 'Document');
    expect(() =>
      sharded.onAddRelation('Relation-ok', 'TEST', 'Document-ok', 'Document-ok2', null)
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// C. Relation Updates
// ---------------------------------------------------------------------------
describe('Relation Updates', () => {
  let dirs: { primary: string; volatileBackup: string; secrets: string };
  let envs: Record<Partition, LmdbDbs>;
  let sinks: Record<Partition, PersistenceSink>;
  let policy: ReturnType<typeof makePolicy>;
  let sharded: ReturnType<typeof makeShardedPersistence>;

  beforeAll(() => {
    dirs = {
      primary: tmpDir('relupd-primary'),
      volatileBackup: tmpDir('relupd-volatile'),
      secrets: tmpDir('relupd-secrets'),
    };
    envs = {
      primary: openEnvAt(dirs.primary),
      volatileBackup: openEnvAt(dirs.volatileBackup),
      secrets: openEnvAt(dirs.secrets),
    };
    policy = makePolicy({
      excludedEntityTypes: new Set([EARS.Entity.TNode]),
      secretEntityTypes: new Set([EARS.Entity.Secret]),
    });
    sinks = {
      primary: makeLmdbAdapter(envs.primary),
      volatileBackup: makeLmdbAdapter(envs.volatileBackup),
      secrets: makeLmdbAdapter(envs.secrets),
    };
    sharded = makeShardedPersistence(policy, sinks);

    // Set up entities
    sharded.onCreateEntity('Document-r1', 'Document');
    sharded.onCreateEntity('Document-r2', 'Document');
    sharded.onCreateEntity('TNode-t1', 'TNode');
  });

  afterAll(() => {
    sharded.close?.();
    for (const db of Object.values(envs)) {
      try { db.entities.close(); db.attrs.close(); db.relations.close(); db.root.close(); } catch {}
    }
    for (const d of Object.values(dirs)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('partial update (info only) preserves src/tgt metadata', () => {
    sharded.onAddRelation('Relation-pu1', 'LINKS', 'Document-r1', 'Document-r2', { weight: 0.5 });
    const before = sharded.getRelMeta().get('Relation-pu1');

    sharded.onUpdateRelation('Relation-pu1', { info: { weight: 0.8 } });

    const after = sharded.getRelMeta().get('Relation-pu1');
    expect(after?.src).toBe(before?.src);
    expect(after?.tgt).toBe(before?.tgt);
  });

  it('cross-partition endpoint change moves relation between sinks', () => {
    // Doc -> TNode goes to volatileBackup
    sharded.onAddRelation('Relation-cp1', 'LINKS', 'Document-r1', 'TNode-t1', { w: 1 });
    const partBefore = policy.routeRelation({
      srcType: EARS.Entity.Document,
      tgtType: EARS.Entity.TNode,
    });
    expect(partBefore).toBe('volatileBackup');

    // Change tgt to Document -> moves to primary
    sharded.onUpdateRelation('Relation-cp1', { tgt: 'Document-r2' });
    const partAfter = policy.routeRelation({
      srcType: EARS.Entity.Document,
      tgtType: EARS.Entity.Document,
    });
    expect(partAfter).toBe('primary');

    const meta = sharded.getRelMeta().get('Relation-cp1');
    expect(meta?.tgt).toBe('Document-r2');
  });

  it('info preserved during cross-partition move', () => {
    sharded.onAddRelation('Relation-cp2', 'LINKS', 'Document-r1', 'TNode-t1', { important: true });
    // Move to primary by changing tgt
    sharded.onUpdateRelation('Relation-cp2', { tgt: 'Document-r2' });
    // Metadata should still be valid
    const meta = sharded.getRelMeta().get('Relation-cp2');
    expect(meta).toBeDefined();
    expect(meta?.src).toBe('Document-r1');
    expect(meta?.tgt).toBe('Document-r2');
  });
});

// ---------------------------------------------------------------------------
// D. Query Layer
// ---------------------------------------------------------------------------
describe('Query Layer', () => {
  let dbs: LmdbDbs;
  let dir: string;
  let query: LmdbQuery;

  beforeAll(() => {
    dir = tmpDir('query');
    dbs = openEnvAt(dir);
    const adapter = makeLmdbAdapter(dbs);

    // Seed data
    // Corrupt index key — use transactionSync to avoid unhandled async rejections
    dbs.entities.transactionSync(() => {
      dbs.attrs.put(`TestKind\x1FEntity-123\x1FnotANumber`, { t: 'string', v: 'corrupt' });
    });
    adapter.onPutAttrArray?.('TestKind', 'Entity-123', ['valid1', 'valid2', 'valid3']);

    // Date attr
    const now = new Date('2025-06-01T00:00:00.000Z');
    adapter.onCreateEntity('Entity-456', 'TestEntity');
    adapter.onPutAttrArray?.('CreatedAt', 'Entity-456', [now]);

    // Complex object attr
    adapter.onCreateEntity('Entity-789', 'TestEntity');
    adapter.onPutAttrArray?.('Config', 'Entity-789', [{ nested: { value: 42 }, arr: [1, 2, 3] }]);

    // Entities + relations for neighbor/tombstone tests
    adapter.onCreateEntity('Doc-1', 'Document');
    adapter.onCreateEntity('Doc-2', 'Document');
    adapter.onCreateEntity('Doc-3', 'Document');
    adapter.onAddRelation('Rel-1', 'LINKS', 'Doc-1', 'Doc-2', null);
    adapter.onAddRelation('Rel-2', 'LINKS', 'Doc-1', 'Doc-3', null);
    adapter.onDestroyEntity('Doc-2');

    // Pagination entities
    for (let i = 0; i < 10; i++) {
      adapter.onCreateEntity(`Page-${i}`, 'Page');
      adapter.onPutAttrArray?.('Index', `Page-${i}`, [i]);
    }

    // Helper test
    adapter.onCreateEntity('Helper-1', 'Helper');
    adapter.onPutAttrArray?.('Values', 'Helper-1', [1, 2, 3, 4, 5]);

    adapter.close?.(); // flush
    query = new LmdbQuery(dbs);
  });

  afterAll(() => {
    try { dbs.entities.close(); dbs.attrs.close(); dbs.relations.close(); dbs.root.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('getAttrArray skips corrupt non-numeric index keys', () => {
    const arr = query.getAttrArray('TestKind', 'Entity-123');
    expect(arr).toEqual(['valid1', 'valid2', 'valid3']);
  });

  it('findEntitiesByAttr Date equality (instance + timestamp)', () => {
    const target = new Date('2025-06-01T00:00:00.000Z');
    const byDate = query.findEntitiesByAttr('CreatedAt', {
      equals: target,
      entityType: 'TestEntity',
    });
    expect(byDate).toContain('Entity-456');

    const byTimestamp = query.findEntitiesByAttr('CreatedAt', {
      equals: target.getTime(),
      entityType: 'TestEntity',
    });
    expect(byTimestamp).toContain('Entity-456');
  });

  it('findEntitiesByAttr deep equality for complex objects', () => {
    const found = query.findEntitiesByAttr('Config', {
      equals: { nested: { value: 42 }, arr: [1, 2, 3] },
      deepEquals: true,
    });
    expect(found).toContain('Entity-789');
  });

  it('neighbors() filters tombstoned entities with skipDeleted', () => {
    const all = query.neighbors('Doc-1', { kind: 'LINKS', skipDeleted: false });
    expect(all).toContain('Doc-2');
    expect(all).toContain('Doc-3');

    const alive = query.neighbors('Doc-1', { kind: 'LINKS', skipDeleted: true });
    expect(alive).not.toContain('Doc-2');
    expect(alive).toContain('Doc-3');
  });

  it('entitiesHavingAttr() and relations() respect limit', () => {
    const limited = [...query.entitiesHavingAttr('Index', 3)];
    expect(limited.length).toBe(3);

    let relCount = 0;
    for (const _ of query.relations({ limit: 1 })) relCount++;
    expect(relCount).toBeLessThanOrEqual(1);
  });

  it('getAttrCount() and getFirstAttr() helpers', () => {
    const count = query.getAttrCount('Values', 'Helper-1');
    expect(count).toBe(5);

    const first = query.getFirstAttr('Values', 'Helper-1');
    expect(first).toBe(1);
  });

  it('decodeAttr() is exported and decodes dates', () => {
    const dateRec = { t: 'date' as const, v: '2025-01-01T00:00:00.000Z' };
    const decoded = decodeAttr(dateRec);
    expect(decoded).toBeInstanceOf(Date);
    expect((decoded as Date).toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// E. Partition Routing (pure unit tests on policy)
// ---------------------------------------------------------------------------
describe('Partition Routing', () => {
  const policy = makePolicy({
    excludedEntityTypes: new Set([EARS.Entity.TNode]),
    secretEntityTypes: new Set([EARS.Entity.Secret]),
  });

  it('routes Document -> primary, TNode -> volatileBackup, Secret -> secrets', () => {
    expect(policy.routeEntity('Document-1')).toBe('primary');
    expect(policy.routeEntity('TNode-1')).toBe('volatileBackup');
    expect(policy.routeEntity('Secret-1')).toBe('secrets');
  });

  it('routes relations based on endpoint types', () => {
    // Both primary -> primary
    expect(policy.routeRelation({
      srcType: EARS.Entity.Document,
      tgtType: EARS.Entity.Document,
    })).toBe('primary');

    // Either excluded -> volatile
    expect(policy.routeRelation({
      srcType: EARS.Entity.Document,
      tgtType: EARS.Entity.TNode,
    })).toBe('volatileBackup');

    expect(policy.routeRelation({
      srcType: EARS.Entity.TNode,
      tgtType: EARS.Entity.Document,
    })).toBe('volatileBackup');

    // Secret involved -> secrets
    expect(policy.routeRelation({
      srcType: EARS.Entity.Secret,
      tgtType: EARS.Entity.Document,
    })).toBe('secrets');
  });
});

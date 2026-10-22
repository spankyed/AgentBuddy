// SPIKE: the LMDB-only engine keeps its data across a reopen, rolls a failed batch back, and indexes typed values
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createDiskEarsEngine, type DiskEngine } from '../../src/lmdb/disk-engine.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ears-disk-engine-'));
const types = new Set(['Task', 'Project']);
const opened: DiskEngine[] = [];
const open = (dir: string, indexThreshold?: number) => {
  const e = createDiskEarsEngine({ path: dir, isEntityType: (n) => types.has(n), indexThreshold });
  opened.push(e);
  return e;
};
afterAll(async () => {
  for (const e of opened) await e.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
});

describe('disk engine', () => {
  it('reads what it wrote after a reopen, with nothing hydrated', async () => {
    const dir = path.join(root, 'reopen');
    const a = open(dir);
    const t = a.query.tx('Task').put('title', 'A').grant('focus').id();
    const p = a.query.tx('Project').put('title', 'P').link('contains', t, { order: 1 }).id();
    await a.close();
    const b = open(dir);
    expect(b.query.findById(t)).toMatchObject({ title: 'A', role: 'focus' });
    expect(b.query.qx(p).linksTo('contains').ids()).toEqual([t]);
    expect(b.query.findRelations()[0]).toMatchObject({ sourceEntity: p, targetEntity: t, info: { order: 1 } });
    // Sequences continue: a new entity sorts after the old ones
    const t2 = b.query.tx('Task').id();
    expect(b.query.getEntitiesOfType('Task')).toEqual([t, t2]);
  });

  it('rolls a throwing batch back', () => {
    const e = open(path.join(root, 'rollback'));
    const t = e.query.tx('Task').put('title', 'A').id();
    expect(() => e.batch(() => {
      e.query.tx(t).put('title', 'B');
      e.query.tx('Task').put('title', 'C');
      throw new Error('boom');
    })).toThrow('boom');
    expect(e.query.getAttr(t, 'title')).toBe('A');
    expect(e.query.getEntitiesOfType('Task')).toEqual([t]);
  });

  it('indexes numbers, booleans and strings apart, and forgets replaced values', () => {
    const e = open(path.join(root, 'index'), 0);
    const [a, b, c] = [1, '1', true].map((v) => e.query.tx('Task').put('v', v).put('done', v === true).id());
    expect(e.query.qx('Task').where('v', 1).ids()).toEqual([a]);
    expect(e.query.qx('Task').where('v', '1').ids()).toEqual([b]);
    expect(e.query.qx('Task').where('v', true).ids()).toEqual([c]);
    expect(e.query.qx('Task').where('done', false).ids()).toEqual([a, b]);
    e.query.tx(a).put('v', 2);
    expect(e.query.qx('Task').where('v', 1).ids()).toEqual([]);
    expect(e.query.qx('Task').where('v', 2).ids()).toEqual([a]);
    e.query.tx(a).destroy();
    expect(e.query.qx('Task').where('v', 2).ids()).toEqual([]);
    expect(e.storage.idsWithValue!('v', 2)!.size).toBe(0);
  });
});

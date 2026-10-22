// SPIKE: bench/ears.bench.ts's cases, against the memory engine or the LMDB-only engine.
//   EARS_BENCH_ENGINE=memory|disk   EARS_DISK_CACHE=1   EARS_DISK_NOSYNC=1   EARS_DISK_INDEX=0
//   npx vitest bench --run bench/engines.bench.ts --outputJson out.json
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, bench, describe } from 'vitest';
import { createEarsEngine, EARS, type EarsEngine } from '../src/index.ts';
import { createDiskEarsEngine } from '../src/lmdb/disk-engine.ts';

const TASKS = 40_000;
const PROJECTS = 5_000;
const PEOPLE = 5_000;
const BLOCKS = 15_000;

type Id = EARS.EntityId;
const types = new Set(['Task', 'Project', 'Person', 'Note', 'Relation']);
const isEntityType = (name: string) => types.has(name);
const DISK = process.env.EARS_BENCH_ENGINE === 'disk';
const dir = DISK ? fs.mkdtempSync(path.join(os.tmpdir(), 'ears-bench-')) : '';

let engine: EarsEngine;
let batch: <T>(fn: () => T) => T = (fn) => fn();
let close = async () => {};
if (DISK) {
  const disk = createDiskEarsEngine({
    path: path.join(dir, 'env'),
    isEntityType,
    cache: process.env.EARS_DISK_CACHE === '1',
    noSync: process.env.EARS_DISK_NOSYNC === '1',
    valueIndex: process.env.EARS_DISK_INDEX !== '0',
  });
  engine = disk;
  batch = disk.batch;
  close = disk.close;
} else {
  engine = createEarsEngine({ isEntityType });
}
const { query, admin } = engine;

afterAll(async () => {
  const mem = process.memoryUsage();
  const size = DISK ? fs.statSync(path.join(dir, 'env', 'data.mdb')).size : 0;
  console.log(`[bench ${DISK ? 'disk' : 'memory'}] heapUsed ${(mem.heapUsed / 1e6).toFixed(0)} MB, rss ${(mem.rss / 1e6).toFixed(0)} MB${DISK ? `, data.mdb ${(size / 1e6).toFixed(0)} MB` : ''}`);
  await close();
  if (DISK) fs.rmSync(dir, { recursive: true, force: true });
});

const task = (i: number) => `Task-${i}` as Id;
const project = (i: number) => `Project-${i}` as Id;
const person = (i: number) => `Person-${i}` as Id;
const STATUSES = ['open', 'done', 'blocked'];

/** 50k entities with 4 attributes each (200k), and 100k relations; on disk, in one write transaction */
function hydrate(): void {
  admin.clear();
  batch(() => {
    const entities: Id[] = [];
    for (let i = 0; i < TASKS; i++) entities.push(task(i));
    for (let i = 0; i < PROJECTS; i++) entities.push(project(i));
    for (let i = 0; i < PEOPLE; i++) entities.push(person(i));
    entities.forEach((id, i) => {
      admin.bulkLoadAttr(id, 'title', `Row ${i}`);
      admin.bulkLoadAttr(id, 'status', STATUSES[i % 3]);
      admin.bulkLoadAttr(id, 'rank', i % 100);
      admin.bulkLoadAttr(id, 'createdAt', 1_700_000_000_000 + i);
    });
    let rel = 0;
    const relate = (src: Id, kind: string, tgt: Id) => {
      const relId = `Relation-${rel++}` as Id;
      admin.bulkLoadAttr(relId, EARS.AttrKind.RelationDetails, { sourceEntity: src, targetEntity: tgt, relationType: kind, info: undefined });
      admin.addToIndex(kind, src, tgt, relId);
    };
    for (let i = 0; i < TASKS; i++) relate(project(i % PROJECTS), 'contains', task(i));
    for (let i = 0; i < TASKS; i++) relate(task(i), 'assigned', person(i % PEOPLE));
    for (let i = 0; i < PROJECTS; i++) relate(project(i), 'owner', person(i));
    for (let i = 0; i < BLOCKS; i++) relate(task(i), 'blocks', task((i * 7 + 1) % TASKS));
  });
}

hydrate();

describe('hydrate', () => {
  bench('bulk load 50k entities, 200k attributes, 100k relations', hydrate, { iterations: DISK ? 3 : 10, time: 0 });
});

describe('queries', () => {
  bench('qx by type with where and pickAll', () => {
    query.qx('Task').where('status', 'blocked').pickAll();
  }, { iterations: 20, time: 0 });

  bench('1,000 qx(id) lookups', () => {
    for (let i = 0; i < 1000; i++) query.qx(task(i)).count();
  }, { iterations: 20, time: 0 });

  bench('qx by type with 3 chained steps', () => {
    query.qx('Task').ofType('Task').orderBy('rank').limit(10).ids();
  }, { iterations: 20, time: 0 });

  bench('relation traversal (a project: its tasks, then their assignees)', () => {
    query.qx(project(1)).linksTo('contains', 'Task').linksTo('assigned').count();
  }, { iterations: 30, time: 0 });

  bench('findById x1,000', () => {
    for (let i = 0; i < 1000; i++) query.findById(task(i));
  }, { iterations: 20, time: 0 });

  bench('qx().withRole over all entities (none)', () => {
    query.qx().withRole('current').ids();
  }, { iterations: 10, time: 0 });
});

describe('writes', () => {
  bench('tx batch of 1,000 creates (a commit per write)', () => {
    for (let i = 0; i < 1000; i++) query.tx('Note').put('title', `Note ${i}`).put('status', 'open');
  }, { iterations: DISK ? 5 : 50, time: 0 });

  bench('tx batch of 1,000 creates (a commit per tx chain)', () => {
    for (let i = 0; i < 1000; i++) batch(() => query.tx('Note').put('title', `Note ${i}`).put('status', 'open'));
  }, { iterations: DISK ? 5 : 50, time: 0 });

  bench('tx batch of 1,000 creates (one commit)', () => {
    batch(() => {
      for (let i = 0; i < 1000; i++) query.tx('Note').put('title', `Note ${i}`).put('status', 'open');
    });
  }, { iterations: DISK ? 10 : 50, time: 0 });

  bench('updateEntity x1,000 on existing tasks (one commit)', () => {
    batch(() => {
      for (let i = 0; i < 1000; i++) query.updateEntity(task(i), { status: STATUSES[(i + 1) % 3] }, true);
    });
  }, { iterations: DISK ? 10 : 50, time: 0 });
});

// The pack-facing replacements for @abuddy/host in pack code: relation reads in @abuddy/sdk/ears,
// and the host-implemented services.appData and services.traceStore (registered by the api's host init).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { findRelations, getRelationStats, untypedQx, tx } from '@abuddy/sdk/ears';
import { services } from '@abuddy/sdk/services';
import { clearMemory, createEntity, envs, qx as hostQx } from '@abuddy/host/ears';
import { EARS } from '../../src/__generated__/ears';

describe('relation reads in @abuddy/sdk/ears', () => {
  beforeEach(() => clearMemory());

  it('findRelations returns matching relations with their ids and info', () => {
    const flow = createEntity(EARS.Entity.Flow);
    const a = createEntity(EARS.Entity.Node);
    const b = createEntity(EARS.Entity.Node);
    tx(a).link(EARS.RelKind.TRANSITIONS_TO, b, { sourceHandle: 'yes' });
    tx(flow).link(EARS.RelKind.CONTAINS, a);

    const [edge] = findRelations({ sourceEntity: a, relationType: EARS.RelKind.TRANSITIONS_TO });
    expect(edge).toMatchObject({ sourceEntity: a, targetEntity: b, relationType: EARS.RelKind.TRANSITIONS_TO, info: { sourceHandle: 'yes' } });
    expect(edge.id).toMatch(/^Relation-/);
    expect(findRelations({ targetEntity: a }).map((r) => r.sourceEntity)).toEqual([flow]);
    expect(findRelations().map((r) => r.id).sort()).toEqual([edge.id, findRelations({ sourceEntity: flow })[0].id].sort());

    tx(a).patchLink(EARS.RelKind.TRANSITIONS_TO, b, { newTarget: b, newInfo: { sourceHandle: 'no' } });
    expect(findRelations({ sourceEntity: a })[0]).toMatchObject({ id: edge.id, targetEntity: b, info: { sourceHandle: 'no' } });
  });

  it('getRelationStats counts relations and distinct endpoints of a kind', () => {
    const [s1, s2, t] = [createEntity(EARS.Entity.Node), createEntity(EARS.Entity.Node), createEntity(EARS.Entity.Node)];
    tx(s1).link(EARS.RelKind.TRANSITIONS_TO, t);
    tx(s2).link(EARS.RelKind.TRANSITIONS_TO, t);
    expect(getRelationStats(EARS.RelKind.TRANSITIONS_TO)).toEqual({ total: 2, uniqueSources: 2, uniqueTargets: 1 });
    expect(getRelationStats(EARS.RelKind.SPAWNED)).toEqual({ total: 0, uniqueSources: 0, uniqueTargets: 0 });
  });

  it('untypedQx is the engine query the host uses', () => {
    expect(untypedQx).toBe(hostQx);
  });
});

describe('services.traceStore', () => {
  const US = '\x1F';
  const ids = { flow: 'TNode-trace-flow', event: 'TNode-trace-event', gone: 'TNode-trace-gone' } as const;

  afterAll(() => {
    const dbs = envs.volatileBackup;
    for (const id of Object.values(ids)) dbs.entities.removeSync(id);
    dbs.attrs.removeSync(`label${US}${ids.flow}${US}0`);
    dbs.relations.removeSync('Relation-trace-1');
    dbs.relations.removeSync('Relation-trace-2');
  });

  it("reads the volatile store's entities, attributes and relations", () => {
    const dbs = envs.volatileBackup;
    dbs.entities.putSync(ids.flow, { type: 'TNode', createdAt: 1 });
    dbs.entities.putSync(ids.event, { type: 'TNode', createdAt: 2 });
    dbs.entities.putSync(ids.gone, { type: 'TNode', createdAt: 3, deletedAt: 4 });
    dbs.attrs.putSync(`label${US}${ids.flow}${US}0`, { t: 'string', v: 'Run' });
    dbs.relations.putSync('Relation-trace-1', { kind: 'tracked', src: ids.flow, tgt: ids.event, createdAt: 5 });
    dbs.relations.putSync('Relation-trace-2', { kind: 'tracked', src: ids.flow, tgt: ids.gone, createdAt: 6 });

    const store = services.traceStore;
    expect(store.entities().filter((e) => e.id.startsWith('TNode-trace-')).map((e) => e.id).sort()).toEqual(Object.values(ids).sort());
    expect(store.getEntityMeta(ids.flow)).toEqual({ type: 'TNode', createdAt: 1 });
    expect(store.getAttr('label', ids.flow)).toBe('Run');
    expect(store.relations({ kind: 'tracked', src: ids.flow })).toEqual([{ id: 'Relation-trace-1', rel: { kind: 'tracked', src: ids.flow, tgt: ids.event, createdAt: 5 } }]);
    expect(store.relations({ kind: 'tracked', src: ids.flow, skipDeleted: false })).toHaveLength(2);
  });
});

describe('services.appData', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports a backup directory, and null for anything else', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-data-backup-'));
    dirs.push(dir);
    expect(await services.appData.backupInfo(dir)).toBeNull();

    const backup = await services.appData.exportBackup(dir, 'probe', ['secretsLmdb']);
    expect(backup).toBe(path.join(dir, 'probe'));
    expect(await services.appData.backupInfo(backup)).toEqual({ timestamp: expect.any(Number), databases: ['secretsLmdb'], size: expect.any(Number), hasMedia: false });
  });

  it('rejects an import of a directory that is not a backup', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-data-not-backup-'));
    dirs.push(dir);
    await expect(services.appData.importBackup(dir)).rejects.toThrow('Invalid backup: metadata.json not found');
  });
});

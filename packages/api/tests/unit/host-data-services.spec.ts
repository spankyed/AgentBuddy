// The pack-facing replacements for @abuddy/host in pack code: relation reads in @abuddy/ears,
// and the host-implemented services.appData and services.traceStore, as the API's host init registers them.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** The app version the migrations read, when a test sets one; the bound app's otherwise */
const version = vi.hoisted(() => ({ current: undefined as string | undefined }));
vi.mock('@abuddy/sdk/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@abuddy/sdk/env')>();
  return { ...actual, getAppVersion: () => version.current ?? actual.getAppVersion() };
});

// The app's store, opened as the API opens it, in a throwaway data dir
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-host-data-services-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('@/setup/backend');
const { store, engine, packs } = openAppStore();
const { defineEars, findRelations, getRelationStats, installedEngine, untypedQx, tx } = await import('@abuddy/ears');
const { services } = await import('@abuddy/sdk/services');
const { createEntity } = defineEars();

const EARS = {
  Entity: { Flow: 'Flow', Node: 'Node' },
  RelKind: { TRANSITIONS_TO: 'transitions_to', CONTAINS: 'contains', SPAWNED: 'spawned' },
} as const;

afterAll(() => {
  store.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('relation reads in @abuddy/ears', () => {
  beforeEach(() => engine.admin.clear());

  it('findRelations returns matching relations with their ids and info', () => {
    const flow = createEntity(EARS.Entity.Flow as never);
    const a = createEntity(EARS.Entity.Node as never);
    const b = createEntity(EARS.Entity.Node as never);
    tx(a).link(EARS.RelKind.TRANSITIONS_TO as never, b, { sourceHandle: 'yes' });
    tx(flow).link(EARS.RelKind.CONTAINS as never, a);

    const [edge] = findRelations({ sourceEntity: a, relationType: EARS.RelKind.TRANSITIONS_TO });
    expect(edge).toMatchObject({ sourceEntity: a, targetEntity: b, relationType: EARS.RelKind.TRANSITIONS_TO as never, info: { sourceHandle: 'yes' } });
    expect(edge.id).toMatch(/^Relation-/);
    expect(findRelations({ targetEntity: a }).map((r) => r.sourceEntity)).toEqual([flow]);
    expect(findRelations().map((r) => r.id).sort()).toEqual([edge.id, findRelations({ sourceEntity: flow })[0].id].sort());

    tx(a).patchLink(EARS.RelKind.TRANSITIONS_TO as never, b, { newTarget: b, newInfo: { sourceHandle: 'no' } });
    expect(findRelations({ sourceEntity: a })[0]).toMatchObject({ id: edge.id, targetEntity: b, info: { sourceHandle: 'no' } });
  });

  it('getRelationStats counts relations and distinct endpoints of a kind', () => {
    const [s1, s2, t] = [createEntity(EARS.Entity.Node as never), createEntity(EARS.Entity.Node as never), createEntity(EARS.Entity.Node as never)];
    tx(s1).link(EARS.RelKind.TRANSITIONS_TO as never, t);
    tx(s2).link(EARS.RelKind.TRANSITIONS_TO as never, t);
    expect(getRelationStats(EARS.RelKind.TRANSITIONS_TO)).toEqual({ total: 2, uniqueSources: 2, uniqueTargets: 1 });
    expect(getRelationStats(EARS.RelKind.SPAWNED)).toEqual({ total: 0, uniqueSources: 0, uniqueTargets: 0 });
  });

  it("untypedQx queries the app's engine, which binding installed", () => {
    expect(installedEngine()).toBe(engine.query);
    tx('Flow-query' as never, true).put('label', 'Queried');
    expect(untypedQx('Flow-query' as never).pick(['label'])).toEqual([{ id: 'Flow-query', label: 'Queried' }]);
  });
});

describe('services.traceStore', () => {
  const US = '\x1F';
  const ids = { flow: 'TNode-trace-flow', event: 'TNode-trace-event', later: 'TNode-trace-later' } as const;

  afterAll(() => {
    const dbs = store.envs.volatileBackup;
    for (const id of Object.values(ids)) dbs.entities.removeSync(id);
    dbs.attrs.removeSync(`label${US}${ids.flow}${US}0`);
    dbs.relations.removeSync('Relation-trace-1');
    dbs.relations.removeSync('Relation-trace-2');
  });

  it("reads the volatile store's entities, attributes and relations", () => {
    const dbs = store.envs.volatileBackup;
    dbs.entities.putSync(ids.flow, { type: 'TNode', createdAt: 1 });
    dbs.entities.putSync(ids.event, { type: 'TNode', createdAt: 2 });
    dbs.entities.putSync(ids.later, { type: 'TNode', createdAt: 3 });
    dbs.attrs.putSync(`label${US}${ids.flow}${US}0`, { t: 'string', v: 'Run' });
    dbs.relations.putSync('Relation-trace-1', { kind: 'tracked', src: ids.flow, tgt: ids.event, createdAt: 5 });
    dbs.relations.putSync('Relation-trace-2', { kind: 'tracked', src: ids.flow, tgt: ids.later, createdAt: 6 });

    const traces = services.traceStore;
    expect(traces.entities().filter((e) => e.id.startsWith('TNode-trace-')).map((e) => e.id).sort()).toEqual(Object.values(ids).sort());
    expect(traces.getEntityMeta(ids.flow)).toEqual({ type: 'TNode', createdAt: 1 });
    expect(traces.getAttr('label', ids.flow)).toBe('Run');
    expect(traces.relations({ kind: 'tracked', src: ids.flow })).toEqual([
      { id: 'Relation-trace-1', rel: { kind: 'tracked', src: ids.flow, tgt: ids.event, createdAt: 5 } },
      { id: 'Relation-trace-2', rel: { kind: 'tracked', src: ids.flow, tgt: ids.later, createdAt: 6 } },
    ]);
    expect(traces.relations({ kind: 'tracked', src: ids.flow, limit: 1 })).toHaveLength(1);
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

    const backup = await services.appData.exportBackup(dir, 'probe', ['volatileLmdb']);
    expect(backup).toBe(path.join(dir, 'probe'));
    expect(await services.appData.backupInfo(backup)).toEqual({ timestamp: expect.any(Number), databases: ['volatileLmdb'], size: expect.any(Number), hasMedia: false });
  });

  it("refuses a backup holding a database this app doesn't have, before it replaces anything", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-data-unknown-db-backup-'));
    dirs.push(dir);
    const backup = await services.appData.exportBackup(dir, 'unknown', ['lmdb']);
    const metadataPath = path.join(backup, 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    fs.writeFileSync(metadataPath, JSON.stringify({ ...metadata, databases: ['lmdb', 'unknownLmdb'] }));
    fs.mkdirSync(path.join(backup, 'unknownLmdb'));
    tx('Note-kept' as never, true).put('title', 'still here');

    // A partial restore of a backup a newer AgentBuddy made would cost the user their data to learn that
    await expect(services.appData.importBackup(backup)).rejects.toThrow("The backup has databases this AgentBuddy doesn't: unknownLmdb");
    expect(untypedQx('Note-kept' as never).pickOne(['title'])).toMatchObject({ title: 'still here' });
  });

  it('restores a backup whose listed database was empty when it was made', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-data-empty-db-backup-'));
    dirs.push(dir);
    // exportBackup lists volatileLmdb but copies no folder when there is nothing in it
    const backup = await services.appData.exportBackup(dir, 'sparse', ['lmdb', 'volatileLmdb']);
    fs.rmSync(path.join(backup, 'volatileLmdb'), { recursive: true, force: true });

    expect(await services.appData.importBackup(backup)).toEqual({ databases: ['lmdb'] });
  });

  it("moves the app's state out of the settings of a backup from before AppState", async () => {
    const { appState } = await import('@abuddy/host/app-state');
    // The release that moves it
    version.current = '0.3.15';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-data-old-backup-'));
    dirs.push(dir);
    // The built-in pack's settings, as 0.3.14 stored them: the app's state in `internal`, and no AppState
    packs.registerPack({ id: 'settings-pack', systems: [], ears: { entities: { Settings: 'Settings' }, relKinds: {} } });
    engine.admin.clear();
    tx('Settings-app' as never, true).put('entityType', 'Settings').put('data', { internal: { hasOnboarded: true, version: '0.3.14' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const backup = await services.appData.exportBackup(dir, 'old', ['lmdb']);
    expect(appState.exists()).toBe(false);

    try {
      await services.appData.importBackup(backup);

      expect(services.appData.hasOnboarded()).toBe(true);
      expect(appState.get().version).toBe('0.3.15');
    } finally {
      version.current = undefined;
      packs.unregisterPack('settings-pack');
    }
  });

  it('rejects an import of a directory that is not a backup', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-data-not-backup-'));
    dirs.push(dir);
    await expect(services.appData.importBackup(dir)).rejects.toThrow(`${dir} isn't a backup: it has no metadata.json`);
  });
});

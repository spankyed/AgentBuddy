// The API's boot and a tool opening the data dir (openAppDatabase, which abuddy db uses) hydrate the same entities,
// relations and roles: both open the store through @abuddy/host/database, and the tool reads the installed packs'
// manifests where the API registers their code. Runs the built-in packs' built runtimes (npm run compile).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { EarsQuery } from '@abuddy/ears';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-database-parity-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('@/setup/backend');
const { loadBuiltInPacks, loadExternalPacks, registerExternalPacks, startPacks } = await import('@abuddy/host/packs/runtime');
const { installPackFromLocal, publishHostPackOutput } = await import('@abuddy/host/packs');
const { openAppDatabase } = await import('@abuddy/host/database');
const { resolveAppContext } = await import('@abuddy/sdk/env');
const { unbindHost } = await import('@abuddy/sdk/runtime/internals');
const { tx } = await import('@abuddy/ears');

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', '..');

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

/** Every entity with its attributes and roles, and every relation, in a stable order */
function snapshot(query: EarsQuery) {
  const ids = [...query.getAllEntities()].sort();
  return {
    entities: ids.map((id) => ({ id, attributes: query.getAll(id), roles: [...query.getRoles(id)].sort() })),
    relations: query.findRelations()
      .map(({ id, relationType, sourceEntity, targetEntity, info }) => ({ id, relationType, sourceEntity, targetEntity, info }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** The API's boot up to hydration (setup/backend.ts), for the built-in packs and the installed external ones; the caller closes the store */
async function bootApi() {
  const app = openAppStore();
  const infos = await loadBuiltInPacks(app.packs, PACKAGES_DIR, { runtimeEntry: 'only' });
  for (const info of infos) publishHostPackOutput(info.dir, path.join(resolveAppContext().hostPacksDir, info.id));
  registerExternalPacks(app.packs, loadExternalPacks());
  await app.store.hydrate();
  return app;
}

/**
 * Installs an external pack declaring its own entity type, as `abuddy install` leaves one: the API registers its
 * runtime, the tool reads the manifest beside it
 */
async function installExternalPack(id: string, entityType: string): Promise<void> {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), `${id}-`));
  const ears = { entities: { [entityType]: entityType }, relKinds: {} };
  fs.writeFileSync(path.join(source, 'abuddy.json'), JSON.stringify({ id, name: id, version: '1.0.0', ...ears }));
  fs.mkdirSync(path.join(source, 'dist', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(source, 'dist', 'types'), { recursive: true });
  fs.writeFileSync(path.join(source, 'dist', 'types', 'snapshot.json'), '{}');
  fs.writeFileSync(
    path.join(source, 'dist', 'runtime', 'index.cjs'),
    `module.exports = { registration: { id: ${JSON.stringify(id)}, ears: ${JSON.stringify(ears)} } };`,
  );
  await installPackFromLocal(source, resolveAppContext().packsDir);
  fs.rmSync(source, { recursive: true, force: true });
}

describe('a data dir opened by the API and by openAppDatabase', () => {
  it('hydrates to the same entities, relations and roles', async () => {
    // A first run seeds the app's data; the user adds a note with a role and a relation, and a run leaves a trace in
    // the volatile partition, which neither hydrates
    const first = await bootApi();
    startPacks(first.packs, []);
    tx('Note-parity' as never, true).put('entityType', 'Note').put('title', 'mine').grant('pinned').link('parent_of', 'Note-child' as never);
    tx('TNode-parity' as never, true).put('entityType', 'TNode').put('status', 'done');
    first.store.close();
    unbindHost();

    const api = await bootApi();
    const fromApi = snapshot(api.engine.query);
    const types = [...api.packs.getRegisteredEntityTypes()];
    const routes = (policy: typeof api.packs.partitionPolicy) => types.map((type) => policy.routeEntity(`${type}-1`, type));
    api.store.close();
    unbindHost();

    const db = await openAppDatabase({ env: 'test', userDataDir: dataDir, readOnly: true, log: () => {} });
    const fromTool = snapshot(db.query);
    db.close();

    expect(fromApi.entities.length).toBeGreaterThan(10);
    expect(fromApi.relations.length).toBeGreaterThan(0);
    expect(fromApi.entities.some(({ roles }) => roles.length > 0)).toBe(true);
    expect(fromApi.entities.find(({ id }) => id === 'Note-parity')).toMatchObject({ roles: ['pinned'] });
    expect(fromApi.entities.find(({ id }) => id === 'TNode-parity')).toBeUndefined();
    expect(fromTool).toEqual(fromApi);
    // The tool knows the built-in pack's entity types, and writes each where the API does
    expect(db.schema.getRegisteredEntityTypes()).toEqual(api.packs.getRegisteredEntityTypes());
    expect(routes(db.schema.partitionPolicy)).toEqual(routes(api.packs.partitionPolicy));
    expect(routes(api.packs.partitionPolicy)).toContain('volatileBackup');
  });
});

// The tool writes through the schema it reconstructs, so a row it creates has to land in the partition the API reads
// it from — the direction a schema drift would corrupt
describe('what the tool writes', () => {
  it('lands where the API reads it, the excluded types in the volatile partition', async () => {
    const booted = await bootApi();
    booted.store.close();
    unbindHost();

    const db = await openAppDatabase({ env: 'test', userDataDir: dataDir, log: () => {} });
    tx('Note-tool' as never, true).put('entityType', 'Note').put('title', 'from the tool').grant('pinned');
    tx('TNode-tool' as never, true).put('entityType', 'TNode').put('status', 'done');
    db.close();

    const api = await bootApi();
    try {
      // The note is in the data the API hydrates, with its role
      expect(api.engine.query.getAttr('Note-tool' as never, 'title' as never)).toBe('from the tool');
      expect([...api.engine.query.getRoles('Note-tool' as never)]).toEqual(['pinned']);
      // The run history isn't hydrated, and is in the partition the app keeps it in
      expect(api.engine.query.getAttr('TNode-tool' as never, 'status' as never)).toBeNull();
      expect(api.store.query('volatileBackup').getFirstAttr('status', 'TNode-tool')).toBe('done');
    } finally {
      api.store.close();
      unbindHost();
    }
  });
});

// The tool takes the entity types of every installed pack, not only the built-in ones: an external pack's rows are
// its user's data like any other
describe('an installed external pack', () => {
  it('is in the entity types and the routing the tool reconstructs, as it is in the API\'s registry', async () => {
    await installExternalPack('memo-pack', 'Memo');

    const api = await bootApi();
    const types = [...api.packs.getRegisteredEntityTypes()];
    const routes = (policy: typeof api.packs.partitionPolicy) => types.map((type) => policy.routeEntity(`${type}-1`, type));
    api.store.close();
    unbindHost();

    const db = await openAppDatabase({ env: 'test', userDataDir: dataDir, readOnly: true, log: () => {} });
    try {
      expect(types).toContain('Memo');
      expect(db.schema.getRegisteredEntityTypes()).toEqual(api.packs.getRegisteredEntityTypes());
      expect(routes(db.schema.partitionPolicy)).toEqual(routes(api.packs.partitionPolicy));
      expect(db.schema.entities.Memo).toBe('Memo');
    } finally {
      db.close();
    }
  });
});

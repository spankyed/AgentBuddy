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
const { loadBuiltInPacks, startPacks } = await import('@abuddy/host/packs/runtime');
const { publishHostPackArtifacts } = await import('@abuddy/host/packs');
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

/** The API's boot up to hydration (setup/backend.ts), for the built-in packs; the caller closes the store */
async function bootApi() {
  const app = openAppStore();
  const infos = await loadBuiltInPacks(app.packs, PACKAGES_DIR, { runtimeEntry: 'only' });
  for (const info of infos) publishHostPackArtifacts(info.dir, path.join(resolveAppContext().hostPacksDir, info.id));
  await app.store.hydrate();
  return app;
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

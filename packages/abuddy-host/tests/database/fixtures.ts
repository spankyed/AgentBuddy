// Data dirs for the database specs: a built-in pack published as the app publishes it, external packs installed,
// and a database written through the composition the app uses
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { tx, installEngine } from '@abuddy/ears';
import { _appDataPaths } from '@abuddy/sdk/utils';
import { openDatabaseStore } from '../../src/database/open.ts';
import { readInstalledSchema } from '../../src/database/schema.ts';

export const tempDirs: string[] = [];

export function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

export function removeTempDirs(): void {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

function writeJSON(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

/** A data dir with the built-in pack `core` published (Note, `mentions`, Trace volatile), and optionally external packs */
export function dataDirWithPacks({ external = [] as Array<{ id: string; entities: Record<string, string>; enabled?: boolean }> } = {}): string {
  const dir = tempDir('host-database-');
  writeJSON(path.join(dir, 'host-packs', 'core', 'types', 'snapshot.json'), {
    types: {},
    defs: {},
    manifest: {
      id: 'core', name: 'Core', version: '1.0.0', builtIn: true,
      entities: { Note: 'Note', Trace: 'Trace' },
      relKinds: { MENTIONS: 'mentions' },
      partitionPolicy: { excludedEntityTypes: ['Trace'] },
    },
  });
  for (const pack of external) {
    writeJSON(path.join(dir, 'packs', pack.id, 'abuddy.json'), {
      id: pack.id, name: pack.id, version: '1.0.0', entities: pack.entities, partitionPolicy: { excludedEntityTypes: Object.keys(pack.entities) },
    });
  }
  const listed = external.filter((pack) => pack.enabled !== undefined);
  if (listed.length > 0) {
    writeJSON(path.join(dir, 'pack-registry.json'), {
      packs: listed.map((pack) => ({ id: pack.id, name: pack.id, version: '1.0.0', dir: path.join(dir, 'packs', pack.id), enabled: pack.enabled, registeredAt: '' })),
    });
  }
  return dir;
}

const context = (userDataDir: string) => ({
  userDataDir,
  packsDir: path.join(userDataDir, 'packs'),
  hostPacksDir: path.join(userDataDir, 'host-packs'),
  registryFile: path.join(userDataDir, 'pack-registry.json'),
});

/** Writes through a store opened on the data dir's layout, as the app writes (the engine installed meanwhile) */
export async function writeData(userDataDir: string, write: () => void, { packaged = false } = {}): Promise<void> {
  const paths = _appDataPaths(userDataDir, { packaged });
  const { store, engine } = openDatabaseStore({
    paths: { primary: paths.lmdb, volatileBackup: paths.volatileLmdb },
    schema: readInstalledSchema(context(userDataDir)),
    log: () => {},
  });
  const previous = installEngine(engine.query);
  try {
    await store.hydrate();
    write();
  } finally {
    installEngine(previous);
    store.close();
  }
}

export { context as schemaContext, tx };

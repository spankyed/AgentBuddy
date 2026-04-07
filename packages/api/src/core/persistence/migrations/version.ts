import type { Database } from 'lmdb';

const SCHEMA_VERSION_KEY = '__schema_version__';

export function readSchemaVersion(entities: Database<any>): number {
  return (entities.get(SCHEMA_VERSION_KEY) as number) ?? 0;
}

export function writeSchemaVersion(entities: Database<any>, version: number): void {
  entities.putSync(SCHEMA_VERSION_KEY, version);
}

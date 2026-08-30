import { getHostModule } from '../runtime/host';
import type { EARS } from '../types/entities';

let _graphMod: any;
function graphMod() {
  if (!_graphMod) _graphMod = getHostModule('ears-graph');
  return _graphMod;
}

export function wouldCreateCycle(sourceId: EARS.EntityId, targetId: EARS.EntityId, relKinds: readonly string[]): boolean {
  return graphMod().wouldCreateCycle(sourceId, targetId, relKinds);
}

let _entityUtilsMod: any;
function entityUtilsMod() {
  if (!_entityUtilsMod) _entityUtilsMod = getHostModule('entity-utils');
  return _entityUtilsMod;
}

export function getTimestamp(): number { return entityUtilsMod().getTimestamp(); }
export function generateShortCode(entityType: EARS.Entity, prefix?: string): string { return entityUtilsMod().generateShortCode(entityType, prefix); }
export function generateLabelWithCount(base: string, entityType: EARS.Entity): string { return entityUtilsMod().generateLabelWithCount(base, entityType); }
export function filterSystemFields<T extends Record<string, unknown>>(updates: T, excludes?: string[]): Partial<T> {
  return entityUtilsMod().filterSystemFields(updates, excludes);
}

let _queryMod: any;
function queryMod() {
  if (!_queryMod) _queryMod = getHostModule('ears-query');
  return _queryMod;
}

export function b64Encode(n: number): string { return queryMod().b64Encode(n); }
export function b64Decode(s: string): number { return queryMod().b64Decode(s); }

let _lmdbQueryMod: any;
function lmdbQueryMod() {
  if (!_lmdbQueryMod) _lmdbQueryMod = getHostModule('lmdb-query');
  return _lmdbQueryMod;
}

export const LmdbQuery: any = new Proxy({} as any, {
  get(_, prop: string) { return lmdbQueryMod().LmdbQuery[prop]; },
  construct(_, args) { return new (lmdbQueryMod().LmdbQuery)(...args); },
});

let _hydrateMod: any;
function hydrateMod() {
  if (!_hydrateMod) _hydrateMod = getHostModule('hydrate-sharded');
  return _hydrateMod;
}

export function hydrateSharded(...args: any[]): Promise<void> { return hydrateMod().hydrateSharded(...args); }

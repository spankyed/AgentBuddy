import { getHostModule } from '../runtime/host';

let _graphMod: any;
function graphMod() {
  if (!_graphMod) _graphMod = getHostModule('ears-graph');
  return _graphMod;
}

export function wouldCreateCycle(...args: any[]) { return graphMod().wouldCreateCycle(...args); }

let _entityUtilsMod: any;
function entityUtilsMod() {
  if (!_entityUtilsMod) _entityUtilsMod = getHostModule('entity-utils');
  return _entityUtilsMod;
}

export function getTimestamp(...args: any[]) { return entityUtilsMod().getTimestamp(...args); }
export function generateShortCode(...args: any[]) { return entityUtilsMod().generateShortCode(...args); }
export function generateLabelWithCount(...args: any[]) { return entityUtilsMod().generateLabelWithCount(...args); }
export function filterSystemFields(...args: any[]) { return entityUtilsMod().filterSystemFields(...args); }

let _queryMod: any;
function queryMod() {
  if (!_queryMod) _queryMod = getHostModule('ears-query');
  return _queryMod;
}

export function b64Encode(...args: any[]) { return queryMod().b64Encode(...args); }
export function b64Decode(...args: any[]) { return queryMod().b64Decode(...args); }

let _lmdbQueryMod: any;
function lmdbQueryMod() {
  if (!_lmdbQueryMod) _lmdbQueryMod = getHostModule('lmdb-query');
  return _lmdbQueryMod;
}

export function getLmdbQuery() { return lmdbQueryMod().LmdbQuery; }
export const LmdbQuery: any = new Proxy({} as any, {
  get(_, prop: string) { return lmdbQueryMod().LmdbQuery[prop]; },
  construct(_, args) { return new (lmdbQueryMod().LmdbQuery)(...args); },
});

let _hydrateMod: any;
function hydrateMod() {
  if (!_hydrateMod) _hydrateMod = getHostModule('hydrate-sharded');
  return _hydrateMod;
}

export function hydrateSharded(...args: any[]) { return hydrateMod().hydrateSharded(...args); }

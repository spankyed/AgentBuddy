import { getHostModule } from '../runtime/host.js';

export { wouldCreateCycle } from './graph.js';
export { getTimestamp, generateShortCode, generateLabelWithCount, filterSystemFields } from './entity-utils.js';
export { b64Encode, b64Decode } from './query.js';

// LMDB lifecycle delegates — host-provided, stay in API
let _attrStorageMod: any;
function attrStorageMod() {
  if (!_attrStorageMod) _attrStorageMod = getHostModule('attribute-storage');
  return _attrStorageMod;
}

export function resetLmdbFiles(): Promise<void> { return attrStorageMod().resetLmdbFiles(); }
export function closePersistence(): void { return attrStorageMod().closePersistence(); }
export function reinitializeLmdb(): void { return attrStorageMod().reinitializeLmdb(); }
export const envs: any = /*#__PURE__*/ new Proxy({} as any, { get(_, p) { return attrStorageMod().envs[p]; } });
export const policy: any = /*#__PURE__*/ new Proxy({} as any, { get(_, p) { return attrStorageMod().policy[p]; } });
export const persistence: any = /*#__PURE__*/ new Proxy({} as any, { get(_, p) { return attrStorageMod().persistence[p]; } });

let _lmdbQueryMod: any;
function lmdbQueryMod() {
  if (!_lmdbQueryMod) _lmdbQueryMod = getHostModule('lmdb-query');
  return _lmdbQueryMod;
}

export const LmdbQuery: any = /*#__PURE__*/ new Proxy({} as any, {
  get(_, prop: string) { return lmdbQueryMod().LmdbQuery[prop]; },
  construct(_, args) { return new (lmdbQueryMod().LmdbQuery)(...args); },
});

let _hydrateMod: any;
function hydrateMod() {
  if (!_hydrateMod) _hydrateMod = getHostModule('hydrate-sharded');
  return _hydrateMod;
}

export function hydrateSharded(...args: any[]): Promise<void> { return hydrateMod().hydrateSharded(...args); }

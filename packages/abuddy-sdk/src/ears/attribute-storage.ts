import { getHostModule } from '../runtime/host';

let _mod: any;
function mod() {
  if (!_mod) _mod = getHostModule('attribute-storage');
  return _mod;
}

export function getAttr(...args: any[]) { return mod().getAttr(...args); }
export function removeRelation(...args: any[]) { return mod().removeRelation(...args); }
export function getEntitiesOfType(...args: any[]) { return mod().getEntitiesOfType(...args); }
export function getAll(...args: any[]) { return mod().getAll(...args); }
export function getAllEntityTypes(...args: any[]) { return mod().getAllEntityTypes(...args); }
export function getAllAttributeKinds(...args: any[]) { return mod().getAllAttributeKinds(...args); }
export function getAllRelationKinds(...args: any[]) { return mod().getAllRelationKinds(...args); }
export function getAttributeStats(...args: any[]) { return mod().getAttributeStats(...args); }
export function resetLmdbFiles(...args: any[]) { return mod().resetLmdbFiles(...args); }
export function clearMemory(...args: any[]) { return mod().clearMemory(...args); }
export function closePersistence(...args: any[]) { return mod().closePersistence(...args); }
export function reinitializeLmdb(...args: any[]) { return mod().reinitializeLmdb(...args); }

export function getEnvs() { return mod().envs; }
export function getPolicy() { return mod().policy; }
export function getPersistence() { return mod().persistence; }

export const envs: any = new Proxy({} as any, { get(_, p) { return mod().envs[p]; } });
export const policy: any = new Proxy({} as any, { get(_, p) { return mod().policy[p]; } });
export const persistence: any = new Proxy({} as any, { get(_, p) { return mod().persistence[p]; } });

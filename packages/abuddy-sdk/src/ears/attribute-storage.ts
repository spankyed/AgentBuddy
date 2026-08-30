import { getHostModule } from '../runtime/host';
import type { EARS } from '../types/entities';

let _mod: any;
function mod() {
  if (!_mod) _mod = getHostModule('attribute-storage');
  return _mod;
}

export function getAttr(id: EARS.EntityId, kind: string): EARS.AttributeValue[] | null {
  return mod().getAttr(id, kind);
}

export function removeRelation(...args: any[]): void {
  return mod().removeRelation(...args);
}

export function getEntitiesOfType(entityType: EARS.Entity): EARS.EntityId[] {
  return mod().getEntitiesOfType(entityType);
}

export function getAll(id: EARS.EntityId): Record<string, unknown> {
  return mod().getAll(id);
}

export function getAllEntityTypes(): any[] {
  return mod().getAllEntityTypes();
}

export function getAllAttributeKinds(): string[] {
  return mod().getAllAttributeKinds();
}

export function getAllRelationKinds(): string[] {
  return mod().getAllRelationKinds();
}

export function getAttributeStats(kind: string): { entityCount: number; totalValues: number } {
  return mod().getAttributeStats(kind);
}

export function resetLmdbFiles(): void { return mod().resetLmdbFiles(); }
export function clearMemory(): void { return mod().clearMemory(); }
export function closePersistence(): void { return mod().closePersistence(); }
export function reinitializeLmdb(): void { return mod().reinitializeLmdb(); }

export const envs: any = new Proxy({} as any, { get(_, p) { return mod().envs[p]; } });
export const policy: any = new Proxy({} as any, { get(_, p) { return mod().policy[p]; } });
export const persistence: any = new Proxy({} as any, { get(_, p) { return mod().persistence[p]; } });

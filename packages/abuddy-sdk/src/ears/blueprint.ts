import { getHostModule } from '../runtime/host';
import type { EARS } from '../types/entities';

let _mod: any;
function mod() {
  if (!_mod) _mod = getHostModule('ears-blueprint');
  return _mod;
}

export interface Blueprint {
  entity: EARS.Entity;
  attrs?: Record<string, unknown>;
  roles?: EARS.RoleKind[];
  uniqueRoles?: EARS.RoleKind[];
  rels?: Array<{
    kind: EARS.RelKind;
    target: Blueprint | EARS.EntityId;
    info?: unknown;
  }>;
}

export interface BlueprintBuilder {
  attr(k: string, v: unknown): BlueprintBuilder;
  grant(r: EARS.RoleKind): BlueprintBuilder;
  ensure(r: EARS.RoleKind): BlueprintBuilder;
  link(kind: EARS.RelKind, target: Blueprint | EARS.EntityId, info?: unknown): BlueprintBuilder;
  build(): Blueprint;
}

export function bp(entity: EARS.Entity): BlueprintBuilder {
  return mod().bp(entity);
}

export function spawn(root: Blueprint, opts?: { dedupe?: boolean }): EARS.EntityId {
  return mod().spawn(root, opts);
}

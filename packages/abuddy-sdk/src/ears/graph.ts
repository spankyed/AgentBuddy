import { getHostModule } from '../runtime/host';
import type { EARS } from '../types/entities';

let _mod: any;
function mod() {
  if (!_mod) _mod = getHostModule('ears-graph');
  return _mod;
}

export function descendants(start: EARS.EntityId, relKind: EARS.RelKind): EARS.EntityId[] {
  return mod().descendants(start, relKind);
}

export function ancestors(start: EARS.EntityId, relKind: EARS.RelKind): EARS.EntityId[] {
  return mod().ancestors(start, relKind);
}

export function rootParent(start: EARS.EntityId, relKind: EARS.RelKind): EARS.EntityId {
  return mod().rootParent(start, relKind);
}

export function linkSymmetric(a: EARS.EntityId, b: EARS.EntityId, kind: EARS.RelKind, info?: unknown): void {
  return mod().linkSymmetric(a, b, kind, info);
}

export function topoSort(roots: EARS.EntityId[], kind: EARS.RelKind, filterType?: EARS.Entity): EARS.EntityId[] {
  return mod().topoSort(roots, kind, filterType);
}

export function shortestPath(src: EARS.EntityId, tgt: EARS.EntityId, kinds: EARS.RelKind[]): EARS.EntityId[] | null {
  return mod().shortestPath(src, tgt, kinds);
}

export function leaves(kind: EARS.RelKind, filterType?: EARS.Entity): EARS.EntityId[] {
  return mod().leaves(kind, filterType);
}

export function lowestCommonAncestor(a: EARS.EntityId, b: EARS.EntityId, treeKind: EARS.RelKind): EARS.EntityId | null {
  return mod().lowestCommonAncestor(a, b, treeKind);
}

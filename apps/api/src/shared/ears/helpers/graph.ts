// graph.ts – high-level graph algorithms on top of qx / edgeStore
import { qx } from "@/shared/ears/helpers/query";
import { edgeStore } from "@/shared/ears/helpers/edge-store";
import { EARS } from "@/shared/ears/types";

/*━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 1 ▸ Ancestors / Descendants
 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export function descendants(
  start: EARS.EntityId,
  relKind: EARS.RelKind,
): EARS.EntityId[] {
  const seen = new Set<EARS.EntityId>();
  const stack = [start];

  while (stack.length) {
    const node = stack.pop()!;
    for (const child of qx(node).linksTo(relKind, EARS.Entity.Thread).ids()) {
      if (!seen.has(child)) {
        seen.add(child);
        stack.push(child);
      }
    }
  }
  seen.delete(start);
  return [...seen];
}

export function ancestors(
  start: EARS.EntityId,
  relKind: EARS.RelKind,
): EARS.EntityId[] {
  const seen = new Set<EARS.EntityId>();
  const stack = [start];

  while (stack.length) {
    const node = stack.pop()!;
    for (const parent of qx(node)
      .linksTo(relKind, EARS.Entity.Thread, /* asSource = */ false)
      .ids()) {
      if (!seen.has(parent)) {
        seen.add(parent);
        stack.push(parent);
      }
    }
  }
  seen.delete(start);
  return [...seen];
}

/*━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 2 ▸ Root parent  (first ancestor with no further parent)
 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export function rootParent(
  start: EARS.EntityId,
  relKind: EARS.RelKind,
): EARS.EntityId {
  let cur = start;
  // walk up until we can’t
  while (true) {
    const parent = qx(cur)
      .linksTo(relKind, EARS.Entity.Thread, /* asSource = */ false)
      .first();
    if (!parent) break;
    cur = parent;
  }
  return cur;
}

/*━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 3 ▸ Cycle guard
 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export function wouldCreateCycle(
  src: EARS.EntityId,
  tgt: EARS.EntityId,
  relKinds: readonly EARS.RelKind[],
): boolean {
  // DFS from tgt following *any* of the provided kinds;
  // if we can reach src, adding (src ─kind─► tgt) would close a loop.
  const stack = [tgt];
  const seen  = new Set<EARS.EntityId>();

  while (stack.length) {
    const node = stack.pop()!;
    if (node === src) return true;
    for (const k of relKinds) {
      qx(node)
        .linksTo(k, EARS.Entity.Thread) // children
        .ids()
        .filter((n: EARS.EntityId) => !seen.has(n))
        .forEach((n: EARS.EntityId) => {
          seen.add(n);
          stack.push(n);
        });
    }
  }
  return false;
}

/*━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 4 ▸ Symmetric edge helper (DUPLICATES, RELATES_TO)
 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export function linkSymmetric(
  a: EARS.EntityId,
  b: EARS.EntityId,
  kind: EARS.RelKind,
) {
  if (a === b) throw new Error("Self-link refused");
  const [lo, hi] = a < b ? [a, b] : [b, a];
  // idempotent set
  edgeStore.linkOne(lo, kind, hi);
}

/* inside transaction.ts tx's relation section */
// safeLink(kind: EARS.RelKind, target: EARS.EntityId) {
//   // 1 ▸ acyclic guards
//   if (kind === EARS.RelKind.CONTAINS) {
//     if (wouldCreateCycle(id, target, [kind]))
//       throw new Error("CONTAINS would create a loop");
//   }
//   if (kind === EARS.RelKind.BLOCKS || kind === EARS.RelKind.DEPENDS_ON) {
//     if (wouldCreateCycle(id, target, [EARS.RelKind.BLOCKS, EARS.RelKind.DEPENDS_ON]))
//       throw new Error("Edge would create a dependency cycle");
//   }

//   // 2 ▸ symmetric kinds
//   if (kind === EARS.RelKind.DUPLICATES || kind === EARS.RelKind.RELATES_TO) {
//     linkSymmetric(id, target, kind);
//     return self;
//   }

//   // 3 ▸ default
//   return self.linkOne(kind, target);
// }
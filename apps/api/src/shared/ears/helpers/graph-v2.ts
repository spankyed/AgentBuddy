// graph.ts – high-level graph algorithms
import { qx } from "@/shared/ears/helpers/query";
import { relationIndex } from "@/shared/ears/relation-index";
import { EARS } from "@/shared/ears/types";

/* helper: iterate neighbours given a list of relation kinds */
const neighbours = (
  id: EARS.EntityId,
  kinds: readonly EARS.RelKind[],
  asSource = true,
): EARS.EntityId[] =>
  kinds.flatMap(k =>
    qx(id).linksTo(k, EARS.Entity.Thread, asSource).ids(),
  );

/*━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 1 ▸ Cycle detection guard (multi-kind)
 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export function wouldCreateCycle(
  src: EARS.EntityId,
  tgt: EARS.EntityId,
  kinds: readonly EARS.RelKind[],
): boolean {
  // DFS from tgt; if we can reach src, adding the edge closes a loop.
  const seen = new Set<EARS.EntityId>();
  const stack = [tgt];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === src) return true;
    for (const n of neighbours(node, kinds)) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return false;
}

/*━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 2 ▸ Topological sort  (throws if a cycle is hit)
 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export function topoSort(
  roots: EARS.EntityId[],
  kind: EARS.RelKind,
): EARS.EntityId[] {
  // Kahn’s algorithm
  const outgoing = new Map<EARS.EntityId, Set<EARS.EntityId>>();
  const incoming = new Map<EARS.EntityId, number>();

  const all = new Set<EARS.EntityId>(roots);
  const collect = (id: EARS.EntityId) => {
    const kids = new Set<EARS.EntityId>(qx(id).linksTo(kind, EARS.Entity.Thread).ids());
    outgoing.set(id, kids);
    kids.forEach(k => {
      incoming.set(k, (incoming.get(k) ?? 0) + 1);
      if (!outgoing.has(k)) collect(k);       // BFS the DAG
      all.add(k);
    });
  };
  roots.forEach(collect);

  const queue = [...all].filter(id => !incoming.has(id));
  const ordered: EARS.EntityId[] = [];

  while (queue.length) {
    const n = queue.shift()!;
    ordered.push(n);
    for (const m of outgoing.get(n) ?? []) {
      incoming.set(m, (incoming.get(m) ?? 0) - 1);
      if (incoming.get(m) === 0) queue.push(m);
    }
  }
  if (ordered.length !== all.size)
    throw new Error("Cycle detected – topological order impossible");
  return ordered;
}

/*━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 3 ▸ Shortest path (unweighted) over multiple kinds
 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export function shortestPath(src: EARS.EntityId, tgt: EARS.EntityId, kinds: EARS.RelKind[]): EARS.EntityId[] | null {
  if (src === tgt) return [src];

  const front = new Map<EARS.EntityId, EARS.EntityId>(); front.set(src, src);
  const back = new Map<EARS.EntityId, EARS.EntityId>(); back.set(tgt, tgt);
  const nbrs = (id: EARS.EntityId) => neighbours(id, kinds);

  let layer = [src], revLayer = [tgt];

  while (layer.length && revLayer.length) {
    // expand smaller frontier
    if (layer.length <= revLayer.length) {
      const next: EARS.EntityId[] = [];
      for (const v of layer)
        for (const n of nbrs(v))
          if (!front.has(n)) {
            front.set(n, v);
            if (back.has(n)) return join(n);
            next.push(n);
          }
      layer = next;
    } else {
      const next: EARS.EntityId[] = [];
      for (const v of revLayer)
        for (const n of nbrs(v))
          if (!back.has(n)) {
            back.set(n, v);
            if (front.has(n)) return join(n);
            next.push(n);
          }
      revLayer = next;
    }
  }
  return null;

  function join(meet: EARS.EntityId): EARS.EntityId[] {
    const path = [meet];
    for (let v = meet; v !== src; v = front.get(v)!) path.unshift(front.get(v)!);
    for (let v = meet; v !== tgt; v = back.get(v)!)  path.push(back.get(v)!);
    return path;
  }
}

/*━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 4 ▸ Leaves (nodes with *no* outgoing edges of a kind)
 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export function leaves(
  kind: EARS.RelKind,
  filterType: EARS.Entity = EARS.Entity.Thread,
): EARS.EntityId[] {
  const all = new Set<EARS.EntityId>(
    qx(filterType).ids(),
  );
  const hasOut = new Set<EARS.EntityId>();

  for (const id of all) {
    for (const child of qx(id).linksTo(kind, filterType).ids()) {
      hasOut.add(id);
    }
  }
  return [...all].filter(id => !hasOut.has(id));
}

/*━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 5 ▸ Lowest common ancestor in a tree
 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export function lowestCommonAncestor(
  a: EARS.EntityId,
  b: EARS.EntityId,
  treeKind = EARS.RelKind.CONTAINS,
): EARS.EntityId | null {
  const pathToRoot = (id: EARS.EntityId) => {
    const path: EARS.EntityId[] = [];
    let cur: EARS.EntityId | null = id;
    while (cur) {
      path.push(cur);
      cur = qx(cur)
        .linksTo(treeKind, EARS.Entity.Thread, false)
        .first();
    }
    return path;
  };

  const A = pathToRoot(a);
  const B = new Set(pathToRoot(b));
  return A.find(node => B.has(node)) ?? null;
}

// import {
//   wouldCreateCycle,
//   topoSort,
//   shortestPath,
//   leaves,
//   lowestCommonAncestor,
// } from "@/shared/ears/graph";

// /* 1 ▸ guard before linking */
// if (wouldCreateCycle(source, target, [
//       EARS.RelKind.BLOCKS,
//       EARS.RelKind.DEPENDS_ON,
//     ])) throw new Error("cycle!");


// /* 2 ▸ produce build order */
// const ordered = topoSort([rootId], EARS.RelKind.DEPENDS_ON);


// /* 3 ▸ explain why A blocks Z */
// const why = shortestPath(A, Z, [
//   EARS.RelKind.BLOCKS,
//   EARS.RelKind.DEPENDS_ON,
// ]);


// /* 4 ▸ tasks with no subtasks */
// const endLeaves = leaves(EARS.RelKind.CONTAINS);


// /* 5 ▸ common folder */
// const lca = lowestCommonAncestor(doc1, doc2);
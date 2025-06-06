/*─────────────────────────────────────────────────────────────
 * qx.ts – fluent *query* wrapper around attribute‑store (v4)
 *─────────────────────────────────────────────────────────────*/
import {
  /* entity scopes */ getAllEntities, getEntitiesOfType,
  /* attrs / roles */ getAttr, getAttrs, getRoles,
  /* look‑ups      */ queryEntitiesByAttribute,
  queryEntitiesInRelationTo,
  queryEntitiesByRelationTo,
} from "@/shared/ears/attribute-storage";

import { relationIndex } from "@/shared/ears/relation-index";
import { EARS } from "@/shared/ears/types";
import { asArr } from "@/shared/utils";

/*──────── helpers ────────*/
const isEntity = (v: unknown): v is EARS.Entity =>
  Object.values(EARS.Entity).includes(v as EARS.Entity);

const hasPrefix = (t: EARS.Entity) => (id: EARS.EntityId) =>
  id.startsWith(`${t}-`);


const liftOne = <F extends (...args: any[]) => any>(many: F) =>
  (...a: Parameters<F>) => (many as any)(...a)[0] ?? null;

/*──────── entry ────────*/
export const qx = (
  seed?:
    | EARS.EntityId
    | EARS.Entity
    | readonly EARS.Entity[]
    | readonly EARS.EntityId[],
) => {
  let ids: readonly EARS.EntityId[];

  if (seed === undefined) {
    ids = getAllEntities();
  } else if (Array.isArray(seed)) {
    const allEntities = (seed as readonly unknown[]).every(isEntity);
    ids = allEntities
      ? (seed as readonly EARS.Entity[]).flatMap(t => getEntitiesOfType(t))
      : [...(seed as readonly EARS.EntityId[])];
  } else if (isEntity(seed)) {
    ids = getEntitiesOfType(seed);
  } else {
    ids = [seed as EARS.EntityId];
  }

  /* create a new immutable cursor */
  const next = (newIds: readonly EARS.EntityId[]) => qx(newIds);

  const self = {
    /*─ filters ─*/
    ofType: (t: EARS.Entity) => next(ids.filter(hasPrefix(t))),

    inIds: (sub: readonly EARS.EntityId[]) => next(ids.filter(i => sub.includes(i))),

    where: (k: EARS.AttrKind, v?: unknown) => {
      const picked = v === undefined
        ? ids.filter(i => getAttrs(i, k).length)
        : ids.filter(i => queryEntitiesByAttribute(k, v).includes(i));
      return next(picked);
    },

    withRole: (r: string) => next(ids.filter(i => getRoles(i).includes(r))),

    relatedTo: (target: EARS.EntityId) =>
      next(ids.filter(i => queryEntitiesInRelationTo(target).includes(i))),

    related: (kind: string, other: EARS.EntityId, asSrc = false) =>
      next(ids.filter(i => queryEntitiesByRelationTo(kind, other, asSrc).includes(i))),

    /*─ graph traversal ─*/
    linksTo: (
      relKinds: string | readonly string[],
      tgtType: EARS.Entity | readonly EARS.Entity[],
      asSrc = true,
    ) => {
      const kinds = asArr(relKinds);
      const targets = asArr(tgtType);
      const matches = (id: EARS.EntityId) => targets.some(t => hasPrefix(t)(id));

      const out = new Set<EARS.EntityId>();
      for (const src of ids) for (const k of kinds)
        queryEntitiesByRelationTo(k, src, asSrc)
          .filter(matches)
          .forEach(i => {
            if (i !== src) out.add(i);           /* ➌ guard reflexive links */
          });

      return qx([...out]);
    },

    /*─ low‑level links array ─*/
    links: <K extends string>(
      relKinds: K | readonly K[],
      tgtType: EARS.Entity | readonly EARS.Entity[],
      asSrc = true,
    ): Array<{ relation: K; id: EARS.EntityId }> => {
      const kinds = asArr(relKinds);
      const targets = asArr(tgtType);
      const matches = (id: EARS.EntityId) => targets.some(t => hasPrefix(t)(id));

      const out: Array<{ relation: K; id: EARS.EntityId }> = [];
      for (const src of ids) for (const k of kinds)
        queryEntitiesByRelationTo(k, src, asSrc)
          .filter(matches)
          .forEach(id => out.push({ relation: k as K, id }));

      return out;
    },

    /*─ relation detail helpers ─*/
    edgeIds: (
      kinds?: string | readonly string[],
      asSrc = true,
    ): EARS.EntityId[] => {
      const ksInput = kinds ? asArr(kinds) : (Object.keys(relationIndex) as readonly string[]);
      const ks = ksInput.filter(k => relationIndex[k] !== undefined); /* ➊ validate once */
      const out = new Set<EARS.EntityId>();
      for (const i of ids) for (const k of ks) {
        const dir = relationIndex[k]!;           // safe: ks filtered above
        (asSrc ? dir.bySource[i] : dir.byTarget[i])?.forEach(r => out.add(r));
      }
      return [...out];
    },

    /*─ projections ─*/
    pick: <A extends readonly string[]>(f: A) =>
      ids.map(i => {
        const o: any = { id: i };
        f.forEach(k => {
          if (k === "id") return;
          o[k] = getAttr(i, EARS.AttrKind.Custom(k));
        });
        return o as { id: EARS.EntityId } & { [K in A[number]]: unknown };
      }),
    pickOne: liftOne(function <A extends readonly string[]>(f: A) {
      return self.pick(f);
    }),
    rows: <A extends readonly string[]>(f: A) => self.pick(f),

    /*─ traverse + project ─*/
    linkRows: <K extends string, A extends readonly string[]>(
      relKinds: K | readonly K[],
      tgtType: EARS.Entity | readonly EARS.Entity[],
      fields: A,
    ) => {
      const manyKinds = asArr(relKinds).length > 1;
      return self.links(relKinds, tgtType).map(({ relation, id }) => ({
        ...(manyKinds ? { relation } : null),
        ...qx(id).pickOne(fields)!,
      }));
    },

    /*─ list shaping helpers ─*/
    orderBy: (
      field: string,
      dir: "asc" | "desc" = "asc",
    ) => {
      const kind = EARS.AttrKind.Custom(field);
      const cmp = (a: unknown, b: unknown) => {
        if (a === b) return 0;
        if (a === undefined) return 1;
        if (b === undefined) return -1;
        if (typeof a === "number" && typeof b === "number") return a - b;
        return String(a).localeCompare(String(b));
      };
      const sorted = [...ids].sort((aId, bId) => {
        const res = cmp(getAttr(aId, kind), getAttr(bId, kind));
        return dir === "asc" ? res : -res;
      });
      return next(sorted);
    },

    limit: (n: number) => next(ids.slice(0, n)),

    /*─ misc extractors ─*/
    ids: () => [...ids],
    count: () => ids.length,
    first: () => ids[0] ?? null,
    last: () => ids.length ? ids[ids.length - 1] : null,
    exists: () => ids.length > 0,

    /*─ functional helpers ─*/
    map: <T>(fn: (i: EARS.EntityId) => T) => ids.map(fn),
    forEach: (fn: (i: EARS.EntityId) => void) => { ids.forEach(fn); return self; },
    reduce: <T>(fn: (a: T, i: EARS.EntityId) => T, init: T) => ids.reduce(fn, init),
  } as const;

  return self;
};

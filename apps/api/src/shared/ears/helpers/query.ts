/*─────────────────────────────────────────────────────────────
 * qx.ts – fluent *query* wrapper around attribute‑store (v2)
 *─────────────────────────────────────────────────────────────*/
import {
  /* entity scopes */ getAllEntities, getEntitiesOfType,
  /* attrs / roles */ getAttr, getAttrs, getAll, getRoles,
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
  /* resolve initial id list (immutable) */
  const ids: EARS.EntityId[] = (() => {
    if (seed === undefined) return getAllEntities();

    if (Array.isArray(seed)) {
      return (seed as readonly unknown[]).every(isEntity)
        ? (seed as readonly EARS.Entity[]).flatMap(getEntitiesOfType)
        : [...(seed as readonly EARS.EntityId[])];
    }

    return isEntity(seed) ? getEntitiesOfType(seed) : [seed as EARS.EntityId];
  })();

  /* handy creator for new cursors */
  const nxt = (list: EARS.EntityId[]) => qx(list);

  const self = {
    /*─ filters (all immutable) ─*/
    ofType: (t: EARS.Entity) => nxt(ids.filter(hasPrefix(t))),
    inIds: (sub: EARS.EntityId[]) => nxt(ids.filter(i => sub.includes(i))),
    where: (k: EARS.AttrKind, v?: unknown) => nxt(v === undefined
      ? ids.filter(i => getAttrs(i, k).length)
      : ids.filter(i => queryEntitiesByAttribute(k, v).includes(i))),
    withRole: (r: string) => nxt(ids.filter(i => getRoles(i).includes(r))),
    relatedTo: (target: EARS.EntityId) => nxt(ids.filter(i => queryEntitiesInRelationTo(target).includes(i))),
    related: (kind: string, other: EARS.EntityId, asSrc = false) =>
      nxt(ids.filter(i => queryEntitiesByRelationTo(kind, other, asSrc).includes(i))),

    /*─ graph traversal retains immutability ─*/
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
          .forEach(id => out.add(id));

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
      const ks = kinds ? asArr(kinds) : Object.keys(relationIndex);
      const out = new Set<EARS.EntityId>();
      for (const i of ids) for (const k of ks) {
        const dir = relationIndex[k];
        if (!dir) continue;
        (asSrc ? dir.bySource[i] : dir.byTarget[i])?.forEach(r => out.add(r));
      }
      return [...out];
    },

    /*─ projections ─*/
    pick: <A extends readonly string[]>(fields: A) =>
      ids.map(id => {
        const o: any = { id };
        fields.forEach(k => {
          if (k === "id") return;
          o[k] = getAttr(id, EARS.AttrKind.Custom(k));
        });
        return o as { id: EARS.EntityId } & { [K in A[number]]: unknown };
      }),
    pickOne: liftOne(<A extends readonly string[]>(f: A) => self.pick(f)),
    rows: <A extends readonly string[]>(f: A) => self.pick(f),

    /*─ traverse + project in one call ─*/
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
        return typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b));
      };
      const sorted = [...ids].sort((aId, bId) => {
        const res = cmp(getAttr(aId, kind), getAttr(bId, kind));
        return dir === "asc" ? res : -res;
      });
      return qx(sorted);
    },

    limit: (n: number) => nxt(ids.slice(0, n)),

    /*─ misc extractors ─*/
    ids: () => [...ids],
    count: () => ids.length,
    first: () => ids[0] ?? null,
    last: () => ids.at(-1) ?? null,
    exists: () => ids.length > 0,

    /*─ functional helpers (leave mutable variations intact) ─*/
    map: <T>(fn: (i: EARS.EntityId) => T) => ids.map(fn),
    forEach: (fn: (i: EARS.EntityId) => void) => (ids.forEach(fn), self),
    reduce: <T>(fn: (a: T, i: EARS.EntityId) => T, init: T) => ids.reduce(fn, init),
  };

  return self;
};

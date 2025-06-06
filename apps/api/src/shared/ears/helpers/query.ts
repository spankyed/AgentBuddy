/*─────────────────────────────────────────────────────────────
 * qx.ts – fluent *query* wrapper around attribute‑store
 *─────────────────────────────────────────────────────────────*/
import {
  /* entity scopes */ getAllEntities, getEntitiesOfType,
  /* attrs / roles */ getAttr, getAttrs, getAll, getRoles,
  /* look‑ups      */ queryEntitiesByAttribute,
                     queryEntitiesInRelationTo,
                     queryEntitiesByRelationTo,
} from "@/shared/ears/attribute-storage";

import { relationIndex } from "@/shared/ears/relation-index";
import { EARS }          from "@/shared/ears/types";

/*──────── helpers ────────*/
const isEntity  = (v: unknown): v is EARS.Entity =>
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
    | readonly EARS.Entity[]       // ← NEW
    | readonly EARS.EntityId[],
) => {
  let ids: EARS.EntityId[];

  if (seed === undefined) {
    ids = getAllEntities();
  } else if (Array.isArray(seed)) {
    // decide whether the array is a list of entity TYPES or actual IDs
    const allEntities = (seed as readonly unknown[]).every(isEntity);

    ids = allEntities
      ? (seed as readonly EARS.Entity[])
        .flatMap(t => getEntitiesOfType(t))
      : [...(seed as readonly EARS.EntityId[])];

  } else if (isEntity(seed)) {
    ids = getEntitiesOfType(seed);
  } else {
    ids = [seed as EARS.EntityId];
  }

  const self = {
    /*─ filters ─*/
    ofType  : (t: EARS.Entity) => (ids = ids.filter(hasPrefix(t)), self),
    inIds   : (sub: EARS.EntityId[]) =>
      (ids = ids.filter(i => sub.includes(i)), self),

    where: (k: EARS.AttrKind, v?: unknown) =>
      (ids = v === undefined
        ? ids.filter(i => getAttrs(i, k).length)
        : ids.filter(i =>
            queryEntitiesByAttribute(k, v).includes(i),
          ), self),

    withRole: (r: string) =>
      (ids = ids.filter(i => getRoles(i).includes(r)), self),

    relatedTo: (target: EARS.EntityId) =>
      (ids = ids.filter(i => queryEntitiesInRelationTo(target).includes(i)), self),

    related: (kind: string, other: EARS.EntityId, asSrc = false) =>
      (ids = ids.filter(i =>
        queryEntitiesByRelationTo(kind, other, asSrc).includes(i)), self),

    /*─ graph traversal retains qx cursor ─*/
    linksTo: (
      relKinds: string | readonly string[],
      tgtType : EARS.Entity,
      asSrc   = true,
    ) => {
      const kinds = Array.isArray(relKinds) ? relKinds : [relKinds];
      const nxt   = new Set<EARS.EntityId>();
      for (const src of ids) for (const k of kinds)
        queryEntitiesByRelationTo(k, src, asSrc)
          .filter(hasPrefix(tgtType))
          .forEach(i => nxt.add(i));
      return qx([...nxt]);
    },

    /*─ low‑level links array ─*/
    links: <K extends string>(
      relKinds: K | readonly K[],
      tgtType: EARS.Entity | readonly EARS.Entity[],  // ← accept single or many
      asSrc = true,
    ): Array<{ relation: K; id: EARS.EntityId }> => {
      const kinds = Array.isArray(relKinds) ? relKinds : [relKinds];
      const targets = Array.isArray(tgtType) ? tgtType : [tgtType];     // ← NEW
      const matches = (id: EARS.EntityId) => targets.some(t => hasPrefix(t)(id));

      const out: Array<{ relation: K; id: EARS.EntityId }> = [];
      for (const src of ids) for (const k of kinds)
        queryEntitiesByRelationTo(k, src, asSrc)
          .filter(matches)                                                  // ← NEW
          .forEach(id => out.push({ relation: k as K, id }));

      return out;
    },

    /*─ relation detail helpers ─*/
    edgeIds: (
      kinds?: string | readonly string[],
      asSrc = true,
    ): EARS.EntityId[] => {
      const ks = kinds ? (Array.isArray(kinds) ? kinds : [kinds])
                      : Object.keys(relationIndex);
      const out = new Set<EARS.EntityId>();
      for (const i of ids) for (const k of ks) {
        const dir = relationIndex[k];
        if (!dir) continue;
        (asSrc ? dir.bySource[i] : dir.byTarget[i])?.forEach(r => out.add(r));
      }
      return [...out];
    },

    /*─ projections ─*/
    pick: <A extends readonly string[]>(f: A) =>
      ids.map(i => {
        const o: any = { id: i };
        f.forEach(k => {
          if (k === 'id') return;               // <── don’t clobber it
          o[k] = getAttr(i, EARS.AttrKind.Custom(k));
        });
        return o as { id: EARS.EntityId } & { [K in A[number]]: unknown };
      }),
    pickOne: liftOne(function <A extends readonly string[]>(f: A) {
      return self.pick(f);
    }),
    rows   : <A extends readonly string[]>(f: A) => self.pick(f),

    /*─ traverse + project in one call ─*/
    linkRows: <K extends string, A extends readonly string[]>(
      relKinds: K | readonly K[],
      tgtType : EARS.Entity,
      fields  : A,
    ) => {
      const manyKinds = Array.isArray(relKinds) && relKinds.length > 1;
      return self.links(relKinds, tgtType).map(({ relation, id }) => ({
        ...(manyKinds ? { relation } : null),
        ...qx(id).pickOne(fields)!,
      }));
    },

    /*─ list shaping helpers ─*/
    orderBy : (
      field: string,
      dir: "asc" | "desc" = "asc",
    ) => {
      // treat every plain string as a Custom attribute‑kind
      // (keeps call‑site terse: .orderBy("timestamp"))
      const kind = EARS.AttrKind.Custom(field);

      // generic compare that works for numbers or strings
      const cmp = (a: unknown, b: unknown) => {
        if (a === b)            return 0;
        if (a === undefined)    return 1;          // push blanks last
        if (b === undefined)    return -1;
        if (typeof a === "number" && typeof b === "number")
          return a - b;
        return String(a).localeCompare(String(b));
      };

      ids.sort((aId, bId) => {
        const res = cmp(getAttr(aId, kind), getAttr(bId, kind));
        return dir === "asc" ? res : -res;
      });
      return self;                                  // keep the chain alive
    },
    limit : (n: number) =>
      (ids = ids.slice(0, n), self),

    /*─ misc extractors ─*/
    ids   : () => [...ids],
    count : () => ids.length,
    first : () => ids[0] ?? null,
    last  : () => ids.length ? ids[ids.length - 1] : null,
    exists: () => ids.length > 0,

    /*─ functional helpers ─*/
    map   : <T>(fn: (i: EARS.EntityId) => T) => ids.map(fn),
    forEach: (fn: (i: EARS.EntityId) => void) => (ids.forEach(fn), self),
    reduce : <T>(fn:(a:T,i:EARS.EntityId)=>T, init:T)=>ids.reduce(fn,init),
  };

  return self;
};
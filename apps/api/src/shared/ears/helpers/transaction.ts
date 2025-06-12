/*───────────────────────────────────────────────────────────────────────────
 * tx.ts – fluent *mutation* helper (safe & expressive v2)
 *───────────────────────────────────────────────────────────────────────────*/
import {
  destroyEntity,
  putAttr, mergeAttr, dropAttr, dropIf,
  grantRole, revokeRole,
  addRelation, updateRelation, removeRelation,
  createEntity,
  getRoles,               // for no‑op guards
} from "@/shared/ears/attribute-storage";

import { edgeStore } from "@/shared/ears/helpers/edge-store";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";

export function tx(typeOrId: EARS.Entity | EARS.EntityId) {
  const isNew = Object.values(EARS.Entity).includes(typeOrId as EARS.Entity);
  const id: EARS.EntityId = isNew
    ? createEntity(typeOrId as EARS.Entity)
    : (typeOrId as EARS.EntityId);

  const preventSelfLoop = (t: EARS.EntityId) => {
    if (t === id) throw new Error("tx.link(): source and target cannot be the same");
  };

  /*──────── core fluent surface ───────────*/
  const self = {
    /*─ attrs ─*/
    put: (k: EARS.AttrKind | string, v: unknown, i?: number) => {
      const kind = typeof k === "string" ? EARS.AttrKind.Custom(k) : k;
      putAttr(id, kind, v);
      return self;
    },
    merge: (k: EARS.AttrKind, v: unknown, i?: number) => (mergeAttr(id, k, v, i), self),
    drop: (k: EARS.AttrKind, i?: number) => (dropAttr(id, k, i), self),
    dropIf: (k: EARS.AttrKind, c: unknown) => (dropIf(id, k, c), self),

    /*─ roles ─*/
    grant: (r: string) => {
      if (!getRoles(id).includes(r)) grantRole(id, r);
      return self;
    },
    revoke: (r: string) => {
      if (getRoles(id).includes(r)) revokeRole(id, r);
      return self;
    },
    ensure: (r: string, scope?: readonly EARS.EntityId[]) => {
      // Only query if scope not provided
      const entities = scope ?? qx().withRole(r).ids();
      entities.forEach(e => revokeRole(e, r));
      grantRole(id, r);
      return self;
    },

    /*─ relations (raw) ─*/
    link: (k: EARS.RelKind, t: EARS.EntityId, info?: unknown) => {
      preventSelfLoop(t); // ! this is being reached
      addRelation(id, k, t, info);
      return self;
    },
    relPatch: (
      rel: EARS.EntityId,
      u: { sourceEntity?: EARS.EntityId; targetEntity?: EARS.EntityId; info?: unknown },
    ) => {
      updateRelation(rel, u.sourceEntity, u.targetEntity, u.info);
      return self;
    },
    unlink: (rel: EARS.EntityId) => (removeRelation(rel), self),

    /*─ criteria‑edges (edge‑store) ─*/
    linkOne: (k: EARS.RelKind, t: EARS.EntityId, info?: unknown) => {
      preventSelfLoop(t);
      edgeStore.linkOne(id, k, t, info);
      return self;
    },
    patchLink: (
      k: EARS.RelKind,
      t: EARS.EntityId,
      u: { newTarget: EARS.EntityId; newInfo?: unknown },
    ) => {
      edgeStore.patchOne(
        { sourceEntity: id, relationType: k, targetEntity: t },
        { newTarget: u.newTarget, newInfo: u.newInfo },
      );
      return self;
    },
    unlinkIf: (k: EARS.RelKind, t?: EARS.EntityId) => (
      edgeStore.unlink({ sourceEntity: id, relationType: k, targetEntity: t }),
      self
    ),
    unlinkWhere: (c?: { kind?: EARS.RelKind; target?: EARS.EntityId }) => (
      edgeStore.unlink({
        sourceEntity: id,
        targetEntity: c?.target,
        relationType: c?.kind,
      }),
      self
    ),

    /*─ entity lifecycle ─*/
    destroy: () => (destroyEntity(id), undefined as never),

    /*─ misc ─*/
    id: () => id,
  } as const;

  return self;
};

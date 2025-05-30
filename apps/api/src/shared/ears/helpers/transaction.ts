/*───────────────────────────────────────────────────────────────────────────
 * tx.ts – fluent *mutation* helper (now querying via qx)
 *───────────────────────────────────────────────────────────────────────────*/
import {
  destroyEntity,
  putAttr, mergeAttr, dropAttr, dropIf,
  grantRole, revokeRole,
  addRelation, updateRelation, removeRelation,
} from "@/shared/ears/attribute-storage";

import { edgeStore } from "@/shared/ears/helpers/edge-store";
import { qx }        from "@/shared/ears/helpers/query";
import { EARS }      from "@/shared/ears/types";
import { createEntity } from "../create-entity";

/** begin mutation session */
export const tx = (typeOrId: EARS.Entity | EARS.EntityId) => {
  const isNew = Object.values(EARS.Entity).includes(typeOrId as EARS.Entity);
  const id    = isNew ? createEntity(typeOrId as EARS.Entity)
                      : (typeOrId as EARS.EntityId);

  const self = {
    /*─ attrs ─*/
    put   :(k: EARS.AttrKind, v: unknown, i?: number)=> (putAttr(id,k,v),                 self),
    merge :(k: EARS.AttrKind, v: unknown, i?: number)=> (mergeAttr(id,k,v,i),             self),
    drop  :(k: EARS.AttrKind, i?: number)   => (dropAttr(id,k,i),                self),
    dropIf:(k: EARS.AttrKind, c: unknown)    => (dropIf(id,k,c),                  self),

    /*─ roles ─*/
    grant :(r: string)=> (grantRole(id,r), self),
    revoke:(r: string)=> (revokeRole(id,r), self),
    ensure:(r: string, scope = qx().withRole(r).ids()) =>
      (scope.forEach(e=>revokeRole(e,r)), grantRole(id,r), self),

    /*─ relations by rel‑ID ─*/
    link     :(k: EARS.RelKind,t: EARS.EntityId,i?: number)=> (addRelation(id,k,t,i),              self),
    relPatch :(rel: EARS.EntityId,u:{src: EARS.EntityId, tgt: EARS.EntityId, info?: unknown})=> (updateRelation(rel,u.src,u.tgt,u.info),     self),
    unlink   :(rel: EARS.EntityId)=>   (removeRelation(rel),                        self),

    /*─ criteria‑edges ─*/
    linkOne  :(k: EARS.RelKind,t: EARS.EntityId,i?: number)=> (edgeStore.linkOne(id,k,t,i),        self),
    patchLink:(k: EARS.RelKind,t: EARS.EntityId,u:{newTarget: EARS.EntityId, newInfo?: unknown}) => (edgeStore.patchOne(
                      {sourceEntity:id,relationType:k,targetEntity:t},
                      {newTarget:u.newTarget,newInfo:u.newInfo}), self),
    unlinkIf :(k: EARS.RelKind,t?: EARS.EntityId) => (edgeStore.unlink({
                      sourceEntity:id,relationType:k,targetEntity:t}), self),

    destroy:()=> (destroyEntity(id), undefined as never),
    id:()=>id,
  };

  return self;
};
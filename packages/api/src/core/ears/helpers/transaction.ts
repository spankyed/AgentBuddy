/*───────────────────────────────────────────────────────────────────────────
 * tx.ts – fluent *mutation* helper (safe & expressive v2)
 *───────────────────────────────────────────────────────────────────────────*/
import {
  destroyEntity,
  putAttr, addAttr, mergeAttr, dropAttr, dropIf, updateAttr,
  grantRole, revokeRole,
  addRelation, updateRelation, removeRelation,
  createEntity,
  getRoles,               // for no‑op guards
} from "@/core/ears/attribute-storage";

import { edgeStore } from "@/core/ears/helpers/edge-store";
import { qx } from "@/core/ears/helpers/query";
import { EARS } from "@/core/types";
import { wouldCreateCycle, linkSymmetric } from "@/core/ears/helpers/graph";

export interface SafeLinkOptions {
  /** Additional info to store with the relation */
  info?: unknown;
  /** If true, creates bidirectional edges automatically */
  symmetric?: boolean;
  /** If specified, prevents cycles within this group of relation kinds */
  acyclicGroup?: readonly EARS.RelKind[];
}

export function tx(typeOrId: EARS.Entity | EARS.EntityId, forceCreate = false) {
  const isNew = forceCreate || Object.values(EARS.Entity).includes(typeOrId as EARS.Entity);
  const id: EARS.EntityId = isNew && !forceCreate
    ? createEntity(typeOrId as EARS.Entity)
    : (typeOrId as EARS.EntityId);

  // If creating a new entity, add a timestamp so it exists in the store
  if (isNew) {
    putAttr(id, EARS.AttrKind.Custom('createdAt'), Date.now());
  }

  const preventSelfLoop = (t: EARS.EntityId) => {
    if (t === id) throw new Error("tx.link(): source and target cannot be the same");
  };

  /*──────── core fluent surface ───────────*/
  const self = {
    /*─ attrs ─*/
    put: (k: EARS.AttrKind | string, v: unknown, allowMultiple = false) => {
      const kind = typeof k === "string" ? EARS.AttrKind.Custom(k) : k;
      if (allowMultiple) {
        addAttr(id, kind, v);
      } else {
        putAttr(id, kind, v);
      }
      return self;
    },
    add: (k: EARS.AttrKind | string, v: unknown) => {
      const kind = typeof k === "string" ? EARS.AttrKind.Custom(k) : k;
      addAttr(id, kind, v);
      return self;
    },
    batchPut: (attrs: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(attrs)) {
        putAttr(id, EARS.AttrKind.Custom(k), v);
      }
      return self;
    },
    merge: (k: EARS.AttrKind, v: unknown, i?: number) => (mergeAttr(id, k, v, i), self),
    drop: (k: EARS.AttrKind, i?: number) => (dropAttr(id, k, i), self),
    dropIf: (k: EARS.AttrKind, c: unknown) => (dropIf(id, k, c), self),
    update: (k: EARS.AttrKind | string, v: unknown) => {
      const kind = typeof k === "string" ? EARS.AttrKind.Custom(k) : k;
      updateAttr(id, kind, v);
      return self;
    },
    updateBatch: (attrs: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(attrs)) {
        updateAttr(id, EARS.AttrKind.Custom(k), v);
      }
      return self;
    },

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
    safeLink: (k: EARS.RelKind, t: EARS.EntityId, options?: SafeLinkOptions) => {
      preventSelfLoop(t);
      
      const opts = options || {};
      
      // Check for cycles if configured
      if (opts.acyclicGroup && wouldCreateCycle(id, t, opts.acyclicGroup)) {
        // Generate meaningful error message based on context
        let errorMsg: string;
        if (opts.acyclicGroup.length === 1) {
          errorMsg = `Cannot create a ${k} relation that would form a cycle`;
        } else {
          const kinds = opts.acyclicGroup.join(', ');
          errorMsg = `Cannot create a ${k} relation that would form a cycle within [${kinds}]`;
        }
        throw new Error(errorMsg);
      }
      
      // Handle symmetric relations
      if (opts.symmetric) {
        linkSymmetric(id, t, k, opts.info);
        return self;
      }
      
      // Default behavior - regular linkOne
      return self.linkOne(k, t, opts.info);
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
    define: (def: {
      attributes?: Record<string, unknown>;
      links?: [EARS.RelKind, EARS.EntityId] | Array<[EARS.RelKind, EARS.EntityId]>;
      roles?: string | string[];
    }) => {
      if (def.attributes) {
        self.batchPut(def.attributes);
      }

      if (def.links) {
        const links = Array.isArray(def.links[0])
          ? def.links as Array<[EARS.RelKind, EARS.EntityId]>
          : [def.links] as Array<[EARS.RelKind, EARS.EntityId]>;

        for (const [kind, target] of links) {
          self.link(kind, target);
        }
      }

      if (def.roles) {
        const roles = Array.isArray(def.roles) ? def.roles : [def.roles];
        for (const role of roles) {
          self.grant(role);
        }
      }

      return self;
    },

    /*─ entity lifecycle ─*/
    destroy: (skipPersistence = false) => (destroyEntity(id, skipPersistence), undefined as never),

    /*─ misc ─*/
    id: () => id,
  } as const;

  return self;
};

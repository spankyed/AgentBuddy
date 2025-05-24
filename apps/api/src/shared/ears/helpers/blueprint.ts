import { unique } from "drizzle-orm/gel-core";
import { addAttribute, addRole, addRelation } from "../attribute-storage";
import { createEntity } from "../create-entity";
import { EARS } from "../types";
import { tx } from "./transaction";

/*────────── Fluent builder ─────────*/
export const bp = (entity: EARS.Entity) => {
  const b: EARS.Blueprint = { entity };

  const chain = {
    attr : (k: string, v: unknown) => {
      if (!b.attrs) b.attrs = {};
      b.attrs[k] = v;
      return chain;
    },
    role : (r: EARS.RoleKind) => {
      if (!b.roles) b.roles = [];
      b.roles.push(r);
      return chain;
    },
    uniqueRole : (r: EARS.RoleKind) => {
      if (!b.roles) b.roles = [];
      b.roles.push(r);
      return chain;
    },
    rel  : (kind: EARS.RelKind, target: EARS.Blueprint | EARS.EntityId, info?: unknown) => {
      if (!b.rels) b.rels = [];
      b.rels.push({ kind, target, info });
      return chain;
    },
    build: () => b,
  };

  return chain;
};

/*────────── Spawn (with memo‑dedupe) ─────────*/
export const spawn = (
  root: EARS.Blueprint,
  { dedupe = true } = {},
): EARS.EntityId => {
  const cache = dedupe ? new Map<EARS.Blueprint, EARS.EntityId>() : undefined;

  const go = (node: EARS.Blueprint): EARS.EntityId => {
    if (cache?.has(node)) {
      // We know the value exists since we checked with has()
      return cache.get(node) as EARS.EntityId;
    }

    const id = createEntity(node.entity);
    cache?.set(node, id);

    for (const [k, v] of Object.entries(node.attrs ?? {}))
      addAttribute(id, EARS.AttrKind.Custom(k), v);

    for (const r of node.roles ?? [])
      addRole(id, r);

    for (const r of node.uniqueRoles ?? [])
      tx(id)
        .uniqueRole(r)  

    for (const { kind, target } of node.rels ?? []) {
      const tgtId = typeof target === 'object' ? go(target) : target;
      addRelation(id, kind, tgtId);
    };

    return id;
  };

  return go(root);
};
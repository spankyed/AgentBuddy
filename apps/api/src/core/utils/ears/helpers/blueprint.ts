// blueprint.ts
import { tx } from "./transaction";
import { EARS } from "../../../types";

export interface Blueprint {
  entity: EARS.Entity;
  attrs?: Record<string, unknown>;
  roles?: EARS.RoleKind[];
  uniqueRoles?: EARS.RoleKind[];
  rels?: Array<{
    kind: EARS.RelKind;
    target: Blueprint | EARS.EntityId;
    info?: unknown;
  }>;
}

/** Fluent builder */
export const bp = (entity: EARS.Entity) => {
  const b: Blueprint = { entity };

  return {
    attr(k: string, v: unknown) {
      (b.attrs ??= {})[k] = v;
      return this;
    },
    grant(r: EARS.RoleKind) {
      (b.roles ??= []).push(r);
      return this;
    },
    ensure(r: EARS.RoleKind) {
      (b.uniqueRoles ??= []).push(r);
      return this;
    },
    link(kind: EARS.RelKind, target: Blueprint | EARS.EntityId, info?: unknown) {
      (b.rels ??= []).push({ kind, target, info });
      return this;
    },
    build() {
      return b;
    },
  };
};

export function spawn(
  root: Blueprint,
  { dedupe = true } = {},
): EARS.EntityId {
  const cache = dedupe ? new Map<Blueprint, EARS.EntityId>() : undefined;

  const go = (node: Blueprint): EARS.EntityId => {
    if (cache?.has(node)) {
      return cache.get(node)!;
    }

    // start tx on this entity (creates it) and grab its ID
    const builder = tx(node.entity);
    const id = builder.id();
    cache?.set(node, id);

    // apply attributes
    for (const [k, v] of Object.entries(node.attrs ?? {})) {
      builder.put(k, v);
    }

    // apply roles
    for (const r of node.roles ?? []) {
      builder.grant(r);
    }
    for (const r of node.uniqueRoles ?? []) {
      builder.ensure(r);
    }

    // apply relations (recursing for Blueprint targets)
    for (const { kind, target, info } of node.rels ?? []) {
      const tgtId =
        typeof target === "object" ? go(target as Blueprint) : target;
      builder.linkOne(kind, tgtId, info as any);
    }

    return id;
  };

  return go(root);
}
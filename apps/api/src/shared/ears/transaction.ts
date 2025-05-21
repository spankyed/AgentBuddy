import {
  addAttribute, addRelation, addRole,
  queryEntitiesByRole, removeRole,
} from '@/shared/ears/attribute-storage';
import { EARS } from '@/shared/ears/types';
import { createEntity } from '.';

/*────────────────────────── Tx builder ──────────────────────────*/
export const tx = (entity: EARS.Entity) => {
  const id = createEntity(entity);

  /* internal ops buffered only for readability, not for rollback */
  return {
    attr(k: string, v: unknown) {                     // add/merge attr
      addAttribute(id, EARS.AttrKind.Custom(k), v);
      return this;
    },
    role(kind: EARS.RoleKind) {                       // add simple role
      addRole(id, kind);
      return this;
    },
    uniqueRole(kind: EARS.RoleKind, scope = queryEntitiesByRole(kind)) {
      for (const e of scope) removeRole(e, kind); // ensure uniqueness
      addRole(id, kind);
      return this;
    },
    rel(kind: EARS.RelKind, target: EARS.EntityId) {  // any relation type
      addRelation(id, kind, target);
      return this;
    },
    id: () => id,                                     // expose entity ID
  };
};
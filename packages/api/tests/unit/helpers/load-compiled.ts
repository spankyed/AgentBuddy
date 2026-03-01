import { tx } from '@/core/ears/helpers/transaction';
import { EARS } from '@/core/types';
import type { CompiledRows } from '@/systems/flows/dsl/compiler';

/** Load compiled rows into EARS in-memory store (mirrors importFromDSL) */
export function loadCompiledRows(compiled: CompiledRows) {
  for (const entity of compiled.entity) {
    const { id, ...attributes } = entity as { id: string; [key: string]: any };
    tx(id as EARS.EntityId, true).batchPut(attributes);
  }
  for (const relation of compiled.relation) {
    tx(relation.source as EARS.EntityId).link(
      relation.kind,
      relation.target as EARS.EntityId,
      relation.info
    );
  }
  for (const role of compiled.role) {
    tx(role.entityId as EARS.EntityId).grant(role.role);
  }
}

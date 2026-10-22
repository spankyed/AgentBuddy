import type { EarsQuery } from '@apackdev/ears';
import type { EARS } from '../../../src/types/entities.ts';
import type { CompiledRows } from '../../../src/build/compilers/flow-compiler.ts';

export function loadCompiledRows({ create, write }: EarsQuery, compiled: CompiledRows) {
  for (const entity of compiled.entity) {
    const { id, entityType, createdAt, ...attributes } = entity as { id: string; entityType: string; createdAt?: number; [key: string]: any };
    create(entityType as never, { id: id as EARS.EntityId, createdAt }).setMany(attributes);
  }
  for (const relation of compiled.relation) {
    write(relation.source as EARS.EntityId).link(
      relation.kind,
      relation.target as EARS.EntityId,
      { info: relation.info },
    );
  }
  for (const role of compiled.role) {
    write(role.entityId as EARS.EntityId).grant(role.role);
  }
}

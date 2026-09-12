/** Find the first entity matching a predicate */
export function findEntity(entities: object[], pred: (e: any) => boolean): any {
  return entities.find(pred);
}

/** Find all entities matching a predicate */
export function filterEntities(entities: object[], pred: (e: any) => boolean): any[] {
  return entities.filter(pred);
}

/** Find all relations matching a predicate */
export function filterRelations(
  relations: Array<{ source: string; kind: string; target: string; info?: object }>,
  pred: (r: any) => boolean,
) {
  return relations.filter(pred);
}

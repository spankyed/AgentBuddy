export const exampleQuery =
`// Example queries - modify and run to explore the database

// Query all threads with their data
return qx(EARS.Entity.Thread).pick(['id', 'topic', 'status', 'threadType', 'timestamp']).limit(10);

// Or try these examples:
// return qx(EARS.Entity.Agent).where('status', 'active').pickAll();
// return qx().where('label').pick(['id', 'label']).limit(20);
// return qx(EARS.Entity.Tag).pick(['id', 'name', 'color']).orderBy('name');`

export const entityQueryTemplate = (value: string) =>
  `// Query all ${value} entities\nreturn qx(EARS.Entity.${value}).pickAll().limit(20);`

export const attributeQueryTemplate = (value: string) =>
  `// Query entities with ${value} attribute\nreturn qx().where('${value}').pick(['id', '${value}']).limit(20);`

export const relationQueryTemplate = (value: string) =>
`// Query entities with ${value} relations
// This returns the source entities that have the specified relation type
const sources = [];
const allIds = getAllEntities();

for (const sourceId of allIds) {
  const targets = qx(sourceId).related('${value}', sourceId, true).ids();
  if (targets.length > 0) {
    const sourceData = getAll(sourceId);
    sources.push({
      id: sourceId,
      type: sourceId.split('-')[0],
      targetCount: targets.length,
      targets: targets.slice(0, 3), // Show first 3 targets
      ...sourceData
    });
  }
}

return sources.slice(0, 20);`

import type { DatabaseSchemaInfo } from './types';

interface SchemaStats {
  entities: Record<string, number>;
  attributes: Record<string, { entityCount: number; totalValues: number }>;
  relations: Record<string, { totalRelations: number; uniqueSources: number; uniqueTargets: number }>;
}

function formatEntityStats(stats: SchemaStats): string {
  return Object.entries(stats.entities)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => `  ${type}: ${count}`)
    .join('\n');
}

function formatRelationStats(stats: SchemaStats): string {
  return Object.entries(stats.relations)
    .filter(([, s]) => s.totalRelations > 0)
    .sort(([, a], [, b]) => b.totalRelations - a.totalRelations)
    .map(([kind, s]) => `  ${kind}: ${s.totalRelations} relations (${s.uniqueSources} sources → ${s.uniqueTargets} targets)`)
    .join('\n');
}

export function buildQueryPrompt(userPrompt: string, schema: DatabaseSchemaInfo, stats?: SchemaStats): string {
  const entityTypes = schema.entities.map(e => e.type).join(', ');
  const attrKinds = schema.attributes.map(a => a.kind).join(', ');

  const entityStatsBlock = stats ? `\nEntity counts:\n${formatEntityStats(stats)}` : '';
  const relationStatsBlock = stats ? `\nRelation counts:\n${formatRelationStats(stats)}` : '';

  return `Generate a read-only TypeScript query for EARS, an in-memory entity-attribute-relation database.

STRICT OUTPUT RULES:
- Output ONLY executable TypeScript code
- NO markdown fencing, NO explanations, NO comments
- MUST include a \`return\` statement
- qx() is synchronous — NEVER use await
- This is a read-only context — tx() is NOT available

AVAILABLE GLOBALS:
- qx(...)          — query builder (see API below)
- EARS.Entity.*    — entity type enum: ${entityTypes}
- EARS.RelKind.*   — relation kind constants
- getAll(id)       — returns Record<string, any> of all attributes for an entity
- getAttr(id, EARS.AttrKind.Custom(name)) — single attribute value
- getSchemaStats() — returns { entities, attributes, relations } with counts

LIVE SCHEMA:
${entityStatsBlock}

Attribute kinds in use: ${attrKinds}
${relationStatsBlock}

qx() API:

  Entry:
    qx()                          → all entities
    qx(EARS.Entity.Thread)        → all of a type
    qx('entity-id')               → single entity by ID
    qx(['id1','id2'])             → multiple by ID

  Filter (chainable, returns qx):
    .ofType(EARS.Entity.X)        → filter by entity type
    .where(attr, value)           → filter by attribute value
    .where(attr)                  → filter: has attribute (any value)
    .withRole(role)               → filter by role
    .relatedTo(targetId)          → filter: any relation to target
    .inIds([...ids])              → filter to specific IDs

  Traversal (returns new qx with linked entities):
    .linksTo(relKind, targetType?)           → follow outgoing relations
    .linksTo(relKind, targetType, false)     → follow INCOMING relations (reverse)
    .links(relKind, targetType?)             → array of { relation, id }
    .linksPick(relKind, fields, targetType?) → traverse + project in one call

  Terminals (consume the chain):
    .pick(['field1','field2'])  → Array<{ id, field1, field2 }>
    .pickAll()                  → Array<{ id, ...allAttributes }>
    .pickOne(['f1','f2'])       → { id, f1, f2 } | null
    .ids()                      → string[]  (entity IDs)
    .count()                    → number
    .first()                    → string | null  (first entity ID)
    .exists()                   → boolean

  Shaping (chainable before terminals):
    .orderBy(field, 'asc'|'desc')
    .limit(n)
    .reverse()
    .distinct(field?)
    .groupBy(field)             → Map<value, qx>

  Iteration (over entity IDs):
    .map(id => ...)             → Array<T>
    .forEach(id => ...)
    .reduce(fn, init)

EXAMPLES:

// All threads with their attributes
return qx(EARS.Entity.Thread).pickAll();

// Count entities by type
const stats = getSchemaStats();
return Object.entries(stats.entities).map(([type, count]) => ({ type, count }));

// Threads ordered by creation date
return qx(EARS.Entity.Thread)
  .orderBy('createdAt', 'desc')
  .limit(20)
  .pick(['topic', 'status', 'createdAt']);

// Flows with their node counts
return qx(EARS.Entity.Flow).pick(['label', 'description']).map(flow => ({
  ...flow,
  nodeCount: qx(flow.id).linksTo('contains', EARS.Entity.Node).count()
}));

// Messages in a thread (parent → child via CONTAINS)
const threadId = qx(EARS.Entity.Thread).first();
return qx(threadId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Message)
  .pick(['text', 'sender', 'timestamp']);

// Find which entities link TO a target (reverse relation)
const targetId = qx(EARS.Entity.Flow).first();
return qx(targetId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Node, false).pickAll();

// Search entities by attribute value
return qx(EARS.Entity.Thread)
  .where('status', 'active')
  .pick(['topic', 'status']);

// All attributes of a single entity
const id = qx(EARS.Entity.Thread).first();
return getAll(id);

USER REQUEST:

${userPrompt}`;
}

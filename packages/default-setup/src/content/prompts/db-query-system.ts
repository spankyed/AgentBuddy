import type { PromptMeta } from '@apackdev/sdk/build';

export const meta: PromptMeta = {
  label: 'DB Query System',
  description: 'Generate a read-only EARS database query from a natural language request',
  category: 'database',
  inputs: {
    schema: { name: 'schema', type: 'string', description: 'Entity types with fields and sample data', required: true },
    topology: { name: 'topology', type: 'string', description: 'Relationship graph between entity types', required: true },
  },
};

export function template(params: Record<string, any>) {
  const { schema, topology } = params;

  return `You are an EARS database query generator. Output ONLY executable TypeScript code. No markdown, no explanations, no comments.
MUST include a return statement. query is synchronous — never use await.

SCHEMA:

${schema}

RELATIONSHIPS:
${topology}

GLOBALS:

query(...)               query builder (see API below)
EARS.Entity.*         entity type enum (e.g. EARS.Entity.Thread)
EARS.RelKind.*        relation kind constants (e.g. EARS.RelKind.CONTAINS = 'contains')
getRow(id)            { id, entityType, ...attributes } for a single entity, or undefined
getAttr(id, EARS.AttrKind.Custom('fieldName'))   single attribute value
getRoles(id)          string[] — roles on an entity
getSchemaStats()      { entities, attributes, relations } with counts

API — chain order matters. Use filters/shaping FIRST, then a terminal to get results.

Chainable (return query, keep chaining):
  query(EARS.Entity.Thread)                          all of a type (a type name only, never an id)
  query([EARS.Entity.Thread, EARS.Entity.Note])      all of several types
  query.ids('Thread-1')                              single entity by ID
  query.ids(['Thread-1', 'Thread-2'])                multiple by ID (absent ids are dropped)
  query.all()                                        every entity
  query.withTrashed(...) / query.trashed(type)       the same, reaching the trash too / only the trash
  .ofType(EARS.Entity.X)                           filter by entity type
  .where('field', value)                           filter by exact attribute match, or a list holding it (value must not be undefined)
  .where('field', v => ...)                        filter by a predicate over the whole value
  .has('field')                                    filter: has this attribute
  .lacks('field')                                  filter: lacks this attribute
  .withRole(role)                                  filter by role
  .relatedTo(targetId)                             filter: any relation to target
  .inIds([...ids])                                 filter to specific IDs
  .linksTo('contains', EARS.Entity.Message)        follow outgoing relations → new query
  .linksTo('contains', EARS.Entity.X, false)       follow INCOMING relations (reverse)
  .linksTo(['contains', 'has'], EARS.Entity.X)     multiple relation kinds
  .orderBy('field', 'desc')                        sort (flat attributes only, not nested)
  .limit(n)                                        take first n
  .reverse()                                       reverse order
  .distinct('field')                               keep first per unique field value

Terminals (end the chain, return data):
  .pick(['f1', 'f2'])     → Array<{ id, f1, f2 }>     id always included automatically
  .pickAll()              → Array<{ id, ...allAttrs }>
  .pickOne(['f1'])        → { id, f1 } | null
  .ids()                  → string[]
  .count()                → number
  .first()                → string | null
  .last()                 → string | null
  .exists()               → boolean

Traversal with projection (terminal):
  .linksPick('contains', ['text', 'sender'], EARS.Entity.Message)
    → Array<{ id, text, sender }>     traverse + pick in one call
  .links('contains', EARS.Entity.Message)
    → Array<{ relation, id }>         get relation kind + target ID pairs

Iteration:
  .map(id => ...)         iterates entity IDs (NOT objects), returns Array<T>
  .forEach(id => ...)     iterates entity IDs, returns query (chainable)
  .groupBy('field')       → Map<value, query>   group entities by field value

After .pick()/.pickAll(), use standard Array methods (.map, .filter) on the result.

PATTERNS:

// List with specific fields
return query(EARS.Entity.Thread).orderBy('createdAt', 'desc').limit(20)
  .pick(['topic', 'status', 'createdAt']);

// Filter by attribute
return query(EARS.Entity.Thread).where('status', 'active').pickAll();

// Traverse relations (get messages in a thread)
const threadId = query(EARS.Entity.Thread).first();
return query.ids(threadId).linksTo('contains', EARS.Entity.Message)
  .pick(['text', 'sender', 'timestamp']);

// Traverse + pick in one call
return query.ids('Thread-1')
  .linksPick('contains', ['text', 'sender', 'timestamp'], EARS.Entity.Message);

// Aggregate: threads with message counts
return query(EARS.Entity.Thread).pick(['topic']).map(t => ({
  ...t,
  messageCount: query.ids(t.id).linksTo('contains', EARS.Entity.Message).count()
}));

// Reverse relation: find what points TO an entity
const flowId = query(EARS.Entity.Flow).first();
return query.ids(flowId).linksTo('contains', EARS.Entity.Node, false).pickAll();

// Inspect a single entity's full data
const id = query(EARS.Entity.Thread).first();
return getRow(id);

// Build custom objects using query.map (iterates IDs, not objects)
return query(EARS.Entity.Flow).map(id => ({
  ...getRow(id),
  nodeCount: query.ids(id).linksTo('contains', EARS.Entity.Node).count()
}));`;
}

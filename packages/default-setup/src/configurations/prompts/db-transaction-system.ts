import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'DB Transaction System',
  description: 'Generate an EARS database transaction from a natural language request',
  category: 'database',
  inputs: {
    schema: { name: 'schema', type: 'string', description: 'Entity types with fields and sample data', required: true },
    topology: { name: 'topology', type: 'string', description: 'Relationship graph between entity types', required: true },
  },
};

export function template(params: Record<string, any>) {
  const { schema, topology } = params;

  return `You are an EARS database transaction generator. Output ONLY executable TypeScript code. No markdown, no explanations, no comments.
MUST include a return statement. Both qx() and tx() are synchronous — never use await.

SCHEMA:

${schema}

RELATIONSHIPS:
${topology}

GLOBALS:

qx(...)               query builder (read-only, for finding entities before mutating)
tx(...)               transaction builder (write operations)
EARS.Entity.*         entity type enum (e.g. EARS.Entity.Thread)
EARS.RelKind.*        relation kind constants (e.g. EARS.RelKind.CONTAINS = 'contains')
getAll(id)            Record<string, any> — all attributes for a single entity
getAllEntities()       string[] — all entity IDs in the database
getRoles(id)          string[] — roles on an entity
destroyEntity(id)     delete an entity
createEntityWithDefaults(type, attrs)   create with auto-generated fields
updateEntity(id, attrs)                 update entity attributes
createRelation(sourceId, kind, targetId)   create a relation
removeRelation(relationId)                 remove a relation

QUERY API (qx) — use to find entities before mutating:

  qx(EARS.Entity.Thread)                          all of a type
  qx('Thread-1')                                  single entity by ID
  .where('field', value)                           filter by attribute
  .linksTo('contains', EARS.Entity.Message)        follow outgoing relations
  .pick(['f1', 'f2'])     → Array<{ id, f1, f2 }>
  .pickAll()              → Array<{ id, ...allAttrs }>
  .pickOne(['f1'])        → { id, f1 } | null
  .ids()                  → string[]
  .count()                → number
  .first()                → string | null

TRANSACTION API (tx):

  Create:
    tx(EARS.Entity.Thread)                         create new entity → chainable
    tx('Thread-1')                                 reference existing entity → chainable

  Attributes (chainable):
    .put(key, value)                               set attribute (replaces existing)
    .batchPut({ key1: val1, key2: val2 })          set multiple attributes
    .update(key, value)                            update existing attribute
    .updateBatch({ key1: val1 })                   update multiple attributes
    .merge(key, value)                             merge into existing object/array
    .drop(key)                                     remove attribute

  Relations (chainable):
    .link(EARS.RelKind.CONTAINS, targetId)         add relation
    .linkOne(kind, targetId)                       add/replace single relation
    .safeLink(kind, targetId, opts?)               link with cycle prevention
    .unlinkWhere({ kind?, target? })               remove relations by criteria

  Roles (chainable):
    .grant(role)                                   grant role
    .revoke(role)                                  revoke role
    .ensure(role)                                  grant role, revoke from others

  Lifecycle:
    .destroy()                                     delete entity (not chainable)
    .id()                                          get entity ID (terminal)

  Bulk:
    .define({ attributes?, links?, roles? })       set up entity in one call

PATTERNS:

// Create a new entity with attributes
const threadId = tx(EARS.Entity.Thread)
  .put('topic', 'New Discussion')
  .put('status', 'active')
  .put('createdAt', Date.now())
  .id();
return { created: threadId };

// Update an existing entity
const threadId = qx(EARS.Entity.Thread).first();
tx(threadId)
  .put('status', 'resolved')
  .put('updatedAt', Date.now());
return qx(threadId).pickAll();

// Create entity with relations
const flowId = tx(EARS.Entity.Flow)
  .put('label', 'My Flow')
  .put('description', 'A workflow')
  .id();
const nodeId = tx(EARS.Entity.Node)
  .put('type', 'action')
  .put('label', 'Step 1')
  .id();
tx(flowId).link(EARS.RelKind.CONTAINS, nodeId);
return { flowId, nodeId };

// Bulk delete entities
const ids = qx(EARS.Entity.Thread)
  .where('status', 'archived')
  .limit(10)
  .ids();
ids.forEach(id => tx(id).destroy());
return { deleted: ids.length };

// Grant/revoke roles
const agentId = qx(EARS.Entity.Agent).first();
tx(agentId).grant('primary').revoke('inactive');
return { agentId, roles: getRoles(agentId) };`;
}

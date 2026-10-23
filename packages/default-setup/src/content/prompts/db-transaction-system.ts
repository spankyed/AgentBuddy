import type { PromptMeta } from '@apackdev/sdk/build';

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
MUST include a return statement. query, create, upsert and write are all synchronous — never use await.

SCHEMA:

${schema}

RELATIONSHIPS:
${topology}

GLOBALS:

query(...)               query builder (read-only, for finding entities before mutating)
create(type, opts?)   create a new entity of a type → write builder
upsert(type, id)      the entity with this id, created as type when missing → write builder
write(id)             an existing entity → write builder (throws when no entity has the id)
EARS.Entity.*         entity type enum (e.g. EARS.Entity.Thread)
EARS.RelKind.*        relation kind constants (e.g. EARS.RelKind.CONTAINS = 'contains')
getAll(id)            Record<string, any> — all attributes for a single entity
getAllEntities()       string[] — all entity IDs in the database
getRoles(id)          string[] — roles on an entity
destroyEntity(id)     delete an entity
createEntityWithDefaults(type, attrs)   create with auto-generated fields
updateEntity(id, attrs)                 update entity attributes
createRelation(sourceId, kind, targetId)   create a relation
removeRelation(sourceId, kind, targetId?)  remove matching relation(s)
removeRelationById(relationId)             remove one relation by its own id

QUERY API (query) — use to find entities before mutating:

  query(EARS.Entity.Thread)                          all of a type (a type name only, never an id)
  query.ids('Thread-1')  /  query.ids([id1, id2])        entities by id (absent ids are dropped)
  query.all()                                         every entity
  .where('field', value)                           filter by attribute value
  .has('field')  /  .lacks('field')                filter by presence / absence
  .linksTo('contains', EARS.Entity.Message)        follow outgoing relations
  .pick(['f1', 'f2'])     → Array<{ id, f1, f2 }>
  .pickAll()              → Array<{ id, ...allAttrs }>
  .pickOne(['f1'])        → { id, f1 } | null
  .ids()                  → string[]
  .count()                → number
  .first()                → string | null
  .exists()               → boolean

WRITE API (create / upsert / write):

  Start:
    create(EARS.Entity.Thread)                     new entity, new id
    create(EARS.Entity.Thread, { id, createdAt })  new entity with a given id and/or creation time
    upsert(EARS.Entity.Thread, 'Thread-1')         get-or-create by id
    write('Thread-1')                              existing entity

  The database writes id, entityType, createdAt, role and relationDetails itself: never set them.

  Attributes (chainable):
    .set(key, value)                               set attribute (replaces existing)
    .setMany({ key1: val1, key2: val2 })           set several attributes
    .add(key, value)                               append a value to a multi-valued attribute
    .merge(key, value)                             merge into existing object
    .delete(key)                                   remove attribute (every value)
    .deleteAt(key, index)                          remove one value by index
    .deleteValue(key, value)                       remove values equal to value

  Relations (chainable):
    .link(EARS.RelKind.CONTAINS, targetId)         add relation
    .link(kind, targetId, { info })                add relation carrying info
    .link(kind, targetId, { replace: true })       add relation, replacing an identical one
    .link(kind, targetId, { acyclicIn: [kind] })   refuse a link that would form a cycle
    .unlink(kind, targetId?)                       remove relations of a kind (to one target)
    .unlinkAll()                                   remove every relation from this entity

  Roles (chainable):
    .grant(role)                                   grant role
    .revoke(role)                                  revoke role
    .grantExclusive(role, amongIds)                grant role, revoke it from the others in amongIds

  Lifecycle:
    .destroy()                                     delete entity (not chainable)
    .id()                                          get entity ID (terminal)

PATTERNS:

// Create a new entity with attributes
const threadId = create(EARS.Entity.Thread)
  .set('topic', 'New Discussion')
  .set('status', 'active')
  .id();
return { created: threadId };

// Update an existing entity
const threadId = query(EARS.Entity.Thread).first();
if (!threadId) return { updated: null };
write(threadId)
  .set('status', 'resolved')
  .set('updatedAt', Date.now());
return query.ids(threadId).pickAll();

// Create entity with relations
const flowId = create(EARS.Entity.Flow)
  .setMany({ label: 'My Flow', description: 'A workflow' })
  .id();
const nodeId = create(EARS.Entity.Node)
  .setMany({ type: 'action', label: 'Step 1' })
  .id();
write(flowId).link(EARS.RelKind.CONTAINS, nodeId);
return { flowId, nodeId };

// Bulk delete entities
const ids = query(EARS.Entity.Thread)
  .where('status', 'archived')
  .limit(10)
  .ids();
ids.forEach(id => write(id).destroy());
return { deleted: ids.length };

// Grant/revoke roles
const noteId = query(EARS.Entity.Note).first();
if (!noteId) return { noteId: null };
write(noteId).grant('primary').revoke('inactive');
return { noteId, roles: getRoles(noteId) };`;
}

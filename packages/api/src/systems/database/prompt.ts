import type { DatabaseSchemaInfo } from './types';

export function buildQueryPrompt(userPrompt: string, schema: DatabaseSchemaInfo): string {
  const entityTypes = schema.entities.map(e => e.type).join(', ');
  const attrKinds = schema.attributes.map(a => a.kind).join(', ');
  const relKinds = schema.relations.map(r => r.kind).join(', ');

  return `You are generating TypeScript code for EARS (Embedded Attribute-Relation Store), an in-memory entity-attribute-relation database.

OUTPUT RULES:
- Output ONLY executable TypeScript code — no markdown fencing, no explanation, no comments
- Code MUST include a \`return\` statement
- Use qx() for reads, tx() for writes

## qx() API — Query

Entry points:
  qx()                         — all entities
  qx('EntityType')             — all of a type (e.g. qx(EARS.Entity.Thread))
  qx('Entity-id')              — single entity by ID
  qx(['id1','id2'])            — multiple by ID

Filters:
  .ofType(EARS.Entity.X)       — filter by entity type
  .where(attrName, value)      — filter by attribute value
  .where(attrName)             — filter: has attribute
  .withRole(role)              — filter by role
  .relatedTo(targetId)         — filter: related to target

Traversal:
  .linksTo(relKind, targetType?)  — follow relations to linked entities
  .links(relKind, targetType?)    — get array of { relation, id }
  .linksPick(relKind, fields, targetType?) — traverse + project

List shaping:
  .orderBy(field, 'asc'|'desc') — sort by attribute
  .limit(n)                     — take first n
  .distinct(field?)             — deduplicate
  .reverse()                    — reverse order

Terminals:
  .pick(fields)     — project to objects with selected fields + id
  .pickAll()        — project to objects with all attributes + id
  .pickOne(fields)  — pick first match (or null)
  .ids()            — array of entity IDs
  .count()          — number of matches
  .first()          — first ID or null
  .last()           — last ID or null
  .exists()         — boolean

Iterators:
  .map(fn)          — map over IDs
  .forEach(fn)      — iterate IDs
  .reduce(fn, init) — reduce over IDs

## tx() API — Transaction

Entry points:
  tx('EntityType')   — create new entity (e.g. tx(EARS.Entity.Thread))
  tx('Entity-id')    — reference existing entity by ID

Attributes:
  .put(key, value)       — set attribute
  .batchPut({ k: v })   — set multiple attributes
  .merge(kind, value)    — merge into attribute
  .drop(kind)            — remove attribute
  .update(key, value)    — update existing attribute

Relations:
  .link(kind, targetId)      — add relation
  .linkOne(kind, targetId)   — add/replace single relation
  .unlink(relationId)        — remove relation by ID
  .unlinkWhere({ kind?, target? }) — remove relations by criteria
  .safeLink(kind, targetId, opts?) — link with cycle prevention

Roles:
  .grant(role)     — grant role
  .revoke(role)    — revoke role
  .ensure(role)    — grant role, revoking from others

Lifecycle:
  .destroy()       — delete entity
  .id()            — returns EntityId of this entity

Bulk:
  .define({ attributes?, links?, roles? }) — set up entity in one call

## Available Globals

EARS.Entity enum: ${entityTypes}
EARS.RelKind values: PARENT_OF, CONTAINS, REPLIED_TO, HAS, BLOCKS, DEPENDS_ON, RELATES_TO, DUPLICATES, TRANSITIONS_TO, EMITS, INSTANCE_OF, SPAWNED, TRACKED, Custom(string)
EARS.AttrKind values: Role, RelationDetails, Custom(string)

Helper functions: getAllEntities(), getAll(entityId), getAttr(id, EARS.AttrKind.Custom(attr)), getAttrs(id, kind), getRoles(id), getEntitiesOfType(type), queryEntitiesByAttribute(kind, value), queryEntitiesInRelationTo(target), relationIndex, getSchemaStats()

## Live Schema

Entity types: ${entityTypes}
Attribute kinds in use: ${attrKinds}
Relation kinds in use: ${relKinds}

## Examples

// Find all active threads
return qx(EARS.Entity.Thread)
  .where('status', 'active')
  .limit(10)
  .pickAll();

// List flows with node counts
const flows = qx(EARS.Entity.Flow).pick(['id', 'label', 'description']);
return flows.map(f => ({
  ...f,
  nodeCount: qx(f.id).linksTo('contains', EARS.Entity.Node).count()
}));

// Create a new thread
const threadId = tx(EARS.Entity.Thread)
  .put('title', 'Dev Environment Setup')
  .put('status', 'active')
  .put('createdAt', Date.now())
  .id();
return { created: threadId };

// Bulk delete completed trace nodes
const oldNodes = qx(EARS.Entity.TNode)
  .where('status', 'completed')
  .limit(50)
  .ids();
oldNodes.forEach(id => tx(id).destroy());
return { deleted: oldNodes.length };

// Find agents with their flows
return qx(EARS.Entity.Agent).pickAll().map(agent => ({
  ...agent,
  flows: qx(agent.id).linksTo('has', EARS.Entity.Flow).pick(['id', 'label'])
}));

## User Request

${userPrompt}`;
}

import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'DB Query',
  description: 'Generate a read-only EARS database query from a natural language request',
  category: 'database',
  inputs: {
    userPrompt: { name: 'userPrompt', type: 'string', description: 'Natural language query request', required: true },
    schema: { name: 'schema', type: 'string', description: 'Entity types with fields and sample data', required: true },
    topology: { name: 'topology', type: 'string', description: 'Relationship graph between entity types', required: true },
  },
};

export function template(params: Record<string, any>) {
  const { userPrompt, schema, topology } = params;

  return `Generate a read-only TypeScript query for EARS, an in-memory entity-attribute-relation database.
Output ONLY executable TypeScript code. No markdown, no explanations, no comments.
MUST include a return statement. qx() is synchronous — never use await.

SCHEMA:

${schema}

RELATIONSHIPS:
${topology}

API:

qx(EARS.Entity.Thread)              → all of a type
qx('Thread-1')                      → single entity by ID
.where('field', value)               → filter by exact attribute match
.where('field')                      → filter: has attribute
.linksTo('contains', EARS.Entity.Message)        → follow outgoing relations → new qx
.linksTo('contains', EARS.Entity.X, false)       → follow INCOMING relations (reverse)
.links('contains', EARS.Entity.Message)          → Array<{ relation, id }>
.orderBy('field', 'desc').limit(n)               → sort + take first n
.pick(['f1', 'f2'])                  → Array<{ id, f1, f2 }>
.pickAll()                           → Array<{ id, ...allAttributes }>
.pickOne(['f1'])                     → { id, f1 } | null
.ids()                               → string[]
.count()                             → number
.first()                             → string | null
.exists()                            → boolean

Note: .pick() and .pickAll() return arrays of objects. Use standard Array methods
(.map, .filter, .reduce) on these results — NOT qx's .map() which iterates entity IDs.
getAll(id) returns Record<string, any> of all attributes for a single entity.

PATTERNS:

return qx(EARS.Entity.Thread).orderBy('createdAt', 'desc').limit(20)
  .pick(['topic', 'status', 'createdAt']);

return qx(EARS.Entity.Thread).where('status', 'active').pickAll();

const threadId = qx(EARS.Entity.Thread).first();
return qx(threadId).linksTo('contains', EARS.Entity.Message)
  .pick(['text', 'sender', 'timestamp']);

const threads = qx(EARS.Entity.Thread).pick(['topic']);
return threads.map(t => ({
  ...t,
  messageCount: qx(t.id).linksTo('contains', EARS.Entity.Message).count()
}));

USER REQUEST:

${userPrompt}`;
}

import { EARS } from '@/core/types';
import { getEntitiesOfType, getAll, getAllEntityTypes } from '@/core/ears/attribute-storage';
import { relationIndex } from '@/core/ears/relation-index';

/**
 * Sample one entity per type to extract real attribute names + values.
 * Truncates long string values and skips large objects to keep prompt compact.
 */
function sampleEntities(): Map<string, { count: number; fields: string[]; sample: Record<string, unknown> }> {
  const result = new Map<string, { count: number; fields: string[]; sample: Record<string, unknown> }>();

  for (const type of getAllEntityTypes()) {
    const ids = getEntitiesOfType(type as EARS.Entity);
    if (ids.length === 0) continue;

    const raw = getAll(ids[0]);
    const sample: Record<string, unknown> = {};
    const fields: string[] = [];

    for (const [key, value] of Object.entries(raw)) {
      fields.push(key);
      // Keep sample values compact
      if (typeof value === 'string') {
        sample[key] = value.length > 60 ? value.slice(0, 60) + '…' : value;
      } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        sample[key] = value;
      } else if (Array.isArray(value)) {
        sample[key] = `[${value.length} items]`;
      } else {
        sample[key] = '{…}';
      }
    }

    result.set(type, { count: ids.length, fields, sample });
  }

  return result;
}

/**
 * Build a relationship topology from the live relation index.
 * Returns lines like: `Thread --contains--> Message (42)`
 */
function buildTopology(): string[] {
  const edges = new Map<string, number>();

  for (const [kind, entry] of Object.entries(relationIndex)) {
    for (const [sourceId, relIds] of Object.entries(entry.bySource)) {
      const sourceType = sourceId.split('-')[0];
      for (const relId of relIds) {
        // Find target type by checking byTarget
        for (const [targetId, tRelIds] of Object.entries(entry.byTarget)) {
          if (tRelIds.includes(relId)) {
            const targetType = targetId.split('-')[0];
            const edgeKey = `${sourceType} --${kind}--> ${targetType}`;
            edges.set(edgeKey, (edges.get(edgeKey) ?? 0) + 1);
            break;
          }
        }
      }
    }
  }

  return [...edges.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([edge, count]) => `  ${edge} (${count})`);
}

export function buildQueryPrompt(userPrompt: string): string {
  const samples = sampleEntities();
  const topology = buildTopology();

  // Build schema section with real field names
  const schemaLines: string[] = [];
  for (const [type, info] of samples) {
    const sampleStr = JSON.stringify(info.sample);
    const truncatedSample = sampleStr.length > 200 ? sampleStr.slice(0, 200) + '…}' : sampleStr;
    schemaLines.push(`${type} (${info.count})\n  fields: ${info.fields.join(', ')}\n  sample: ${truncatedSample}`);
  }

  return `Generate a read-only TypeScript query for EARS, an in-memory entity-attribute-relation database.
Output ONLY executable TypeScript code. No markdown, no explanations, no comments.
MUST include a return statement. qx() is synchronous — never use await.

SCHEMA:

${schemaLines.join('\n\n')}

RELATIONSHIPS:
${topology.join('\n')}

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

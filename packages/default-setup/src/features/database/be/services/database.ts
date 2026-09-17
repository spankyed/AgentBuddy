/**
 * Database Service
 *
 * `services.database`: live-data context for AI query generation. Actions read and write
 * entities through `services.repository`; pack code imports `qx`/`tx` from `@/__generated__/ears`.
 */

import { EARS } from '@/__generated__/ears';
import { getEntitiesOfType, getAllEntityTypes, getAll } from '@abuddy/ears';
import { findRelations } from '@abuddy/ears';

/**
 * Build a query context from live data for AI query generation.
 * Samples one entity per type to extract real attribute names + values,
 * and maps the relationship topology.
 */
export function buildQueryContext(): { schema: string; topology: string } {
  // Sample entities
  const schemaLines: string[] = [];
  for (const type of getAllEntityTypes()) {
    const ids = getEntitiesOfType(type as EARS.Entity);
    if (ids.length === 0) continue;

    const raw = getAll(ids[0]);
    const fields: string[] = [];
    const sample: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(raw)) {
      fields.push(key);
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

    const sampleStr = JSON.stringify(sample);
    const truncated = sampleStr.length > 200 ? sampleStr.slice(0, 200) + '…}' : sampleStr;
    schemaLines.push(`${type} (${ids.length})\n  fields: ${fields.join(', ')}\n  sample: ${truncated}`);
  }

  // Build topology: relation counts by source type, kind and target type
  const edges = new Map<string, number>();
  for (const { sourceEntity, relationType, targetEntity } of findRelations()) {
    const edgeKey = `${sourceEntity.split('-')[0]} --${relationType}--> ${targetEntity.split('-')[0]}`;
    edges.set(edgeKey, (edges.get(edgeKey) ?? 0) + 1);
  }

  const topologyLines = [...edges.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([edge, count]) => `  ${edge} (${count})`);

  return {
    schema: schemaLines.join('\n\n'),
    topology: topologyLines.join('\n'),
  };
}

export const databaseService = {
  buildQueryContext,
};

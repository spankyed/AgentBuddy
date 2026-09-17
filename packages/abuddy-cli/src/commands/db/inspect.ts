// abuddy db inspect: an entity's relations, followed a few levels, or relation counts per entity type
import type { EarsQuery, EARS } from '@abuddy/ears';
import { openTarget, parseDbArgs, READ_USAGE, TARGET_USAGE, type DbIo } from './target';

const OPTIONS = {
  type: { type: 'string', short: 't' },
  depth: { type: 'string', default: '1' },
  incoming: { type: 'boolean', default: false },
  outgoing: { type: 'boolean', default: false },
  'ignore-version': { type: 'boolean', default: false },
} as const;

export const INSPECT_USAGE = [
  'Usage: abuddy db inspect [<entity-id> | --type <Entity>] [options]',
  '',
  'Prints an entity with its relations, or the first five entities of a type, or with neither, relation counts per',
  'entity type.',
  '',
  'Options:',
  '  -t, --type <Entity>    The first five entities of a type',
  '  --depth <n>            Levels of relations to follow (default 1)',
  '  --incoming             Only relations pointing at the entity',
  '  --outgoing             Only relations from the entity (with neither, or both: both)',
  READ_USAGE,
  TARGET_USAGE,
].join('\n');

type Direction = 'outgoing' | 'incoming';

export interface InspectOptions {
  depth: number;
  directions: Direction[];
}

const entityType = (id: string) => id.split('-')[0];

/** The ids an entity's relations in one direction reach, by relation kind */
function relatedByKind(query: EarsQuery, entityId: EARS.EntityId, direction: Direction): Map<string, string[]> {
  const relations = direction === 'outgoing'
    ? query.findRelations({ sourceEntity: entityId })
    : query.findRelations({ targetEntity: entityId });
  const byKind = new Map<string, string[]>();
  for (const relation of relations) {
    const other = direction === 'outgoing' ? relation.targetEntity : relation.sourceEntity;
    byKind.set(relation.relationType, [...(byKind.get(relation.relationType) ?? []), other]);
  }
  return byKind;
}

/**
 * The lines showing an entity and its relations in `options.directions`, followed `options.depth` levels (a
 * related entity at the last level is listed by id, and one already shown isn't shown again)
 */
export function graphLines(query: EarsQuery, entityId: string, options: InspectOptions, depth = options.depth, indent = '', seen = new Set<string>()): string[] {
  if (seen.has(entityId)) return [`${indent}[${entityType(entityId)}] ${entityId} (shown above)`];
  seen.add(entityId);
  const attributes = query.getAll(entityId as EARS.EntityId);
  if (Object.keys(attributes).length === 0) return [`${indent}Not found: ${entityId}`];

  const name = String(attributes.label ?? attributes.name ?? attributes.title ?? '');
  const lines = [`${indent}[${entityType(entityId)}] ${entityId}${name ? ` "${name.length > 40 ? `${name.slice(0, 40)}...` : name}"` : ''}`];
  const roles = query.getRoles(entityId as EARS.EntityId);
  if (roles.length > 0) lines.push(`${indent}  roles: ${roles.join(', ')}`);

  for (const direction of options.directions) {
    const byKind = relatedByKind(query, entityId as EARS.EntityId, direction);
    const arrow = direction === 'outgoing' ? '->' : '<-';
    for (const [kind, related] of byKind) {
      lines.push(`${indent}  ${arrow} ${kind} (${related.length})`);
      const shown = related.slice(0, 10);
      for (const relatedId of shown) {
        lines.push(...(depth > 1
          ? graphLines(query, relatedId, options, depth - 1, `${indent}    `, seen)
          : [`${indent}      [${entityType(relatedId)}] ${relatedId}`]));
      }
      if (related.length > shown.length) lines.push(`${indent}      ... and ${related.length - shown.length} more`);
    }
  }
  return lines;
}

/** Entities and outgoing relations per entity type, for the types that have entities */
export function relationStatsLines(query: EarsQuery, entityTypes: Iterable<string>): string[] {
  const rows = [...entityTypes].sort().flatMap((type) => {
    const ids = query.getEntitiesOfType(type as EARS.Entity);
    if (ids.length === 0) return [];
    const relations = ids.reduce((sum, id) => sum + query.findRelations({ sourceEntity: id }).length, 0);
    return [[type, String(ids.length), String(relations), (relations / ids.length).toFixed(1)]];
  });
  const header = ['Entity type', 'Entities', 'Relations', 'Per entity'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const line = (cells: string[]) => cells.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join('  ');
  return [line(header), ...rows.map(line)];
}

export async function dbInspect(args: string[], io: DbIo): Promise<void> {
  const { values, positionals, target } = parseDbArgs(args, OPTIONS, INSPECT_USAGE);
  if (positionals.length > 1) throw new Error(`Inspect one entity at a time\n\n${INSPECT_USAGE}`);
  const [entityId] = positionals;
  if (entityId && values.type) throw new Error(`Pass an entity id or --type, not both\n\n${INSPECT_USAGE}`);
  const depth = Number(values.depth);
  if (!Number.isInteger(depth) || depth < 1) throw new Error('--depth must be a whole number from 1');
  const [incoming, outgoing] = [values.incoming as boolean, values.outgoing as boolean];
  const directions: Direction[] = incoming === outgoing ? ['outgoing', 'incoming'] : incoming ? ['incoming'] : ['outgoing'];

  const db = await openTarget(target, { write: false, ignoreVersion: values['ignore-version'] as boolean }, io);
  try {
    if (entityId) {
      graphLines(db.query, entityId, { depth, directions }).forEach((line) => io.out(line));
    } else if (values.type) {
      const ids = db.query.getEntitiesOfType(values.type as EARS.Entity);
      io.out(`${ids.length} ${values.type} entities${ids.length > 5 ? ', the first 5:' : ''}`);
      for (const id of ids.slice(0, 5)) graphLines(db.query, id, { depth, directions }).forEach((line) => io.out(line));
    } else {
      relationStatsLines(db.query, db.schema.getRegisteredEntityTypes()).forEach((line) => io.out(line));
    }
  } finally {
    db.close();
  }
}

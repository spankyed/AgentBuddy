#!/usr/bin/env tsx
/**
 * Inspect entity relationships
 *
 * Usage:
 *   npm run db:script scripts/db/inspect-relations.ts
 *   npm run db:script scripts/db/inspect-relations.ts -- --entity Thread-123 --incoming
 */

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { findRelations, untypedQx as qx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import { packs } from './database';

export interface InspectOptions {
  entityId?: string;
  entityType?: EARS.Entity;
  depth: number;
  showIncoming: boolean;
  showOutgoing: boolean;
}

/** `--incoming` and `--outgoing` pick the directions shown; with neither (or both), both are. */
export function parseInspectArgs(args: string[]): InspectOptions {
  const options: InspectOptions = { depth: 1, showIncoming: true, showOutgoing: true };
  let incoming = false;
  let outgoing = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--entity':
      case '-e':
        options.entityId = args[++i];
        break;
      case '--type':
      case '-t':
        options.entityType = args[++i] as EARS.Entity;
        break;
      case '--depth':
      case '-d':
        options.depth = parseInt(args[++i] || '1', 10);
        break;
      case '--incoming':
        incoming = true;
        break;
      case '--outgoing':
        outgoing = true;
        break;
    }
  }

  if (incoming || outgoing) {
    options.showIncoming = incoming;
    options.showOutgoing = outgoing;
  }
  return options;
}

type Direction = 'outgoing' | 'incoming';
type Log = (line: string) => void;

/** The entities an entity's relations in one direction point at, grouped by relation kind */
function relatedByKind(entityId: string, direction: Direction): { total: number; byKind: Map<EARS.RelKind, string[]> } {
  const relations = direction === 'outgoing'
    ? findRelations({ sourceEntity: entityId as EARS.EntityId })
    : findRelations({ targetEntity: entityId as EARS.EntityId });
  const byKind = new Map<EARS.RelKind, string[]>();
  for (const rel of relations ?? []) {
    const other = direction === 'outgoing' ? rel.targetEntity : rel.sourceEntity;
    const list = byKind.get(rel.relationType) ?? [];
    list.push(other);
    byKind.set(rel.relationType, list);
  }
  return { total: relations?.length ?? 0, byKind };
}

/**
 * Prints an entity and its relations in the directions `options` selects, following them
 * `depth` levels (a related entity is listed at the last level).
 */
export function visualizeGraph(
  entityId: string,
  depth: number,
  options: Pick<InspectOptions, 'showIncoming' | 'showOutgoing'>,
  log: Log = console.log,
  visited = new Set<string>(),
): void {
  if (visited.has(entityId) || depth <= 0) return;
  visited.add(entityId);

  const indent = '  '.repeat(Math.max(0, 2 - depth));

  const entity = qx(entityId as EARS.EntityId).pickAll()[0];
  if (!entity) {
    log(`${indent}❌ Entity not found: ${entityId}`);
    return;
  }

  const type = entityId.split('-')[0];
  const name = String(entity.name || entity.title || entity.content || '');
  const preview = name ? ` "${name.substring(0, 30)}${name.length > 30 ? '...' : ''}"` : '';
  log(`${indent}📦 [${type}] ${entityId}${preview}`);

  const directions: Direction[] = [
    ...(options.showOutgoing ? ['outgoing' as const] : []),
    ...(options.showIncoming ? ['incoming' as const] : []),
  ];

  for (const direction of directions) {
    const { total, byKind } = relatedByKind(entityId, direction);
    if (total === 0) continue;

    const [label, arrow, noun] = direction === 'outgoing' ? ['Outgoing', '→', 'target'] : ['Incoming', '←', 'source'];
    log(`${indent}  └─ ${label} (${total}):`);

    byKind.forEach((related, relType) => {
      log(`${indent}      ${relType} ${arrow} ${related.length} ${noun}(s)`);
      const shown = depth > 1 ? 3 : 5;
      related.slice(0, shown).forEach((relatedId) => {
        if (depth > 1) visualizeGraph(relatedId, depth - 1, options, log, visited);
        else log(`${indent}        - [${relatedId.split('-')[0]}] ${relatedId}`);
      });
      if (related.length > shown) {
        log(`${indent}        ... and ${related.length - shown} more`);
      }
    });
  }
}

function inspectRelations(options: InspectOptions, log: Log = console.log) {
  log('🔍 Inspecting Entity Relations\n');
  log('─'.repeat(50));

  if (options.entityId) {
    log(`Entity: ${options.entityId}`);
    log(`Depth: ${options.depth}`);
    log('');
    visualizeGraph(options.entityId, options.depth, options, log);
  } else if (options.entityType) {
    const entities = qx(options.entityType).ids();
    log(`Entity Type: ${options.entityType}`);
    log(`Found: ${entities.length} entities`);
    log('');

    if (entities.length === 0) {
      log('No entities found');
      return;
    }

    const limit = 5;
    entities.slice(0, limit).forEach((id) => {
      visualizeGraph(id, options.depth, options, log);
      log('');
    });

    if (entities.length > limit) {
      log(`... and ${entities.length - limit} more entities`);
    }
  } else {
    log('📊 Relationship Statistics:\n');

    const stats: Record<string, { entities: number; relations: number }> = {};

    for (const entityType of packs.getRegisteredEntityTypes() as ReadonlySet<EARS.Entity>) {
      const entities = qx(entityType).ids();
      if (entities.length === 0) continue;

      let totalRelations = 0;
      entities.forEach((id) => {
        totalRelations += findRelations({ sourceEntity: id as EARS.EntityId })?.length ?? 0;
      });
      stats[entityType] = { entities: entities.length, relations: totalRelations };
    }

    log('Entity Type          | Entities | Relations | Avg Rels/Entity');
    log('─'.repeat(65));

    Object.entries(stats).forEach(([type, data]) => {
      const avg = data.entities > 0 ? (data.relations / data.entities).toFixed(1) : '0';
      log(`${type.padEnd(20)} | ${String(data.entities).padStart(8)} | ${String(data.relations).padStart(9)} | ${avg.padStart(15)}`);
    });

    log('\nTip: Use --entity <id> or --type <type> to inspect specific entities');
  }
}

// Run as a script: db:script sets process.argv to this file and its arguments (the spec imports the functions)
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    inspectRelations(parseInspectArgs(process.argv.slice(2)));
  } catch (error) {
    console.error('❌ Inspection failed:', error);
    process.exit(1);
  }
}

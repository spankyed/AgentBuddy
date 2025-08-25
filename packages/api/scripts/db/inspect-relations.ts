#!/usr/bin/env tsx
/**
 * Example script: Inspect entity relationships
 * 
 * Usage:
 *   npm run db:script scripts/db/inspect-relations.ts
 *   npm run db:script scripts/db/inspect-relations.ts -- --entity Thread-123
 */

import { qx } from '@/core/ears/helpers/query';
import { EARS } from '@/core/types';
import { getRelations, getIncomingRelations } from '@/core/ears/attribute-storage';

interface InspectOptions {
  entityId?: string;
  entityType?: EARS.Entity;
  depth: number;
  showIncoming: boolean;
  showOutgoing: boolean;
}

function parseArgs(): InspectOptions {
  const args = process.argv.slice(2);
  const options: InspectOptions = {
    depth: 1,
    showIncoming: true,
    showOutgoing: true
  };

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
        options.showIncoming = true;
        options.showOutgoing = false;
        break;
      case '--outgoing':
        options.showIncoming = false;
        options.showOutgoing = true;
        break;
    }
  }

  return options;
}

function visualizeGraph(entityId: string, depth: number, visited = new Set<string>()): void {
  if (visited.has(entityId) || depth <= 0) return;
  visited.add(entityId);

  const indent = '  '.repeat(Math.max(0, 2 - depth));
  
  // Get entity details
  const entity = qx(entityId).pickOne();
  if (!entity) {
    console.log(`${indent}❌ Entity not found: ${entityId}`);
    return;
  }

  const type = entityId.split('-')[0];
  const name = entity.name || entity.title || entity.content || '';
  const preview = name ? ` "${name.substring(0, 30)}${name.length > 30 ? '...' : ''}"` : '';
  
  console.log(`${indent}📦 [${type}] ${entityId}${preview}`);

  // Get outgoing relations
  const relations = getRelations(entityId);
  
  if (relations && relations.length > 0) {
    console.log(`${indent}  └─ Outgoing (${relations.length}):`);
    
    // Group by relation type
    const grouped = new Map<EARS.RelKind, string[]>();
    relations.forEach(rel => {
      if (!grouped.has(rel.relationType)) {
        grouped.set(rel.relationType, []);
      }
      grouped.get(rel.relationType)!.push(rel.targetEntity);
    });

    grouped.forEach((targets, relType) => {
      console.log(`${indent}      ${relType} → ${targets.length} target(s)`);
      
      if (depth > 1) {
        targets.slice(0, 3).forEach(targetId => {
          visualizeGraph(targetId, depth - 1, visited);
        });
        
        if (targets.length > 3) {
          console.log(`${indent}        ... and ${targets.length - 3} more`);
        }
      } else {
        targets.slice(0, 5).forEach(targetId => {
          const targetType = targetId.split('-')[0];
          console.log(`${indent}        - [${targetType}] ${targetId}`);
        });
        
        if (targets.length > 5) {
          console.log(`${indent}        ... and ${targets.length - 5} more`);
        }
      }
    });
  }

  // Get incoming relations
  const incoming = getIncomingRelations(entityId);
  
  if (incoming && incoming.length > 0) {
    console.log(`${indent}  └─ Incoming (${incoming.length}):`);
    
    // Group by relation type
    const grouped = new Map<EARS.RelKind, string[]>();
    incoming.forEach(rel => {
      if (!grouped.has(rel.relationType)) {
        grouped.set(rel.relationType, []);
      }
      grouped.get(rel.relationType)!.push(rel.sourceEntity);
    });

    grouped.forEach((sources, relType) => {
      console.log(`${indent}      ${relType} ← ${sources.length} source(s)`);
      
      sources.slice(0, 5).forEach(sourceId => {
        const sourceType = sourceId.split('-')[0];
        console.log(`${indent}        - [${sourceType}] ${sourceId}`);
      });
      
      if (sources.length > 5) {
        console.log(`${indent}        ... and ${sources.length - 5} more`);
      }
    });
  }
}

async function inspectRelations() {
  const options = parseArgs();
  
  console.log('🔍 Inspecting Entity Relations\n');
  console.log('─'.repeat(50));

  if (options.entityId) {
    // Inspect specific entity
    console.log(`Entity: ${options.entityId}`);
    console.log(`Depth: ${options.depth}`);
    console.log();
    
    visualizeGraph(options.entityId, options.depth);
  } else if (options.entityType) {
    // Inspect all entities of a type
    const entities = qx(options.entityType).ids();
    console.log(`Entity Type: ${options.entityType}`);
    console.log(`Found: ${entities.length} entities`);
    console.log();

    if (entities.length === 0) {
      console.log('No entities found');
      return;
    }

    // Show first few entities
    const limit = 5;
    entities.slice(0, limit).forEach(id => {
      visualizeGraph(id, options.depth);
      console.log();
    });

    if (entities.length > limit) {
      console.log(`... and ${entities.length - limit} more entities`);
    }
  } else {
    // Show overall statistics
    console.log('📊 Relationship Statistics:\n');
    
    const stats: Record<string, { entities: number; relations: number }> = {};
    
    for (const entityType of Object.values(EARS.Entity)) {
      const entities = qx(entityType).ids();
      if (entities.length === 0) continue;

      let totalRelations = 0;
      entities.forEach(id => {
        const rels = getRelations(id);
        if (rels) totalRelations += rels.length;
      });

      if (entities.length > 0 || totalRelations > 0) {
        stats[entityType] = {
          entities: entities.length,
          relations: totalRelations
        };
      }
    }

    // Display stats in a table format
    console.log('Entity Type          | Entities | Relations | Avg Rels/Entity');
    console.log('─'.repeat(65));
    
    Object.entries(stats).forEach(([type, data]) => {
      const avg = data.entities > 0 ? (data.relations / data.entities).toFixed(1) : '0';
      const typePadded = type.padEnd(20);
      const entitiesPadded = String(data.entities).padStart(8);
      const relationsPadded = String(data.relations).padStart(9);
      const avgPadded = avg.padStart(15);
      
      console.log(`${typePadded} | ${entitiesPadded} | ${relationsPadded} | ${avgPadded}`);
    });

    console.log('\nTip: Use --entity <id> or --type <type> to inspect specific entities');
  }
}

// Run the inspection
inspectRelations().catch(error => {
  console.error('❌ Inspection failed:', error);
  process.exit(1);
});
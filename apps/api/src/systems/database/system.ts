import { setup } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, safeEvents } from '@/shared/utils/actor-helpers';
import { EARS } from '@/shared/ears/types';
import { z } from 'zod';
import { qx } from '@/shared/ears/helpers/query';
import { getAllEntities, getAll, queryEntitiesByRelationTo } from '@/shared/ears/attribute-storage';
import { relationIndex } from '@/shared/ears/relation-index';
import type { DatabaseQueryResult, DatabaseSchemaInfo, DatabaseStartupData } from './types';

export const database = 'database' as const;

const busEvent = systemBus(database);

export const IncomingDatabaseEvents = [
  busEvent('EXECUTE_QUERY', {
    code: z.string(),
  }),
] as const;

export type DatabaseInternalEvents = 
  | { type: 'CLIENT_CONNECTED' }
  | SystemEvents;

export type OutgoingDatabaseEvents = 
  | { type: 'DATABASE_STARTUP'; data: DatabaseStartupData }
  | { type: 'QUERY_RESULT'; result: DatabaseQueryResult; error?: string }
  | { type: 'QUERY_ERROR'; error: string };

export interface DatabaseContext {
  databaseId: EARS.EntityId;
}

export const DatabaseSystemEvents = fromSystem(IncomingDatabaseEvents)<OutgoingDatabaseEvents, typeof database>();
type ReceivableEvents = MergeReceivable<typeof IncomingDatabaseEvents, DatabaseInternalEvents>;
const typeOf = safeEvents<ReceivableEvents>();

// Generate schema information from the EARS types
function generateSchemaInfo(): DatabaseSchemaInfo {
  // Get all entity types from the enum
  const entities = Object.values(EARS.Entity).map(type => ({
    type,
    description: getEntityDescription(type),
  }));

  // Get common attributes from the code
  const attributes = [
    { kind: 'label', description: 'Display name or title' },
    { kind: 'timestamp', description: 'Creation timestamp' },
    { kind: 'lastUpdated', description: 'Last update timestamp' },
    { kind: 'description', description: 'Text description' },
    { kind: 'status', description: 'Current status' },
    { kind: 'type', description: 'Type or category' },
    { kind: 'content', description: 'Main content' },
    { kind: 'role', description: 'Role designation' },
  ];

  // Get relations from the RelKind values
  const relations = [
    { kind: EARS.RelKind.PARENT_OF, description: 'Parent-child relationship' },
    { kind: EARS.RelKind.CONTAINS, description: 'Container relationship' },
    { kind: EARS.RelKind.SPAWNED, description: 'Creation relationship' },
    { kind: EARS.RelKind.REPLIED_TO, description: 'Reply relationship' },
    { kind: EARS.RelKind.HAS, description: 'Ownership relationship' },
    { kind: EARS.RelKind.TRANSITIONS_TO, description: 'State transition' },
    { kind: EARS.RelKind.CONSUMED_BY, description: 'Consumption relationship' },
    { kind: EARS.RelKind.EMITS, description: 'Emission relationship' },
    { kind: EARS.RelKind.BLOCKS, description: 'Blocking dependency' },
    { kind: EARS.RelKind.DEPENDS_ON, description: 'Required dependency' },
    { kind: EARS.RelKind.RELATES_TO, description: 'General relationship' },
    { kind: EARS.RelKind.DUPLICATES, description: 'Duplication relationship' },
  ];

  return { entities, attributes, relations };
}

function getEntityDescription(type: EARS.Entity): string {
  const descriptions: Record<EARS.Entity, string> = {
    [EARS.Entity.Agent]: 'AI agent or assistant',
    [EARS.Entity.Brain]: 'Knowledge base or memory storage',
    [EARS.Entity.Message]: 'Chat message or communication',
    [EARS.Entity.Thread]: 'Conversation thread',
    [EARS.Entity.Tag]: 'Label or category tag',
    [EARS.Entity.Relation]: 'Relationship between entities',
    [EARS.Entity.ContextItem]: 'Context or reference item',
    [EARS.Entity.CanvasItem]: 'Visual canvas element',
    [EARS.Entity.Flow]: 'Workflow or process flow',
    [EARS.Entity.Node]: 'Flow node or step',
  };
  return descriptions[type] || '';
}

// Execute user query code
async function executeQuery(code: string): Promise<DatabaseQueryResult> {
  try {
    // Create a function that executes the user's code
    // The user has access to qx, EARS types, and query helpers
    const func = new Function('qx', 'EARS', 'getAllEntities', 'getAll', 'queryEntitiesByRelationTo', `
      return (async () => {
        ${code}
      })();
    `);
    
    const result = await func(qx, EARS, getAllEntities, getAll, queryEntitiesByRelationTo);
    
    // If result is already in the expected format, return it
    if (result && typeof result === 'object' && 'nodes' in result && 'edges' in result) {
      return result as DatabaseQueryResult;
    }
    
    // Otherwise, try to convert qx result to graph format
    if (result && typeof result === 'object' && typeof result.ids === 'function') {
      const ids = result.ids();
      const nodes = ids.map((id: EARS.EntityId) => {
        const [entityType] = id.split('-') as [EARS.Entity];
        return {
          id,
          type: entityType,
          data: getAll(id),
        };
      });
      
      // Get edges from relations
      const edges: DatabaseQueryResult['edges'] = [];
      const processedEdges = new Set<string>();
      
      for (const id of ids) {
        for (const [relKind, index] of Object.entries(relationIndex)) {
          if (!index) continue;
          
          // Get relations where this entity is the source
          const targets = index.bySource[id];
          if (targets) {
            for (const target of targets) {
              const edgeId = `${id}-${relKind}-${target}`;
              if (!processedEdges.has(edgeId)) {
                processedEdges.add(edgeId);
                edges.push({
                  id: edgeId,
                  source: id,
                  target,
                  type: relKind as EARS.RelKind,
                });
              }
            }
          }
        }
      }
      
      return { nodes, edges };
    }
    
    // If we can't convert, return empty result
    return { nodes: [], edges: [] };
  } catch (error) {
    throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const databaseSystem = setup({
  types: {
    context: {} as DatabaseContext,
    events: {} as ReceivableEvents,
    input: {} as EARS.EntityId,
  },
  actions: {
    sendDatabaseStartupData: ({ system }) => {
      const schema = generateSchemaInfo();
      system.get(bus).send(emit(database, { 
        type: 'DATABASE_STARTUP',
        data: { schema }
      }));
    },
    executeQuery: async ({ system, event }) => {
      const { code } = typeOf('EXECUTE_QUERY', event);
      
      try {
        const result = await executeQuery(code);
        system.get(bus).send(emit(database, { 
          type: 'QUERY_RESULT',
          result
        }));
      } catch (error) {
        system.get(bus).send(emit(database, { 
          type: 'QUERY_ERROR',
          error: error instanceof Error ? error.message : String(error)
        }));
      }
    },
  },
}).createMachine(
  {
    id: database,
    initial: 'idle',
    context: ({ input }) => ({
      databaseId: input,
    }),
    on: {
      CLIENT_CONNECTED: {
        actions: 'sendDatabaseStartupData',
      },
    },
    states: {
      idle: {
        on: {
          EXECUTE_QUERY: {
            actions: 'executeQuery',
          },
        },
      },
    },
  }
); 
import { EARS } from '@/shared/ears';

export { databaseSystem, database, DatabaseSystemEvents } from './system';
export { executeQuery } from './query-executor';
export type { 
  DatabaseInternalEvents,
  OutgoingDatabaseEvents,
  DatabaseContext 
} from './system';
export type { 
  DatabaseQueryResult,
  DatabaseSchemaInfo,
  DatabaseStartupData
} from './types'; 

// const attributes = [
//   { kind: 'label', description: 'Display name or title' },
//   { kind: 'timestamp', description: 'Creation timestamp' },
//   { kind: 'lastUpdated', description: 'Last update timestamp' },
//   { kind: 'description', description: 'Text description' },
//   { kind: 'status', description: 'Current status' },
//   { kind: 'type', description: 'Type or category' },
//   { kind: 'content', description: 'Main content' },
//   { kind: 'role', description: 'Role designation' },
// ];

// // Get relations from the RelKind values
// const relations = [
//   { kind: EARS.RelKind.PARENT_OF, description: 'Parent-child relationship' },
//   { kind: EARS.RelKind.CONTAINS, description: 'Container relationship' },
//   { kind: EARS.RelKind.SPAWNED, description: 'Creation relationship' },
//   { kind: EARS.RelKind.REPLIED_TO, description: 'Reply relationship' },
//   { kind: EARS.RelKind.HAS, description: 'Ownership relationship' },
//   { kind: EARS.RelKind.TRANSITIONS_TO, description: 'State transition' },
//   { kind: EARS.RelKind.CONSUMED_BY, description: 'Consumption relationship' },
//   { kind: EARS.RelKind.EMITS, description: 'Emission relationship' },
//   { kind: EARS.RelKind.BLOCKS, description: 'Blocking dependency' },
//   { kind: EARS.RelKind.DEPENDS_ON, description: 'Required dependency' },
//   { kind: EARS.RelKind.RELATES_TO, description: 'General relationship' },
//   { kind: EARS.RelKind.DUPLICATES, description: 'Duplication relationship' },
// ];

// const descriptions: Record<EARS.Entity, string> = {
//   [EARS.Entity.Agent]: 'AI agent or assistant',
//   [EARS.Entity.Brain]: 'Knowledge base or memory storage',
//   [EARS.Entity.Message]: 'Chat message or communication',
//   [EARS.Entity.Thread]: 'Conversation thread',
//   [EARS.Entity.Tag]: 'Label or category tag',
//   [EARS.Entity.Relation]: 'Relationship between entities',
//   [EARS.Entity.ContextItem]: 'Context or reference item',
//   [EARS.Entity.CanvasItem]: 'Visual canvas element',
//   [EARS.Entity.Flow]: 'Workflow or process flow',
//   [EARS.Entity.Node]: 'Flow node or step',
// };

import type { BaseEntity } from '@/shared/types';
import { EARS } from '@/shared/ears/types';
import { flowRows } from './repository/mock-data';


export interface FlowEntity extends BaseEntity {
  entityType: EARS.Entity.Flow;
  label: string;
  description?: string;
  flowType: 'workflow' | 'integration';
  // steps: string[]; // Array of step IDs or names
}

export interface NodeEntity extends BaseEntity {
  entityType: EARS.Entity.Node;
  nodeType: 'query' | 'create' | 'update' | 'action' | 'decision' | 'fire' | 'listen' | 'transform' | 'flow';
  label: string;
  description?: string;
  prompt?: string;
  x?: number; // X coordinate for visualization
  y?: number; // Y coordinate for visualization
  color?: string;
  // config?: any;
}

// --------------------------------------------------------------------------------
export type FlowTypeCodes = 'variable' | 'llm' | 'decision' | 'action' | 'subflow';
export type FlowTypeShortCode = `${FlowTypeCodes}-${number}`;
export type FlowStatus = 'draft' | 'queued' | 'active' | 'inactive';

export type EdgeEntity = {
  id: EARS.EntityId;
  kind: EARS.RelKind;
  source: EARS.EntityId;
  target: EARS.EntityId;
  info?: { [key: string]: any; } 
};
export interface FlowsStartupData {
  graph: {
    nodes: Partial<NodeEntity>[];
    edges: EdgeEntity[];
  };
  flows: Partial<FlowEntity>[];
  rootFlow?: Partial<FlowEntity>;
}

// export type FlowsStartupData = {
//     flows: FlowEntity[];
//     steps: StepEntity[];
//     stepRelations: StepRelation[];
//     events: FlowEventEntity[];
// }

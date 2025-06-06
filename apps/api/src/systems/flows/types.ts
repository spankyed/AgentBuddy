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

export interface StepEntity extends BaseEntity {
  entityType: EARS.Entity.Step;
  stepType: 'query' | 'variable' | 'action' | 'decision' | 'fire-event' | 'event-listener' | 'response' | 'transform' | 'llm';
  label: string;
  prompt?: string;
  x: number; // X coordinate for visualization
  y: number; // Y coordinate for visualization
  color?: string;
  // config?: any;
}

export interface FlowEventEntity extends BaseEntity {
  entityType: EARS.Entity.FlowEvent;
  label: string;
  description?: string;
  color?: string;
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
    nodes: Partial<StepEntity>[];
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

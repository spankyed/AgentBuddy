import type { FlowEntity, FlowEventEntity, StepEntity } from '@/shared/types';
import { flowRows } from './repository/mock-data';

export type FlowTypeCodes = 'variable' | 'llm' | 'decision' | 'action' | 'subflow';
export type FlowTypeShortCode = `${FlowTypeCodes}-${number}`;

export type FlowStatus = 'draft' | 'queued' | 'active' | 'inactive';

export type FlowsStartupData = typeof flowRows

// export type FlowsStartupData = {
//     flows: FlowEntity[];
//     steps: StepEntity[];
//     stepRelations: StepRelation[];
//     events: FlowEventEntity[];
// }

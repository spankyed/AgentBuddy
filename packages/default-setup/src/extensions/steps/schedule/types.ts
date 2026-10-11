import type { NodeBase } from '@apack/sdk';

export interface ScheduleNode extends NodeBase {
  nodeType: 'schedule';
  cronExpression: string;
}

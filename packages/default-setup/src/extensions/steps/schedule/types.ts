import type { NodeBase } from '@apackdev/sdk';

export interface ScheduleNode extends NodeBase {
  nodeType: 'schedule';
  cronExpression: string;
}

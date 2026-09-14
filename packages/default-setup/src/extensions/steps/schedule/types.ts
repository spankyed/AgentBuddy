import type { NodeBase } from '@abuddy/sdk';

export interface ScheduleNode extends NodeBase {
  nodeType: 'schedule';
  cronExpression: string;
}

import type { NodeBase } from '@abuddy/sdk/build';

export interface ScheduleNode extends NodeBase {
  nodeType: 'schedule';
  cronExpression: string;
}

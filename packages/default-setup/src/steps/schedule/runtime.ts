import type { TriggerRuntimeNode, TriggerRuntimeContext } from '@abuddy/sdk/steps';
import { registerSchedule } from '@/features/brain/be/services/scheduler';

export function register(node: TriggerRuntimeNode, ctx: TriggerRuntimeContext): void {
  registerSchedule(
    `${ctx.flowTNodeId}:${node.id}`,
    node.cronExpression as string,
    () => {
      ctx.sendToBrainSystem({
        eventType: `schedule.${node.id}`,
        targetFlowId: ctx.flowTNodeId,
      });
    },
  );
}

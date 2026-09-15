import type { TriggerRuntimeNode, TriggerRuntimeContext } from '@abuddy/sdk/steps';
import { services } from '@/__generated__/services';

export function register(node: TriggerRuntimeNode, ctx: TriggerRuntimeContext): void {
  // Through the scheduler service, so unit tests can drive ticks (mockService('scheduler', …))
  services.scheduler.registerSchedule(
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

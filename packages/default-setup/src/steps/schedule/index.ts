import type { StepDefinition, TriggerRuntimeNode, TriggerRuntimeContext } from '@abuddy/sdk/steps';
import { EARS } from '@/registries/ears';
import { Cron } from 'croner';
import { registerSchedule } from '@/plugins/brain/be/services/scheduler';

export const scheduleTrigger: StepDefinition = {
  type: 'schedule',
  kind: 'trigger',
  trigger: {
    trackField: 'schedule',
    compile(track, trackId, ts, trackKey) {
      return {
        id: trackId,
        entityType: EARS.Entity.Node,
        createdAt: ts,
        nodeType: 'schedule',
        label: (track as any).label || 'Schedule',
        description: (track as any).description,
        trackKey,
        cronExpression: (track as any).schedule,
      };
    },
    decompile(node) {
      return { schedule: (node as any).cronExpression };
    },
    persistent: true,
    register(node: TriggerRuntimeNode, ctx: TriggerRuntimeContext) {
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
    },
    queryFields: ['cronExpression'],
    validateTrack(track) {
      const errors: string[] = [];
      const cron = (track as any).schedule as string | undefined;
      if (!cron || cron.trim().length === 0) {
        errors.push('Missing required field: schedule');
      } else {
        const parts = cron.trim().split(/\s+/);
        if (parts.length < 5 || parts.length > 6) {
          errors.push('Invalid cron expression');
        } else {
          try {
            new Cron(cron);
          } catch {
            errors.push('Invalid cron expression');
          }
        }
      }
      return { valid: errors.length === 0, errors };
    },
    validate(node) {
      const errors: string[] = [];
      const cron = (node as any).cronExpression as string | undefined;
      if (!cron || cron.trim().length === 0) {
        errors.push('Missing required field: cronExpression');
      } else {
        const parts = cron.trim().split(/\s+/);
        if (parts.length < 5 || parts.length > 6) {
          errors.push('Invalid cron expression');
        } else {
          try {
            new Cron(cron);
          } catch {
            errors.push('Invalid cron expression');
          }
        }
      }
      return { valid: errors.length === 0, errors };
    },
  },
  fe: {
    nodeConfig: {
      label: 'Schedule',
      defaultLabel: 'On schedule',
      icon: 'Clock',
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      hoverBgColor: 'group-hover:bg-cyan-500/15',
      connectionRules: { inputs: 0, outputs: -1 },
      category: 'trigger',
    },
    colorKey: 'cyan',
    defaults: { cronExpression: '0 * * * *' },
  },
};

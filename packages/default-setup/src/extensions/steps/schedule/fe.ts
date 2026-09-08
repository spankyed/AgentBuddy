import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Clock } from 'lucide-vue-next';

export const scheduleTriggerFE: StepDefinition = {
  type: 'schedule',
  kind: 'trigger',
  fe: {
    loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
    nodeConfig: {
      label: 'Schedule',
      defaultLabel: 'On schedule',
      icon: Clock,
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

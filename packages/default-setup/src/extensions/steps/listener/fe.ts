import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Radio } from 'lucide-vue-next';

export const listenerTriggerFE: StepDefinition = {
  type: 'listener',
  kind: 'trigger',
  fe: {
    loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
    nodeConfig: {
      label: 'Listener',
      defaultLabel: 'On event',
      icon: Radio,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      hoverBgColor: 'group-hover:bg-blue-500/15',
      connectionRules: { inputs: 0, outputs: -1 },
      category: 'trigger',
      isImplemented: true,
    },
    colorKey: 'blue',
    defaults: { scope: 'global', eventType: '' },
  },
};

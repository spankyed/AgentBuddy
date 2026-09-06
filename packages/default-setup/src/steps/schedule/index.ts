import type { StepDefinition } from '@abuddy/sdk/steps';
import { Clock } from 'lucide-vue-next';
import { compile, decompile, validateTrack, validate } from './build';

export const scheduleTrigger: StepDefinition = {
  type: 'schedule',
  kind: 'trigger',
  trigger: {
    trackField: 'schedule',
    compile,
    decompile,
    persistent: true,
    async register(node, ctx) {
      const { register } = await import('./runtime');
      return register(node, ctx);
    },
    queryFields: ['cronExpression'],
    validateTrack,
    validate,
  },
  fe: {
    loadComponents: () => ({ form: require('./form.vue').default }),
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

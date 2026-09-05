import type { StepDefinition } from '@abuddy/sdk/steps';
import { compile, validate, getLabel, decompile } from './build';

export const actionStep: StepDefinition = {
  type: 'action',
  build: { compile, validate, getLabel, decompile, relation: { field: 'actionId', targetEntity: 'Action' } },
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: {
    colorKey: 'neutral',
    nodeConfig: {
      label: 'Action',
      defaultLabel: 'Do action',
      icon: 'Play',
      color: 'text-neutral-400',
      bgColor: 'bg-neutral-700/20',
      hoverBgColor: 'group-hover:bg-neutral-700/30',
      connectionRules: { inputs: -1, outputs: -1 },
      component: 'ActionNode',
      category: 'action',
      isImplemented: true,
    },
  },
};

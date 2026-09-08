import type { StepDefinition } from '@abuddy/sdk/steps';
import { Split } from 'lucide-vue-next';

const SWITCH_DIMS = { rowHeight: 26, headerOffset: 43, bottomPadding: 10 };

export const switchStepFE: StepDefinition = {
  type: 'switch',
  fe: {
    loadComponents: () => ({
      node: require('./node.vue').default,
      form: require('./form.vue').default,
    }),
    colorKey: 'yellow',
    nodeConfig: {
      label: 'Switch',
      defaultLabel: 'Choose path',
      icon: Split,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      hoverBgColor: 'group-hover:bg-yellow-500/15',
      connectionRules: { inputs: 1, outputs: -1 },
      component: 'SwitchNode',
      category: 'logic',
      isImplemented: true,
    },
    defaults: { conditions: [{ predicate: undefined, label: 'Else' }] },
    handlePrefix: 'branch',
    layout: {
      getHeight: (node) => {
        const branchCount = (node.conditions as any[])?.length ?? 0;
        return Math.max(50, SWITCH_DIMS.headerOffset + branchCount * SWITCH_DIMS.rowHeight + SWITCH_DIMS.bottomPadding);
      },
      getPorts: (node) => {
        const branchCount = (node.conditions as any[])?.length ?? 0;
        const ports: Array<{ id: string; layoutOptions: Record<string, string> }> = [
          { id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } },
        ];
        for (let i = 0; i < branchCount; i++) {
          ports.push({
            id: `${node.id}-out-branch-${i}`,
            layoutOptions: { 'port.side': 'EAST', 'port.index': String(i) },
          });
        }
        return ports;
      },
      hasInput: true,
    },
  },
};

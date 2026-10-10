import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Split } from 'lucide-vue-next';

const SWITCH_DIMS = { rowHeight: 26, headerOffset: 43, bottomPadding: 10 };

export const switchStepFE: StepFEFacet = {
  loadComponents: () => ({
    node: defineAsyncComponent(() => import('./node.vue')),
    form: defineAsyncComponent(() => import('./form.vue')),
  }),
  colorKey: 'yellow',
  nodeConfig: {
    icon: Split,
    connectionRules: { inputs: 1, outputs: -1 },
    category: 'logic',
    isImplemented: true,
  },
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
};

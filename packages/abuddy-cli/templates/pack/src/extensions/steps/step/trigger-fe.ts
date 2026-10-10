// How a trigger is drawn. A second file rather than a placeholder in `fe.ts`, because what differs is a
// union member and an object literal — a placeholder in either would stop the template typechecking, and a
// template is ordinary pack code an author reads. Its label and the fields a new node starts with are not
// here: they are what both the backend and the canvas read, so they live in the `node` facet in `trigger.ts`.
import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Radio } from 'lucide-vue-next';

export const __CAMEL__TriggerFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'blue',
  nodeConfig: {
    icon: Radio,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    hoverBgColor: 'group-hover:bg-blue-500/15',
    // A trigger starts a flow, so nothing connects into it and it may fan out without limit
    connectionRules: { inputs: 0, outputs: -1 },
    category: 'trigger',
    isImplemented: true,
  },
};

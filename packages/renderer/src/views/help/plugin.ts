import type { PluginDefinition } from '@apackdev/sdk/fe';
import { helpMachine } from '@apackdev/host/fe';
import { CircleHelp } from 'lucide-vue-next';
import canvas from './canvas.vue';

export const helpPlugin: PluginDefinition = {
  label: 'Help', icon: CircleHelp, state: helpMachine, canvas, isPinned: true,
};

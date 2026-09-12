import { defineAsyncComponent } from 'vue';
import type { Plugin } from "@abuddy/sdk/fe";
import { Code2 } from 'lucide-vue-next';
import state, { id } from './state.ts';
import settings from './settings.vue';

const canvas = defineAsyncComponent(() => import('./canvas/canvas.vue'));
const panel = defineAsyncComponent(() => import('./features/panel.vue'));

const codePlugin: Plugin = {
  id,
  label: 'Code',
  icon: Code2,
  state,
  canvas,
  panel,
  settings,
  isPinned: false,
  hotkeys: [
    {
      action: 'openTerminal',
      global: false
    },
    {
      action: 'openTerminalTab',
      global: false
    },
    {
      action: 'navigatePrevPanel',
      global: false
    },
    {
      action: 'navigateNextPanel',
      global: false
    },
    {
      action: 'focusSearch',
      global: false
    }
  ]
};

export default codePlugin;
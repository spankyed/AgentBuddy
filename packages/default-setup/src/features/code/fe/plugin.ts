import { defineAsyncComponent } from 'vue';
import { definePlugin } from '@apackdev/sdk/fe';
import { Code2 } from 'lucide-vue-next';
import state from './state.ts';

const canvas = defineAsyncComponent(() => import('./canvas/canvas.vue'));
const panel = defineAsyncComponent(() => import('./features/panel.vue'));

const codePlugin = definePlugin({
  label: 'Code',
  icon: Code2,
  state,
  canvas,
  panel,
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
});

export default codePlugin;
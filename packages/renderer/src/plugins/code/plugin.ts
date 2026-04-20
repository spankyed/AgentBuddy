import type { Plugin } from "@/core/types/index.ts";
import { Code2 } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas/canvas.vue';
import panel from './features/panel.vue';
import settings from './settings.vue';

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
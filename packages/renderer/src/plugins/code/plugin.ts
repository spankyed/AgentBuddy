import type { Plugin } from "@/core/types/index.ts";
import { Code2 } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas/canvas.vue';
import panel from './features/panel.vue';

const codePlugin: Plugin = {
  id,
  label: 'Code',
  icon: Code2,
  state,
  canvas,
  panel,
  isPinned: false,
  // Note: Code plugin hotkeys are not yet converted to dynamic system
  // hotkeys: [
  //   {
  //     action: 'openTerminal',
  //     description: 'Open terminal at current directory',
  //     global: false
  //   },
  //   {
  //     action: 'navigatePrevPanel',
  //     description: 'Navigate to previous panel',
  //     global: false
  //   },
  //   {
  //     action: 'navigateNextPanel',
  //     description: 'Navigate to next panel',
  //     global: false
  //   }
  // ]
};

export default codePlugin;
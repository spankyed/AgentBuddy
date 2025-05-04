import type { Plugin } from "../../helpers/types/index";
import { Code } from 'lucide-vue-next';
import state from './state.ts';
// import canvas from './canvas.vue';
import canvas from './canvas-dummy.vue';
import panel from './panel/panel.vue';

const agentPlugin: Plugin = {
  id: 'code',
  label: 'Code',
  icon: Code,
  state,
  canvas,
  panel
};

export default agentPlugin;
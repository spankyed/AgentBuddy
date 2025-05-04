import type { Plugin } from "@/helpers/types";
import state, { id } from './state.ts';
// import canvas from './canvas.vue';
import canvas from './canvas-dummy.vue';
import panel from './panel/panel.vue';
import chat from './chat/chat.vue';

const agentPlugin: Plugin = {
  id,
  label: 'Agent',
  // icon: Brain,
  state,
  canvas,
  panel,
  chat
};

export default agentPlugin;
import type { Plugin } from "@/helpers/types";
import state, { id } from './state.ts';
import display from './canvas/display.vue';
import workload from './canvas/blank.vue';
// import workload from './canvas/workload.vue';
import panel from './panel/panel.vue';
import chat from './chat/chat.vue';

const agentPlugin: Plugin = {
  id,
  label: 'Agent',
  // icon: Brain,
  state,
  canvas: {
    display,
    workload
  },
  panel,
  chat
};

export default agentPlugin;
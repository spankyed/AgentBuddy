import type { Plugin } from "@/core/types";
import state, { id } from '@/plugins/agent/state.ts';
import content from '@/plugins/agent/canvas/content.vue';
import workload from '@/plugins/agent/canvas/workload.vue';
// import workload from './canvas/workload.vue';
import panel from '@/plugins/agent/panel/panel.vue';
import chat from '@/plugins/agent/chat/chat.vue';

const agentPlugin: Plugin = {
  id,
  label: 'Agent',
  // icon: Brain,
  state,
  canvas: {
    content,
    workload
  },
  panel,
  chat,
  // welcomeScreen // show this component when the app is first loaded
};

export default agentPlugin;
import type { Plugin } from "@/core/types";
import state, { id } from '@/plugins/agent/state.ts';
import canvas from '@/plugins/agent/canvas/canvas.vue';
import panel from '@/plugins/agent/panel/panel.vue';
import chat from '@/plugins/agent/chat/chat.vue';
import { Inbox } from "lucide-vue-next";

const agentPlugin: Plugin = {
  id,
  label: 'Agent',
  icon: Inbox,
  state,
  canvas,
  panel,
  chat,
  // welcomeScreen // show this component when the app is first loaded
};

export default agentPlugin;
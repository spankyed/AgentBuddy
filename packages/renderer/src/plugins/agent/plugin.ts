import type { Plugin } from "@/core/types";
import state, { id } from '@/plugins/agent/state.ts';
import canvas from '@/plugins/agent/canvas/canvas.vue';
import chat from '@/plugins/agent/chat/chat.vue';
import settings from '@/plugins/agent/settings.vue';
import { BotMessageSquare } from "lucide-vue-next";

const agentPlugin: Plugin = {
  id,
  label: 'Agent',
  icon: BotMessageSquare,
  state,
  canvas,
  chat,
  settings,
  hotkeys: [
    {
      action: 'textToSpeech',
      global: false
    },
    {
      action: 'switchMode',
      global: true
    }
  ],
  // welcomeScreen // show this component when the app is first loaded
};

export default agentPlugin;
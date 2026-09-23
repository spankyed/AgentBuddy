import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe';

import { BotMessageSquare } from 'lucide-vue-next';
import state from './state.ts';
import list from './canvas/list.vue';
import kanban from './canvas/kanban.vue';
import ThreadDetail from './canvas/ThreadDetail.vue';
import AgentCanvas from './canvas/agent/canvas.vue';
import chat from './chat/chat.vue';
import settings from './settings.vue';

/** What a thread's own views ask of it: showing an artifact, and answering a to-do list */
export const accepts = pluginAccepts<
  | { type: 'SELECT_ARTIFACT'; artifactId: string }
  | { type: 'APPROVE_TODO_LIST'; artifactId: string; tasks: unknown[] }
  | { type: 'REJECT_TODO_LIST'; artifactId: string }
  | { type: 'OPEN_THREAD_CHAT'; threadId: string }
  | { type: 'VIEW_THREAD'; threadId: string }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'VIEW_DASHBOARD' }
>();

const threadsPlugin = definePlugin({
  label: 'Threads',

  icon: BotMessageSquare,
  state,

  canvas: {
    list,
    kanban,
    create: ThreadDetail,
    view: ThreadDetail,
    dashboard: AgentCanvas,
  },
  chat,
  settings,
  hotkeys: [
    {
      action: 'textToSpeech',
      global: false
    },
    {
      action: 'quickPrompts',
      global: true
    },
    {
      action: 'closeTab',
      global: false
    }
  ],
});

export default threadsPlugin;

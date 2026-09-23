import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe';
import { Bug } from 'lucide-vue-next';
import state from './state.ts';
import type { LogEntry } from '../be/types';
import canvas from './canvas.vue';
import settings from './settings.vue';

/** Any pack may add a line to the app's log, and the Logs plugin is where that arrives */
export const accepts = pluginAccepts<{ type: 'LOG_ADDED'; log: LogEntry }>();

const logsPlugin = definePlugin({
  label: 'Logs',
  // icon: ScrollText,
  icon: Bug,
  state,
  canvas,
  settings,
  isPinned: true,
});

export default logsPlugin;

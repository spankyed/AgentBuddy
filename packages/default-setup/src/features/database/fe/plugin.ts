import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe';
import { Database } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

import type { DatabaseEvents } from './state.ts';
/** The pages the Database settings open */
export const accepts = pluginAccepts<Extract<DatabaseEvents, { type: 'VIEW_BACKUP' | 'VIEW_DASHBOARD' }>>();

const databasePlugin = definePlugin({
  label: 'Database',
  icon: Database,
  state,
  canvas,
  settings,
  isPinned: true,
});

export default databasePlugin; 
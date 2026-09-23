import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe';
import { NotebookText } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';
import panel from './panel.vue';
import settings from './settings.vue';

import type { NotesEvents } from './state.ts';
/** Where an editor link to a note, task or task list lands */
export const accepts = pluginAccepts<Extract<NotesEvents, { type: 'NOTE.OPEN' }>>();

const notesPlugin = definePlugin({
  label: 'Notes',
  icon: NotebookText,
  state,
  canvas,
  panel,
  settings,
});

export default notesPlugin;

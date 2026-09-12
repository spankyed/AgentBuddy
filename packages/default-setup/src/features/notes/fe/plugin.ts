import type { Plugin } from "@abuddy/sdk/fe";
import { NotebookText } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';
import panel from './panel.vue';
import settings from './settings.vue';

const notesPlugin: Plugin = {
  id,
  label: 'Notes',
  icon: NotebookText,
  state,
  canvas,
  panel,
  settings,
};

export default notesPlugin;

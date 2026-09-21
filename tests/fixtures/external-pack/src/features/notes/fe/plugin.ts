import type { Plugin } from '@abuddy/sdk/fe';
import { NotebookPen } from 'lucide-vue-next';
import state, { id } from './state';
import canvas from './canvas/list.vue';

const notesPlugin: Plugin = {
  id,
  label: 'Fixture Notes',
  icon: NotebookPen,
  state,
  canvas,
};

export default notesPlugin;

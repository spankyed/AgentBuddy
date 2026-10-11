import { definePlugin } from '@apack/sdk/fe';
import { NotebookPen } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas/list.vue';

const notesPlugin = definePlugin({
  label: 'Fixture Notes',
  icon: NotebookPen,
  state,
  canvas,
});

export default notesPlugin;

import { definePlugin } from '@abuddy/sdk/fe';
import { NotebookPen } from 'lucide-vue-next';
import state from './state';
import canvas from './canvas/list.vue';

const notesPlugin = definePlugin({
  label: 'Fixture Notes',
  icon: NotebookPen,
  state,
  canvas,
});

export default notesPlugin;

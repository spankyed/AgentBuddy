import { definePlugin } from '@apackdev/sdk/fe';
import { NotebookText } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';
import panel from './panel.vue';

const notesPlugin = definePlugin({
  label: 'Notes',
  icon: NotebookText,
  state,
  canvas,
  panel,
});

export default notesPlugin;

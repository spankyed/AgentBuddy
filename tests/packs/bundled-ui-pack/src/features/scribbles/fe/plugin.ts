import { definePlugin } from '@apackdev/sdk/fe';
import { NotebookPen } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas/editor.vue';

const scribblesPlugin = definePlugin({
  label: 'Scribbles',
  icon: NotebookPen,
  state,
  canvas,
});

export default scribblesPlugin;

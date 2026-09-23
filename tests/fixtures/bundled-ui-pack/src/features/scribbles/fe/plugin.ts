import { definePlugin } from '@abuddy/sdk/fe';
import { NotebookPen } from 'lucide-vue-next';
import state from './state';
import canvas from './canvas/editor.vue';

const scribblesPlugin = definePlugin({
  label: 'Scribbles',
  icon: NotebookPen,
  state,
  canvas,
});

export default scribblesPlugin;

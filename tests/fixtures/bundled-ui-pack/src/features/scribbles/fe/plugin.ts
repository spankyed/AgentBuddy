import type { Plugin } from '@abuddy/sdk/fe';
import { NotebookPen } from 'lucide-vue-next';
import state, { id } from './state';
import canvas from './canvas/editor.vue';

const scribblesPlugin: Plugin = {
  id,
  label: 'Scribbles',
  icon: NotebookPen,
  state,
  canvas,
};

export default scribblesPlugin;

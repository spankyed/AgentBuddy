import type { PluginDefinition } from '@abuddy/sdk/fe';
import { NotebookPen } from 'lucide-vue-next';
import state from './state';
import canvas from './canvas/editor.vue';

const scribblesPlugin: PluginDefinition = {
  label: 'Scribbles',
  icon: NotebookPen,
  state,
  canvas,
};

export default scribblesPlugin;

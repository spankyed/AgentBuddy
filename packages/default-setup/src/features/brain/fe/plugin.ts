import { defineAsyncComponent } from 'vue';
import { definePlugin } from '@abuddy/sdk/fe';

import { Brain } from 'lucide-vue-next';
import state from './state.ts';
import type { BrainContext } from './contract';
import settings from './settings.vue';

const canvas = defineAsyncComponent(() => import('./canvas.vue'));
const panel = defineAsyncComponent(() => import('./panel.vue'));

const brainPlugin = definePlugin({
  label: 'Brain',

  icon: Brain,
  state,
  canvas,
  settings,
  panel,
  // Inspect mode shows the brain's panel beside plugins that have none of their own
  fallbackPanel: {
    label: 'Inspect Mode',
    isShown: (snapshot) => (snapshot.context as BrainContext).inspectEnabled,
    toggle: { type: 'TOGGLE_INSPECT' },
  },
  isPinned: true,

});

export default brainPlugin;
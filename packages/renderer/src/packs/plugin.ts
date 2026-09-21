import type { Plugin } from '@abuddy/host/fe';
import { asHostAddress } from '@abuddy/sdk/ids';
import { Package } from 'lucide-vue-next';
import state, { id } from './state';
import canvas from './canvas/index.vue';

export const packsPlugin: Plugin = {
  id: asHostAddress(id),
  label: 'Packs',
  icon: Package,
  state,
  canvas,
  isPinned: true,
};

export default packsPlugin;

import type { PackFERegistration, PluginDefinition } from '@abuddy/sdk/fe';
import { HOST_PACK_ID } from '@abuddy/sdk/ids';
import { packsMachine } from '@abuddy/host/fe';
import { Package } from 'lucide-vue-next';
import canvas from './canvas.vue';

const packsPlugin: PluginDefinition = {
  label: 'Packs',
  icon: Package,
  state: packsMachine,
  canvas,
  isPinned: true,
};

/** The app's own frontend, registered as the pack `host` like any pack's: the Packs tab */
export const hostFrontend: PackFERegistration = { id: HOST_PACK_ID, features: { packs: { plugin: packsPlugin } } };

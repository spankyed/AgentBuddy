import type { PackFERegistration, PluginDefinition } from '@apackdev/sdk/fe';
import { HOST_PACK_ID } from '@apackdev/sdk/ids';
import { packsMachine, hostPluginDeclarations } from '@apackdev/host/fe';
import { Package } from 'lucide-vue-next';
import canvas from './canvas.vue';
import { settingsPlugin } from '@/views/settings/plugin';

const packsPlugin: PluginDefinition = {
  ...hostPluginDeclarations.packs,
  icon: Package,
  state: packsMachine,
  canvas,
};

/** The app's own frontend, registered as the pack `host` like any pack's: the Packs tab */
export const hostFrontend: PackFERegistration = {
  id: HOST_PACK_ID,
  features: {
    packs: { plugin: packsPlugin },
    // The app's settings: the host's machine, this window's views
    settings: { plugin: settingsPlugin },
  },
};

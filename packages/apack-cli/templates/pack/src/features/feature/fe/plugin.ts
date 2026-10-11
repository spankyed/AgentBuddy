import { definePlugin } from '@apack/sdk/fe';
import { __ICON__ } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas/list.vue';

// What this plugin publishes is its contract, in fe/contract.ts beside it

// Registered at the feature's address by the host, so the module carries no id
const __CAMEL__Plugin = definePlugin({
  label: '__LABEL__',
  icon: __ICON__,
  state,
  canvas,
});

export default __CAMEL__Plugin;

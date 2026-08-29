import * as vue from 'vue';
import * as xstate from 'xstate';
import * as xstateVue from '@xstate/vue';

declare global {
  interface Window {
    __abuddy?: {
      vue: typeof vue;
      xstate: typeof xstate;
      xstateVue: typeof xstateVue;
    };
  }
}

window.__abuddy = { vue, xstate, xstateVue };

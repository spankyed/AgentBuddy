import { SHARED_DEPS } from '@abuddy/sdk/fe/shared-deps';
import * as vue from 'vue';
import * as xstate from 'xstate';
import * as xstateVue from '@xstate/vue';
import * as tiptapCore from '@tiptap/core';
import * as tiptapVue3 from '@tiptap/vue-3';
import * as tiptapStarterKit from '@tiptap/starter-kit';
import * as rekaUi from 'reka-ui';
import * as lucideVueNext from 'lucide-vue-next';
import * as vueFlowCore from '@vue-flow/core';

const modules: Record<string, unknown> = {
  vue,
  xstate,
  xstateVue,
  tiptapCore,
  tiptapVue3,
  tiptapStarterKit,
  rekaUi,
  lucideVueNext,
  vueFlowCore,
};

declare global {
  interface Window {
    __abuddy?: Record<string, unknown>;
  }
}

const abuddy: Record<string, unknown> = {};
for (const [, { globalKey }] of Object.entries(SHARED_DEPS)) {
  if (modules[globalKey]) {
    abuddy[globalKey] = modules[globalKey];
  }
}

window.__abuddy = abuddy;

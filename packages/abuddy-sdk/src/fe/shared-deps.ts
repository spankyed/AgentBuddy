export interface SharedDep {
  globalKey: string;
  tier: 'core' | 'optional';
}

export const SHARED_DEPS: Record<string, SharedDep> = {
  'vue':                  { globalKey: 'vue',              tier: 'core' },
  'xstate':               { globalKey: 'xstate',           tier: 'core' },
  '@xstate/vue':          { globalKey: 'xstateVue',        tier: 'core' },

  '@tiptap/core':         { globalKey: 'tiptapCore',       tier: 'optional' },
  '@tiptap/vue-3':        { globalKey: 'tiptapVue3',       tier: 'optional' },
  '@tiptap/starter-kit':  { globalKey: 'tiptapStarterKit', tier: 'optional' },
  'reka-ui':              { globalKey: 'rekaUi',           tier: 'optional' },
  'lucide-vue-next':      { globalKey: 'lucideVueNext',    tier: 'optional' },
  '@vue-flow/core':       { globalKey: 'vueFlowCore',      tier: 'optional' },
};

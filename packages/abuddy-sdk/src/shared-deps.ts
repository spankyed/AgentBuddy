export interface SharedDep {
  globalKey?: string;
  tier: 'core' | 'optional';
  target: 'fe' | 'be' | 'both';
}

export const SHARED_DEPS: Record<string, SharedDep> = {
  'vue':                  { globalKey: 'vue',              tier: 'core',     target: 'fe' },
  'xstate':               { globalKey: 'xstate',           tier: 'core',     target: 'both' },
  '@xstate/vue':          { globalKey: 'xstateVue',        tier: 'core',     target: 'fe' },
  'zod':                  {                                tier: 'core',     target: 'be' },

  '@tiptap/core':         { globalKey: 'tiptapCore',       tier: 'optional', target: 'fe' },
  '@tiptap/vue-3':        { globalKey: 'tiptapVue3',       tier: 'optional', target: 'fe' },
  '@tiptap/starter-kit':  { globalKey: 'tiptapStarterKit', tier: 'optional', target: 'fe' },
  'reka-ui':              { globalKey: 'rekaUi',           tier: 'optional', target: 'fe' },
  'lucide-vue-next':      { globalKey: 'lucideVueNext',    tier: 'optional', target: 'fe' },
  '@vue-flow/core':       { globalKey: 'vueFlowCore',      tier: 'optional', target: 'fe' },
};

export function getSharedFeDeps(): Record<string, SharedDep & { globalKey: string }> {
  return Object.fromEntries(
    Object.entries(SHARED_DEPS).filter(([, d]) => d.target !== 'be' && d.globalKey),
  ) as Record<string, SharedDep & { globalKey: string }>;
}

export function getSharedBeDeps(): string[] {
  return Object.keys(SHARED_DEPS).filter(k => SHARED_DEPS[k].target !== 'fe');
}

/// <reference types="vite/client" />

// Pack FE code imports single-file components. The pack's `typecheck` script is
// plain `tsc`, which cannot read .vue files, so they resolve to a generic
// component here. Checking *inside* the SFCs needs vue-tsc and is not wired up.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>;
  export default component;
}

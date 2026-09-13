// Plain `tsc` can't read .vue files, so single-file components resolve to a generic
// component here. Checking inside SFCs needs vue-tsc.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>;
  export default component;
}

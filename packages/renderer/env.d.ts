/// <reference types="vite/client" />
// A triple-slash reference, not an import: an `import` would make this file a module and the
// `Window` augmentation it pulls in would stop being global.
// oxlint-disable-next-line typescript-eslint/triple-slash-reference
/// <reference path="./src/electron.d.ts" />

declare module 'virtual:built-in-packs' {
  import type { PackFERegistration } from '@abuddy/sdk/fe';
  const packs: Record<string, () => Promise<{ default: PackFERegistration }>>;
  export default packs;
}

declare module 'virtual:host-deps' {}

declare global {
  interface Window {
    __abuddy?: Record<string, unknown>;
  }
}

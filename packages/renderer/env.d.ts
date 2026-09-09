/// <reference types="vite/client" />
/// <reference path="./src/electron.d.ts" />

declare module 'virtual:built-in-packs' {
  import type { PackFERegistration } from '@abuddy/sdk/fe';
  const packs: Record<string, () => Promise<{ default: PackFERegistration }>>;
  export default packs;
}

// Type declarations for virtual modules provided by esbuild plugins in tsup.config.ts

declare module 'virtual:built-in-pack-loaders' {
  import type { PackRegistration } from '@abuddy/sdk/packs';
  const loaders: Record<string, () => Promise<{ registration: PackRegistration; setCompiledDir?: (dir: string) => void }>>;
  export default loaders;
}

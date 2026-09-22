export type { Plugin } from '@abuddy/sdk/fe';
export { createFePackRegistry, type FePackRegistry } from './pack-store.ts';
export { HOST } from '../host-refs.ts';
export type { PackFERegistration } from '@abuddy/sdk/fe';
export { describeFailure, type ShellClient, type ShellConnection, type ShellFailure } from './client.ts';
export type { LoadedPackEntry } from '../packs/pack-layout.ts';
export * from './shell/index.ts';

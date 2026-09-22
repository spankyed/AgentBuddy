// The frontend's port: what the SDK's frontend code reaches in the renderer, bound once per window
import type { Message } from '../events/index.ts';
import type { SecretsClient } from '../fe/secrets-client.ts';
import type { Component } from 'vue';
import type { Plugin } from '../fe/plugin.ts';
import type { HostShell } from '../fe/shell.ts';
import type { TiptapPlugin } from '../fe/tiptap-plugins.ts';
import type { DslTypeConfig } from '../fe/dsl-types.ts';
import type { PackExtensionsView } from './packs-view.ts';

/**
 * The window's client to the API, as SDK code uses it: sending to backend systems. The host's shell extends it with
 * what only the host reads (the bus subscription, the loaded packs), in `@abuddy/host/fe`.
 */
export interface FeClient {
  /** Delivers a message to a backend system */
  send(message: Message): void;
}

/** The packs whose frontends the renderer registered, read-only */
export interface FePackRegistryView extends PackExtensionsView {
  /** Every registered plugin, in registration order */
  plugins(): Plugin[];
  /** The first registered default plugin */
  defaultPlugin(): Plugin | undefined;
  tiptapPlugins(): TiptapPlugin[];
  /** The component a pack registered for an app extension slot */
  appExtension(slot: string): Component | undefined;
  /** The DSL types packs registered for the code editors, by name */
  dslTypes(): ReadonlyMap<string, DslTypeConfig>;
}

/** The running app, as the SDK reaches it in the renderer */
export interface FeHostRuntime {
  /** The app shell, which spawns the plugins, holds which is open and lays out the panels */
  application: HostShell;
  /** The API's secrets procedures */
  secrets: SecretsClient;
  /** The window's client to the API */
  client: FeClient;
  /** The packs whose frontends the renderer registered */
  packs: FePackRegistryView;
}

let bound: FeHostRuntime | undefined;

/** Binds the renderer's app; once per window, before any plugin or pack frontend runs */
export function bindFeHost(runtime: FeHostRuntime): void {
  if (bound) throw new Error('A frontend host is already bound: bindFeHost runs once, at boot');
  bound = runtime;
}

/** @internal Tests only: forgets the bound frontend host */
export function unbindFeHost(): void {
  bound = undefined;
}

/** @internal Whether a frontend host is bound */
export function _isFeHostBound(): boolean {
  return bound !== undefined;
}

/** @internal The bound frontend host; throws, naming bindFeHost, when none is */
export function boundFeHost(): FeHostRuntime {
  if (!bound) throw new Error('No frontend host is bound: the renderer binds one at boot with bindFeHost(runtime) from @abuddy/sdk/runtime');
  return bound;
}

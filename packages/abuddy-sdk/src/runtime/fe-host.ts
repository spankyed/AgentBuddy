// The frontend's port: what the SDK's frontend code reaches in the renderer, bound once per window
import type { AnyActorRef } from 'xstate';
import type { Message } from '../events/index.ts';
import type { SecretsClient } from '../fe/secrets-client.ts';
import type { Component } from 'vue';
import type { Plugin } from '../fe/plugin.ts';
import type { TiptapPlugin } from '../fe/tiptap-plugins.ts';
import type { DslTypeConfig } from '../fe/dsl-types.ts';
import type { PackExtensionsView } from './packs-view.ts';

/** How frontend code sends to backend systems (the renderer's API client) */
export interface FeTransport {
  /** Delivers an event to a backend system */
  sendIncoming(message: Message): void;
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
  /** The application actor, which spawns and selects plugins */
  application: AnyActorRef;
  /** The API's secrets procedures */
  secrets: SecretsClient;
  /** Sends to backend systems */
  transport: FeTransport;
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

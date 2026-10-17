import { assign, enqueueActions, fromPromise, setup, type ActorRefFrom } from 'xstate';
import { entityTypeOf } from '@apackdev/sdk/fe';
import type { EARS } from '@apackdev/sdk';
import { newCall, type OpenEntity } from '@apackdev/sdk/events';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import { isEqual } from '../../settings/document.ts';
import { selectEntityDestination, getEligiblePlugin, type EntityDestinationSelection, type ShellPluginCatalog } from '../../../fe/plugin-selection.ts';
import { notifyPluginActor } from '../../../fe/plugin-delivery.ts';
import type { PluginFrontendBinding } from '../../../fe/pack-store.ts';
import type { PluginCatalogEntry } from '../../../packs/catalog.ts';
import type { ShellClient } from '../../../fe/client.ts';

export const ENTITY_OPENING_ID = 'entity-opening';

interface EntityOpenRequest {
  id: EARS.EntityId;
  token: string;
  target?: { declaration: PluginCatalogEntry; binding?: PluginFrontendBinding };
}

type EntityOpeningEvent = OpenEntity
  | { type: 'CANCEL' | 'CHANGED' }
  | { type: 'UNLOADED'; packId: string }
  | { type: 'RUNTIMES_UPDATED'; runtimes: Record<string, string> }
  | { type: 'READY' | 'DELIVER'; token: string }
  | { type: 'REFUSED'; token: string; detail: string };

interface EntityOpeningOptions {
  client: ShellClient;
  catalog: ShellPluginCatalog;
  bindings(): ReadonlyMap<string, PluginFrontendBinding>;
  refuse(title: string, detail: string): void;
}

function destinationDetail(selection: EntityDestinationSelection): string {
  switch (selection.status) {
    case 'disabled': return `The destination is disabled: ${selection.destinations.map(entry => entry.featureRef).join(', ')}.`;
    case 'ambiguous': return `Multiple destinations claim this entity: ${selection.destinations.map(entry => entry.featureRef).join(', ')}.`;
    case 'unclaimed': return 'No enabled feature declares that it opens this entity type.';
    default: return 'Entity destinations are unavailable.';
  }
}

function destinationProblem(options: EntityOpeningOptions, request: EntityOpenRequest): string | undefined {
  const selection = selectEntityDestination(options.catalog, entityTypeOf(request.id));
  if (selection.status !== 'declared') return destinationDetail(selection);
  if (request.target && (!isEqual(selection.destination, request.target.declaration)
    || (request.target.binding && options.bindings().get(selection.destination.featureRef) !== request.target.binding))) {
    return 'The destination changed while this entity was opening. Open it again.';
  }
}

/** One owner from intent to delivery; the shell readiness queue carries only its token. */
export function createEntityOpeningMachine(options: EntityOpeningOptions) {
  const { client, catalog, bindings } = options;
  const refuse = (request: EntityOpenRequest | null, detail: string) => {
    if (request) options.refuse(`Couldn't open ${request.id}`, detail);
  };
  return setup({
    types: {
      context: {} as { request: EntityOpenRequest | null; isConnected(): boolean },
      input: {} as { isConnected(): boolean },
      events: {} as EntityOpeningEvent,
    },
    actors: {
      exists: fromPromise<boolean, EARS.EntityId>(({ input, signal }) => client.entityExists(input, signal)),
    },
    guards: {
      currentToken: ({ context, event }) => 'token' in event && event.token === context.request?.token,
      changedDestination: ({ context }) => !!context.request?.target && !!destinationProblem(options, context.request),
    },
    actions: {
      finish: enqueueActions(({ context, enqueue }) => {
        if (context.request) enqueue.sendParent({ type: 'ENTITY_OPEN_FINISHED', token: context.request.token });
        enqueue.assign({ request: null });
      }),
      refuseChanged: ({ context }) => refuse(context.request, destinationProblem(options, context.request!)!),
    },
  }).createMachine({
    id: ENTITY_OPENING_ID,
    context: ({ input }) => ({ request: null, isConnected: input.isConnected }),
    initial: 'idle',
    on: {
      OPEN_ENTITY: {
        target: '.resolving', reenter: true,
        actions: ['finish', assign({ request: ({ event }) => ({ id: event.id, token: newCall() }) })],
      },
      CANCEL: '.idle',
      REFUSED: { guard: 'currentToken', target: '.idle', actions: ({ context, event }) => refuse(context.request, event.detail) },
      UNLOADED: {
        guard: ({ context, event }) => context.request?.target?.declaration.packId === event.packId,
        target: '.idle', actions: ({ context }) => refuse(context.request, 'Its destination was unloaded.'),
      },
      RUNTIMES_UPDATED: {
        guard: ({ context, event }) => {
          const binding = context.request?.target?.binding;
          return !!binding?.runtimeRevision && event.runtimes[binding.packId] !== binding.runtimeRevision;
        },
        target: '.idle', actions: ({ context }) => refuse(context.request, 'Its destination was replaced. Open it again.'),
      },
      CHANGED: { guard: 'changedDestination', target: '.idle', actions: 'refuseChanged' },
    },
    states: {
      idle: { entry: 'finish' },
      resolving: {
        always: [
          { guard: ({ context }) => typeof context.request!.id !== 'string' || !context.request!.id.includes('-'),
            target: 'idle', actions: ({ context }) => refuse(context.request, 'The entity ID is invalid.') },
          { guard: ({ context }) => !context.isConnected(), target: 'idle',
            actions: ({ context }) => refuse(context.request, 'The app is disconnected.') },
          { guard: () => catalog.status() === 'loading', target: 'catalog' },
          { guard: ({ context }) => !!destinationProblem(options, context.request!), target: 'idle', actions: 'refuseChanged' },
          { target: 'checking', actions: assign(({ context }) => {
            const selection = selectEntityDestination(catalog, entityTypeOf(context.request!.id));
            if (selection.status !== 'declared') throw new Error('Entity destination was not resolved');
            const declaration = selection.destination;
            return { request: { ...context.request!, target: { declaration,
              binding: getEligiblePlugin(catalog, bindings(), declaration.featureRef) ? bindings().get(declaration.featureRef) : undefined } } };
          }) },
        ],
      },
      catalog: { on: { CHANGED: 'resolving' } },
      checking: {
        invoke: {
          src: 'exists', input: ({ context }) => context.request!.id,
          onError: { target: 'idle', actions: ({ context, event }) => refuse(context.request, errorMessage(event.error)) },
          onDone: [
            { guard: ({ event }) => !event.output, target: 'idle',
              actions: ({ context }) => refuse(context.request, 'This entity no longer exists or is in the trash.') },
            { target: 'waiting', actions: enqueueActions(({ context, enqueue }) => {
              const request = context.request!;
              enqueue.sendParent({ type: 'OPEN_PLUGIN', plugin: request.target!.declaration.featureRef,
                events: [], entityToken: request.token });
            }) },
          ],
        },
      },
      waiting: {
        on: {
          READY: [
            { guard: ({ context, event }) => context.request?.token === event.token && !!destinationProblem(options, context.request),
              target: 'idle', actions: 'refuseChanged' },
            { guard: 'currentToken', actions: assign(({ context }) => ({ request: { ...context.request!,
              target: { ...context.request!.target!, binding: context.request!.target!.binding ?? bindings().get(context.request!.target!.declaration.featureRef) } } })) },
          ],
          DELIVER: { guard: 'currentToken', target: 'idle', actions: ({ context, system }) => {
            const request = context.request!;
            const plugin = request.target!.declaration.featureRef;
            const actor = system.get(plugin);
            const problem = destinationProblem(options, request)
              ?? (!getEligiblePlugin(catalog, bindings(), plugin) ? `The plugin "${plugin}" is no longer ready.` : undefined)
              ?? (!actor ? `The destination actor "${plugin}" is no longer available.` : undefined);
            if (problem) refuse(request, problem);
            else notifyPluginActor(actor, plugin, { type: 'OPEN_ENTITY', id: request.id });
          } },
        },
      },
    },
  });
}

export type EntityOpeningActor = ActorRefFrom<ReturnType<typeof createEntityOpeningMachine>>;

/** Queue admission reads the owner's current request; it never captures another request copy. */
export function checkEntityOpening(owner: EntityOpeningActor, token: string, options: EntityOpeningOptions): { current: false } | { current: true; problem?: string } {
  const request = owner.getSnapshot().context.request;
  return request?.token === token ? { current: true, problem: destinationProblem(options, request) } : { current: false };
}

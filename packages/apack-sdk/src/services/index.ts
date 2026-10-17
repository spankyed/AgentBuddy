import type { repository } from '@apackdev/ears';
import { boundHost, type HostRuntimeServices } from '../runtime/host-runtime.ts';
import { createSends, untypedBroadcastToPlugin, untypedSendToWindow, untypedSendToSystem } from '../events/index.ts';
import { resolveRegistered } from '../ids/refs.ts';
import { createLogger, type Logger } from '../logger/logger.ts';
import type { AppDataService } from './app-data.ts';
import type { OnboardingService } from './onboarding.ts';
import type { TraceStore } from './trace-store.ts';
import type { InferenceService } from './inference.ts';
import type { SecretsService } from './secrets.ts';
import type { FilesystemService } from './filesystem.ts';
import type { SettingsService } from './settings.ts';
import type { SettingsAdmin } from './settings.ts';
import type { SettingsTarget } from '../types/settings.ts';
import { _settingsHandle } from './settings-handle.ts';

export type { AppDataService, BackupDatabase, BackupSummary } from './app-data.ts';
export type { OnboardingService } from './onboarding.ts';
export { UnknownBackupDatabasesError } from './app-data.ts';
export type { TraceStore, TraceEntityMeta, TraceRelation } from './trace-store.ts';
export { _createInferenceService, type _InferenceModels, type InferenceService, type OutputSchema, type OutputSpec, type _ResolveModel } from './inference.ts';
export type { FileEntry, FileStat, FilesystemService } from './filesystem.ts';
export type { SettingsChange, SettingsService, SettingsAdmin } from './settings.ts';
export type { SecretMetadata, SecretProvider, SecretsProtection, SecretsService, SecretsSnapshot, SecretsStatus } from './secrets.ts';
export { _secretRules, _secretProviderLabel, _toSecretMetadata } from './secrets-rules.ts';
export type { ModelId, ProviderName } from './models.ts';

const logger = createLogger('log-service');

/**
 * Ambient services the host supplies to every action, alongside the services a
 * pack registers itself. Packs generate their `Services` type as
 * `typeof featureServices & HostServices`, so this stays the single definition
 * of what is injected.
 */
export interface HostServices {
  logger: Logger;
  /**
   * Sends to plugins and systems. Both name a feature `<packId>/<featureId>` — the action's own pack included,
   * and the host's (`host/application`); `sendToSystem` also takes a role (`{ role: 'brain' }`), which reaches
   * whichever system plays it — a flow event goes to the brain as `TRIGGER_BRAIN_EVENT`. A pack's `Services`
   * types them with its own and its dependencies' events.
   *
   * Naming its own pack is the point, not a gap left by the action having no pack scope.
   * An action is content, not source: a row a user can edit in the Actions plugin, read in the DB console,
   * export to a content file and copy into another pack. A bare name would rebind on that copy — `'threads'`
   * quietly meaning the new pack's feature, or nothing — where a ref that no longer fits is wrong visibly, and
   * is refused at the bus rather than doing something else.
   *
   * What an action sends does say where it came from: the pack running it in `Message.from` and the action in
   * `Message.via` (`createActionEmitter`). Saying so and resolving names are separate — the first is a label on
   * the message, the second would change what a name means.
   */
  emitter: {
    broadcastToPlugin: typeof untypedBroadcastToPlugin;
    /**
     * To that plugin on one connection, which the caller supplies. A handler is handed the connection it
     * is serving; an action is handed nothing, so it has one only if something passed it in a payload —
     * nothing does today, which is why this has no caller yet rather than why it would fail.
     */
    sendToWindow: typeof untypedSendToWindow;
    sendToSystem: typeof untypedSendToSystem;
  };
  repository: typeof repository;
  /** Completion of the app's onboarding, independent of preferences and database administration */
  onboarding: OnboardingService;
  /** Reset, back up and restore the app's stored data */
  appData: AppDataService;
  /** Read the volatile trace store (flow execution records) */
  traceStore: TraceStore;
  /** Model calls (text, agents, embeddings, images, speech, transcription, reranking) with the user's provider keys */
  inference: InferenceService;
  /** The user's API keys, without their values: list, select, rename, delete */
  secrets: SecretsService;
  /** Files and folders on the user's disk */
  filesystem: FilesystemService;
  /** Caller-bound access to app, pack/group and feature preferences */
  settings: SettingsService;
}

/** An action names every feature by its ref, its own pack's included, and the ref must be a registered one */
const actionRef = (kind: 'system' | 'plugin', name: string, registered: readonly string[]) =>
  resolveRegistered(kind, name, { registered, form: `actions name a ${kind} "<packId>/<featureId>"` });

/** Who an action's sends say they are. Both fields are labels: nothing routes or refuses on either. */
export interface ActionSender {
  /** The pack whose code is running the action, stamped as `Message.from` */
  from: string;
  /**
   * The running action, as `action:<label>` — the same string that names its logger, so a dropped send and that
   * action's own log lines share something to grep for. Stamped as `Message.via`.
   */
  via: string;
}

/**
 * The emitter an action runs with: the sends of `HostServices`, stamped with the pack running the action and the
 * action itself. A pack that runs user-authored code builds one per run — default-setup's `runActionCode` does —
 * so the last sender that could not say who it was now can.
 *
 * Without a `sender` it is `services.emitter`: the sends any pack code reaches through `services`, stamping
 * nothing, since only the pack that ran the action knows which action it was.
 *
 * Its names stay refs either way. Binding an identity for the stamp must not make a bare name resolve: an action
 * is content, not source — a row a user edits, exports and copies into another pack, where `'threads'` would
 * quietly mean the new pack's feature, or nothing.
 */
export function createActionEmitter(sender?: ActionSender): HostServices['emitter'] {
  const sends = createSends(sender);
  return {
    broadcastToPlugin: (name, event) => sends.broadcastToPlugin(actionRef('plugin', name, boundHost().packs.pluginIds()), event),
    sendToWindow: (client, name, event) => sends.sendToWindow(client, actionRef('plugin', name, boundHost().packs.pluginIds()), event),
    sendToSystem: (to, event, options) => sends.sendToSystem(typeof to === 'string' ? actionRef('system', to, boundHost().packs.systemIds()) : to, event, options),
  };
}

const emitter: HostServices['emitter'] = createActionEmitter();

/** The bound app's implementation of a service; each call reads the binding */
const app = <K extends keyof HostRuntimeServices>(name: K): HostRuntimeServices[K] => boundHost().services[name];

const onboarding: OnboardingService = {
  isComplete: () => app('onboarding').isComplete(),
  complete: () => app('onboarding').complete(),
};

const appData: AppDataService = {
  reset: () => app('appData').reset(),
  exportBackup: (targetPath, name, databases) => app('appData').exportBackup(targetPath, name, databases),
  importBackup: (backupPath, options) => app('appData').importBackup(backupPath, options),
  readBackupSummary: (backupPath) => app('appData').readBackupSummary(backupPath),
};

const traceStore: TraceStore = {
  entities: () => app('traceStore').entities(),
  getEntityMeta: (id) => app('traceStore').getEntityMeta(id),
  getAttr: (kind, id) => app('traceStore').getAttr(kind, id),
  relations: (filter) => app('traceStore').relations(filter),
};

const inference: InferenceService = {
  generateText: (options) => app('inference').generateText(options),
  streamText: (options) => app('inference').streamText(options),
  createAgent: (settings) => app('inference').createAgent(settings),
  embed: (options) => app('inference').embed(options),
  embedMany: (options) => app('inference').embedMany(options),
  generateImage: (options) => app('inference').generateImage(options),
  generateSpeech: (options) => app('inference').generateSpeech(options),
  transcribe: (options) => app('inference').transcribe(options),
  rerank: (options) => app('inference').rerank(options),
};

const secrets: SecretsService = {
  status: () => app('secrets').status(),
  list: () => app('secrets').list(),
  select: (id) => app('secrets').select(id),
  rename: (id, label) => app('secrets').rename(id, label),
  delete: (id) => app('secrets').delete(id),
};

const filesystem: FilesystemService = {
  writeFile: (filePath, content) => app('filesystem').writeFile(filePath, content),
  readFile: (filePath) => app('filesystem').readFile(filePath),
  exists: (filePath) => app('filesystem').exists(filePath),
  mkdir: (dirPath) => app('filesystem').mkdir(dirPath),
  readDir: (dirPath) => app('filesystem').readDir(dirPath),
  remove: (targetPath) => app('filesystem').remove(targetPath),
  rename: (oldPath, newPath) => app('filesystem').rename(oldPath, newPath),
  stat: (filePath) => app('filesystem').stat(filePath),
};

// An unbound import cannot borrow host settings authority. Generated services bind pack identity.
const settings: SettingsService = {
  get: () => { throw new Error('Use settings through #generated/services: pack identity is required'); },
  set: () => { throw new Error('Use settings through #generated/services: pack identity is required'); },
  reset: () => { throw new Error('Use settings through #generated/services: pack identity is required'); },
  onChange: (listener) => app('settings').onChange(listener),
};

/**
 * The services the SDK builds (logger, emitter, repository from the bound engine), the app's implementations, and every
 * registered pack's. Reading them needs a bound app; the app's services are delegates that read it on each call.
 */
function resolveServices(): HostServices & Record<string, unknown> {
  const runtime = boundHost();
  return {
    logger,
    emitter,
    repository: runtime.ears.repository,
    appData,
    onboarding,
    traceStore,
    inference,
    secrets,
    filesystem,
    settings,
    ...runtime.packs.getRegisteredServices(),
  };
}

/**
 * Host services plus every registered pack service. Untyped beyond HostServices: a pack's
 * `#generated/services` exports `services` typed with its own and its dependencies' services.
 */
export const services: HostServices & Record<string, unknown> = new Proxy({} as HostServices & Record<string, unknown>, {
  get(_, prop: string) { return resolveServices()[prop]; },
  ownKeys() { return Reflect.ownKeys(resolveServices()); },
  getOwnPropertyDescriptor(_, prop) {
    const s = resolveServices();
    if (prop in s) return { configurable: true, enumerable: true, value: s[prop as string] };
  },
});

export { _settingsHandle } from './settings-handle.ts';

/** @internal Host administration over the shared SDK instance, including the published test harness. */
export function _settingsAdmin(): SettingsAdmin {
  return app('settings');
}

/** @internal Generated runtimes receive scoped settings only after the host accepts their registration. */
export function _createPackServices() {
  const createBinding = () => {
    let source: SettingsService | undefined;
    let revoked = false;
    const subscriptions = new Set<() => void>();
    const accepted = (): SettingsService => {
      if (revoked) throw new Error('Pack settings binding has been revoked');
      if (!source) throw new Error('Pack settings are unavailable until the host accepts this runtime');
      return source;
    };
    const service: SettingsService = {
      get: target => accepted().get(target),
      set: (target, path, value, condition) => accepted().set(target, path, value, condition),
      reset: target => accepted().reset(target),
      onChange: listener => {
        const stop = accepted().onChange(change => { if (!revoked) listener(change); });
        const unsubscribe = () => { if (subscriptions.delete(unsubscribe)) stop(); };
        subscriptions.add(unsubscribe);
        return unsubscribe;
      },
    };
    return {
      service,
      accepted,
      bind(settings: SettingsService) {
        if (source) throw new Error('Pack settings are already bound');
        source = settings;
      },
      revoke() {
        revoked = true;
        const errors: unknown[] = [];
        for (const stop of subscriptions) {
          try { stop(); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'Could not release all pack settings subscriptions');
      },
    };
  };
  let binding = createBinding();
  const current = (): SettingsService => {
    binding.accepted();
    return binding.service;
  };
  return {
    // Construction can precede acceptance; every operation belongs to this one binding lifetime.
    settingsHandle: <T>(target: SettingsTarget) => _settingsHandle<T>(target, binding.service),
    services: new Proxy({} as HostServices & Record<string, unknown>, {
      get(_, key) { return key === 'settings' ? current() : Reflect.get(services, key); },
      ownKeys: () => Reflect.ownKeys(services),
      getOwnPropertyDescriptor(_, key) {
        return key === 'settings' ? { configurable: true, enumerable: true, value: current() } : Reflect.getOwnPropertyDescriptor(services, key);
      },
    }),
    bindSettings(settings: SettingsService): () => void {
      const accepted = binding;
      accepted.bind(settings);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        binding = createBinding();
        accepted.revoke();
      };
    },
  };
}

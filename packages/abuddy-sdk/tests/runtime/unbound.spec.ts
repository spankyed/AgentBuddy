// The SDK reaches the app only through the runtime bound with bindHost: bound once, required by what goes over
// the app's bus or its services, and not by logging, which writes to the console without an app (tooling)
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createEarsEngine, untypedQx, tx } from '@abuddy/ears';
import { bindHost, unbindHost, type HostRuntime } from '../../src/runtime/host-runtime.ts';
import { _rootEvents } from '../../src/runtime/root-events.ts';
import { onConnected, onIncoming, sendToPlugin, sendToSystem } from '../../src/events/index.ts';
import { createLogger, onLog, reportError } from '../../src/logger/index.ts';
import { services } from '../../src/services/index.ts';
import { getAppVersion } from '../../src/env/index.ts';
import { getDesignated, hasDesignation } from '../../src/designations/index.ts';
import { stepRegistry } from '../../src/steps/registry.ts';
import { artifactRegistry } from '../../src/artifacts/registry.ts';
import { blockRegistry } from '../../src/blocks/registry.ts';
import { _seedHookRegistry } from '../../src/seed/hooks.ts';
import { getPackCommands, getPackSettingsDefaults, onPackSettingsDefaultsChanged } from '../../src/framework/index.ts';
import { seedData, registeredSeedKeys } from '../../src/utils/seed.ts';
import { getDslTypes } from '../../src/fe/dsl-types.ts';
import { tiptapPluginRegistry } from '../../src/fe/tiptap-plugins.ts';
import { testPacksView } from '../../src/testing/packs.ts';

const unused = () => { throw new Error('unused'); };
const engine = createEarsEngine({ isEntityType: (name) => name === 'Memo' });
const runtime: HostRuntime = {
  transport: { rootEvents: _rootEvents },
  ears: engine.query,
  packs: testPacksView(),
  appVersion: '1.2.3',
  services: {
    appData: { reset: unused, hasOnboarded: unused, completeOnboarding: unused, exportBackup: unused, importBackup: unused, backupInfo: unused },
    traceStore: { entities: unused, getEntityMeta: unused, getAttr: unused, relations: unused },
    inference: {
      generateText: unused, streamText: unused, createAgent: unused, embed: unused, embedMany: unused,
      generateImage: unused, generateSpeech: unused, transcribe: unused, rerank: unused,
    },
    secrets: { status: unused, list: unused, select: unused, rename: unused, delete: unused },
    filesystem: { writeFile: unused, readFile: unused, exists: unused, mkdir: unused, readDir: unused, remove: unused, rename: unused, stat: unused },
  },
};

// HostRuntime compiles only when complete
type Without<K extends keyof HostRuntime> = Omit<HostRuntime, K>;
type WithoutService<K extends keyof HostRuntime['services']> = Omit<HostRuntime, 'services'> & { services: Omit<HostRuntime['services'], K> };
// @ts-expect-error no transport
export const noTransport: HostRuntime = {} as Without<'transport'>;
// @ts-expect-error no engine
export const noEars: HostRuntime = {} as Without<'ears'>;
// @ts-expect-error no packs
export const noPacks: HostRuntime = {} as Without<'packs'>;
// @ts-expect-error no app version
export const noVersion: HostRuntime = {} as Without<'appVersion'>;
// @ts-expect-error no services
export const noServices: HostRuntime = {} as Without<'services'>;
// @ts-expect-error no appData
export const noAppData: HostRuntime = {} as WithoutService<'appData'>;
// @ts-expect-error no traceStore
export const noTraceStore: HostRuntime = {} as WithoutService<'traceStore'>;
// @ts-expect-error no inference
export const noInference: HostRuntime = {} as WithoutService<'inference'>;
// @ts-expect-error no secrets
export const noSecrets: HostRuntime = {} as WithoutService<'secrets'>;
// @ts-expect-error no filesystem
export const noFilesystem: HostRuntime = {} as WithoutService<'filesystem'>;

afterEach(() => {
  unbindHost();
  vi.restoreAllMocks();
});

describe('with no app bound', () => {
  it('throws, naming bindHost, for what needs the app', async () => {
    const needsApp: Array<[string, () => unknown]> = [
      ['sendToPlugin', () => sendToPlugin('memos', { type: 'MEMO_ADDED' })],
      ['sendToSystem', () => sendToSystem('memos', { type: 'ADD_MEMO' })],
      ['onConnected', () => onConnected(() => {})],
      ['onIncoming', () => onIncoming(() => {})],
      ['onLog', () => onLog(() => {})],
      ['reportError', () => reportError({ error: new Error('boom'), source: 'memos' })],
      ['_rootEvents', () => _rootEvents.emitLog({ level: 'info', message: 'x' })],
      ['getAppVersion', () => getAppVersion()],
      ['services.inference', () => services.inference.generateText({ model: 'openai:gpt-5', prompt: 'hi' })],
      ['services.appData', () => services.appData.reset()],
      ['services.traceStore', () => services.traceStore.entities()],
      ['services.secrets', () => services.secrets.list()],
      ['services.filesystem', () => services.filesystem.readFile('/tmp/x')],
      ['services.repository', () => services.repository],
    ];
    for (const [name, use] of [['qx', () => untypedQx('Memo')], ['tx', () => tx('Memo')]] as const) {
      expect(use, name).toThrow('No EARS engine is installed');
    }
    for (const [name, use] of needsApp) expect(use, name).toThrow('bindHost');
  });

  it('throws, naming bindHost (or bindFeHost in the frontend), for what packs registered', () => {
    const seedsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbound-seeds-'));
    fs.writeFileSync(path.join(seedsDir, 'seeds.json'), JSON.stringify({ version: 1, packId: 'memo-pack', seeds: [] }));
    onTestFinished(() => fs.rmSync(seedsDir, { recursive: true, force: true }));
    const lookups: Array<[string, () => unknown]> = [
      ['getDesignated', () => getDesignated('brain')],
      ['hasDesignation', () => hasDesignation('brain')],
      ['stepRegistry.get', () => stepRegistry.get('action')],
      ['stepRegistry.all', () => stepRegistry.all()],
      ['stepRegistry.triggers', () => stepRegistry.triggers()],
      ['artifactRegistry.get', () => artifactRegistry.get('code')],
      ['artifactRegistry.all', () => artifactRegistry.all()],
      ['blockRegistry.get', () => blockRegistry.get('choice')],
      ['blockRegistry.all', () => blockRegistry.all()],
    ];
    for (const [name, use] of lookups) {
      expect(use, name).toThrow(/bindHost\(runtime\).*\(the renderer with bindFeHost\(runtime\)\)/);
    }
    const backendLookups: Array<[string, () => unknown]> = [
      ['_seedHookRegistry.get', () => _seedHookRegistry.get('Memo')],
      ['seedData', () => seedData({ compiledDir: seedsDir })],
      ['registeredSeedKeys', () => registeredSeedKeys('memo-pack')],
      ['getPackSettingsDefaults', () => getPackSettingsDefaults()],
      ['onPackSettingsDefaultsChanged', () => onPackSettingsDefaultsChanged(() => {})],
      ['getPackCommands', () => getPackCommands()],
    ];
    for (const [name, use] of backendLookups) expect(use, name).toThrow('bindHost(runtime)');
    for (const [name, use] of [['getDslTypes', () => getDslTypes()], ['tiptapPluginRegistry.getAll', () => tiptapPluginRegistry.getAll()]] as const) {
      expect(use, name).toThrow('bindFeHost(runtime)');
    }
  });

  it('logs to the console, redacted', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createLogger('installed-packs').info('Installed', { pack: 'memos' });
    createLogger().error('key sk-proj-abcdef1234567890 rejected');
    expect(info.mock.calls).toEqual([['[installed-packs]', 'Installed', { pack: 'memos' }]]);
    expect(error.mock.calls).toEqual([['key [redacted] rejected']]);
  });
});

describe('bindHost', () => {
  it('binds once: binding again throws', () => {
    bindHost(runtime);
    expect(getAppVersion()).toBe('1.2.3');
    expect(() => bindHost(runtime)).toThrow('already bound');
  });

  it("installs the app's engine for @abuddy/ears's free functions, until unbound", () => {
    bindHost(runtime);
    const id = tx('Memo').put('title', 'bound').id();
    expect(engine.query.findById(id)).toMatchObject({ title: 'bound' });
    expect(untypedQx('Memo').ids()).toEqual([id]);
    unbindHost();
    expect(() => untypedQx('Memo')).toThrow('No EARS engine is installed');
  });

  it("reads the bound app's services on each call", () => {
    bindHost(runtime);
    expect(services.repository).toBe(engine.query.repository);
    expect(() => services.secrets.list()).toThrow('unused');
  });
});

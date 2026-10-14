// @slow: three cases each build a TypeScript program, which is the subject rather than a detail
// That the generated sends actually type-check.
//
// The three cases that build a TypeScript program, apart from the other 93 because of what they cost:
// ~2.5s against ~130ms for a pure case. `goal-one-job-pool.md` Phase 5 named this boundary — "91 pure, 3
// that invoke a compiler, which is a real tier boundary" — and the shared `ts.CompilerHost` below is what
// took them from 3.13s to 2.46s.
//
// One of five files split from a 1,365-line original; `_support/pack.ts` holds the fixture and why.
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { PackSnapshot } from '../../../src/build/manifest.ts';
import { setupPackFixture, dependency, facade, generatePackFiles, manifest, root, system, withPlugin, write, writePluginState, writeSystemEntry  } from './_support/pack.ts';

setupPackFixture();

/** Type-checks the generated files at `names` with `root` linked to this SDK's source, and returns the diagnostics */
/**
 * One `ts.SourceFile` cache across the three programs this file builds, so the SDK and ears source is
 * parsed once instead of three times. Each program resolves `@apackdev/sdk` under the `@apackdev/source`
 * condition, so it type-checks ~165 files of real source; `skipLibCheck` skips the `.d.ts`, and the SDK is
 * `.ts`.
 *
 * **The cache rule is safe by construction:** `root` is `mkdtemp`'d per test, so every file a test writes
 * is under a path no other test uses. Cache any file that is not under `root`; never one that is.
 *
 * Measured: the three compiling tests go 3.13s -> 2.46s, and the file 10.36s -> 9.43s. Passing `oldProgram`
 * as well was tried and measured at 2.44s and 2.52s against 2.46s without — no difference, so it is not
 * here. The file's remaining cost is not compilation: the other 91 tests are ~7.2s of `generatePackFiles`,
 * which builds something different every time and cannot be cached, and the per-test `mkdtemp`/`rmSync` is
 * 0.15s for all 94.
 */
const parsed = new Map<string, ts.SourceFile | undefined>();
let compilerHost: ts.CompilerHost | undefined;
function sharedHost(options: ts.CompilerOptions): ts.CompilerHost {
  if (!compilerHost) {
    const host = ts.createCompilerHost(options, true);
    const read = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
      if (fileName.startsWith(root)) return read(fileName, languageVersion, onError, shouldCreate);
      if (!parsed.has(fileName)) parsed.set(fileName, read(fileName, languageVersion, onError, shouldCreate));
      return parsed.get(fileName);
    };
    compilerHost = host;
  }
  return compilerHost;
}

function typecheck(files: Record<string, string>, names: string[], noUnusedLocals = false): string[] {
  for (const [file, content] of Object.entries(files)) if (content) write(file, content);
  write('package.json', JSON.stringify({ type: 'module' }));
  const sdk = path.resolve(import.meta.dirname, '../../..');
  const fromSdk = (name: string) => path.dirname(createRequire(path.join(sdk, 'package.json')).resolve(`${name}/package.json`));
  // The generated facades import the engine too, which a pack installs with the SDK
  const links = { '@apackdev/sdk': sdk, '@apackdev/ears': fromSdk('@apackdev/ears'), zod: fromSdk('zod'), vue: fromSdk('vue') };
  for (const [name, target] of Object.entries(links)) {
    const link = path.join(root, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, 'dir');
  }
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    customConditions: ['@apackdev/source'],
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    strict: true,
    noUnusedLocals,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  };
  const program = ts.createProgram({ rootNames: names.map((name) => path.join(root, name)), options, host: sharedHost(options) });
  return ts.getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName.startsWith(root))
    .map((d) => `${path.relative(root, d.file!.fileName)}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}

/** A dependency whose facade declares `systems` (feature id → incoming event type) */
function typedDependency(systems: Record<string, string>): PackSnapshot {
  const events = Object.entries(systems).map(([id, type]) => `'${id}': { type: '${type}'; n: number }`).join('; ');
  return dependency({ features: Object.keys(systems).map((id) => system(id)) }, facade({ PackSystemEvents: `{ ${events} }` }));
}

describe('generated sends compile', () => {
  it('for feature ids that match generated names, beside a dependency with the same feature ids', async () => {
    const ids = ['foo', 'fooEntry', 'specs', 'specEvents', 'ref', 'openPlugin', 'registration', 'steps'];
    for (const id of ids) writeSystemEntry(id, "{ type: 'DONE' }", `{ type: '${id.toUpperCase()}_RUN'; n: number }`);
    const files = await generatePackFiles(manifest({ features: ids.map((id) => ({ ...system(id), designation: id === 'foo' ? 'foo' : undefined })) }), {
      packRoot: root,
      depSnapshots: new Map([['base-pack', typedDependency({ foo: 'BASE_FOO_RUN', calendar: 'CALENDAR_RUN' })]]),
    });
    write('src/probe.ts', [
      "import { sendToSystem } from './__generated__/events.ts';",
      ...ids.map((id) => `sendToSystem('${id}', { type: '${id.toUpperCase()}_RUN', n: 1 });`),
      "sendToSystem('base-pack/foo', { type: 'BASE_FOO_RUN', n: 1 });",
      '// @ts-expect-error the own foo system receives FOO_RUN',
      "sendToSystem('foo', { type: 'BASE_FOO_RUN', n: 1 });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts', 'src/__generated__/pack-entry.ts'], true)).toEqual([]);
  });

  it("for a pack without systems, sending to its dependencies'", async () => {
    const files = await generatePackFiles(manifest({ features: [{ id: 'sidebar', plugin: { label: 'Fixture', state: writePluginState('src/features/sidebar/fe/plugin.ts') } }] }), {
      packRoot: root,
      depSnapshots: new Map([['base-pack', typedDependency({ calendar: 'CALENDAR_RUN' })]]),
    });
    write('src/probe.ts', [
      "import { sendToSystem } from './__generated__/events.ts';",
      "sendToSystem('base-pack/calendar', { type: 'CALENDAR_RUN', n: 1 });",
      '// @ts-expect-error CALENDAR_RUN needs its n',
      "sendToSystem('base-pack/calendar', { type: 'CALENDAR_RUN' });",
      '// @ts-expect-error the pack has no system of its own',
      "sendToSystem('sidebar', { type: 'CALENDAR_RUN', n: 1 });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
  });

  it("to a dependency's plugins and a host plugin, with the events their owner declares", async () => {
    writeSystemEntry('memos', "{ type: 'MEMO_ADDED'; text: string }");
    const base = dependency(
      { features: [withPlugin(system('calendar')), withPlugin(system('code'))] },
      facade({ PackPluginEvents: "{ 'calendar': { type: 'TAG_ADDED'; name: string }; 'code': { type: 'FILE_OPENED'; path: string } }" }),
    );
    const files = await generatePackFiles(
      manifest({ features: [withPlugin(system('memos'))] }),
      { packRoot: root, depSnapshots: new Map([['base-pack', base]]) },
    );
    write('src/probe.ts', [
      "import { sendToPlugin } from './__generated__/events.ts';",
      "sendToPlugin('memos', { type: 'MEMO_ADDED', text: 'x' });",
      "sendToPlugin('base-pack/calendar', { type: 'TAG_ADDED', name: 'x' });",
      "sendToPlugin('base-pack/code', { type: 'FILE_OPENED', path: 'x' });",
      "sendToPlugin('host/application', { type: 'PLUGIN_VISIBILITY_UPDATED', pluginVisibility: { 'demo-pack/memos': false } });",
      "// @ts-expect-error a dependency's plugin takes only the events its own pack declares for it",
      "sendToPlugin('base-pack/calendar', { type: 'MEMO_ADDED', text: 'x' });",
      "// @ts-expect-error a dependency's plugin is named <pack>/<feature>, as the send resolves it",
      "sendToPlugin('calendar', { type: 'TAG_ADDED', name: 'x' });",
      '// @ts-expect-error the host declares what its application plugin receives',
      "sendToPlugin('host/application', { type: 'MEMO_ADDED', text: 'x' });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
  });
});


describe('generated settings compile', () => {
  it('derives pack group values from schemas, preserving enums, optional fields and local references', async () => {
    const files = await generatePackFiles(manifest({ extensions: { settings: {
      other: {
        schema: { type: 'object', additionalProperties: false,
          definitions: { label: { type: 'number' } },
          properties: { label: { $ref: '#/definitions/label' } }, required: ['label'],
        },
        defaults: { label: 1 },
      },
      assistant: {
        title: 'Assistant preferences',
        schema: {
          type: 'object', additionalProperties: false,
          definitions: { label: { type: 'string' } },
          properties: {
            mode: { type: 'string', enum: ['quick', 'thorough'] },
            limit: { type: 'number' },
            label: { $ref: '#/definitions/label' },
            optional: { type: 'boolean' },
            nullable: { type: ['string', 'null'] },
            labels: { type: 'object', additionalProperties: { type: 'string' } },
          },
          required: ['mode', 'limit', 'label', 'nullable', 'labels'],
        },
        defaults: { mode: 'quick', limit: 10, label: 'Default', nullable: null, labels: {} },
      },
    } } }), { packRoot: root });
    write('src/probe.ts', `
      import type { PackGroupSettings } from './__generated__/settings.ts';
      const settings: PackGroupSettings['assistant'] = {
        mode: 'thorough', limit: 20, label: 'Other', nullable: 'present', labels: { first: 'one' },
      };
      const other: PackGroupSettings['other'] = { label: 2 };
      // @ts-expect-error groups with identically named schema definitions stay independent
      other.label = settings.label;
      settings.optional = false;
      settings.nullable = null;
      // @ts-expect-error the enum is closed
      settings.mode = 'unknown';
      // @ts-expect-error defaults do not determine numeric types
      settings.limit = '20';
      // @ts-expect-error local references retain their value type
      settings.label = 1;
      // @ts-expect-error record values follow their schema
      settings.labels.first = false;
      // @ts-expect-error undeclared group
      type Missing = PackGroupSettings['missing'];
    `);
    expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
    expect(files['src/__generated__/pack-types.ts']).toContain('PackGroupSettings');
  });

  it('pairs schema-derived paths and values in backend accessors and custom forms', async () => {
    const declaration = { schema: { type: 'object', additionalProperties: false,
      properties: {
        enabled: { type: 'boolean' }, paths: { type: 'object', additionalProperties: { type: 'string' } },
        chat: { type: 'object', additionalProperties: false, properties: { mode: { type: 'string' } } },
        items: { type: 'array', items: { type: 'string' } },
      }, required: ['enabled', 'paths', 'chat', 'items'],
    }, defaults: { enabled: true, paths: {}, chat: {}, items: [] } };
    const files = await generatePackFiles(manifest({ features: [
      { id: 'notes', settings: declaration },
      { id: 'hidden', plugin: { label: 'Fixture', state: writePluginState('src/hidden.ts'), defaultVisible: false } },
    ] }), { packRoot: root, depSnapshots: new Map([['base-pack', dependency({
      features: [{ id: 'calendar', settings: declaration }],
    }, facade({ PackFeatureSettings: "{ calendar: { weekStartsOn: number } }" }))]]) });
    write('src/probe.ts', `
      import { featureSettings, type SettingUpdate } from './__generated__/settings.ts';
      import { useSettings } from './__generated__/settings-fe.ts';
      const notes = featureSettings.forFeature('notes');
      const enabled: boolean = notes.get().enabled;
      notes.set({ path: ['enabled'], value: enabled });
      notes.set({ path: ['enabled'] as const, value: false });
      notes.set({ path: ['paths', 'claude'], value: '/usr/bin/claude' });
      notes.set({ path: ['chat', 'mode'], value: 'focused' });
      // @ts-expect-error JSON writes do not encode undefined
      notes.set({ path: ['chat', 'mode'], value: undefined });
      notes.set({ path: ['items'], value: ['one'] });
      notes.reset();
      featureSettings.forFeature('base-pack/calendar').set({ path: ['weekStartsOn'], value: 1 });
      useSettings('base-pack/calendar').set({ path: ['weekStartsOn'], value: 2 });
      const update: SettingUpdate<'notes'> = { path: ['enabled'], value: false };
      useSettings('notes').set(update);
      // @ts-expect-error boolean field cannot accept a string
      notes.set({ path: ['enabled'], value: 'false' });
      // @ts-expect-error array elements are not independently addressable
      notes.set({ path: ['items', '0'], value: 'one' });
      // @ts-expect-error undeclared setting
      notes.set({ path: ['missing'], value: true });
      // @ts-expect-error undeclared feature
      featureSettings.forFeature('missing');
      // @ts-expect-error visibility-only declaration has no settings schema
      featureSettings.forFeature('hidden');
      // @ts-expect-error frontend enforces the same value type
      useSettings('notes').set({ path: ['enabled'], value: 1 });
    `);
    expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
    expect(files['src/__generated__/settings-fe.ts']).not.toContain('sdk/services');
    expect(files['src/__generated__/settings-fe.ts']).not.toContain('src/settings.ts');
  });
});


it('emits settings modules that compile with unused-import checking for a pack without settings', async () => {
  const files = await generatePackFiles(manifest({}), { packRoot: root });
  const diagnostics = typecheck(files, ['src/__generated__/settings.ts', 'src/__generated__/settings-fe.ts'], true);
  expect(diagnostics.filter(d => /^src\/__generated__\/settings(?:-fe)?\.ts:/.test(d))).toEqual([]);
});


it('allows feature services to create settings handles during module initialization', async () => {
  write('src/service.ts', `import { featureSettings } from './__generated__/settings.ts';
    export const notesService = { settings: featureSettings.forFeature('notes') };`);
  const files = await generatePackFiles(manifest({ features: [{
    id: 'notes', settings: { schema: { type: 'object', properties: { limit: { type: 'number' } }, required: ['limit'] }, defaults: { limit: 10 } }, services: { notes: 'src/service.ts#notesService' },
  }] }), { packRoot: root });
  write('src/probe.ts', `import './__generated__/services.ts';
    import { notesService } from './service.ts';
    if (typeof notesService.settings.get !== 'function') throw new Error('Missing settings handle');`);
  expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
  const outfile = path.join(root, 'probe.mjs');
  buildSync({ entryPoints: [path.join(root, 'src/probe.ts')], outfile,
    bundle: true, platform: 'node', format: 'esm', external: ['@apackdev/sdk/*'] });
  expect(() => execFileSync(process.execPath, ['--import', 'tsx', outfile], { stdio: 'pipe' })).not.toThrow();
});

it('runs generated frontend settings through its entry binding without ambient host administration', async () => {
  const definition = { schema: { type: 'object', properties: { limit: { type: 'number' } }, required: ['limit'] }, defaults: { limit: 10 } };
  const files = await generatePackFiles(manifest({ features: [{ id: 'notes', settings: definition }],
    extensions: { settings: { shared: definition } },
  }), { packRoot: root });
  write('src/probe.ts', `
    import { effectScope } from 'vue';
    import type { SettingsPort } from '@apackdev/sdk/fe';
    import entry from './__generated__/pack-entry-fe.ts';
    import { useSettings, usePackSettings, useAppSettings } from './__generated__/settings-fe.ts';
    const updates: unknown[] = [];
    const port: SettingsPort = {
      get: <T,>() => ({ limit: 10 } as T), status: () => 'ready', subscribe: () => () => {},
      update: async (target, path, value, condition) => { updates.push({ target, path, value, condition }); return { status: 'saved' }; },
      reset: async target => { updates.push({ target }); return { status: 'saved' }; },
    };
    const binding = entry.bindSettings(port);
    binding.activate();
    const scope = effectScope();
    const handles = scope.run(() => ({ notes: useSettings('notes'), shared: usePackSettings('shared'), app: useAppSettings() }))!;
    await handles.notes.set({ path: ['limit'], value: 20 });
    await handles.shared.set({ path: ['limit'], value: 30 });
    await handles.app.set({ path: ['personal', 'name'], value: 'Ada' });
    if (JSON.stringify(updates) !== JSON.stringify([
      { target: { kind: 'feature', featureRef: 'demo-pack/notes' }, path: ['limit'], value: 20 },
      { target: { kind: 'pack', packId: 'demo-pack', groupId: 'shared' }, path: ['limit'], value: 30 },
      { target: { kind: 'app' }, path: ['personal', 'name'], value: 'Ada' },
    ])) throw new Error('Generated settings did not reach their bound targets');
    binding.dispose();
    if ((await handles.app.reset()).status !== 'refused') throw new Error('Retained app handle remained writable');
    if ((await handles.notes.reset()).status !== 'refused') throw new Error('Retained handle remained writable');
    const next = entry.bindSettings(port);
    next.activate();
    if ((await handles.shared.reset()).status !== 'refused') throw new Error('Rebinding revived an old handle');
    next.dispose();
    scope.stop();
  `);
  expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
  const outfile = path.join(root, 'probe.mjs');
  buildSync({ entryPoints: [path.join(root, 'src/probe.ts')], outfile,
    bundle: true, platform: 'node', format: 'esm', external: ['@apackdev/sdk/*', 'vue'] });
  expect(() => execFileSync(process.execPath, ['--conditions=@apackdev/source', '--import', 'tsx', outfile], { stdio: 'pipe' })).not.toThrow();
});

it('generates owner-writable and dependency-readonly handles for both settings owners', async () => {
  const shared = {
    schema: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'], additionalProperties: false },
    defaults: { enabled: true },
  };
  const owner = { ...shared, access: 'owner' as const };
  const files = await generatePackFiles(manifest({ id: 'consumer-pack',
    extensions: { settings: { local: owner } }, features: [{ id: 'local', settings: owner }],
  }), { packRoot: root, depSnapshots: new Map([['base-pack', dependency({
    extensions: { settings: { shared, private: owner } },
    features: [{ id: 'shared', settings: shared }, { id: 'private', settings: owner }],
  }, facade({
    PackFeatureSettings: '{ shared: { enabled: boolean }; private: { enabled: boolean } }',
    PackGroupSettings: '{ shared: { enabled: boolean }; private: { enabled: boolean } }',
  }))]]) });
  write('src/probe.ts', `
    import { featureSettings, packSettings } from './__generated__/settings.ts';
    import { useSettings, usePackSettings } from './__generated__/settings-fe.ts';
    featureSettings.forFeature('local').set({ path: ['enabled'], value: false });
    featureSettings.forFeature('consumer-pack/local').reset();
    packSettings.forGroup('local').reset();
    packSettings.forGroup('consumer-pack/local').set({ path: ['enabled'], value: true });
    useSettings('local').reset();
    usePackSettings('consumer-pack/local').set({ path: ['enabled'], value: false });
    featureSettings.forFeature('base-pack/shared').set({ path: ['enabled'], value: false });
    packSettings.forGroup('base-pack/shared').reset();
    useSettings('base-pack/shared').reset();
    usePackSettings('base-pack/shared').set({ path: ['enabled'], value: false });
    const serialized: import('@apackdev/sdk/types').SettingsTarget = { kind: 'feature', featureRef: 'base-pack/private' };
    void serialized;
    // @ts-expect-error serialized feature targets still require a qualified ref
    const bare: import('@apackdev/sdk/types').SettingsTarget = { kind: 'feature', featureRef: 'private' };
    void bare;
    const feature = featureSettings.forFeature('base-pack/private');
    const group = packSettings.forGroup('base-pack/private');
    const enabled: boolean = feature.get().enabled;
    const stop = group.onChange(value => { const enabled: boolean = value.enabled; void enabled; });
    stop(); void enabled;
    // @ts-expect-error restricted dependencies are readable but not writable
    feature.set({ path: ['enabled'], value: false });
    // @ts-expect-error reset is also a mutation
    group.reset();
    // @ts-expect-error frontend uses the same feature policy
    useSettings('base-pack/private').set({ path: ['enabled'], value: false });
    // @ts-expect-error frontend uses the same group policy
    usePackSettings('base-pack/private').reset();
    // @ts-expect-error undeclared group
    usePackSettings('missing');
    // @ts-expect-error declared group value comes from its schema
    packSettings.forGroup('base-pack/shared').set({ path: ['enabled'], value: 'false' });
  `);
  expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
});

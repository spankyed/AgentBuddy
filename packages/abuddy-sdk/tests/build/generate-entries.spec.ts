import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { transformSync } from 'esbuild';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _depTypesFile, _depTypesVersion, entitiesWithoutShapes, generatePackFiles, PACK_TYPES_DEF } from '../../src/build/generate-entries.ts';
import { PACK_TYPES_FORMAT, _buildProvenance } from '../../src/build/manifest.ts';
import { SDK_ENTITIES, SDK_REL_KINDS } from '../../src/types/sdk-entities.ts';
import type { PackManifest, PackSnapshot } from '../../src/build/manifest.ts';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-codegen-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

function manifest(fields: Record<string, unknown>): PackManifest {
  return { id: 'demo-pack', name: 'Demo', version: '1.0.0', ...fields } as unknown as PackManifest;
}

/** The exports every facade `abuddy build` bundles publishes, and the declaration each gets by default */
const FACADE_DEFAULTS = {
  PackEntityShapes: '{}',
  PackStepNodes: 'never',
  PackEvents: '{}',
  PackSystemEvents: '{}',
  Services: '{}',
  Repositories: '{}',
};

/**
 * A dependency's facade as `abuddy build` bundles one, with `overrides` replacing a named export's
 * declaration. Generated code imports these from every typed dependency, so a fixture publishing
 * fewer stands for a pack built by a CLI too old to build against — not for a smaller pack.
 */
function facade(overrides: Partial<Record<keyof typeof FACADE_DEFAULTS, string>> = {}): Record<string, string> {
  const body = Object.entries({ ...FACADE_DEFAULTS, ...overrides })
    .map(([name, type]) => `export type ${name} = ${type};`)
    .join('\n');
  return { [PACK_TYPES_DEF]: body };
}

function dependency(fields: Record<string, unknown>, defs: Record<string, string> = facade()): PackSnapshot {
  // A dependency built by this CLI records the facade shape it publishes; one that doesn't is the
  // stale-facade case, covered on its own below
  return { types: { entities: {}, relKinds: {} }, defs, typesFormat: PACK_TYPES_FORMAT, manifest: manifest({ id: 'base-pack', ...fields }) };
}

function generate(fields: Record<string, unknown>, deps: Record<string, PackSnapshot> = {}): Record<string, string> {
  return generatePackFiles(manifest(fields), { packRoot: root, depSnapshots: new Map(Object.entries(deps)) });
}

/**
 * A feature with a system, and the system entry it names. The entry declares the events the system
 * emits: the generated `receivedEventTypes` reads them from it, so a fixture without one is a pack
 * whose sends could not be checked.
 */
const system = (id: string, extra: Record<string, unknown> = {}) => {
  const entry = `src/features/${id}/be/system.ts`;
  const typeName = (extra.outgoingEventsType as string | undefined)
    ?? `Outgoing${id.replace(/(^|[-_])(\w)/g, (_, __, c: string) => c.toUpperCase())}Events`;
  // A test that writes its own richer system entry keeps it; this only fills in the declaration a
  // fixture would otherwise lack, since generation now reads the events from it
  if (!fs.existsSync(path.join(root, entry))) {
    write(entry, `export type ${typeName} = { type: '${id.toUpperCase()}_CONNECTED' } | { type: '${id.toUpperCase()}_UPDATED' };\n`);
  }
  return { id, system: { entry, ...extra } };
};
const withPlugin = (feature: Record<string, unknown>) => ({ ...feature, plugin: { entry: `src/features/${feature.id}/fe/index.ts` } });

describe('generated events', () => {
  it('keys each plugin by the systems that send to it', () => {
    const files = generate({ features: [withPlugin(system('actions', { sendsTo: ['flows', 'application'] })), withPlugin(system('flows'))] });
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("'actions': __events_actions;");
    expect(events).toContain("'flows': __events_flows | __events_actions;");
    // A host plugin keeps the events the host declares it receives: a pack widens only its own plugins
    expect(events).toContain("export type PackEvents = OwnPackEvents & Omit<Pick<HostPluginEvents, 'application'>, keyof OwnPackEvents>;");
    expect(events).not.toContain("'application': __events_actions");
  });

  // The runtime half of OwnPackEvents: the app checks a system's send against it, so it has to say the
  // same thing as the types beside it
  it('records the event types each own plugin receives, read from its senders\' declared unions', () => {
    const events = generate({ features: [withPlugin(system('actions', { sendsTo: ['flows'] })), withPlugin(system('flows'))] })['src/__generated__/events.ts'];
    expect(events).toContain("'actions': ['ACTIONS_CONNECTED', 'ACTIONS_UPDATED'],");
    // flows receives its own system's events and the ones actions sends it, sorted and deduplicated
    expect(events).toContain("'flows': ['ACTIONS_CONNECTED', 'ACTIONS_UPDATED', 'FLOWS_CONNECTED', 'FLOWS_UPDATED'],");
  });

  // `{ type: 'A' | 'B' }` is one member covering two event types, a legal way to write an event whose
  // payload is the same either way — the style StepEvent already uses. Reading only single literals
  // rejected it, failing the build on a declaration nothing else objects to.
  it("expands a member whose `type` is a union of literals", () => {
    write('src/features/jobs/be/system.ts', "export type OutgoingJobsEvents = { type: 'CANCEL' | 'COMPLETE'; id: string } | { type: 'JOBS_CONNECTED' };\n");
    const events = generate({ features: [withPlugin({ id: 'jobs', system: { entry: 'src/features/jobs/be/system.ts' }, plugin: { entry: 'src/features/jobs/fe/index.ts' } })] })['src/__generated__/events.ts'];
    expect(events).toContain("'jobs': ['CANCEL', 'COMPLETE', 'JOBS_CONNECTED'],");
  });

  it('still refuses a member whose `type` is not a literal at all', () => {
    write('src/features/loose/be/system.ts', 'export type OutgoingLooseEvents = { type: string };\n');
    expect(() => generate({ features: [withPlugin({ id: 'loose', system: { entry: 'src/features/loose/be/system.ts' }, plugin: { entry: 'src/features/loose/fe/index.ts' } })] }))
      .toThrow(/`type` is string, not a string literal or a union of them/);
  });

  it('records nothing for a plugin no system sends to, so a send there is rejected', () => {
    const events = generate({ features: [withPlugin(system('actions')), withPlugin({ id: 'viewer', plugin: { entry: 'src/features/viewer/fe/index.ts' } })] })['src/__generated__/events.ts'];
    expect(events).toContain("'actions': ['ACTIONS_CONNECTED', 'ACTIONS_UPDATED'],");
    expect(events).not.toContain("'viewer':");
  });

  it('records only this pack\'s own plugins: a dependency\'s and the host\'s are their owners\' to declare', () => {
    const deps = { 'base-pack': dependency({ features: [{ id: 'memos', system: { entry: 'x' }, plugin: { entry: 'y' } }] }, facade({ PackEvents: "{ memos: { type: 'MEMO_ADDED' } }" })) };
    const events = generate({ dependencies: { 'base-pack': '1.0.0' }, features: [withPlugin(system('actions', { sendsTo: ['memos', 'application'] }))] }, deps)['src/__generated__/events.ts'];
    const runtime = events.slice(events.indexOf('receivedEventTypes'));
    expect(runtime).toContain("'actions':");
    expect(runtime).not.toContain("'memos':");
    expect(runtime).not.toContain("'application':");
  });

  it('leaves out a host plugin no sendsTo names', () => {
    const events = generate({ features: [withPlugin(system('actions'))] })['src/__generated__/events.ts'];
    expect(events).toContain('export type PackEvents = OwnPackEvents;');
    expect(events).not.toContain('HostPluginEvents');
  });

  it('gives a feature with a system but no plugin no key: nothing could receive the events', () => {
    const files = generate({ features: [withPlugin(system('actions', { sendsTo: ['flows'] })), withPlugin(system('flows')), system('brain')] });
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("export type OwnPackEvents = {\n  'actions': __events_actions;\n  'flows': __events_flows | __events_actions;\n};");
    expect(events).not.toContain("'brain': __events_brain;");
    // Its system still receives events as a system
    expect(events).toContain("'brain': IncomingEventsOf<(typeof __specs)['brain']>;");
  });

  it('rejects a sendsTo target that is a feature of this pack with no plugin', () => {
    expect(() => generate({ features: [withPlugin(system('memos', { sendsTo: ['brain'] })), system('brain')] }))
      .toThrow('Feature "memos": system.sendsTo names "brain", a feature of this pack with no plugin');
  });

  it('includes a plugin-only feature something sends to', () => {
    const files = generate({ features: [system('notes', { sendsTo: ['sidebar'] }), { id: 'sidebar', plugin: { entry: 'x' } }] });
    expect(files['src/__generated__/events.ts']).toContain("'sidebar': __events_notes;");
  });

  it("takes a dependency's plugin a sendsTo names, with the events that dependency declares it receives", () => {
    const files = generate(
      { features: [system('memos', { sendsTo: ['threads'] })] },
      { 'base-pack': dependency({ features: [withPlugin(system('threads')), withPlugin(system('code'))] }) },
    );
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("import type { PackEvents as __dep_base_pack_PackEvents } from './deps/base-pack.js';");
    // Only the plugin named, and only the events its own pack declares for it
    expect(events).toContain("export type PackEvents = OwnPackEvents & Omit<Pick<__dep_base_pack_PackEvents, 'threads'>, keyof OwnPackEvents>;");
    expect(files['src/__generated__/deps/base-pack.d.ts']).toContain('export type PackEvents = {};');
    expect(files['src/__generated__/deps/base-pack.d.ts']).toContain('// base-pack@1.0.0 facade types\n');
    expect(_depTypesVersion(files[_depTypesFile('base-pack')], 'base-pack')).toBe('1.0.0');
  });

  it("leaves out a dependency's plugins no sendsTo names", () => {
    const files = generate(
      { features: [withPlugin(system('memos'))] },
      { 'base-pack': dependency({ features: [withPlugin(system('threads'))] }) },
    );
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain('export type PackEvents = OwnPackEvents;');
    expect(events).not.toContain("import type { PackEvents as __dep_base_pack_PackEvents }");
  });

  it("rejects a sendsTo naming a dependency's plugin its own pack declares no events for", () => {
    expect(() => generate(
      { features: [system('memos', { sendsTo: ['threads'] })] },
      { 'base-pack': dependency({ features: [{ id: 'threads', plugin: { entry: 'x' } }] }) },
    )).toThrow('system.sendsTo names "threads", a plugin of a dependency that declares no events for it');
  });

  it("rejects a sendsTo naming a plugin of a dependency built without facade types", () => {
    expect(() => generate(
      { features: [system('memos', { sendsTo: ['threads'] })] },
      { 'base-pack': dependency({ features: [withPlugin(system('threads'))] }, {}) },
    )).toThrow('a plugin of "base-pack", which was built without facade types');
  });

  it('rejects a sendsTo target no pack or host provides', () => {
    expect(() => generate({ features: [system('memos', { sendsTo: ['nowhere'] })] }))
      .toThrow('Feature "memos": system.sendsTo names "nowhere"');
  });

  // A send is typed against the owning pack's PackEvents, which only a direct dependency's facade
  // names, so this stays rejected — but as the dependency it is, not as a plugin nobody has.
  it("names the owning pack for a plugin reached only through a dependency, from the snapshot's provenance", () => {
    const mid = { 'mid-pack': { ...dependency({ id: 'mid-pack' }), provenance: { plugins: { threads: 'deep-pack' } } } };
    expect(() => generate({ features: [system('memos', { sendsTo: ['threads'] })] }, mid))
      .toThrow('a plugin of "deep-pack", which this pack depends on only through another pack');
  });

  it('still sends to a direct dependency\'s plugin when a transitive record names the same id', () => {
    const base = {
      'base-pack': { ...dependency({ features: [withPlugin(system('threads'))] }), provenance: { plugins: { threads: 'deep-pack' } } },
    };
    const files = generate({ features: [system('memos', { sendsTo: ['threads'] })] }, base);
    expect(files['src/__generated__/events.ts']).toContain("Pick<__dep_base_pack_PackEvents, 'threads'>");
  });
});

// The reader behind that message is `_mergeProvenance`, covered on its own in provenance.spec.ts.

describe('generated system sends', () => {
  const baseTypes = facade();

  it("names the pack's own systems by feature id and its dependencies' as <dependency>/<feature>", () => {
    const files = generate({ features: [system('memos')] }, {
      'base-pack': dependency({ features: [system('threads')] }, baseTypes),
      'default-setup': dependency({ id: 'default-setup', builtIn: true, features: [system('memos')] }),
    });
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("export type PackSystemEvents = {\n  'memos': IncomingEventsOf<(typeof __specs)['memos']>;\n};");
    expect(events).toContain('export type SendableSystemEvents = PackSystemEvents & { [K in keyof __dep_base_pack_PackSystemEvents & string as `base-pack/${K}`]: __dep_base_pack_PackSystemEvents[K] } & ');
    // Each name maps to the id its system runs under: an external dependency's is prefixed, a built-in's isn't
    expect(events).toContain("const systemIds = {\n  ...busId,\n  'base-pack/threads': 'base-pack.threads',\n  'default-setup/memos': 'memos',\n};");
    expect(events).toContain('defineEvents<PackEvents, SendableSystemEvents>(systemIds);');
    expect(files['src/__generated__/system-specs.ts']).toContain("export const specs = {\n  'memos': incomingEvents(__system_memos.spec),\n};");
    expect(files['src/__generated__/system-ids.ts']).toContain("export const threads = 'base-pack.threads';");
    expect(files['src/__generated__/pack-types.ts']).toContain("export type { PackEvents, PackSystemEvents } from './events.js';");
  });

  it("gives a pack without systems a sendToSystem for its dependencies' systems", () => {
    const files = generate({ features: [{ id: 'sidebar', plugin: { entry: 'x' } }] }, { 'base-pack': dependency({ features: [system('threads')] }, baseTypes) });
    const events = files['src/__generated__/events.ts'];
    expect(events).not.toContain('bus-ids');
    expect(events).not.toContain('system-specs');
    expect(events).toContain("const systemIds = {\n  'base-pack/threads': 'base-pack.threads',\n};");
    expect(files['src/__generated__/system-specs.ts']).toBeUndefined();
    expect(files['src/__generated__/bus-ids.ts']).toBeUndefined();
  });
});

/** Type-checks the generated files at `names` with `root` linked to this SDK's source, and returns the diagnostics */
function typecheck(files: Record<string, string>, names: string[]): string[] {
  for (const [file, content] of Object.entries(files)) if (content) write(file, content);
  write('package.json', JSON.stringify({ type: 'module' }));
  const sdk = path.resolve(import.meta.dirname, '../..');
  const fromSdk = (name: string) => path.dirname(createRequire(path.join(sdk, 'package.json')).resolve(`${name}/package.json`));
  // The generated facades import the engine too, which a pack installs with the SDK
  const links = { '@abuddy/sdk': sdk, '@abuddy/ears': fromSdk('@abuddy/ears'), zod: fromSdk('zod') };
  for (const [name, target] of Object.entries(links)) {
    const link = path.join(root, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, 'dir');
  }
  const program = ts.createProgram(names.map((name) => path.join(root, name)), {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    customConditions: ['@abuddy/source'],
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  });
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
  it('for feature ids that match generated names, beside a dependency with the same feature ids', () => {
    const ids = ['foo', 'fooEntry', 'specs', 'incomingEvents', 'systemIds', 'registration', 'steps'];
    for (const id of ids) {
      write(`src/features/${id}/be/system.ts`, [
        "import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';",
        `export type Outgoing${id.charAt(0).toUpperCase() + id.slice(1)}Events = { type: 'DONE' };`,
        `const spec = defineSystem('${id}')<{ type: '${id.toUpperCase()}_RUN'; n: number }, { type: 'DONE' }>();`,
        `export const ${id} = spec.id;`,
        "export default { spec, machine: undefined as unknown as SystemEntry['machine'] } satisfies SystemEntry;",
      ].join('\n'));
    }
    const files = generatePackFiles(manifest({ features: ids.map((id) => ({ ...system(id), designation: id === 'foo' ? 'foo' : undefined })) }), {
      packRoot: root,
      depSnapshots: new Map([['base-pack', typedDependency({ foo: 'BASE_FOO_RUN', threads: 'THREADS_RUN' })]]),
    });
    write('src/probe.ts', [
      "import { sendToSystem } from './__generated__/events.js';",
      "import { specs, systemIds, threads } from './__generated__/system-ids.js';",
      'export const ids: string[] = [specs, systemIds, threads];',
      ...ids.map((id) => `sendToSystem('${id}', { type: '${id.toUpperCase()}_RUN', n: 1 });`),
      "sendToSystem('base-pack/foo', { type: 'BASE_FOO_RUN', n: 1 });",
      '// @ts-expect-error the own foo system receives FOO_RUN',
      "sendToSystem('foo', { type: 'BASE_FOO_RUN', n: 1 });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts', 'src/__generated__/pack-entry.ts'])).toEqual([]);
  });

  it("for a pack without systems, sending to its dependencies'", () => {
    const files = generatePackFiles(manifest({ features: [{ id: 'sidebar', plugin: { entry: 'x' } }] }), {
      packRoot: root,
      depSnapshots: new Map([['base-pack', typedDependency({ threads: 'THREADS_RUN' })]]),
    });
    write('src/probe.ts', [
      "import { sendToSystem } from './__generated__/events.js';",
      "sendToSystem('base-pack/threads', { type: 'THREADS_RUN', n: 1 });",
      '// @ts-expect-error THREADS_RUN needs its n',
      "sendToSystem('base-pack/threads', { type: 'THREADS_RUN' });",
      '// @ts-expect-error the pack has no system of its own',
      "sendToSystem('sidebar', { type: 'THREADS_RUN', n: 1 });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
  });

  it("to a dependency's plugin and a host plugin a sendsTo names, with the events their owner declares", () => {
    write('src/features/memos/be/system.ts', [
      "import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';",
      "export type OutgoingMemosEvents = { type: 'MEMO_ADDED'; text: string };",
      "const spec = defineSystem('memos')<{ type: 'ADD_MEMO'; text: string }, OutgoingMemosEvents>();",
      "export default { spec, machine: undefined as unknown as SystemEntry['machine'] } satisfies SystemEntry;",
    ].join('\n'));
    const base = dependency(
      { features: [withPlugin(system('threads')), withPlugin(system('code'))] },
      facade({ PackEvents: "{ 'threads': { type: 'TAG_ADDED'; name: string }; 'code': { type: 'FILE_OPENED'; path: string } }" }),
    );
    const files = generatePackFiles(
      manifest({ features: [withPlugin(system('memos', { sendsTo: ['threads', 'application'] }))] }),
      { packRoot: root, depSnapshots: new Map([['base-pack', base]]) },
    );
    write('src/probe.ts', [
      "import { emit, sendToPlugin } from './__generated__/events.js';",
      "emit('memos', { type: 'MEMO_ADDED', text: 'x' });",
      "emit('threads', { type: 'TAG_ADDED', name: 'x' });",
      "sendToPlugin('application', { type: 'APPLICATION_RESTORE_LAST_PLUGIN', lastActivePluginId: 'memos' });",
      "// @ts-expect-error a dependency's plugin takes only the events its own pack declares for it",
      "emit('threads', { type: 'MEMO_ADDED', text: 'x' });",
      '// @ts-expect-error the host declares what its application plugin receives',
      "sendToPlugin('application', { type: 'MEMO_ADDED', text: 'x' });",
      "// @ts-expect-error no sendsTo names the dependency's code plugin",
      "emit('code', { type: 'FILE_OPENED', path: 'x' });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
  });
});

describe('generated frontend entry', () => {
  it("sets each plugin's designation from the manifest, replacing one the plugin module sets", () => {
    const files = generate({ features: [
      { id: 'settings', designation: 'settings', plugin: { entry: 'src/settings/plugin' } },
      { id: 'notes', plugin: { entry: 'src/notes/plugin' } },
    ] });
    const fe = files['src/__generated__/pack-entry-fe.ts'];
    expect(fe).toContain("const __plugin_settings = { ...__plugin_settings_module, designation: 'settings' }");
    expect(fe).toContain('const __plugin_notes = { ...__plugin_notes_module, designation: undefined }');
  });

  it('opens the plugin that claims the default, not the pack\'s first', () => {
    const files = generate({ features: [
      { id: 'settings', plugin: { entry: 'src/settings/plugin' } },
      { id: 'notes', plugin: { entry: 'src/notes/plugin', default: true } },
    ] });

    expect(files['src/__generated__/pack-entry-fe.ts']).toContain('defaultPlugin: __plugin_notes,');
  });

  it("falls back to the pack's first plugin when none claims it", () => {
    const files = generate({ features: [
      { id: 'settings', plugin: { entry: 'src/settings/plugin' } },
      { id: 'notes', plugin: { entry: 'src/notes/plugin' } },
    ] });

    expect(files['src/__generated__/pack-entry-fe.ts']).toContain('defaultPlugin: __plugin_settings,');
  });
});

describe('generated backend entry', () => {
  it('records which features have a plugin, and takes the plugin\'s name and icon from its module', () => {
    const files = generate({ features: [
      { id: 'notes', plugin: { entry: 'src/notes/plugin' } },
      system('brain'),
    ] });
    const entry = files['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("id: 'notes',\n    hasSystem: false,\n    hasPlugin: true,");
    expect(entry).toContain("id: 'brain',\n    hasSystem: true,\n    hasPlugin: false,");
    expect(entry).not.toMatch(/label|icon|isPinned/);
  });

  it("carries the pack's declared slash commands, so registering it registers them", () => {
    const withCommands = generate({ commands: [{ name: 'note', placeholder: 'Text' }], features: [system('brain')] });
    expect(withCommands['src/__generated__/pack-entry.ts']).toContain('commands: [{"name":"note","placeholder":"Text"}],');

    // A pack that declares none says nothing
    expect(generate({ features: [system('brain')] })['src/__generated__/pack-entry.ts']).not.toContain('commands:');
  });

  it('fails for a command a dependency declares, which the app would refuse to register', () => {
    const base = { 'base-pack': dependency({ commands: [{ name: 'instructions', placeholder: 'Theirs' }] }) };
    expect(() => generate({ commands: [{ name: 'instructions', placeholder: 'Mine' }], features: [system('brain')] }, base))
      .toThrow('Command "instructions" is declared by "base-pack", which this pack depends on');
    expect(generate({ commands: [{ name: 'memo', placeholder: 'Mine' }], features: [system('brain')] }, base)['src/__generated__/pack-entry.ts'])
      .toContain('commands: [{"name":"memo","placeholder":"Mine"}],');
  });

  /**
   * `constructor` matches the command-name pattern, so it is a name a pack may declare. Looked up on an
   * ordinary object it finds `Object`'s constructor, and the build failed with
   * `declared by "function Object() { [native code] }"` — for a command nothing had declared.
   */
  it('accepts a command named after something on Object.prototype, which no pack declared', () => {
    expect(() => generate(
      { dependencies: { 'base-pack': '1.0.0' }, commands: [{ name: 'constructor' }] },
      { 'base-pack': dependency({ id: 'base-pack' }) },
    )).not.toThrow();
  });

  it('still fails when a dependency really does declare that name', () => {
    expect(() => generate(
      { dependencies: { 'base-pack': '1.0.0' }, commands: [{ name: 'constructor' }] },
      { 'base-pack': dependency({ id: 'base-pack', commands: [{ name: 'constructor' }] }) },
    )).toThrow('Command "constructor" is declared by "base-pack"');
  });

  it("fails for a command a dependency's own dependency declares, from the snapshot's provenance", () => {
    const mid = { 'mid-pack': { ...dependency({ id: 'mid-pack' }), provenance: { commands: { pr2md: 'default-setup' } } } };
    expect(() => generate({ commands: [{ name: 'pr2md', placeholder: 'Mine' }], features: [system('brain')] }, mid))
      .toThrow('Command "pr2md" is declared by "default-setup", which this pack depends on');
  });
});

describe('generated entity shapes', () => {
  it('imports own shapes under aliases and dependency shapes from their facade types', () => {
    write('src/features/memos/be/types.ts', 'export interface ItemEntity { text: string }\n');
    const files = generate(
      { entities: { Memo: 'Memo' }, entityShapes: { Memo: { source: 'src/features/memos/be/types.ts', type: 'ItemEntity' } } },
      { 'base-pack': dependency({}) },
    );
    const ears = files['src/__generated__/ears.ts'];
    expect(ears).toContain("import type { ItemEntity as __shape_Memo } from '../features/memos/be/types.js';");
    expect(ears).toContain("'Memo': __shape_Memo;");
    expect(ears).toContain("export type PackShapes = Omit<SdkEntityShapes & OwnEntityShapes & __dep_base_pack_PackEntityShapes, 'Node'> & {");
  });

  it("reads Node rows as the step node types of the pack and its dependencies, NodeBase when none define any", () => {
    write('src/steps/ping/types.ts', "import type { NodeBase } from '@abuddy/sdk';\nexport interface PingNode extends NodeBase { nodeType: 'ping' }\n");
    const withSteps = generate(
      { steps: { register: 'src/steps/register.ts', definitions: [{ type: 'ping', path: 'src/steps/ping' }] } },
      { 'base-pack': dependency({}) },
    )['src/__generated__/ears.ts'];
    expect(withSteps).toContain("import type { NodeEntity } from './types.js';");
    expect(withSteps).toContain("import type { PackStepNodes as __dep_base_pack_PackStepNodes } from './deps/base-pack.js';");
    expect(withSteps).toContain('export type PackStepNodes = NodeEntity | __dep_base_pack_PackStepNodes;');
    expect(withSteps).toContain("Node: [PackStepNodes] extends [never] ? SdkEntityShapes['Node'] : PackStepNodes;");

    const withoutSteps = generate({}, { 'base-pack': dependency({}) })['src/__generated__/ears.ts'];
    expect(withoutSteps).not.toContain("import type { NodeEntity }");
    expect(withoutSteps).toContain('export type PackStepNodes = never | __dep_base_pack_PackStepNodes;');
  });

  it('fails when a declared shape type is not exported', () => {
    write('src/types.ts', 'interface ItemEntity { text: string }\n');
    expect(() => generate({ entities: { Memo: 'Memo' }, entityShapes: { Memo: { source: 'src/types.ts', type: 'ItemEntity' } } }))
      .toThrow('Entity shape "Memo": src/types.ts doesn\'t export a type named "ItemEntity"');
  });

  it("fails when a pack redeclares the SDK's TNode shape", () => {
    write('src/types.ts', 'export interface MyTNode { x: string }\n');
    expect(() => generate({ entityShapes: { TNode: { source: 'src/types.ts', type: 'MyTNode' } } }))
      .toThrow("the SDK declares this entity's shape");
  });

  it('accepts a shape exported by name from a list', () => {
    write('src/types.ts', 'interface ItemEntity { text: string }\nexport type { ItemEntity };\n');
    expect(() => generate({ entityShapes: { Memo: { source: 'src/types.ts', type: 'ItemEntity' } } })).not.toThrow();
  });
});

describe('generated feature settings', () => {
  it("passes each feature's settings module to its registration, which registers them as defaults", () => {
    write('src/features/memos/settings.ts', 'export default { plugins: { memos: {} } };\n');
    const entry = generate({ features: [{ ...system('memos'), settings: 'src/features/memos/settings.ts' }, system('todos')] })['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("import __settings_Memos from '../features/memos/settings.js';");
    expect(entry).toMatch(/id: 'memos',[^}]*services: \[\],\n {4}settings: __settings_Memos,\n {2}\}/);
    expect(entry).toMatch(/id: 'todos',[^}]*services: \[\],\n {2}\}/);
  });

  it('fails on a settings module that is missing or has no default export', () => {
    expect(() => generate({ features: [{ ...system('memos'), settings: 'src/settings.ts' }] }))
      .toThrow('Feature "memos": no settings file found at src/settings.ts');
    write('src/settings.ts', 'export const settings = {};\n');
    expect(() => generate({ features: [{ ...system('memos'), settings: 'src/settings.ts' }] }))
      .toThrow('Feature "memos": settings src/settings.ts has no default export');
  });
});

describe('generated repositories', () => {
  it('types repositories from their declarations and puts them in the registration, registering nothing on import', () => {
    write('src/features/memos/be/repository.ts', 'export const memoQueries = {};\n');
    const files = generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/features/memos/be/repository.ts#memoQueries' } }] });
    expect(files['src/__generated__/repository.ts']).toContain("import type { memoQueries as __repo_memoQueries } from '../features/memos/be/repository.js';");
    expect(files['src/__generated__/repository.ts']).toContain('memoQueries: typeof __repo_memoQueries;');
    expect(files['src/__generated__/repositories.ts']).toContain('  memoQueries: __repo_memoQueries,');
    expect(files['src/__generated__/repositories.ts']).not.toContain('registerRepository');
    expect(files['src/__generated__/pack-entry.ts']).toContain("import { repositories } from './repositories.js';");
    expect(files['src/__generated__/pack-entry.ts']).toContain('  repositories,\n');
  });

  it('accepts a repository exported through a barrel', () => {
    write('src/memos/queries.ts', 'export const memoQueries = {};\n');
    write('src/memos/index.ts', "export * from './queries';\n");
    expect(generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/memos#memoQueries' } }] })['src/__generated__/repositories.ts'])
      .toContain("import { memoQueries as __repo_memoQueries } from '../memos/index.js';");
  });

  it('fails on a repository export that does not exist', () => {
    write('src/repo.ts', 'export const other = {};\n');
    expect(() => generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/repo.ts#memoQueries' } }] }))
      .toThrow('Repository "memoQueries" (feature "memos"): src/repo.ts doesn\'t export "memoQueries"');
  });

  it('writes no repositories module for a pack without repositories', () => {
    const files = generate({ features: [system('memos')] });
    expect(files['src/__generated__/repositories.ts']).toBeUndefined();
    expect(files['src/__generated__/pack-entry.ts']).not.toContain('repositories');
  });

  it("fails on a repository name a dependency declares, naming both packs: the app would refuse to register it", () => {
    write('src/features/memos/be/repository.ts', 'export const memoQueries = {};\n');
    const deps = { 'base-pack': dependency({ features: [{ ...system('notes'), repositories: { memoQueries: 'src/repo.ts#memoQueries' } }] }) };
    expect(() => generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/features/memos/be/repository.ts#memoQueries' } }] }, deps))
      .toThrow('Repository "memoQueries" (feature "memos") is declared by "base-pack", which this pack depends on');
  });

  it("accepts a repository name no dependency declares", () => {
    write('src/features/memos/be/repository.ts', 'export const memoQueries = {};\n');
    const deps = { 'base-pack': dependency({ features: [{ ...system('notes'), repositories: { noteQueries: 'src/repo.ts#noteQueries' } }] }) };
    expect(() => generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/features/memos/be/repository.ts#memoQueries' } }] }, deps))
      .not.toThrow();
  });
});

// A → B and A → C, both of which depend on D. Nothing exercised two dependencies converging, which
// is where a collision is silent rather than obvious: each dependency is fine on its own.
describe('a diamond dependency', () => {
  const dep = (id: string, fields: Record<string, unknown> = {}) => ({ ...dependency({ id, ...fields }), manifest: manifest({ id, ...fields }) }) as PackSnapshot;

  const surfacing = (id: string, owner: string) => ({
    types: { entities: { Memo: 'Memo' }, relKinds: {} },
    defs: facade(),
    typesFormat: PACK_TYPES_FORMAT,
    provenance: { entities: { Memo: owner } },
    manifest: manifest({ id }),
  }) as PackSnapshot;

  // Both sides surface deep-pack's Memo, because a snapshot carries its dependencies' names so a
  // chain resolves one level deep. Attributing it to the dependency it arrived through made this
  // read as two packs declaring Memo — and since every pack depends on the base pack, that was every
  // pack with two dependencies.
  it('accepts one ancestor\'s entity arriving through both sides', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'left-pack': surfacing('left-pack', 'deep-pack'),
      'right-pack': surfacing('right-pack', 'deep-pack'),
    })).not.toThrow();
  });

  /**
   * The same diamond, on an entity name assignment to an ordinary object would have lost. Each side's
   * provenance is produced by `_buildProvenance` and put through JSON, as a real build's is, because
   * that round trip is where the two halves of the hazard differ: `JSON.parse` defines `__proto__` as an
   * own property, while the assignment that wrote it did not.
   */
  /**
   * The read half, which the write half does not cover. A dependency can surface a name its provenance
   * does not record — its own dependency was built without provenance, say — and the lookup is then meant
   * to fall back to the pack the name arrived through. On an ordinary object a name like `constructor`
   * finds `Object`'s constructor instead, and that function becomes the declaring pack: it is compared
   * against other packs' names, and printed if a collision is reported.
   */
  it('falls back to the dependency for a surfaced name its provenance omits, even one Object.prototype has', async () => {
    const { mergeRegistries } = await import('../../src/build/generate-entries.ts');
    const depTypes = new Map([['base-pack', { entities: { constructor: 'constructor' }, relKinds: {} }]]);
    const provenanceOmittingIt = new Map([['base-pack', { entities: JSON.parse('{"Memo":"deep-pack"}') }]]);

    const registry = mergeRegistries('app-pack', manifest({ id: 'app-pack' }), depTypes, provenanceOmittingIt);

    expect(registry.entities.get('constructor')?.source).toBe('base-pack');
  });

  it("accepts an ancestor's entity named __proto__ arriving through both sides", () => {
    const side = (id: string) => ({
      types: { entities: { ['__proto__']: '__proto__' }, relKinds: {} },
      defs: facade(),
      typesFormat: PACK_TYPES_FORMAT,
      provenance: JSON.parse(JSON.stringify(_buildProvenance(
        [['deep-pack', { manifest: { entities: { ['__proto__']: '__proto__' } } }] as const],
        { id, manifest: {} },
      ))),
      manifest: manifest({ id }),
    }) as PackSnapshot;

    expect(() => generate({ features: [system('brain')] }, {
      'left-pack': side('left-pack'),
      'right-pack': side('right-pack'),
    })).not.toThrow();
  });

  it('still reports two different packs that each declare the same entity', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'left-pack': surfacing('left-pack', 'left-pack'),
      'right-pack': surfacing('right-pack', 'right-pack'),
    })).toThrow(/entity "Memo" declared by both/);
  });

  it("names the deeper pack once for a plugin both sides surface", () => {
    const owners = { threads: 'deep-pack' };
    expect(() => generate({ features: [system('memos', { sendsTo: ['threads'] })] }, {
      'left-pack': { ...dep('left-pack'), provenance: { plugins: owners } } as PackSnapshot,
      'right-pack': { ...dep('right-pack'), provenance: { plugins: owners } } as PackSnapshot,
    })).toThrow('a plugin of "deep-pack"');
  });
});

describe("a dependency's facade", () => {
  /** A snapshot whose facade publishes only `names`, standing for one an older CLI produced */
  const publishing = (names: string[], fields: Record<string, unknown> = {}) => ({
    types: { entities: {}, relKinds: {} },
    defs: { [PACK_TYPES_DEF]: names.map((n) => `export type ${n} = {};`).join('\n') },
    typesFormat: PACK_TYPES_FORMAT,
    manifest: manifest({ id: 'base-pack' }),
    ...fields,
  }) as PackSnapshot;

  const ALL = Object.keys(FACADE_DEFAULTS);

  // Presence used to be the whole check, so a facade whose shape had changed was consumed and blew up
  // later as TS2305 inside generated code, naming nothing the author could act on. The check is on the
  // exports the generated code imports, so the message names those instead.
  it('fails naming each export the generated code imports and the facade lacks', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': publishing(ALL.filter((n) => n !== 'Services' && n !== 'Repositories')),
    })).toThrow(/publishes facade types without `Services`, `Repositories`.*Rebuild "base-pack"/s);
  });

  it('names how the facade was built, as context for the missing exports', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': publishing(['PackEvents'], { sdkVersion: '0.2.1', typesFormat: PACK_TYPES_FORMAT + 1 }),
    })).toThrow(`(Built with SDK 0.2.1, facade format ${PACK_TYPES_FORMAT + 1}; this CLI generates facade format ${PACK_TYPES_FORMAT}.)`);
  });

  // The format number is a proxy for the exports, and a worse one: it fails a dependency whose facade
  // changed in ways this pack never touches. Capability is the check; the format is only context.
  it('accepts a capable facade whose recorded format this CLI does not generate', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': publishing(ALL, { typesFormat: PACK_TYPES_FORMAT + 1 }),
    })).not.toThrow();
  });

  it('accepts a capable facade that records no format at all', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': publishing(ALL, { typesFormat: undefined }),
    })).not.toThrow();
  });

  // PackEvents is imported only for a dependency a sendsTo names, so requiring it of every dependency
  // would fail builds over a type they never import.
  it('does not require PackEvents of a dependency no sendsTo names', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': publishing(ALL.filter((n) => n !== 'PackEvents')),
    })).not.toThrow();
  });

  it('requires PackEvents of a dependency whose plugin a sendsTo names', () => {
    expect(() => generate(
      { features: [withPlugin(system('memos', { sendsTo: ['threads'] }))] },
      {
        'base-pack': publishing(ALL.filter((n) => n !== 'PackEvents'), {
          manifest: manifest({ id: 'base-pack', features: [withPlugin(system('threads'))] }),
        }),
      },
    )).toThrow(/without `PackEvents`, which is needed because this pack's system.sendsTo names one of its plugins/);
  });

  // The remedy has to be one the reader can carry out. "Rebuild it" is right for a workspace sibling
  // and impossible for a release someone else published — there is no source tree to build.
  describe('names a remedy that fits where the dependency came from', () => {
    const incapable = () => ({ 'base-pack': publishing(ALL.filter((n) => n !== 'Services')) });
    const failure = (sources?: Record<string, string>) => {
      try {
        generatePackFiles(manifest({ features: [system('brain')] }), {
          packRoot: root,
          depSnapshots: new Map(Object.entries(incapable())),
          depSources: sources && new Map(Object.entries(sources)),
        });
      } catch (err) {
        return (err as Error).message;
      }
      throw new Error('expected the facade check to fail');
    };

    it('tells the author to rebuild a workspace dependency, and says where it came from', () => {
      const message = failure({ 'base-pack': 'workspace' });
      expect(message).toContain('(from workspace)');
      expect(message).toContain('Rebuild "base-pack"');
      expect(message).not.toContain("can't rebuild it yourself");
    });

    it('tells the author to rebuild a file: dependency', () => {
      const message = failure({ 'base-pack': 'file:/packs/base-pack' });
      expect(message).toContain('(from file:/packs/base-pack)');
      expect(message).toContain('Rebuild "base-pack"');
    });

    it('does not tell the author to rebuild a downloaded release', () => {
      const message = failure({ 'base-pack': 'github:acme/base-pack@1.4.0' });
      expect(message).toContain('(from github:acme/base-pack@1.4.0)');
      expect(message).toContain("You can't rebuild it yourself");
      expect(message).toContain('ask its author for a release built with a current abuddy CLI');
      expect(message).not.toMatch(/Rebuild "base-pack"/);
    });

    // Taken out of an installed app, so there is no source tree here — and no author to ask either:
    // the copy came with AgentBuddy and moves when AgentBuddy does
    it('tells the author to update AgentBuddy for a pack from an installed app', () => {
      const message = failure({ 'base-pack': 'installed app (production)' });
      expect(message).toContain('(from installed app (production))');
      expect(message).toContain('update AgentBuddy');
      expect(message).not.toContain('ask its author');
      expect(message).not.toMatch(/Rebuild "base-pack"/);
    });

    // A cache hit records no source, so the message offers both and names neither situation
    it('offers both options when the dependency came from the cache', () => {
      const message = failure();
      expect(message).not.toContain('(from ');
      expect(message).toContain('Rebuild "base-pack"');
      expect(message).toContain("if it isn't yours to build");
    });
  });

  // A pack built before facades existed has no facade at all. That stays a silent downgrade to
  // untyped, which is what `typedDeps` is for — the check is only about a facade that exists.
  it('accepts a dependency with no facade at all, which stays untyped', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': { types: { entities: {}, relKinds: {} }, defs: {}, manifest: manifest({ id: 'base-pack' }) } as PackSnapshot,
    })).not.toThrow();
  });
});

describe('service name collisions', () => {
  const withService = (id: string, name: string) => ({ id, services: { [name]: 'src/x.ts#svc' } });

  // Services from dependencies are intersected (_S0 & _S1), which says nothing about a collision:
  // two `db` services merge into an unusable type with no error. The registry refuses the second
  // pack at registration, so without this the report arrives at app start instead of at build.
  it('fails when two dependencies declare the same service name', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': dependency({ id: 'base-pack', features: [withService('a', 'db')] }),
      'other-pack': dependency({ id: 'other-pack', features: [withService('b', 'db')] }),
    })).toThrow('Service "db" is declared by both');
  });

  it("fails when this pack declares a name a dependency declares, as commands and repositories do", () => {
    expect(() => generate({ features: [withService('mine', 'db')] }, {
      'base-pack': dependency({ id: 'base-pack', features: [withService('a', 'db')] }),
    })).toThrow('Service "db" is declared by "base-pack"');
  });

  it('covers pack-level services, not only a feature\'s', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': dependency({ id: 'base-pack', packServices: { db: 'src/x.ts#svc' } }),
      'other-pack': dependency({ id: 'other-pack', features: [withService('b', 'db')] }),
    })).toThrow('Service "db" is declared by both');
  });

  it('accepts distinct names across dependencies', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': dependency({ id: 'base-pack', features: [withService('a', 'db')] }),
      'other-pack': dependency({ id: 'other-pack', features: [withService('b', 'cache')] }),
    })).not.toThrow();
  });
});

describe('generated services', () => {
  const service = (target: string, key = 'memo') => generate({ features: [{ id: 'memos', services: { [key]: target } }] })['src/__generated__/services.ts'];

  it('imports the named service object under an alias, so a service named "services" does not shadow the export', () => {
    write('src/services.ts', 'export const servicesService = { value: 1 };\n');
    const services = service('src/services.ts#servicesService', 'services');
    expect(services).toContain("import { servicesService as __service_services } from '../services.js';");
    expect(services).toContain('  services: __service_services,');
    expect(services).toContain('export const services = sdkServices');
  });

  it('imports pack-level services the same way', () => {
    write('src/cache/index.ts', 'export const cacheService = { get: (key: string) => key };\n');
    const services = generate({ packServices: { cache: 'src/cache#cacheService' } })['src/__generated__/services.ts'];
    expect(services).toContain("import { cacheService as __service_cache } from '../cache/index.js';");
    expect(services).toContain('  cache: __service_cache,');
  });

  it('accepts a service object re-exported from another module, a barrel or a multi-line export list', () => {
    write('src/impl.ts', 'class MemoStore { list(): string[] { return []; } }\n/* export const memoService = 1 */\nconst memoService = new MemoStore();\nexport {\n  MemoStore,\n  memoService,\n};\n');
    write('src/reexport.ts', "export { memoService } from './impl';\n");
    write('src/barrel.ts', "export * from './reexport';\n");
    write('src/renamed.ts', "import { memoService as impl } from './impl';\nexport { impl as memoService };\n");
    for (const source of ['src/impl.ts', 'src/reexport.ts', 'src/barrel.ts', 'src/renamed.ts']) {
      expect(service(`${source}#memoService`)).toContain('  memo: __service_memo,');
    }
  });

  it("fails on a target without an export, a missing file or export, and an export that isn't a service object", () => {
    write('src/memo.ts', [
      'export type MemoType = { list(): string[] };',
      'export interface MemoInterface { list(): string[] }',
      'export function createMemoService() { return {}; }',
      'export const memoFactory = () => ({});',
      'export class MemoService {}',
      'const typeOnly = {};',
      'export type { typeOnly };',
      '// export const commented = {};',
    ].join('\n'));
    expect(() => service('src/memo.ts')).toThrow('Service "memo": "src/memo.ts" must name its export, as "path#exportName"');
    expect(() => service('src/missing.ts#memoService')).toThrow('Service "memo": no file found at src/missing.ts');
    expect(() => service('src/memo.ts#memoService')).toThrow('Service "memo": src/memo.ts doesn\'t export "memoService"');
    expect(() => service('src/memo.ts#commented')).toThrow('Service "memo": src/memo.ts doesn\'t export "commented"');
    for (const name of ['MemoType', 'MemoInterface', 'typeOnly']) {
      expect(() => service(`src/memo.ts#${name}`)).toThrow(`Service "memo": src/memo.ts exports "${name}" only as a type, not a value`);
    }
    for (const name of ['createMemoService', 'memoFactory']) {
      expect(() => service(`src/memo.ts#${name}`)).toThrow(`Service "memo": "${name}" in src/memo.ts is a function; export the service object itself`);
    }
    expect(() => service('src/memo.ts#MemoService')).toThrow('Service "memo": "MemoService" in src/memo.ts is a class; export an instance of it');
  });

  it("intersects dependencies' services and types repository with the pack's repositories", () => {
    const services = generate({}, { 'base-pack': dependency({}) })['src/__generated__/services.ts'];
    expect(services).toContain("Omit<HostServices, 'repository' | 'emitter'> & { repository: Repositories; emitter: PackEmitter } & Omit<__dep_base_pack_Services, 'repository' | 'emitter'>");
  });

  it("types the emitter with the pack's events, naming every system <pack>/<feature>", () => {
    const files = generate({ features: [system('memos')] }, { 'base-pack': dependency({ features: [system('threads')] }, facade()) });
    expect(files['src/__generated__/events.ts']).toContain('export type QualifiedSystemEvents = { [K in keyof PackSystemEvents & string as `demo-pack/${K}`]: PackSystemEvents[K] } & { [K in keyof __dep_base_pack_PackSystemEvents & string as `base-pack/${K}`]: __dep_base_pack_PackSystemEvents[K] };');
    const services = files['src/__generated__/services.ts'];
    expect(services).toContain("import type { PackEvents, QualifiedSystemEvents } from './events.js';");
    expect(services).toContain('  sendToPlugin: TypedSendToPlugin<PackEvents>;\n  sendToSystem: TypedSendToSystem<QualifiedSystemEvents>;');
  });
});

describe('generated imports', () => {
  it('names generated modules with .js', () => {
    const files = generate({ features: [system('memos')] });
    expect(files['src/__generated__/pack-entry.ts']).toContain("import { getCompiledDir, seeders } from './seeders.js';");
    expect(files['src/__generated__/pack-entry.ts']).not.toMatch(/from '\.\/seeders';/);
  });

  it('keeps dots in extensionless names and normalizes backslashes', () => {
    write('src/features/memos/be/memo.types.ts', 'export interface MemoEntity { text: string }\n');
    const ears = generate({ entityShapes: { Memo: { source: 'src\\features\\memos\\be\\memo.types', type: 'MemoEntity' } } })['src/__generated__/ears.ts'];
    expect(ears).toContain("from '../features/memos/be/memo.types.js';");
  });
});

describe('generated EARS facade', () => {
  it('names the declared entities and passes them to the typed helpers, with tx', () => {
    write('src/memo.ts', 'export interface MemoEntity { text: string }\n');
    const ears = generate({ entities: { Memo: 'Memo', Tag: 'Tag' }, entityShapes: { Memo: { source: 'src/memo.ts', type: 'MemoEntity' } } })['src/__generated__/ears.ts'];
    expect(ears).toContain(`export type EntityName = ${['Memo', 'Tag', ...Object.values(SDK_ENTITIES)].map((name) => `'${name}'`).join(' | ')};`);
    expect(ears).toContain('defineEars<PackShapes, EntityName>()');
    expect(ears).toMatch(/export const \{\n  qx, tx, findById/);
  });
});

describe("the SDK's entities and relation kinds", () => {
  it('are in every pack, with no entities or dependencies declared', () => {
    const ears = generate({})['src/__generated__/ears.ts'];
    for (const entity of Object.values(SDK_ENTITIES)) expect(ears).toContain(`export const ${entity} = '${entity}';`);
    for (const [name, kind] of Object.entries(SDK_REL_KINDS)) expect(ears).toContain(`export const ${name} = '${kind}';`);
    expect(ears).toContain(`export type EntityName = ${Object.values(SDK_ENTITIES).map((name) => `'${name}'`).join(' | ')};`);
    expect(ears).toContain("import type { SdkEntityShapes } from '@abuddy/sdk';");
    // Relation alone doesn't close the pack's Entity type
    expect(ears).toContain('export type Entity = string;');
  });

  it("rejects a dependency whose types still declare the SDK's names, asking to rebuild it", () => {
    const base = { ...dependency({}), types: { entities: { Flow: 'Flow', Tag: 'Tag' }, relKinds: { NEXT: 'transitions_to' } } };
    expect(() => generate({ dependencies: { 'base-pack': '*' } }, { 'base-pack': base })).toThrow(
      'Type conflicts:\n  entity "Flow" from "base-pack" is defined by the SDK: rebuild "base-pack" with the current abuddy CLI',
    );
    const relKindsOnly = { ...dependency({}), types: { entities: { Tag: 'Tag' }, relKinds: { NEXT: 'transitions_to' } } };
    expect(() => generate({ dependencies: { 'base-pack': '*' } }, { 'base-pack': relKindsOnly }))
      .toThrow('relKind "NEXT": "transitions_to" from "base-pack" is defined by the SDK');
  });

  it('rejects a name or value two sources declare', () => {
    const base = { ...dependency({}), types: { entities: { Tag: 'Tag' }, relKinds: { TAGGED: 'tagged' } } };
    const withBase = (manifest: object) => () => generate({ ...manifest, dependencies: { 'base-pack': '*' } }, { 'base-pack': base });
    expect(withBase({ entities: { Tag: 'Tag' } })).toThrow('entity "Tag" declared by both "demo-pack" and "base-pack"');
    expect(withBase({ relKinds: { LABELLED: 'tagged' } })).toThrow('relKind "TAGGED" declared by both "demo-pack" and "base-pack"');
    expect(withBase({ relKinds: { TAGGED: 'labelled' } })).toThrow('relKind "TAGGED" declared by both "demo-pack" and "base-pack"');
  });

  it('names entity types by their values in EntityName, the type names rows carry', () => {
    // abuddy.json requires an entity's key to be its type name; the generated names follow the value regardless
    const base = { ...dependency({}), types: { entities: { Tag: 'Tag' }, relKinds: {} } };
    const ears = generate({ entities: { Memo: 'memo' }, dependencies: { 'base-pack': '*' } }, { 'base-pack': base })['src/__generated__/ears.ts'];
    const names = ears.match(/export type EntityName = ([^;]*);/)![1];
    expect(names).toContain("'memo'");
    expect(names).not.toContain("'Memo'");
    expect(names).toContain("'Tag'");
    expect(names).toContain("'Relation'");
  });

  it("registers only the pack's own entities and relation kinds, not its dependencies' or the SDK's", () => {
    const base = { ...dependency({}), types: { entities: { Tag: 'Tag' }, relKinds: { TAGGED: 'tagged' } } };
    const entry = generate({ entities: { Memo: 'Memo' }, relKinds: { PINNED: 'pinned' }, dependencies: { 'base-pack': '*' } }, { 'base-pack': base })['src/__generated__/pack-entry.ts'];
    expect(entry).toContain('entities: {"Memo":"Memo"},');
    expect(entry).toContain('relKinds: {"PINNED":"pinned"},');
  });

  it("rejects a pack's own declaration of the SDK's names", () => {
    expect(() => generate({ entities: { Relation: 'Relation' } })).toThrow(/entity "Relation" is defined by the SDK/);
    expect(() => generate({ entities: { Action: 'Action' } })).toThrow(/entity "Action" is defined by the SDK/);
    expect(() => generate({ relKinds: { TRANSITIONS_TO: 'transitions_to' } })).toThrow(/relKind "TRANSITIONS_TO": "transitions_to" is defined by the SDK/);
  });
});

describe('entitiesWithoutShapes', () => {
  it("lists the pack's entities with no shape, leaving out those the SDK shapes", () => {
    expect(entitiesWithoutShapes({
      entities: { Memo: 'Memo', Tag: 'Tag', TNode: 'TNode', Relation: 'Relation', Action: 'Action' },
      entityShapes: { Memo: { source: 'src/memo.ts', type: 'MemoEntity' } },
    })).toEqual(['Tag']);
    expect(entitiesWithoutShapes({})).toEqual([]);
  });
});

describe('generated registrations', () => {
  // Everything a pack contributes arrives in its registration: no generated module registers anything when imported
  it("carry the pack's seeders and DSL types, which their modules only export", () => {
    const files = generate({
      features: [{ id: 'memos', plugin: { entry: 'src/features/memos/fe/plugin.ts' } }],
      boot: { seed: { actions: 'src/seeds/actions' } },
      dsl: { memo: { entry: 'src/defs/memo.ts', targets: ['monaco'], prefix: 'memo:', globals: { memos: 'typeof _dsl.memos' } } },
    });
    expect(files['src/__generated__/pack-entry.ts']).toContain('\n  seeders,\n');
    expect(files['src/__generated__/seeders.ts']).toContain('export const seeders: Seeder[] = [');
    expect(files['src/__generated__/pack-entry-fe.ts']).toContain("import { dslTypes } from './dsl-types-fe.js';");
    expect(files['src/__generated__/pack-entry-fe.ts']).toContain('\n  dslTypes,\n');
    expect(files['src/__generated__/dsl-types-fe.ts']).toContain([
      'export const dslTypes: Record<string, DslTypeConfig> = {',
      '  memo: {',
      "    prefix: 'memo:',",
      '    schema: memoSchema,',
      '    globals: {',
      "      memos: 'typeof _dsl.memos',",
    ].join('\n'));
    for (const [file, content] of Object.entries(files)) {
      expect(content, file).not.toMatch(/\bregister(Seeders?|DslType)\s*\(/);
      expect(content, file).not.toMatch(/^import '[^']+';$/m);
    }
  });

  it('carry no seeders or DSL types for a pack without them', () => {
    const files = generate({ features: [{ id: 'memos', plugin: { entry: 'src/features/memos/fe/plugin.ts' } }] });
    expect(files['src/__generated__/seeders.ts']).toContain('export const seeders: Seeder[] = [];');
    expect(files['src/__generated__/pack-entry-fe.ts']).not.toContain('dslTypes');
    expect(files).not.toHaveProperty(['src/__generated__/dsl-types-fe.ts']);
  });
});

describe('generated seeders', () => {
  it('registers the generic seeder with its format settings, and SDK seeders for specialty keys', () => {
    const files = generate({
      entities: { Memo: 'Memo' },
      seedFormats: {
        memos: { format: 'markdown-tree', entity: 'Memo', identity: ['title', 'parent'], tree: { relKind: 'has_memo' }, media: 'media' },
        faqs: { compiler: 'src/seeds/compilers/faqs.ts' },
      },
      boot: { seed: {
        actions: 'src/seeds/actions',
        flows: { path: 'src/seeds/flows' },
        memos: { path: 'src/seeds/memos', format: 'memos' },
        faqs: { path: 'src/seeds/faqs', format: 'faqs' },
      } },
    });
    const seeders = files['src/__generated__/seeders.ts'];
    expect(seeders).toContain(`export const seeders: Seeder[] = [\n  createSeeder({ key: 'actions', entities: ['Action'], identity: ['label'] }),`);
    expect(seeders).toContain('  createFlowSeeder(),');
    expect(seeders).toContain('  createSeeder({"key":"memos","entities":["Memo"],"identity":["title","parent"],"relKind":"has_memo","media":true}),');
    expect(seeders).not.toContain('faqs');
    expect(files['src/__generated__/pack-entry.ts']).toContain('seedKeys: ["actions", "flows", "memos"],');
  });

  it("uses a dependency's format settings for an entry naming it", () => {
    const deps = { 'base-pack': { ...dependency({ seedFormats: { notes: { format: 'markdown-tree', entity: 'Note', identity: ['title'], tree: { branch: 'index.md' } } } }), types: { entities: { Note: 'Note' }, relKinds: {} } } };
    const seeders = generate({ dependencies: { 'base-pack': '*' }, boot: { seed: { team: { path: 'src/seeds/team', format: 'base-pack:notes' } } } }, deps)['src/__generated__/seeders.ts'];
    expect(seeders).toContain('  createSeeder({"key":"team","entities":["Note"],"identity":["title"]}),');
    expect(() => generate({ dependencies: { 'base-pack': '*' }, boot: { seed: { team: { path: 'p', format: 'base-pack:missing' } } } }, deps))
      .toThrow('Seed "team": dependency "base-pack" has no format "missing"');
  });

  it("registers a pack seeder module under a seed key that isn't an identifier", () => {
    const seeders = generate({ boot: { seed: { 'my-memos': { seeder: 'src/seeds/memos.ts' } } } })['src/__generated__/seeders.ts'];
    expect(seeders).toContain("import { seed as __seeder_my_memos } from '../seeds/memos.js';");
    expect(seeders).toContain('  { key: "my-memos", seed: __seeder_my_memos },');
  });

  it("registers a pack seeder module for a format entry naming one, and boot-seeds the compiled entry", () => {
    const files = generate({
      seedFormats: { settings: { compiler: 'src/seeds/compilers/settings.ts' } },
      boot: { seed: { settings: { path: 'src/seeds/settings.ts', format: 'settings', seeder: 'src/seeds/settings-seeder.ts' } } },
    });
    const seeders = files['src/__generated__/seeders.ts'];
    expect(seeders).toContain("import { seed as __seeder_settings } from '../seeds/settings-seeder.js';");
    expect(seeders).toContain('  { key: "settings", seed: __seeder_settings },');
    expect(seeders).not.toContain('createSeeder');
    expect(files['src/__generated__/pack-entry.ts']).toContain('seedKeys: ["settings"],');
  });

  it('accepts format entities from the SDK and dependencies, and rejects one nobody declares', () => {
    const deps = { 'base-pack': { ...dependency({}), types: { entities: { Note: 'Note' }, relKinds: {} } } };
    expect(() => generate({ dependencies: { 'base-pack': '*' }, seedFormats: {
      notes: { format: 'markdown-tree', entity: 'Note' },
      actions2: { format: 'json', entity: 'Action', identity: ['label'] },
    } }, deps)).not.toThrow();
    // Unused formats are checked too: dependents may use them
    expect(() => generate({ seedFormats: { memos: { format: 'json', entity: 'Memo' } } }))
      .toThrow(`Seed format "memos": entity "Memo" isn't declared by this pack, its dependencies or the SDK`);
    expect(() => generate({ seedFormats: { memos: { format: 'markdown-tree', entity: 'Action', tree: { branchEntity: 'Folder' } } } }))
      .toThrow(`entity "Folder" isn't declared`);
  });

  it("registers the pack's seed hooks by entity type", () => {
    write('src/memo-hooks.ts', 'export const memoSeedHooks = {};');
    const entry = generate({ entities: { Memo: 'Memo' }, seedHooks: { Memo: 'src/memo-hooks.ts#memoSeedHooks' } })['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("import { memoSeedHooks as __seedHooks_0 } from '../memo-hooks.js';");
    expect(entry).toContain('seedHooks: { "Memo": __seedHooks_0 },');
    expect(() => generate({ entities: { Memo: 'Memo' }, seedHooks: { Memo: 'src/memo-hooks.ts#missing' } }))
      .toThrow(`Seed hooks for "Memo": src/memo-hooks.ts doesn't export "missing"`);
  });

  it('names seed hook imports validly whatever the entity is called', () => {
    write('src/hooks.ts', 'export const docHooks = {};\nexport const noteHooks = {};');
    const files = generate({
      entities: { 'team-doc': 'team-doc', 'team.note': 'team.note' },
      seedHooks: { 'team-doc': 'src/hooks.ts#docHooks', 'team.note': 'src/hooks.ts#noteHooks' },
    });
    for (const file of ['src/__generated__/pack-entry.ts', 'src/__generated__/seed-runtime.ts']) {
      expect(() => transformSync(files[file], { loader: 'ts' }), file).not.toThrow();
      expect(files[file]).toContain('seedHooks: { "team-doc": __seedHooks_0, "team.note": __seedHooks_1 },');
    }
  });
});

describe('generated flow helpers', () => {
  const helpers = (exports: string[], name: string) => ({ exports, module: `// ${name} module`, types: `// ${name} types` });

  it("types a step helper's options with the step's DSL node fields", () => {
    write('src/steps/pour/types.ts', "export interface DSLPourNode { type: 'pour'; cup: string; size?: 'small' | 'large'; [key: string]: unknown }\n");
    const files = generate({ steps: { register: 'src/steps/register.ts', definitions: [{ type: 'pour', path: 'src/steps/pour', dsl: { primaryField: 'cup' } }] } });

    expect(files['src/__generated__/flow-helpers.ts']).toContain(
      "export function pour(cup: string, opts?: { [K in keyof DSLPourNode as K extends 'type' | 'cup' ? never : K]: DSLPourNode[K] }): DSLStepNode {",
    );
  });

  it('names helpers in camelCase, splitting step types and track fields on - and _', () => {
    write('src/steps/pour-cup/types.ts', "export interface DSLPourCupNode { type: 'pour-cup'; cup: string; [key: string]: unknown }\n");
    write('src/steps/every-day/build.ts', "export const everyDay = { trigger: { trackField: 'every_day' } };\n");
    const files = generate({ steps: { register: 'src/steps/register.ts', definitions: [
      { type: 'pour-cup', path: 'src/steps/pour-cup', dsl: { primaryField: 'cup' } },
      { type: 'keep_alive', path: 'src/steps/keep-alive', dsl: {} },
      { type: 'stop-now', path: 'src/steps/stop-now', dsl: { defaultLabel: 'Stop' } },
      { type: 'every-day', path: 'src/steps/every-day', kind: 'trigger' },
    ] } });
    const flowHelpers = files['src/__generated__/flow-helpers.ts'];

    expect(flowHelpers).toContain('export function pourCup(cup: string, opts?:');
    expect(flowHelpers).toContain("return { type: 'pour-cup', cup, ...opts };");
    expect(flowHelpers).toContain('export function keepAlive(label?: string): DSLStepNode {');
    expect(flowHelpers).toContain("export function stopNow(label: string = 'Stop'): DSLStepNode {");
    expect(flowHelpers).toContain('export function everyDay(every_day: string, exits: DSLStepNode[][], label?: string): Track {');
    const { diagnostics } = ts.transpileModule(flowHelpers, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ESNext } });
    expect(diagnostics?.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
  });

  it("re-exports each dependency's flow helpers from the module its snapshot carries, except names already exported", () => {
    write('src/steps/pour/types.ts', "export interface DSLPourNode { type: 'pour'; cup: string }\n");
    const files = generate(
      { steps: { register: 'src/steps/register.ts', definitions: [{ type: 'pour', path: 'src/steps/pour', dsl: { primaryField: 'cup' } }] } },
      {
        'base-pack': { ...dependency({}), flowHelpers: helpers(['branch', 'entry', 'on', 'pour', 'schedule'], 'base-pack') },
        'other-pack': { ...dependency({ id: 'other-pack' }), flowHelpers: helpers(['branch', 'every'], 'other-pack') },
        'untyped-pack': dependency({ id: 'untyped-pack' }),
      },
    );
    const flowHelpers = files['src/__generated__/flow-helpers.ts'];

    expect(flowHelpers).toContain("export { branch, schedule } from './deps/base-pack.flow-helpers.js';");
    expect(flowHelpers).toContain("export { every } from './deps/other-pack.flow-helpers.js';");
    expect(flowHelpers).not.toContain('untyped-pack');
    expect(flowHelpers).not.toContain('Record<string, unknown>');
    expect(files['src/__generated__/deps/base-pack.flow-helpers.js']).toContain('// base-pack module');
    expect(files['src/__generated__/deps/base-pack.flow-helpers.d.ts']).toContain('// base-pack types');
  });
});

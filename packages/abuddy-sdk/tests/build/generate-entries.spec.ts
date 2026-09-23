import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { transformSync } from 'esbuild';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _depTypesFile, _depTypesVersion, entitiesWithoutShapes, generatePackFiles, PACK_TYPES_DEF } from '../../src/build/generate-entries.ts';
import { _buildProvenance, PACK_SNAPSHOT_FORMAT, PROVENANCE_KINDS } from '../../src/build/manifest.ts';
import { SDK_ENTITIES, SDK_REL_KINDS } from '../../src/types/sdk-entities.ts';
import type { PackFeatureEntry, PackManifest, PackPluginEntry, PackSnapshot, PackSystemEntry, SeedFormatConfig } from '../../src/build/manifest.ts';
import type { PackFeature, PackFeaturePlugin, PackFeatureSystem, PackRegistration } from '../../src/framework/index.ts';

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
  PackPluginEvents: '{}',
  PackSystemEvents: '{}',
  Services: '{}',
  Repositories: '{}',
};

/**
 * A dependency's facade as `abuddy build` bundles one, with `overrides` replacing a named export's
 * declaration. Generated code imports these from every dependency.
 */
function facade(overrides: Partial<Record<keyof typeof FACADE_DEFAULTS, string>> = {}): Record<string, string> {
  const body = Object.entries({ ...FACADE_DEFAULTS, ...overrides })
    .map(([name, type]) => `export type ${name} = ${type};`)
    .join('\n');
  return { [PACK_TYPES_DEF]: body };
}

function dependency(fields: Record<string, unknown>, defs: Record<string, string> = facade()): PackSnapshot {
  return { types: { entities: {}, relKinds: {} }, defs, manifest: manifest({ id: 'base-pack', ...fields }), format: PACK_SNAPSHOT_FORMAT };
}

function generate(fields: Record<string, unknown>, deps: Record<string, PackSnapshot> = {}): Record<string, string> {
  return generatePackFiles(manifest(fields), { packRoot: root, depSnapshots: new Map(Object.entries(deps)) });
}

/**
 * A system entry whose spec declares the events the system receives and sends, typed as `defineSystem` types
 * them, with no import: codegen reads the sent events from the default export's spec.
 */
/**
 * A plugin entry, and beside it the contract leaf when the plugin declares one. The contract is a plain declared
 * type: these fixtures are bare temp dirs with no `@abuddy/sdk` to resolve, and a declared type needs no import to
 * read — which is the point of reading one rather than a value's phantom property.
 */
function writePluginEntry(file: string, inbox?: string): string {
  write(file.endsWith('.ts') ? file : `${file}.ts`, ['declare const plugin: { label: string };', 'export default plugin;'].join('\n') + '\n');
  if (inbox !== undefined) writeContract(`${file.replace(/(\.ts)?$/, '')}.types.ts`, inbox);
  return file;
}

/** A contract leaf: the state the plugin publishes, and the inbox it opens */
function writeContract(file: string, inbox?: string, state = '{ ready: boolean }'): string {
  write(file, `export type Contract = { state: ${state}${inbox === undefined ? '' : `; inbox: { public: ${inbox} }`} };\n`);
  return `${file}#Contract`;
}

/** The manifest `plugin` object for a feature whose contract sits beside its entry */
const pluginWithContract = (entry: string, inbox?: string) => ({
  entry: writePluginEntry(entry, inbox),
  ...(inbox === undefined ? {} : { contract: `${entry.replace(/(\.ts)?$/, '')}.types.ts#Contract` }),
});

function writeSystemEntry(id: string, outgoing: string, incoming = `{ type: '${id.toUpperCase()}_RUN' }`): string {
  const entry = `src/features/${id}/be/system.ts`;
  write(entry, [
    `declare const spec: { _incoming: ${incoming}; _outgoing: ${outgoing} };`,
    'export default { spec, machine: undefined as never };',
  ].join('\n') + '\n');
  return entry;
}

/**
 * A feature with a system, and the system entry it names. The entry declares the events the system
 * emits: each plugin's generated `receives` is read from it, so a fixture without one is a pack
 * whose sends could not be checked.
 */
const system = (id: string, extra: Record<string, unknown> = {}) => {
  const entry = `src/features/${id}/be/system.ts`;
  // A test that writes its own richer system entry keeps it
  if (!fs.existsSync(path.join(root, entry))) {
    writeSystemEntry(id, `{ type: '${id.toUpperCase()}_CONNECTED' } | { type: '${id.toUpperCase()}_UPDATED' }`);
  }
  return { id, system: { entry, ...extra } };
};
const withPlugin = (feature: Record<string, unknown>, inbox?: string) => ({ ...feature, plugin: pluginWithContract(`src/features/${feature.id}/fe/index.ts`, inbox) });

/** The event types the generated pack entry says a feature's plugin receives, or undefined when it has no plugin */
function receives(files: Record<string, string>, featureId: string): string[] | undefined {
  const entry = files['src/__generated__/pack-entry.ts'];
  const feature = entry.slice(entry.indexOf(`    '${featureId}': {`));
  const match = /^ {4}'[^']+': \{\n(?:(?! {4}\}).*\n)*? {6}plugin: \{ receives: \[(.*)\] \}/.exec(feature);
  return match ? [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : undefined;
}

describe('generated events', () => {
  it('keys each plugin by its own system\'s events and the inbox it declares', () => {
    const files = generate({ features: [withPlugin(system('actions')), withPlugin(system('flows'), "{ type: 'FLOW.SELECT' }")] });
    const events = files['src/__generated__/events.ts'];
    // A plugin that declares nothing takes only what its own feature's system sends it
    expect(events).toContain("'actions': __events_actions | __accepts_actions;");
    expect(events).toContain("'flows': __events_flows | __accepts_flows;");
    // What a dependent may send is the `public` audience alone: not the events between a feature's own halves, and
    // not the `pack` audience either, which is what this pack's features send each other
    expect(events).toContain("export type PackPluginEvents = {");
    expect(events).toContain("  'flows': __public_flows;");
    // Every host plugin is sendable, as every dependency's system already is: the owner's declaration is the contract
    expect(events).toContain("export type QualifiedPluginEvents = Qualified<'demo-pack', OwnPluginEvents> & HostPluginEvents;");
    expect(events).toContain("export type SendablePluginEvents = WithOwnNames<'demo-pack', QualifiedPluginEvents>;");
  });

  it('records in the pack entry what each own plugin receives: its system\'s events and its declared inbox', () => {
    const files = generate({ features: [withPlugin(system('actions')), withPlugin(system('flows'), "{ type: 'FLOW.SELECT' } | { type: 'FLOW.OPEN' }")] });
    expect(receives(files, 'actions')).toEqual(['ACTIONS_CONNECTED', 'ACTIONS_UPDATED']);
    // sorted and deduplicated across both halves
    expect(receives(files, 'flows')).toEqual(['FLOWS_CONNECTED', 'FLOWS_UPDATED', 'FLOW.OPEN', 'FLOW.SELECT'].sort());
  });

  // `{ type: 'A' | 'B' }` is one member covering two event types, a legal way to write an event whose
  // payload is the same either way — the style StepEvent already uses. Reading only single literals
  // rejected it, failing the build on a declaration nothing else objects to.
  it("expands a member whose `type` is a union of literals", () => {
    writeSystemEntry('jobs', "{ type: 'CANCEL' | 'COMPLETE'; id: string } | { type: 'JOBS_CONNECTED' }");
    expect(receives(generate({ features: [withPlugin(system('jobs'))] }), 'jobs')).toEqual(['CANCEL', 'COMPLETE', 'JOBS_CONNECTED']);
  });

  it('still refuses a member whose `type` is not a literal at all', () => {
    writeSystemEntry('loose', '{ type: string }');
    expect(() => generate({ features: [withPlugin(system('loose'))] }))
      .toThrow(/Feature "loose": .*`type` is string, not a string literal or a union of them/);
  });

  // The spec is the one place a system's sent events are declared: no second, named union can drift from it
  it("reads the events from the spec, whatever else the entry exports", () => {
    writeSystemEntry('notes', "{ type: 'NOTE_SAVED' }");
    fs.appendFileSync(path.join(root, 'src/features/notes/be/system.ts'), "export type OutgoingNotesEvents = { type: 'STALE' };\n");
    expect(receives(generate({ features: [withPlugin(system('notes'))] }), 'notes')).toEqual(['NOTE_SAVED']);
  });

  it('records no events for a system whose spec sends none', () => {
    writeSystemEntry('quiet', 'never');
    expect(receives(generate({ features: [withPlugin(system('quiet'))] }), 'quiet')).toEqual([]);
  });

  // An annotation `: SystemEntry` types the spec as the contract's, which carries no events
  it('refuses an entry whose spec has lost its events, naming the fix', () => {
    write('src/features/typed/be/system.ts', [
      "const entry: { spec: { id: string }; machine: unknown } = { spec: { id: 'typed' }, machine: undefined };",
      'export default entry;',
    ].join('\n'));
    expect(() => generate({ features: [withPlugin(system('typed'))] }))
      .toThrow(/Feature "typed": system\.ts: .*that spec carries none: default-export the system entry declared with `satisfies SystemEntry`/);
  });

  // `: SystemEntry` types the spec as the contract's own, `{ type: string }` both ways, which a pack's facade would
  // publish as its system's events: a system with no plugin is read too, so it fails the same way
  it('refuses an entry annotated `: SystemEntry`, a system without a plugin too, naming the fix', () => {
    writeSystemEntry('worker', '{ type: string }', '{ type: string }');
    expect(() => generate({ features: [system('worker')] }))
      .toThrow(/Feature "worker": .*`type` is string.*an entry annotated `: SystemEntry` has these: default-export it declared with `satisfies SystemEntry`/);
  });

  it("says so when the spec's type doesn't resolve, rather than blaming the declaration", () => {
    write('src/features/unresolved/be/system.ts', [
      "import { defineSystem } from '@abuddy/not-installed';",
      "export default { spec: defineSystem<{ type: 'RUN' }, { type: 'DONE' }>(), machine: undefined };",
    ].join('\n'));
    expect(() => generate({ features: [withPlugin(system('unresolved'))] })).toThrow(/whose type doesn't resolve: check that its `defineSystem` import does/);
  });

  it('refuses an entry with no default export', () => {
    write('src/features/bare/be/system.ts', "export const spec = { id: 'bare' };\n");
    expect(() => generate({ features: [withPlugin(system('bare'))] })).toThrow(/Feature "bare": system\.ts: .*it has no default export/);
  });

  it('records nothing for a plugin no system sends to, so a send there is rejected', () => {
    const files = generate({ features: [withPlugin(system('actions')), withPlugin({ id: 'viewer', plugin: { entry: writePluginEntry('src/features/viewer/fe/index.ts') } })] });
    expect(receives(files, 'actions')).toEqual(['ACTIONS_CONNECTED', 'ACTIONS_UPDATED']);
    expect(receives(files, 'viewer')).toEqual([]);
  });

  it('records only this pack\'s own plugins: a dependency\'s and the host\'s are their owners\' to declare', () => {
    const deps = { 'base-pack': dependency({ features: [{ id: 'memos', system: { entry: 'x' }, plugin: { entry: writePluginEntry('y') } }] }, facade({ PackPluginEvents: "{ memos: { type: 'MEMO_ADDED' } }" })) };
    const files = generate({ dependencies: { 'base-pack': '1.0.0' }, features: [withPlugin(system('actions'))] }, deps);
    expect(receives(files, 'actions')).toEqual(['ACTIONS_CONNECTED', 'ACTIONS_UPDATED']);
    // The pack entry carries its own features only: nothing there declares what another's plugin receives
    expect(files['src/__generated__/pack-entry.ts']).not.toMatch(/'(base-pack\/memos|memos|host\/application)': \{/);
  });


  it('gives a feature with a system but no plugin no key: nothing could receive the events', () => {
    const files = generate({ features: [withPlugin(system('actions')), system('worker')] });
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("'actions': __events_actions | __accepts_actions;");
    expect(events).not.toContain("'worker': __events_worker | __accepts_worker;");
  });


  it('keys a plugin-only feature by the inbox it declares, with no system of its own', () => {
    const plugin = pluginWithContract('src/features/sidebar/fe/index.ts', "{ type: 'SIDEBAR.TOGGLE' }");
    const files = generate({ features: [system('notes'), { id: 'sidebar', plugin }] });
    expect(files['src/__generated__/events.ts']).toContain("'sidebar': __accepts_sidebar;");
    expect(receives(files, 'sidebar')).toEqual(['SIDEBAR.TOGGLE']);
  });

  // The contract is read as a declared type. A name exported only as a value is the mistake worth catching: the
  // old reader's opposite check — an `accepts` exported only as a type — went with the phantom it read.
  it('refuses a contract the module exports only as a value', () => {
    const entry = writePluginEntry('src/features/sidebar/fe/index.ts');
    write('src/features/sidebar/fe/types.ts', 'export const Contract = { state: {} };\n');
    expect(() => generate({ features: [system('notes'), { id: 'sidebar', plugin: { entry, contract: 'src/features/sidebar/fe/types.ts#Contract' } }] }))
      .toThrow(/only as a value, not a type/);
  });

  it('refuses a contract the module does not declare, naming the type it looked for', () => {
    const entry = writePluginEntry('src/features/sidebar/fe/index.ts');
    write('src/features/sidebar/fe/types.ts', 'export type Other = { state: {} };\n');
    expect(() => generate({ features: [system('notes'), { id: 'sidebar', plugin: { entry, contract: 'src/features/sidebar/fe/types.ts#Contract' } }] }))
      .toThrow(/doesn't export "Contract"/);
  });

  it('refuses an inbox opened to an audience that does not exist', () => {
    const entry = writePluginEntry('src/features/sidebar/fe/index.ts');
    write('src/features/sidebar/fe/types.ts', "export type Contract = { state: {}; inbox: { publik: { type: 'X' } } };\n");
    expect(() => generate({ features: [system('notes'), { id: 'sidebar', plugin: { entry, contract: 'src/features/sidebar/fe/types.ts#Contract' } }] }))
      .toThrow(/is not an audience/);
  });

  // A plugin may publish state and take nothing: its own system's events still reach it
  it('reads a contract with no inbox as receiving only its own system events', () => {
    const entry = writePluginEntry('src/features/sidebar/fe/index.ts');
    const contract = writeContract('src/features/sidebar/fe/types.ts');
    const files = generate({ features: [{ ...system('sidebar'), plugin: { entry, contract } }] });
    expect(receives(files, 'sidebar')).toEqual(['SIDEBAR_CONNECTED', 'SIDEBAR_UPDATED']);
  });

  it("keys a dependency's plugin that declares nothing to never, so no send to it compiles", () => {
    const deps = { 'base-pack': dependency({ features: [{ id: 'memos', plugin: { entry: 'y' } }] }, facade({ PackPluginEvents: '{ memos: never }' })) };
    const files = generate({ dependencies: { 'base-pack': '1.0.0' }, features: [withPlugin(system('actions'))] }, deps);
    expect(files['src/__generated__/deps/base-pack.d.ts']).toContain('{ memos: never }');
    expect(files['src/__generated__/events.ts']).toContain("Qualified<'base-pack', __dep_base_pack_PackPluginEvents>");
  });

  it("takes every dependency's plugins, with the inbox that dependency declares", () => {
    const deps = { 'base-pack': dependency({ features: [{ id: 'memos', plugin: { entry: 'y' } }] }, facade({ PackPluginEvents: "{ memos: { type: 'MEMO_ADDED' } }" })) };
    const files = generate({ dependencies: { 'base-pack': '1.0.0' }, features: [withPlugin(system('actions'))] }, deps);
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("import type { PackPluginEvents as __dep_base_pack_PackPluginEvents } from './deps/base-pack.js';");
    expect(events).toContain("Qualified<'base-pack', __dep_base_pack_PackPluginEvents>");
  });
});

// `_mergeProvenance`, which names a plugin's owning pack, is covered on its own in provenance.spec.ts.

describe('generated system sends', () => {
  const baseTypes = facade();

  it("names the pack's own systems by feature id and its dependencies' as <dependency>/<feature>", () => {
    const files = generate({ features: [system('memos')] }, {
      'base-pack': dependency({ features: [system('threads')] }, baseTypes),
      'default-setup': dependency({ id: 'default-setup', builtIn: true, features: [system('memos')] }),
    });
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("export type PackSystemEvents = {\n  'memos': IncomingEventsOf<(typeof __specs)['memos']>;\n};");
    expect(events).toContain("export type QualifiedSystemEvents = Qualified<'demo-pack', PackSystemEvents> & Qualified<'base-pack', __dep_base_pack_PackSystemEvents> & ");
    expect(events).toContain("export type SendableSystemEvents = WithOwnNames<'demo-pack', QualifiedSystemEvents>;");
    // No table of names: the sends derive every address from the pack id (@abuddy/sdk/ids)
    expect(events).toContain("defineEvents<SendablePluginEvents, SendableSystemEvents>('demo-pack');");
    expect(events).not.toContain('systemIds');
    expect(files['src/__generated__/system-specs.ts']).toContain("export const specs = {\n  'memos': specEvents(__system_memos.spec),\n};");
    // Pack code names systems; it gets no module of addresses
    expect(files['src/__generated__/system-ids.ts']).toBeUndefined();
    expect(files['src/__generated__/pack-types.ts']).toContain("export type { PackPluginEvents, PackSystemEvents } from './events.js';");
  });

  // Pack code resolves a name with `ref`, which is bound to its pack as the sends are
  it('binds ref to the pack, so pack code never passes its own pack id', () => {
    const files = generate({ features: [{ id: 'sidebar', plugin: { entry: writePluginEntry('src/features/sidebar/fe/plugin.ts') } }] });
    expect(files['src/__generated__/ref.ts']).toContain("export const ref = (name: FeatureName): FeatureRef => resolveName(name, 'demo-pack');");
    expect(files['src/__generated__/bus-ids.ts']).toBeUndefined();
  });

  it("gives a pack without systems a sendToSystem for its dependencies' systems", () => {
    const files = generate({ features: [{ id: 'sidebar', plugin: { entry: writePluginEntry('src/features/sidebar/fe/plugin.ts') } }] }, { 'base-pack': dependency({ features: [system('threads')] }, baseTypes) });
    const events = files['src/__generated__/events.ts'];
    expect(events).not.toContain('system-specs');
    expect(events).toContain("defineEvents<SendablePluginEvents, SendableSystemEvents>('demo-pack');");
    expect(files['src/__generated__/system-specs.ts']).toBeUndefined();
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
    const ids = ['foo', 'fooEntry', 'specs', 'specEvents', 'ref', 'navigateToPlugin', 'registration', 'steps'];
    for (const id of ids) writeSystemEntry(id, "{ type: 'DONE' }", `{ type: '${id.toUpperCase()}_RUN'; n: number }`);
    const files = generatePackFiles(manifest({ features: ids.map((id) => ({ ...system(id), designation: id === 'foo' ? 'foo' : undefined })) }), {
      packRoot: root,
      depSnapshots: new Map([['base-pack', typedDependency({ foo: 'BASE_FOO_RUN', threads: 'THREADS_RUN' })]]),
    });
    write('src/probe.ts', [
      "import { sendToSystem } from './__generated__/events.js';",
      ...ids.map((id) => `sendToSystem('${id}', { type: '${id.toUpperCase()}_RUN', n: 1 });`),
      "sendToSystem('base-pack/foo', { type: 'BASE_FOO_RUN', n: 1 });",
      '// @ts-expect-error the own foo system receives FOO_RUN',
      "sendToSystem('foo', { type: 'BASE_FOO_RUN', n: 1 });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts', 'src/__generated__/pack-entry.ts'])).toEqual([]);
  });

  it("for a pack without systems, sending to its dependencies'", () => {
    const files = generatePackFiles(manifest({ features: [{ id: 'sidebar', plugin: { entry: writePluginEntry('src/features/sidebar/fe/plugin.ts') } }] }), {
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

  it("to a dependency's plugins and a host plugin, with the events their owner declares", () => {
    writeSystemEntry('memos', "{ type: 'MEMO_ADDED'; text: string }");
    const base = dependency(
      { features: [withPlugin(system('threads')), withPlugin(system('code'))] },
      facade({ PackPluginEvents: "{ 'threads': { type: 'TAG_ADDED'; name: string }; 'code': { type: 'FILE_OPENED'; path: string } }" }),
    );
    const files = generatePackFiles(
      manifest({ features: [withPlugin(system('memos'))] }),
      { packRoot: root, depSnapshots: new Map([['base-pack', base]]) },
    );
    write('src/probe.ts', [
      "import { sendToPlugin } from './__generated__/events.js';",
      "sendToPlugin('memos', { type: 'MEMO_ADDED', text: 'x' });",
      "sendToPlugin('base-pack/threads', { type: 'TAG_ADDED', name: 'x' });",
      "sendToPlugin('base-pack/code', { type: 'FILE_OPENED', path: 'x' });",
      "sendToPlugin('host/application', { type: 'PLUGIN_VISIBILITY_UPDATED', pluginVisibility: { 'demo-pack/memos': false } });",
      "// @ts-expect-error a dependency's plugin takes only the events its own pack declares for it",
      "sendToPlugin('base-pack/threads', { type: 'MEMO_ADDED', text: 'x' });",
      "// @ts-expect-error a dependency's plugin is named <pack>/<feature>, as the send resolves it",
      "sendToPlugin('threads', { type: 'TAG_ADDED', name: 'x' });",
      '// @ts-expect-error the host declares what its application plugin receives',
      "sendToPlugin('host/application', { type: 'MEMO_ADDED', text: 'x' });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
  });
});

describe('generated ref', () => {
  // A FeatureRef is accepted wherever a send takes one, so the names ref() takes are what keep a misspelling out
  it("takes this pack's features, its dependencies' and the host's, and nothing else", () => {
    const files = generate(
      { dependencies: { 'base-pack': '1.0.0' }, features: [{ id: 'notes', plugin: { entry: writePluginEntry('src/notes/plugin') } }, system('jobs')] },
      { 'base-pack': dependency({ features: [{ id: 'threads', plugin: { entry: writePluginEntry('x') } }, { id: 'worker', system: { entry: 'y' } }] }) },
    );
    expect(files['src/__generated__/ref.ts']).toContain(
      "export type FeatureName = 'notes' | 'jobs' | 'base-pack/threads' | 'base-pack/worker' | 'host/application' | 'host/settings' | 'host/bus';",
    );
    expect(files['src/__generated__/ref.ts']).toContain('export const ref = (name: FeatureName): FeatureRef');
  });
});

describe('generated frontend names', () => {
  // A name nothing declares fails to compile: a plugin named by data opens through `openPlugin` instead
  it("lists this pack's plugins by feature id and its dependencies' by ref, with no open-ended member", () => {
    const files = generate(
      { features: [{ id: 'notes', plugin: { entry: writePluginEntry('src/notes/plugin') } }, system('jobs')] },
      { 'base-pack': dependency({ features: [{ id: 'threads', plugin: { entry: writePluginEntry('src/threads/plugin') } }, { id: 'worker', system: { entry: 'src/worker/system' } }] }) },
    );

    expect(files['src/__generated__/fe.ts']).toContain("export type PluginName = 'notes' | 'base-pack/threads';");
  });
});

describe('generated frontend entry', () => {
  // Keyed by feature, as the backend entry is: each plugin with its feature's role
  it("keys each plugin by its feature, with the feature's role, passing the plugin module through untouched", () => {
    const files = generate({ features: [
      { id: 'settings', designation: 'settings', plugin: { entry: writePluginEntry('src/settings/plugin') } },
      { id: 'notes', plugin: { entry: writePluginEntry('src/notes/plugin') } },
    ] });
    const fe = files['src/__generated__/pack-entry-fe.ts'];

    expect(fe).toContain("  features: {\n    'settings': { plugin: __plugin_settings, designation: 'settings', default: true },\n    'notes': { plugin: __plugin_notes },\n  },");
    expect(fe).toContain("import __plugin_settings from '../settings/plugin.js';");
    expect(fe).not.toContain('_module');
  });

  it('names the pack the frontend registration belongs to', () => {
    const files = generate({ features: [{ id: 'notes', plugin: { entry: writePluginEntry('src/notes/plugin') } }] });

    expect(files['src/__generated__/pack-entry-fe.ts']).toContain("id: 'demo-pack',");
  });

  it('opens the plugin that claims the default, not the pack\'s first', () => {
    const files = generate({ features: [
      { id: 'settings', plugin: { entry: writePluginEntry('src/settings/plugin') } },
      { id: 'notes', plugin: { entry: writePluginEntry('src/notes/plugin'), default: true } },
    ] });

    const fe = files['src/__generated__/pack-entry-fe.ts'];
    expect(fe).toContain("'notes': { plugin: __plugin_notes, default: true },");
    expect(fe).toContain("'settings': { plugin: __plugin_settings },");
  });

  it("falls back to the pack's first plugin when none claims it", () => {
    const files = generate({ features: [
      { id: 'settings', plugin: { entry: writePluginEntry('src/settings/plugin') } },
      { id: 'notes', plugin: { entry: writePluginEntry('src/notes/plugin') } },
    ] });

    expect(files['src/__generated__/pack-entry-fe.ts']).toContain("'settings': { plugin: __plugin_settings, default: true },");
  });

  // So a frontend send to that role resolves, as it does on the backend
  it('lists a designated feature with no plugin for its role, and leaves out an undesignated one', () => {
    const files = generate({ features: [
      { id: 'notes', plugin: { entry: writePluginEntry('src/notes/plugin') } },
      system('scheduler', {}),
      system('worker'),
    ].map((f) => (f.id === 'scheduler' ? { ...f, designation: 'clock' } : f)) });

    const fe = files['src/__generated__/pack-entry-fe.ts'];
    expect(fe).toContain("'scheduler': { designation: 'clock' },");
    expect(fe).not.toContain("'worker'");
    expect(fe).toContain("'notes': { plugin: __plugin_notes, default: true },");
  });
});

describe('generated backend entry', () => {
  it('records which features have a plugin, and takes the plugin\'s name and icon from its module', () => {
    const files = generate({ features: [
      { id: 'notes', plugin: { entry: writePluginEntry('src/notes/plugin') } },
      system('brain'),
    ] });
    const entry = files['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("    'notes': {\n      plugin: { receives: [] },\n      services: [],\n    }");
    expect(entry).toContain("    'brain': {\n      system: packSystem(__system_brain),\n      services: [],\n    }");
    expect(entry).not.toMatch(/label|icon|isPinned/);
  });

  // One record, keyed by feature: the app derives every ref, system and plugin from it
  it('registers each feature once, in manifest order, with its early system and the events the manifest adds', () => {
    const entry = generate({ features: [
      { ...system('logs'), earlySystem: true },
      { ...system('inbox'), system: { entry: 'src/features/inbox/be/system.ts', events: { incoming: ['MAIL_ARRIVED'] } } },
      { ...system('config'), designation: 'settings' },
    ] })['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("system: packSystem(__system_logs, { early: true }),");
    expect(entry).toContain(`system: packSystem(__system_inbox, { incoming: ["MAIL_ARRIVED"] }),`);
    // No role orders the features: a system that needs another's data reads it when it needs it
    expect(entry.indexOf("'logs': {")).toBeLessThan(entry.indexOf("'config': {"));
    expect(entry).not.toMatch(/systems:|earlySystem|receivedEventTypes|toPackSystemDefs/);
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
    expect(entry).toContain("    'memos': {\n      system: packSystem(__system_memos),\n      services: [],\n      settings: __settings_Memos,\n    }");
    expect(entry).toContain("    'todos': {\n      system: packSystem(__system_todos),\n      services: [],\n    }");
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
    provenance: { entities: { Memo: owner } },
    manifest: manifest({ id }),
    format: PACK_SNAPSHOT_FORMAT,
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
        provenance: JSON.parse(JSON.stringify(_buildProvenance(
        [['deep-pack', { manifest: { entities: { ['__proto__']: '__proto__' } } }] as const],
        { id, manifest: {} },
      ))),
      manifest: manifest({ id }),
      format: PACK_SNAPSHOT_FORMAT,
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
    expect(files['src/__generated__/events.ts']).toContain("export type QualifiedSystemEvents = Qualified<'demo-pack', PackSystemEvents> & Qualified<'base-pack', __dep_base_pack_PackSystemEvents> & HostSystemEvents;");
    const services = files['src/__generated__/services.ts'];
    expect(services).toContain("import type { QualifiedPluginEvents, QualifiedSystemEvents } from './events.js';");
    expect(services).toContain('  broadcastToPlugin: TypedSendToPlugin<QualifiedPluginEvents>;\n  sendToSystem: TypedSendToSystem<QualifiedSystemEvents>;');
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
      features: [{ id: 'memos', plugin: { entry: writePluginEntry('src/features/memos/fe/plugin.ts') } }],
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
    const files = generate({ features: [{ id: 'memos', plugin: { entry: writePluginEntry('src/features/memos/fe/plugin.ts') } }] });
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
        help: { compiler: 'src/seeds/compilers/help.ts' },
      },
      boot: { seed: {
        actions: 'src/seeds/actions',
        flows: { path: 'src/seeds/flows' },
        memos: { path: 'src/seeds/memos', format: 'memos' },
        help: { path: 'src/seeds/help', format: 'help' },
      } },
    });
    const seeders = files['src/__generated__/seeders.ts'];
    expect(seeders).toContain(`export const seeders: Seeder[] = [\n  createSeeder({ key: 'actions', entities: ['Action'], identity: ['label'] }),`);
    expect(seeders).toContain('  createFlowSeeder(),');
    expect(seeders).toContain('  createSeeder({"key":"memos","entities":["Memo"],"identity":["title","parent"],"relKind":"has_memo","media":true}),');
    expect(seeders).not.toContain('help');
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

/**
 * What `PACK_SNAPSHOT_FORMAT` covers: the snapshot's fields, the manifest's, the provenance kinds, the facade exports
 * a dependent's generated code imports, and the registration the app loads. When this fails, the snapshot's contract changed. If a CLI on the
 * other side would misread the change (anything removed, renamed or reshaped) and the last release shipped
 * this format number, bump it; then update the expectation. A pure addition every reader ignores needs only
 * the expectation.
 */
describe('the snapshot format', () => {
  // Each typed against its interface, so adding, renaming or removing a field fails the typecheck until it is listed
  const SNAPSHOT_FIELDS: Record<keyof PackSnapshot, true> = {
    types: true, defs: true, manifest: true, format: true, sdkVersion: true, provenance: true, flowHelpers: true,
  };
  /** The snapshot's manifest, which a dependent's codegen reads (features, services, seed formats, version…) */
  const MANIFEST_FIELDS: Record<keyof PackManifest, true> = {
    $manifestVersion: true, $schema: true, artifacts: true, blocks: true, boot: true, builtIn: true, commands: true,
    dependencies: true, description: true, dsl: true, entities: true, entityShapes: true, help: true, fe: true, features: true,
    hostVersion: true, id: true, license: true, migrations: true, name: true, packServices: true, partitionPolicy: true,
    permissions: true, relKinds: true, seedFormats: true, seedHooks: true, settingsSections: true, steps: true, version: true,
  };
  const MANIFEST_FEATURE_FIELDS: Record<keyof PackFeatureEntry, true> = {
    designation: true, earlySystem: true, id: true, plugin: true, references: true, repositories: true, services: true,
    settings: true, system: true, typesEntry: true,
  };
    const MANIFEST_SYSTEM_FIELDS: Record<keyof PackSystemEntry, true> = { entry: true, events: true };
  const MANIFEST_SYSTEM_EVENTS_FIELDS: Record<keyof NonNullable<PackSystemEntry['events']>, true> = { incoming: true };
  const MANIFEST_PLUGIN_FIELDS: Record<keyof PackPluginEntry, true> = { contract: true, default: true, entry: true };
  /** A dependency's seed formats, which a dependent's `boot.seed` compiles its own sources with */
  const SEED_FORMAT_FIELDS: Record<keyof SeedFormatConfig, true> = {
    compiler: true, entity: true, fields: true, format: true, identity: true, media: true, tree: true,
  };
  const SEED_TREE_FIELDS: Record<keyof NonNullable<SeedFormatConfig['tree']>, true> = { branch: true, branchEntity: true, relKind: true };
  const SEED_FIELD_FIELDS: Record<keyof NonNullable<SeedFormatConfig['fields']>[string], true> = { default: true, from: true, type: true };
  /** The registration the runtime bundle exports, which the app loads */
  const REGISTRATION_FIELDS: Record<keyof PackRegistration, true> = {
    id: true, features: true, services: true, ears: true, repositories: true, boot: true, migrations: true, steps: true,
    artifacts: true, blocks: true, seedHooks: true, seeders: true, commands: true, help: true, settingsSections: true,
  };
  const REGISTRATION_FEATURE_FIELDS: Record<keyof PackFeature, true> = {
    designation: true, system: true, plugin: true, services: true, settings: true,
  };
  const REGISTRATION_SYSTEM_FIELDS: Record<keyof PackFeatureSystem, true> = { early: true, machine: true, receives: true };
  const REGISTRATION_PLUGIN_FIELDS: Record<keyof PackFeaturePlugin, true> = { receives: true };

  /** Every name generated code imports from a dependency's facade, with a send to one of its plugins */
  function facadeImports(): string[] {
    const deps = { 'base-pack': dependency({ features: [{ id: 'memos', system: { entry: 'x' }, plugin: { entry: writePluginEntry('y') } }] }) };
    const files = generate({ dependencies: { 'base-pack': '1.0.0' }, features: [withPlugin(system('actions'))] }, deps);
    const names = Object.values(files).flatMap((file) => [...file.matchAll(/import type \{ (\w+) as \w+ \} from '\.\/deps\/base-pack\.js'/g)].map((m) => m[1]));
    return [...new Set(names)].sort();
  }

  it('covers exactly what dependents read', () => {
    expect({
      format: PACK_SNAPSHOT_FORMAT,
      fields: Object.keys(SNAPSHOT_FIELDS).sort(),
      manifest: {
        fields: Object.keys(MANIFEST_FIELDS).sort(),
        feature: Object.keys(MANIFEST_FEATURE_FIELDS).sort(),
        system: Object.keys(MANIFEST_SYSTEM_FIELDS).sort(),
        systemEvents: Object.keys(MANIFEST_SYSTEM_EVENTS_FIELDS).sort(),
        plugin: Object.keys(MANIFEST_PLUGIN_FIELDS).sort(),
        seedFormat: Object.keys(SEED_FORMAT_FIELDS).sort(),
        seedTree: Object.keys(SEED_TREE_FIELDS).sort(),
        seedField: Object.keys(SEED_FIELD_FIELDS).sort(),
      },
      registration: {
        fields: Object.keys(REGISTRATION_FIELDS).sort(),
        feature: Object.keys(REGISTRATION_FEATURE_FIELDS).sort(),
        system: Object.keys(REGISTRATION_SYSTEM_FIELDS).sort(),
        plugin: Object.keys(REGISTRATION_PLUGIN_FIELDS).sort(),
      },
      provenanceKinds: Object.keys(PROVENANCE_KINDS).sort(),
      facadeImports: facadeImports(),
    }).toEqual({
      format: 1,
      fields: ['defs', 'flowHelpers', 'format', 'manifest', 'provenance', 'sdkVersion', 'types'],
      manifest: {
        fields: [
          '$manifestVersion', '$schema', 'artifacts', 'blocks', 'boot', 'builtIn', 'commands', 'dependencies', 'description', 'dsl',
          'entities', 'entityShapes', 'fe', 'features', 'help', 'hostVersion', 'id', 'license', 'migrations', 'name', 'packServices',
          'partitionPolicy', 'permissions', 'relKinds', 'seedFormats', 'seedHooks', 'settingsSections', 'steps', 'version',
        ],
        feature: ['designation', 'earlySystem', 'id', 'plugin', 'references', 'repositories', 'services', 'settings', 'system', 'typesEntry'],
        system: ['entry', 'events'],
        systemEvents: ['incoming'],
        plugin: ['contract', 'default', 'entry'],
        seedFormat: ['compiler', 'entity', 'fields', 'format', 'identity', 'media', 'tree'],
        seedTree: ['branch', 'branchEntity', 'relKind'],
        seedField: ['default', 'from', 'type'],
      },
      registration: {
        fields: ['artifacts', 'blocks', 'boot', 'commands', 'ears', 'features', 'help', 'id', 'migrations', 'repositories', 'seedHooks', 'seeders', 'services', 'settingsSections', 'steps'],
        feature: ['designation', 'plugin', 'services', 'settings', 'system'],
        system: ['early', 'machine', 'receives'],
        plugin: ['receives'],
      },
      provenanceKinds: ['commands', 'entities', 'plugins', 'relKinds'],
      facadeImports: ['PackEntityShapes', 'PackPluginEvents', 'PackPluginState', 'PackStepNodes', 'PackSystemEvents', 'Repositories', 'Services'],
    });
  });
});

// The barrel is how one feature names another's types (`#generated/types`). A feature may have repositories or
// services and no system at all, and the types its callers need are the ones its repository and service signatures
// use — so what decides is whether it has a types module, not whether it has a system.
describe('generated type barrel', () => {
  it("takes every feature's types module, with or without a system", () => {
    write('src/features/records/be/types.ts', 'export interface RecordRow { id: string }');
    write('src/features/records/be/repository/index.ts', 'export const recordQueries = {};');
    write('src/features/memos/be/types.ts', 'export interface Memo { text: string }');
    writeSystemEntry('memos', "{ type: 'MEMO_ADDED' }");

    const files = generatePackFiles(manifest({
      features: [
        // Data for the rest of the pack, and no system of its own
        { id: 'records', repositories: { recordQueries: 'src/features/records/be/repository/index.ts#recordQueries' } },
        system('memos'),
      ] as PackFeatureEntry[],
    }), { packRoot: root });

    expect(files['src/__generated__/types.ts']).toContain("export type * from '../features/records/be/types.js';");
    expect(files['src/__generated__/types.ts']).toContain("export type * from '../features/memos/be/types.js';");
  });

  it('leaves out a feature with no types module, whatever else it has', () => {
    writeSystemEntry('memos', "{ type: 'MEMO_ADDED' }");

    const files = generatePackFiles(manifest({
      features: [system('memos')] as PackFeatureEntry[],
    }), { packRoot: root });

    expect(files['src/__generated__/types.ts']).not.toContain('features/memos/be/types');
  });
});

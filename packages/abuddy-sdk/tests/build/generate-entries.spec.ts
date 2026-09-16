import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { transformSync } from 'esbuild';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { depTypesFile, depTypesVersion, entitiesWithoutShapes, generatePackFiles, PACK_TYPES_DEF } from '../../src/build/generate-entries.ts';
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

function dependency(fields: Record<string, unknown>, defs: Record<string, string> = { [PACK_TYPES_DEF]: 'export type PackEvents = {};' }): PackSnapshot {
  return { types: { entities: {}, relKinds: {} }, defs, manifest: manifest({ id: 'base-pack', ...fields }) };
}

function generate(fields: Record<string, unknown>, deps: Record<string, PackSnapshot> = {}): Record<string, string> {
  return generatePackFiles(manifest(fields), { packRoot: root, depSnapshots: new Map(Object.entries(deps)) });
}

const system = (id: string, extra: Record<string, unknown> = {}) => ({ id, system: { entry: `src/features/${id}/be/system.ts`, ...extra } });

describe('generated events', () => {
  it('keys each plugin by the systems that send to it', () => {
    const files = generate({ features: [system('actions', { sendsTo: ['flows', 'application'] }), system('flows')] });
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("'actions': __events_actions;");
    expect(events).toContain("'flows': __events_flows | __events_actions;");
    expect(events).toContain('export type PackEvents = OwnPackEvents & Omit<HostPluginEvents, keyof OwnPackEvents>;');
  });

  it('includes a plugin-only feature something sends to', () => {
    const files = generate({ features: [system('notes', { sendsTo: ['sidebar'] }), { id: 'sidebar', plugin: { entry: 'x' } }] });
    expect(files['src/__generated__/events.ts']).toContain("'sidebar': __events_notes;");
  });

  it("intersects each dependency's plugin events and accepts its plugins as targets", () => {
    const files = generate(
      { features: [system('memos', { sendsTo: ['threads'] })] },
      { 'base-pack': dependency({ features: [{ id: 'threads', plugin: { entry: 'x' } }] }) },
    );
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("import type { PackEvents as __dep_base_pack_PackEvents } from './deps/base-pack.js';");
    expect(events).toContain('export type PackEvents = OwnPackEvents & Omit<__dep_base_pack_PackEvents, keyof OwnPackEvents> & Omit<HostPluginEvents, keyof OwnPackEvents>;');
    expect(files['src/__generated__/deps/base-pack.d.ts']).toContain('export type PackEvents = {};');
    expect(files['src/__generated__/deps/base-pack.d.ts']).toContain('// base-pack@1.0.0 facade types\n');
    expect(depTypesVersion(files[depTypesFile('base-pack')], 'base-pack')).toBe('1.0.0');
  });

  it('rejects a sendsTo target no pack or host provides', () => {
    expect(() => generate({ features: [system('memos', { sendsTo: ['nowhere'] })] }))
      .toThrow('Feature "memos": system.sendsTo names "nowhere"');
  });
});

describe('generated system sends', () => {
  it("types sendToSystem with the pack's own systems by feature id and its dependencies' as <dependency>/<feature>", () => {
    const files = generate(
      { features: [system('memos')] },
      { 'base-pack': dependency({ features: [system('threads')] }, { [PACK_TYPES_DEF]: 'export type PackEvents = {};\nexport type PackSystemEvents = {};' }) },
    );
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("import { busId } from './bus-ids.js';");
    expect(events).toContain("import type { specs as __specs } from './system-specs.js';");
    expect(events).toContain("'memos': IncomingEventsOf<(typeof __specs)['memos']>;");
    expect(events).toContain('export type PackSystemEvents = OwnSystemEvents;');
    expect(events).toContain("import type { PackSystemEvents as __dep_base_pack_PackSystemEvents } from './deps/base-pack.js';");
    expect(events).toContain('export type SendableSystemEvents = OwnSystemEvents & { [K in keyof __dep_base_pack_PackSystemEvents & string as `base-pack/${K}`]: __dep_base_pack_PackSystemEvents[K] };');
    // Each name maps to the id its system runs under: the dependency is external, so its system is prefixed
    expect(events).toContain('const systemIds = {\n  ...busId,\n  "base-pack/threads": "base-pack.threads",\n};');
    expect(events).toContain('export const { emit, sendToPlugin, sendToSystem } = /*#__PURE__*/ defineEvents<PackEvents, SendableSystemEvents>(systemIds);');
    expect(files['src/__generated__/pack-types.ts']).toContain("export type { PackEvents, PackSystemEvents } from './events.js';");
  });

  it("reads each system's events from a spec module that carries nothing else", () => {
    const specs = generate({ features: [system('memos')] })['src/__generated__/system-specs.ts'];
    expect(specs).toContain("import { incomingEvents } from '@abuddy/sdk/events';");
    expect(specs).toContain("import __system_memos from '../features/memos/be/system.js';");
    expect(specs).toContain("export const specs = {\n  'memos': incomingEvents(__system_memos.spec),\n};");
  });

  it('gives a pack without systems no sendToSystem, bus ids or spec module', () => {
    const files = generate({ features: [{ id: 'sidebar', plugin: { entry: 'x' } }] });
    const events = files['src/__generated__/events.ts'];
    expect(events).not.toContain('bus-ids');
    expect(events).not.toMatch(/export const \{[^}]*sendToSystem/);
    expect(events).not.toContain('systemIds');
    expect(events).toContain('export type PackSystemEvents = OwnSystemEvents;');
    expect(events).toContain('export const { emit, sendToPlugin } = /*#__PURE__*/ defineEvents<PackEvents>();');
    expect(files['src/__generated__/system-specs.ts']).toBeUndefined();
    expect(files['src/__generated__/bus-ids.ts']).toBeUndefined();
  });
});

/** Type-checks the generated files at `names` with `root` linked to this SDK's source, and returns the diagnostics */
function typecheck(files: Record<string, string>, names: string[]): string[] {
  for (const [file, content] of Object.entries(files)) if (content) write(file, content);
  write('package.json', JSON.stringify({ type: 'module' }));
  const sdk = path.resolve(import.meta.dirname, '../..');
  const links = { '@abuddy/sdk': sdk, zod: path.dirname(createRequire(path.join(sdk, 'package.json')).resolve('zod/package.json')) };
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

describe('generated bindings', () => {
  /** A system entry as packs write one; a feature id that is a reserved word is exported by name */
  function writeSystem(id: string): void {
    const pascal = id.charAt(0).toUpperCase() + id.slice(1);
    const idExport = id === 'default' ? '' : ['export', 'delete'].includes(id) ? `const id = spec.id;\nexport { id as ${id} };` : `export const ${id} = spec.id;`;
    write(`src/features/${id}/be/system.ts`, [
      "import type { SystemEntry } from '@abuddy/sdk/framework';",
      "import { defineSystem } from '@abuddy/sdk/framework';",
      `export type Outgoing${pascal}Events = { type: '${id.toUpperCase()}_DONE' };`,
      `const spec = defineSystem('${id}')<{ type: '${id.toUpperCase()}_RUN'; n: number }, Outgoing${pascal}Events>();`,
      idExport,
      "const entry = { spec, machine: undefined as unknown as SystemEntry['machine'] } satisfies SystemEntry;",
      'export default entry;',
    ].join('\n'));
  }

  it('compiles for feature ids that are reserved words or match generated names', () => {
    const ids = ['default', 'export', 'incomingEvents', 'foo', 'fooEntry', 'specs', 'registration'];
    for (const id of ids) writeSystem(id);
    const files = generatePackFiles(manifest({ features: ids.map((id) => ({ ...system(id), designation: id === 'foo' ? 'foo' : undefined })) }), {
      packRoot: root,
      depSnapshots: new Map([['base-pack', dependency(
        { features: [system('delete'), system('foo'), system('busId')] },
        { [PACK_TYPES_DEF]: [
          'export type PackEntityShapes = {};',
          'export type PackEvents = {};',
          "export type PackSystemEvents = { 'delete': { type: 'DELETE_RUN' }; 'foo': { type: 'BASE_FOO_RUN' } };",
          'export type Services = {};',
          'export type Repositories = {};',
        ].join('\n') },
      )]]),
    });
    expect(files['src/__generated__/system-ids.ts']).toContain("const __id_delete = 'base-pack.delete';\nexport { __id_delete as delete };");
    // Own ids and the busId re-export come first
    expect(files['src/__generated__/system-ids.ts']).not.toContain('__id_foo');
    expect(files['src/__generated__/system-ids.ts']).not.toContain('__id_busId');

    const probe = [
      "import { sendToSystem } from './__generated__/events.js';",
      "import systemIds, { export as exportId, delete as deleteId, incomingEvents as incomingEventsId } from './__generated__/system-ids.js';",
      "import { busId } from './__generated__/bus-ids.js';",
      "export const ids: string[] = [systemIds, exportId, deleteId, incomingEventsId, busId.default, busId.export];",
      "sendToSystem('default', { type: 'DEFAULT_RUN', n: 1 });",
      "sendToSystem('export', { type: 'EXPORT_RUN', n: 1 });",
      "sendToSystem('incomingEvents', { type: 'INCOMINGEVENTS_RUN', n: 1 });",
      "sendToSystem('fooEntry', { type: 'FOOENTRY_RUN', n: 1 });",
      "sendToSystem('specs', { type: 'SPECS_RUN', n: 1 });",
      "sendToSystem('base-pack/delete', { type: 'DELETE_RUN' });",
      "sendToSystem('base-pack/foo', { type: 'BASE_FOO_RUN' });",
      '// @ts-expect-error the foo system receives FOO_RUN',
      "sendToSystem('foo', { type: 'FOOENTRY_RUN', n: 1 });",
    ].join('\n');
    write('src/probe.ts', probe);
    expect(typecheck(files, ['src/probe.ts', 'src/__generated__/system-specs.ts', 'src/__generated__/pack-entry.ts'])).toEqual([]);

    // The frontend entry imports the host's frontend modules: check its syntax only
    const fe = generatePackFiles(manifest({ features: ids.map((id) => ({ id, plugin: { entry: `src/features/${id}/fe/plugin` } })) }), { packRoot: root })['src/__generated__/pack-entry-fe.ts'];
    const { diagnostics } = ts.transpileModule(fe, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ESNext } });
    expect(diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
    expect(fe).toContain('plugins: [__plugin_default, __plugin_export, __plugin_incomingEvents, __plugin_foo, __plugin_fooEntry, __plugin_specs, __plugin_registration],');
  });
});

describe('system ids a dependency runs', () => {
  it('rejects a system feature named busId, which #generated/system-ids exports as the bus-id map', () => {
    expect(() => generate({ features: [system('busId')] })).toThrow('Feature "busId" has a system');
  });

  it("keeps an own system and a built-in dependency's system of the same feature id apart", () => {
    const builtIn = dependency({ id: 'default-setup', builtIn: true, features: [system('settings')] });
    const events = generate({ features: [system('settings')] }, { 'default-setup': builtIn })['src/__generated__/events.ts'];
    // The pack's own is `settings` (via busId); the dependency's, which runs as `settings`, is `default-setup/settings`
    expect(events).toContain('  "default-setup/settings": "settings",');
  });

  it("accepts a feature id an external dependency uses, whose system runs as <packId>.<featureId>", () => {
    const files = generate({ features: [system('memos')] }, { 'base-pack': dependency({ features: [system('memos'), system('threads')] }) });
    expect(files['src/__generated__/system-ids.ts']).toContain("const __id_threads = 'base-pack.threads';");
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

  it("fails for a command a dependency's own dependency declares, from the snapshot's dependencyCommands", () => {
    const mid = { 'mid-pack': { ...dependency({ id: 'mid-pack' }), dependencyCommands: [{ name: 'pr2md', packId: 'default-setup' }] } };
    expect(() => generate({ commands: [{ name: 'pr2md', placeholder: 'Mine' }], features: [system('brain')] }, mid))
      .toThrow('Command "pr2md" is declared by "default-setup", which this pack depends on');
  });
});

describe('dependency types in .abuddy/generated/types.ts', () => {
  it("re-exports a dependency's types by their exported names, not the facade names", async () => {
    const { emitDepTypes } = await import('../../src/build/generate-entries.ts');
    const types = emitDepTypes(new Map([['base-pack', { types: { entities: {}, relKinds: {} }, defs: {
      [PACK_TYPES_DEF]: 'type Local = {};\ntype TagEntity = {};\nexport type { Local as PackEntityShapes, TagEntity };\n',
    } }]]));
    expect(types).toContain("export type { TagEntity } from '../deps/base-pack/defs/pack-types.js';");
    expect(types).not.toMatch(/Local|PackEntityShapes/);
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
    expect(withSteps).toContain('type PackNodes = NodeEntity | StepNodesOf<__dep_base_pack_PackEntityShapes>;');
    expect(withSteps).toContain("Node: [PackNodes] extends [never] ? SdkEntityShapes['Node'] : PackNodes;");

    const withoutSteps = generate({}, { 'base-pack': dependency({}) })['src/__generated__/ears.ts'];
    expect(withoutSteps).not.toContain("import type { NodeEntity }");
    expect(withoutSteps).toContain('type PackNodes = never | StepNodesOf<__dep_base_pack_PackEntityShapes>;');
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
  it('types repositories from their declarations and registers them from the backend entry', () => {
    write('src/features/memos/be/repository.ts', 'export const memoQueries = {};\n');
    const files = generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/features/memos/be/repository.ts#memoQueries' } }] });
    expect(files['src/__generated__/repository.ts']).toContain("import type { memoQueries as __repo_memoQueries } from '../features/memos/be/repository.js';");
    expect(files['src/__generated__/repository.ts']).toContain('memoQueries: typeof __repo_memoQueries;');
    expect(files['src/__generated__/repositories.ts']).toContain("registerRepository('memoQueries', __repo_memoQueries);");
    expect(files['src/__generated__/pack-entry.ts']).toContain("import './repositories.js';");
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

  it('writes no registration module for a pack without repositories', () => {
    const files = generate({ features: [system('memos')] });
    expect(files['src/__generated__/repositories.ts']).toBeUndefined();
    expect(files['src/__generated__/pack-entry.ts']).not.toContain('repositories.js');
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
    const files = generate({ features: [system('memos')] }, { 'base-pack': dependency({ features: [system('threads')] }, { [PACK_TYPES_DEF]: 'export type PackEvents = {};\nexport type PackSystemEvents = {};' }) });
    expect(files['src/__generated__/events.ts']).toContain('export type QualifiedSystemEvents = { [K in keyof OwnSystemEvents & string as `demo-pack/${K}`]: OwnSystemEvents[K] } & { [K in keyof __dep_base_pack_PackSystemEvents & string as `base-pack/${K}`]: __dep_base_pack_PackSystemEvents[K] };');
    const services = files['src/__generated__/services.ts'];
    expect(services).toContain("import type { PackEvents, QualifiedSystemEvents } from './events.js';");
    expect(services).toContain('  sendToPlugin: TypedSendToPlugin<PackEvents>;\n  sendToSystem: TypedSendToSystem<QualifiedSystemEvents>;');
  });
});

describe('generated imports', () => {
  it('names side-effect imports with .js', () => {
    const files = generate({ features: [system('memos')] });
    expect(files['src/__generated__/pack-entry.ts']).toContain("import './seeders.js';");
    expect(files['src/__generated__/pack-entry.ts']).not.toMatch(/import '\.\/seeders';/);
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

  it("ignores dependencies built when their manifests still declared the SDK's names", () => {
    const base = { ...dependency({}), types: { entities: { Relation: 'Relation', Flow: 'Flow', Tag: 'Tag' }, relKinds: { CONTAINS: 'contains' } } };
    const other = { ...dependency({ id: 'other-pack' }), types: { entities: { Relation: 'Relation', Flow: 'Flow', Memo: 'Memo' }, relKinds: { CONTAINS: 'contains' } } };
    const ears = generate({ dependencies: { 'base-pack': '*', 'other-pack': '*' } }, { 'base-pack': base, 'other-pack': other })['src/__generated__/ears.ts'];
    expect(ears).toContain("export const Relation = 'Relation';");
    expect(ears).toContain("export const Tag = 'Tag';");
    expect(ears).toContain("export const Memo = 'Memo';");
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
    expect(() => generate({ relKinds: { TRANSITIONS_TO: 'transitions_to' } })).toThrow(/relKind "TRANSITIONS_TO" is defined by the SDK/);
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
    expect(seeders).toContain(`registerSeeders("demo-pack", [\n  createSeeder({ key: 'actions', entities: ['Action'], identity: ['label'] }),`);
    expect(seeders).toContain('  createFlowSeeder(),');
    expect(seeders).toContain('  createSeeder({"key":"memos","entities":["Memo"],"identity":["title","parent"],"relKind":"has_memo","media":true}),');
    expect(seeders).not.toContain('faqs');
    expect(files['src/__generated__/pack-entry.ts']).toContain('artifacts: ["actions", "flows", "memos"],');
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

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, REPO_ROOT, installPublishedPackages } from '../helpers/published-packages';

/**
 * A pack's typed facades (#generated/ears, events, services, repository) cover its own
 * declarations and its dependencies'. A real `abuddy build` of a dependency pack produces its facade
 * types; a dependent pack built against it (file: dependency) typechecks a consumer, with every
 * generated file, against the workspace SDK source and the packed SDK under node16 and bundler.
 */
const CLI = path.join(REPO_ROOT, 'packages', 'abuddy-cli', 'bin', 'abuddy.mjs');
const TSC = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');

function write(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof content === 'string' ? content : JSON.stringify(content));
  }
}

const packageJson = (name: string) => JSON.stringify({ name, type: 'module', imports: { '#generated/*': './src/__generated__/*' } });
const tsconfig = JSON.stringify({
  compilerOptions: {
    target: 'ES2022', module: 'esnext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, noEmit: true, types: ['node'],
    customConditions: ['@abuddy/source'], allowImportingTsExtensions: true, paths: { '#generated/*': ['./src/__generated__/*'] },
  },
  include: ['src/**/*.ts'],
});

// Relative and #generated imports name .js, so the sources are valid under node16 too
const BASE_PACK = {
  'package.json': packageJson('base-pack'),
  'tsconfig.json': tsconfig,
  'abuddy.json': JSON.stringify({
    id: 'base-pack', name: 'Base', version: '1.0.0',
    entities: { Tag: 'Tag', Item: 'Item' },
    entityShapes: { Tag: { source: 'src/types.ts', type: 'TagEntity' }, Item: { source: 'src/types.ts', type: 'ItemEntity' } },
    features: [{
      id: 'threads',
      system: { entry: 'src/system.ts' },
      plugin: { entry: 'src/plugin.ts', label: 'Threads', icon: 'Box' },
      services: { search: 'src/search.ts' },
      repositories: { tagQueries: 'src/repository.ts#tagQueries' },
    }],
  }),
  'src/types.ts': 'export interface TagEntity { name: string }\nexport interface ItemEntity { title: string }\n',
  'src/system.ts': [
    "import { setup } from 'xstate';",
    "import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';",
    "export type OutgoingThreadsEvents = { type: 'TAG_ADDED'; name: string };",
    "export const threadsSpec = defineSystem('threads')<{ type: 'ADD_TAG' }, OutgoingThreadsEvents>();",
    'export const threads = threadsSpec.id;',
    'const entry: SystemEntry = { spec: threadsSpec, machine: setup({ types: threadsSpec.types }).createMachine({ id: threadsSpec.id }) };',
    'export default entry;',
  ].join('\n'),
  'src/plugin.ts': "import type { Plugin } from '@abuddy/sdk/fe';\nexport default { id: 'threads' } as unknown as Plugin;\n",
  'src/search.ts': 'export const searchService = { query: (q: string): string[] => [q] };\n',
  'src/repository.ts': [
    "import { findAll, EARS } from '#generated/ears.js';",
    'export const tagQueries = { names: (): string[] => findAll(EARS.Entity.Tag).map((tag) => tag.name) };',
  ].join('\n'),
};

const APP_PACK = {
  'package.json': packageJson('app-pack'),
  'tsconfig.json': tsconfig,
  'abuddy.json': JSON.stringify({
    id: 'app-pack', name: 'App', version: '1.0.0',
    dependencies: { 'base-pack': 'file:../base-pack' },
    entities: { Memo: 'Memo' },
    // Same type name as the dependency's Item shape
    entityShapes: { Memo: { source: 'src/types.ts', type: 'ItemEntity' } },
    features: [{ id: 'memos', system: { entry: 'src/system.ts', sendsTo: ['threads'] } }],
  }),
  'src/types.ts': 'export interface ItemEntity { text: string; pinned: boolean }\n',
  'src/system.ts': [
    "import { setup } from 'xstate';",
    "import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';",
    "export type OutgoingMemosEvents = { type: 'MEMO_ADDED'; text: string };",
    "export const memosSpec = defineSystem('memos')<{ type: 'ADD_MEMO' }, OutgoingMemosEvents>();",
    'export const memos = memosSpec.id;',
    'const entry: SystemEntry = { spec: memosSpec, machine: setup({ types: memosSpec.types }).createMachine({ id: memosSpec.id }) };',
    'export default entry;',
  ].join('\n'),
};

const CONSUMER = `
import { EARS as PackEARS, qx, tx, findById, findAll, createEntity, type EntityShape, type EntityName } from '#generated/ears.js';
import { emit, sendToPlugin } from '#generated/events.js';
import { services } from '#generated/services.js';
import { repository } from '#generated/repository.js';
import type { EARS } from '@abuddy/sdk';
type IsAny<T> = 0 extends 1 & T ? true : false;
type Expect<T extends true> = T;
type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends (<X>() => X extends B ? 1 : 2) ? true : false;

declare const memoId: EARS.EntityId<'Memo'>;
const memo = findById(memoId)!;
export type OwnField = Expect<Equal<typeof memo.text, string>>;
export type NotAny = Expect<Equal<IsAny<typeof memo.pinned>, false>>;

const tags = findAll('Tag');
export type DependencyField = Expect<Equal<(typeof tags)[number]['name'], string>>;
// The dependency's ItemEntity is a different type from this pack's
const items = findAll('Item');
export type DependencyItem = Expect<Equal<(typeof items)[number]['title'], string>>;

const picked = qx('Memo').pickOne(['text'] as const);
export type PickedField = Expect<Equal<NonNullable<typeof picked>['text'], string>>;
export type Branded = Expect<Equal<ReturnType<typeof createEntity<'Memo'>>, EARS.EntityId<'Memo'>>>;

export type DependencyService = Expect<Equal<ReturnType<typeof services.search.query>, string[]>>;
export type DependencyRepository = Expect<Equal<ReturnType<typeof repository.tagQueries.names>, string[]>>;
export type RepositoryService = Expect<Equal<typeof services.repository, typeof repository>>;
// @ts-expect-error not a service of this pack or its dependency
services.nope;

// The memos system declares sendsTo: ['threads'], a plugin of the dependency
emit('threads', { type: 'TAG_ADDED', name: 'x' });
emit('memos', { type: 'MEMO_ADDED', text: 'x' });
sendToPlugin('application', { type: 'APPLICATION_RESTORE_LAST_PLUGIN', lastActivePluginId: 'memos' });
// @ts-expect-error the threads plugin doesn't receive this event
emit('threads', { type: 'MEMO_ADDED', text: 'x' });

export type Undeclared = Expect<Equal<EntityShape<'Nope'>['anything'], unknown>>;
// An entity name only known at runtime is accepted, and reads as unknown values
declare const runtimeName: string;
const other = findAll(runtimeName)[0]!;
// @ts-expect-error unknown field can't be used without narrowing
other.anything.length;
qx('Memo').linksTo('contains', runtimeName).pickAll();
findAll<{ title: string }>('Item');
// An explicit shape reads rows of an entity named only at runtime
const shaped = findAll<{ title: string }>(runtimeName);
export type ExplicitShape = Expect<Equal<(typeof shaped)[number]['title'], string>>;
// A generic helper constrained to the declared names is checked, and its rows typed
export function memosOf<E extends EntityName>(entityType: E) { return findAll(entityType); }
export type GenericHelper = Expect<Equal<ReturnType<typeof memosOf<'Memo'>>[number]['text'], string>>;

// A literal must name an entity this pack or its dependency declares
// @ts-expect-error undeclared entity name
findAll('Nope');
// @ts-expect-error a generic over any string can't be checked (constrain it to EntityName)
export function anyOf<E extends string>(entityType: E) { return findAll(entityType); }
// @ts-expect-error undeclared entity name
qx('Nope');
// @ts-expect-error undeclared entity name in a seed list
qx(['Memo', 'Nope']);
// @ts-expect-error undeclared relation target
qx('Memo').linksTo('contains', 'Nope');
// @ts-expect-error undeclared entity name
createEntity('Nope');

// Ids from queries and rows carry their entity type, so the next lookup is typed
const firstMemo = qx('Memo').first()!;
export type QueryIdTagged = Expect<Equal<typeof firstMemo, EARS.EntityId<'Memo'>>>;
const memoFromQuery = findById(firstMemo)!;
export type LookupFromQueryId = Expect<Equal<typeof memoFromQuery.text, string>>;
export type RowIdTagged = Expect<Equal<(typeof tags)[number]['id'], EARS.EntityId<'Tag'>>>;
// A plain id is accepted where a tagged one is expected; another entity's id is not
const openMemo = (id: EARS.EntityId<'Memo'>) => id;
declare const plainId: EARS.EntityId;
openMemo(plainId);
[firstMemo].includes(plainId);
// @ts-expect-error a Tag id where a Memo id is expected
openMemo(tags[0]!.id);
// A tagged link result passed straight to a generic function still infers the target's shape
const uniqueById = <T extends { id?: EARS.EntityId }>(nodes: T[]): T[] => nodes;
const linkedMemos = uniqueById(qx(memoId).linksPick('related', ['text'], ['Memo']));
export type ContextualLinkPick = Expect<Equal<(typeof linkedMemos)[number]['text'], string>>;

// tx checks the values of declared fields when it knows the entity; other fields are free
tx(memoId).put('text', 'x').put('pinned', true).put('undeclared', 42);
tx(firstMemo).update('pinned', false);
tx('Memo').batchPut({ text: 'x', extra: 1 });
const createdMemo = tx('Memo').id();
export type TxIdTagged = Expect<Equal<typeof createdMemo, EARS.EntityId<'Memo'>>>;
// @ts-expect-error a declared field's value is checked
tx(memoId).put('text', 42);
// @ts-expect-error in batch writes too
tx('Memo').batchPut({ pinned: 'yes' });
// A dependency's entity is checked the same way
// @ts-expect-error Tag.name is a string
tx(tags[0]!.id).put('name', 1);
// Relation is the SDK's: available and shaped though neither pack declares it
const relationType: 'Relation' = PackEARS.Entity.Relation;
const relation = findAll(relationType)[0]!;
export type RelationShape = Expect<Equal<typeof relation.relationDetails.sourceEntity, EARS.EntityId>>;
// So is the flow model, without depending on default-setup
const action = findAll('Action')[0]!;
export type ActionShape = Expect<Equal<typeof action.actionFn, string>>;
const tNodes = qx(PackEARS.Entity.TNode).linksTo(PackEARS.RelKind.SPAWNED, 'TNode').pickAll();
export type TNodeShape = Expect<Equal<(typeof tNodes)[number]['tNodeType'], 'flow' | 'event' | 'step'>>;
// Neither pack defines steps, so Node rows read as the SDK's NodeBase
const node = findAll('Node')[0]!;
export type NodeFallback = Expect<Equal<typeof node.nodeType, string>>;
// A plain id leaves writes unchecked
tx(plainId).put('text', 42);
// @ts-expect-error undeclared entity name
tx('Nope');
`;

function run(cmd: string, args: string[], cwd: string): { code: number; output: string } {
  try {
    return { code: 0, output: execFileSync(cmd, args, { cwd, stdio: 'pipe', env: { ...process.env, FORCE_COLOR: '0' } }).toString() };
  } catch (err: any) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** The two packs, built, in a temp dir; node_modules link the workspace or the packed packages */
function buildPacks(published: boolean): string {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'facade-typing-'));
  const modules = published ? path.join(installPublishedPackages(), 'node_modules') : path.join(REPO_ROOT, 'node_modules');
  for (const [name, files] of [['base-pack', BASE_PACK], ['app-pack', APP_PACK]] as const) {
    const dir = path.join(parent, name);
    write(dir, files);
    fs.symlinkSync(modules, path.join(dir, 'node_modules'), 'dir');
    const build = run(process.execPath, [CLI, 'build'], dir);
    if (build.code !== 0) throw new Error(`abuddy build failed in ${name}:\n${build.output}`);
  }
  write(path.join(parent, 'app-pack'), { 'src/consumer.ts': CONSUMER });
  return parent;
}

/**
 * Editor completions in a pack, from the TypeScript language service. The typed EARS types can
 * compile and pass every type check while suggestions disappear (packages/abuddy-sdk/TYPED-EARS.md,
 * Incidents), so these positions are checked directly. `|name|` marks a position in the source.
 */
const COMPLETIONS = `
import { EARS, qx, getAttr, getAttrs, findAll, findWithFields, findByIdWithFields, createEntity } from '#generated/ears.js';
declare const memoId: EARS.EntityId<'Memo'>;
qx('Memo').pick(['|pick|']);
qx('Memo').pickOne(['|pickOne|']);
qx(memoId).linksPick('related', ['|linksPick|'], 'Memo');
qx('Memo').where('|where|');
qx('Memo').orderBy('|orderBy|');
qx('Memo').distinct('|distinct|');
qx('Memo').groupBy('|groupBy|');
getAttr(memoId, '|getAttr|');
getAttrs(memoId, '|getAttrs|');
findWithFields('Memo', ['|findWithFields|']);
findByIdWithFields(memoId, ['|findByIdWithFields|']);
findAll('|findAll|');
createEntity('|createEntity|');
qx(memoId).linksTo('related', '|linksTo|');
qx().ofType('|ofType|');
qx('|qx|');
qx('Memo').where('txet');
`;
const FIELD_POSITIONS = ['pick', 'pickOne', 'linksPick', 'where', 'orderBy', 'distinct', 'groupBy', 'getAttr', 'getAttrs', 'findWithFields', 'findByIdWithFields'];
const NAME_POSITIONS = ['findAll', 'createEntity', 'linksTo', 'ofType'];

/** String completions at each marked position of COMPLETIONS, and the file's diagnostics */
function completionsIn(app: string, tsconfig: string): { at: Record<string, string[]>; diagnostics: string[] } {
  const file = path.join(app, 'src', 'completions.ts');
  const markers: Record<string, number> = {};
  let removed = 0;
  const text = COMPLETIONS.replace(/\|(\w+)\|/g, (marker: string, name: string, offset: number) => {
    markers[name] = offset - removed;
    removed += marker.length;
    return '';
  });
  fs.writeFileSync(file, text);
  const config = ts.getParsedCommandLineOfConfigFile(path.join(app, tsconfig), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })!;
  const files = [...config.fileNames, file];
  const service = ts.createLanguageService({
    getScriptFileNames: () => files,
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => (fs.existsSync(name) ? ts.ScriptSnapshot.fromString(fs.readFileSync(name, 'utf-8')) : undefined),
    getCurrentDirectory: () => app,
    getCompilationSettings: () => config.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  });
  const at = Object.fromEntries(Object.entries(markers).map(([name, position]) => [
    name,
    (service.getCompletionsAtPosition(file, position, {})?.entries ?? []).filter((entry) => entry.kind === ts.ScriptElementKind.string).map((entry) => entry.name),
  ]));
  const diagnostics = service.getSemanticDiagnostics(file).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
  return { at, diagnostics };
}

/** tsconfig for the app pack's consumer under a moduleResolution: the workspace source or the packed SDK */
function writeTsconfig(app: string, moduleResolution: 'bundler' | 'node16', published: boolean): string {
  const name = `tsconfig.${moduleResolution}.json`;
  fs.writeFileSync(path.join(app, name), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: moduleResolution === 'node16' ? 'node16' : 'esnext', moduleResolution,
      strict: true, skipLibCheck: true, noEmit: true, types: ['node'],
      ...(published ? {} : { customConditions: ['@abuddy/source'], allowImportingTsExtensions: true }),
      ...(moduleResolution === 'bundler' ? { paths: { '#generated/*': ['./src/__generated__/*'] } } : {}),
    },
    // Every generated facade, not only the ones the consumer imports
    include: ['src/__generated__/**/*.ts', 'src/consumer.ts'],
    exclude: ['src/__generated__/pack-entry-fe.ts', 'src/__generated__/contributions.ts'],
  }));
  return name;
}

const LAYOUTS = [
  { name: 'workspace source', published: false },
  ...(PACKAGES_BUILT ? [{ name: 'published package', published: true }] : []),
];

describe.each(LAYOUTS)('generated facades with a dependency ($name)', ({ published }) => {
  let parent: string;
  beforeAll(() => { parent = buildPacks(published); }, 240_000);
  afterAll(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("writes the dependency's facade types into its snapshot", () => {
    const snapshot = JSON.parse(fs.readFileSync(path.join(parent, 'base-pack', 'dist', 'types', 'snapshot.json'), 'utf-8'));
    expect(snapshot.defs['pack-types']).toMatch(/export type \{[^}]*PackEntityShapes[^}]*\}/);
  });

  it.each(['bundler', 'node16'] as const)('typechecks own and dependency types under moduleResolution %s', (moduleResolution) => {
    const app = path.join(parent, 'app-pack');
    const result = run(TSC, ['-p', writeTsconfig(app, moduleResolution, published)], app);
    expect(result.code, result.output).toBe(0);
  }, 120_000);

  it.each(['bundler', 'node16'] as const)('offers field and entity-name completions under moduleResolution %s', (moduleResolution) => {
    const app = path.join(parent, 'app-pack');
    const { at, diagnostics } = completionsIn(app, writeTsconfig(app, moduleResolution, published));
    const missing = (positions: string[], expected: string[]) =>
      positions.filter((position) => !expected.every((name) => at[position]?.includes(name)));
    expect(missing(FIELD_POSITIONS, ['text', 'pinned']), 'positions without Memo field completions').toEqual([]);
    expect(missing(NAME_POSITIONS, ['Memo', 'Tag', 'Relation']), 'positions without entity-name completions').toEqual([]);
    // A typo's error lists the fields it could have been
    expect(diagnostics.find((message) => message.includes('"txet"'))).toMatch(/"text"/);
  }, 120_000);

  // qx's name overloads come before its id overloads; in the other order a name seed gets no suggestions
  it.each(['bundler', 'node16'] as const)('offers entity-name completions in qx() under moduleResolution %s', (moduleResolution) => {
    const app = path.join(parent, 'app-pack');
    const { at } = completionsIn(app, writeTsconfig(app, moduleResolution, published));
    expect(at.qx, 'entity-name completions in qx()').toEqual(expect.arrayContaining(['Memo', 'Tag', 'Relation']));
  }, 120_000);
});

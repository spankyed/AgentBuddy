import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
import { qx, findById, findAll, createEntity, type EntityShape, type EntityName } from '#generated/ears.js';
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
    fs.writeFileSync(path.join(app, `tsconfig.${moduleResolution}.json`), JSON.stringify({
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
    const result = run(TSC, ['-p', `tsconfig.${moduleResolution}.json`], app);
    expect(result.code, result.output).toBe(0);
  }, 120_000);
});

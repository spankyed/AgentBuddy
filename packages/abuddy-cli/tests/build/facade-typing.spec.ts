import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generatePackFiles, type PackManifest, type PackSnapshot } from '@abuddy/sdk/build';
import { PACKAGES_BUILT, REPO_ROOT, installPublishedPackages } from '../helpers/published-packages';

/**
 * A pack's typed data access comes from its generated #generated/ears facade: its own
 * entity shapes plus its dependencies'. Typechecks a consumer against the facade codegen
 * writes, so a facade that falls back to untyped helpers fails here. Runs against the
 * workspace SDK source and the packed SDK, under bundler and node16 resolution.
 */
const TSC = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');

const LAYOUTS = [
  { name: 'workspace source', published: false, moduleResolution: 'bundler' as const },
  ...(PACKAGES_BUILT ? [
    { name: 'published package', published: true, moduleResolution: 'bundler' as const },
    { name: 'published package', published: true, moduleResolution: 'node16' as const },
  ] : []),
];

function write(pack: string, rel: string, content: string) {
  const file = path.join(pack, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function makePack(published: boolean): string {
  const pack = published ? installPublishedPackages() : fs.mkdtempSync(path.join(os.tmpdir(), 'facade-typing-'));
  write(pack, 'package.json', JSON.stringify({ name: 'facade-pack', type: 'module', imports: { '#generated/*': './src/__generated__/*' } }));
  write(pack, 'src/features/memos/be/types.ts', "export interface MemoEntity { entityType: 'Memo'; text: string; pinned: boolean }\n");
  // A dependency's entity type, as fetch-deps caches it (snapshot + defs)
  write(pack, '.abuddy/deps/base-pack/defs/entities.d.ts', "export interface TagEntity { entityType: 'Tag'; name: string }\n");
  if (!published) fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(pack, 'node_modules'), 'dir');

  const manifest = {
    id: 'facade-pack', name: 'Facade Pack', version: '1.0.0',
    entities: { Memo: 'Memo' },
    entityShapes: { Memo: { source: 'src/features/memos/be/types.ts', type: 'MemoEntity' } },
    dependencies: { 'base-pack': '*' },
  } as unknown as PackManifest;
  const dependency: PackSnapshot = {
    types: { entities: { Tag: 'Tag' }, relKinds: {} },
    defs: {},
    manifest: { id: 'base-pack', name: 'Base', version: '1.0.0', entityShapes: { Tag: { source: 'src/types.ts', type: 'TagEntity' } } } as unknown as PackManifest,
  };
  const files = generatePackFiles(manifest, {
    packRoot: pack,
    depSnapshots: new Map([['base-pack', dependency]]),
  });
  for (const [file, content] of Object.entries(files)) write(pack, file, content as string);
  return pack;
}

function typecheck(pack: string, layout: (typeof LAYOUTS)[number], consumer: string): { code: number; output: string } {
  write(pack, 'tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: layout.moduleResolution === 'node16' ? 'node16' : 'esnext', moduleResolution: layout.moduleResolution,
      strict: true, skipLibCheck: true, noEmit: true, types: ['node'],
      // The workspace layout checks the codegen against the SDK's source
      ...(layout.published ? {} : { customConditions: ['@abuddy/source'] }),
      paths: { '#generated/*': ['./src/__generated__/*'] },
    },
    include: ['src/__generated__/ears.ts', 'src/consumer.ts'],
  }));
  write(pack, 'src/consumer.ts', consumer);
  try {
    return { code: 0, output: execFileSync(TSC, ['-p', pack], { stdio: 'pipe' }).toString() };
  } catch (err: any) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

// node16 needs the extension on the subpath import; bundler resolution takes either
const header = (layout: (typeof LAYOUTS)[number]) => `
import { qx, findById, findAll, createEntity, type EntityShape } from '#generated/ears${layout.moduleResolution === 'node16' ? '.js' : ''}';
import type { EARS } from '@abuddy/sdk';
type IsAny<T> = 0 extends 1 & T ? true : false;
type Expect<T extends true> = T;
type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends (<X>() => X extends B ? 1 : 2) ? true : false;
`;

describe.each(LAYOUTS)('#generated/ears facade ($name, $moduleResolution)', (layout) => {
  let pack: string;
  beforeAll(() => { pack = makePack(layout.published); }, 120_000);
  afterAll(() => fs.rmSync(pack, { recursive: true, force: true }));

  it("types the pack's own and its dependencies' entities, and never falls back to any", () => {
    const result = typecheck(pack, layout, `${header(layout)}
declare const memoId: EARS.EntityId<'Memo'>;
const memo = findById(memoId)!;
export type OwnField = Expect<Equal<typeof memo.text, string>>;
export type NotAny = Expect<Equal<IsAny<typeof memo.pinned>, false>>;

const tags = findAll('Tag');
export type DependencyField = Expect<Equal<(typeof tags)[number]['name'], string>>;

const picked = qx('Memo').pickOne(['text'] as const);
export type PickedField = Expect<Equal<NonNullable<typeof picked>['text'], string>>;

export type Branded = Expect<Equal<ReturnType<typeof createEntity<'Memo'>>, EARS.EntityId<'Memo'>>>;

// An entity the pack doesn't declare reads as unknown, so using a field needs narrowing
export type Undeclared = Expect<Equal<EntityShape<'Nope'>['anything'], unknown>>;
const other = findAll('Nope')[0]!;
// @ts-expect-error unknown field can't be used without narrowing
other.anything.length;
`);
    expect(result.code, result.output).toBe(0);
  }, 120_000);
});

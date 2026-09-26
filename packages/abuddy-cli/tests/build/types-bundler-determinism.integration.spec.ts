import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, REPO_ROOT, installPublishedPackages } from '@app/publish-checks';

/**
 * A pack's facade bundle (dist/types/pack-types.d.ts) is the same whether its @abuddy/* packages come
 * from this checkout's workspace links or from the tarballs npm would publish: what the repo builds
 * against is what a pack author installs. A package whose `files` or `exports` ship something other
 * than the workspace has, as a private package with no `files` field does, shows up here as a
 * different facade — or as a build that cannot resolve the packages at all.
 */
const CLI = path.join(REPO_ROOT, 'packages', 'abuddy-cli', 'bin', 'abuddy.mjs');

const PACK: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'facade-pack', type: 'module', imports: { '#generated/*': './src/__generated__/*' } }),
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'esnext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, noEmit: true, types: ['node'],
      allowImportingTsExtensions: true, paths: { '#generated/*': ['./src/__generated__/*'] },
    },
    include: ['src/**/*.ts'],
  }),
  'abuddy.json': JSON.stringify({
    id: 'facade-pack', name: 'Facade', version: '1.0.0',
    entities: { Tag: 'Tag' },
    entityShapes: { Tag: { source: 'src/types.ts', type: 'TagEntity' } },
    features: [{
      id: 'tags',
      system: { entry: 'src/system.ts', contract: 'src/system.contract.ts#Contract' },
      services: { tags: 'src/tags.ts#tagsService' },
      repositories: { tagQueries: 'src/repository.ts#tagQueries' },
    }],
  }),
  'src/types.ts': "import type { EARS } from '@abuddy/sdk';\nexport interface TagEntity { name: string; parent?: EARS.EntityId<'Tag'> }\n",
  'src/system.contract.ts': [
    "export type OutgoingTagsEvents = { type: 'TAG_ADDED'; name: string };",
    "export type Contract = { incoming: { type: 'ADD_TAG' }; outgoing: OutgoingTagsEvents };",
  ].join('\n') + '\n',
  'src/system.ts': [
    "import { setup } from 'xstate';",
    "import { defineSystem } from '@abuddy/sdk/framework';",
    "import type { Contract } from './system.contract.js';",
    'export const tagsSpec = defineSystem<Contract>();',
    'const entry = { spec: tagsSpec, machine: setup({ types: tagsSpec.types }).createMachine({ id: "tags" }) };',
    'export default entry;',
  ].join('\n'),
  // Inferred types that name SDK declarations: the declaration emit prints them from whichever copy resolved
  'src/tags.ts': [
    "import { z } from 'zod';",
    "import { qx, findAll } from '#generated/ears.js';",
    "export const TagInput = z.object({ name: z.string(), color: z.enum(['red', 'blue']).optional() });",
    'export const tagsService = {',
    "  query: () => qx('Tag'),",
    "  all: () => findAll('Tag'),",
    '  parse: (input: unknown) => TagInput.parse(input),',
    '};',
  ].join('\n'),
  'src/repository.ts': [
    "import { findAll, EARS } from '#generated/ears.js';",
    'export const tagQueries = { names: () => findAll(EARS.Entity.Tag).map((tag) => tag.name), ids: () => findAll(EARS.Entity.Tag).map((tag) => tag.id) };',
  ].join('\n'),
};

/** The pack built with node_modules linked to `modules`; its facade bundle */
function buildFacade(parent: string, name: string, modules: string): string {
  const dir = path.join(parent, name);
  for (const [rel, content] of Object.entries(PACK)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  fs.symlinkSync(modules, path.join(dir, 'node_modules'), 'dir');
  try {
    execFileSync(process.execPath, [CLI, 'build'], { cwd: dir, stdio: 'pipe', env: { ...process.env, FORCE_COLOR: '0' } });
  } catch (err: any) {
    throw new Error(`abuddy build failed (${name}):\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  }
  return fs.readFileSync(path.join(dir, 'dist', 'types', 'pack-types.d.ts'), 'utf-8');
}

describe.skipIf(!PACKAGES_BUILT)('facade bundle determinism (needs dist: npm run packages:build)', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'facade-determinism-'));
  afterAll(() => fs.rmSync(parent, { recursive: true, force: true }));

  it('is identical from the workspace and from the packed tarballs a consumer installs', () => {
    const fromWorkspace = buildFacade(parent, 'workspace', path.join(REPO_ROOT, 'node_modules'));
    const fromPacked = buildFacade(parent, 'packed', path.join(installPublishedPackages(), 'node_modules'));
    expect(fromWorkspace).toContain('QueryBuilder');
    expect(fromPacked).toBe(fromWorkspace);
  });
});

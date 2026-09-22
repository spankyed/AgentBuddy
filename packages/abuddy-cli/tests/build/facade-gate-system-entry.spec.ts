import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generatePackFiles, type PackManifest } from '@abuddy/sdk/build';
import { facadeProblems } from '../../src/build/facade-gate';
import { bundlePackTypes } from '../../src/build/types-bundler';

/**
 * A system entry declared with `satisfies SystemEntry` keeps its spec's events, which the facade
 * types read. An annotated entry (`const entry: SystemEntry = …`) loses them, and generating the pack's
 * entries refuses it, naming the feature and the fix, before its facade could publish them widened.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'facade-gate-system-entry-'));
afterAll(() => fs.rmSync(parent, { recursive: true, force: true }));

const MANIFEST: PackManifest = {
  id: 'entry-pack',
  name: 'Entry',
  version: '1.0.0',
  features: [{ id: 'tags', system: { entry: 'src/system.ts' } }],
} as PackManifest;

function systemSource(declaration: 'satisfies' | 'annotation'): string {
  const machine = "{ spec: tagsSpec, machine: setup({ types: tagsSpec.types }).createMachine({ id: 'tags' }) }";
  return [
    "import { setup } from 'xstate';",
    "import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';",
    "export type OutgoingTagsEvents = { type: 'TAG_ADDED'; name: string };",
    "export const tagsSpec = defineSystem<{ type: 'ADD_TAG'; name: string }, OutgoingTagsEvents>();",
    declaration === 'satisfies'
      ? `const entry = ${machine} satisfies SystemEntry;`
      : `const entry: SystemEntry = ${machine};`,
    'export default entry;',
  ].join('\n');
}

/** The pack with its system entry declared one way, its generated files written and its facade bundled; the gate's problems */
async function gate(declaration: 'satisfies' | 'annotation'): Promise<string[]> {
  const dir = path.join(parent, declaration);
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: MANIFEST.id, type: 'module' }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'esnext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, noEmit: true, types: ['node'] },
      include: ['src/**/*.ts'],
    }),
    'abuddy.json': JSON.stringify(MANIFEST),
    'src/system.ts': systemSource(declaration),
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  for (const [rel, content] of Object.entries(generatePackFiles(MANIFEST, { packRoot: dir }))) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  const outFile = path.join(dir, 'dist', 'types', 'pack-types.d.ts');
  const bundled = await bundlePackTypes(dir, outFile);
  if (!bundled.success) throw new Error(bundled.error);
  return facadeProblems(dir, outFile);
}

describe('facade gate: system entries', () => {
  it('passes a system entry declared with satisfies SystemEntry', async () => {
    expect(await gate('satisfies')).toEqual([]);
  }, 60_000);

  it('refuses an annotated system entry, naming the feature and the fix', async () => {
    await expect(gate('annotation')).rejects.toThrow(/Feature "tags": .*default-export it declared with `satisfies SystemEntry`/);
  }, 60_000);
});

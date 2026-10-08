// `opaqueDeps` is about rollup's include pass, so what it is checked by is the output: a dependency
// declared opaque is included as published, which is observable as code the shake would otherwise remove.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packFixture } from '@abuddy/sdk/testing/pack-fixture';
import { bundlePackFE } from '../../src/build/fe-bundler';

const UNUSED = 'UNUSED_EXPORT_MARKER';
const USED = 'USED_EXPORT_MARKER';

/** A dependency whose unused export is pure, so nothing but the shake decides whether it survives */
const VENDOR = {
  'node_modules/vendor-blob/package.json': JSON.stringify({ name: 'vendor-blob', version: '1.0.0', type: 'module', main: 'index.js' }),
  'node_modules/vendor-blob/index.js': [
    `export const used = '${USED}';`,
    `export const unused = '${UNUSED}';`,
  ].join('\n'),
};

const tmpDirs: string[] = [];

function makePack(build: Record<string, unknown> | undefined): { packDir: string; entry: string } {
  const packDir = packFixture({
    manifest: { id: 'fixture-pack', name: 'Fixture', ...(build ? { build } : {}) },
    files: { ...VENDOR, 'src/entry.ts': "import { used } from 'vendor-blob';\nexport default { used };\n" },
  });
  tmpDirs.push(packDir);
  return { packDir, entry: path.join(packDir, 'src', 'entry.ts') };
}

async function bundle(build?: Record<string, unknown>): Promise<string> {
  const { packDir, entry } = makePack(build);
  const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });
  expect(result.error, result.error).toBeUndefined();
  return fs.readdirSync(path.join(packDir, 'dist'), { recursive: true })
    .filter((f): f is string => typeof f === 'string' && f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(packDir, 'dist', f), 'utf-8'))
    .join('\n');
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('build.opaqueDeps', () => {
  it('shakes an undeclared dependency, which is what makes the case below mean anything', async () => {
    const output = await bundle();
    expect(output).toContain(USED);
    expect(output).not.toContain(UNUSED);
  });

  it('includes a declared dependency whole, keeping what the shake would have removed', async () => {
    const output = await bundle({ opaqueDeps: ['vendor-blob'] });
    expect(output).toContain(USED);
    expect(output).toContain(UNUSED);
  });

  it('names packages, so a dependency it does not name is still shaken', async () => {
    const output = await bundle({ opaqueDeps: ['some-other-package'] });
    expect(output).not.toContain(UNUSED);
  });
});

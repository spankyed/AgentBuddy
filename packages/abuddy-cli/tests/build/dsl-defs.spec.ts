import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bundleDslDefs, monacoDefsFile } from '../../src/build/dsl-defs';
import type { PackManifest } from '@abuddy/sdk/build';

/**
 * The DSL editors load the declarations `abuddy build` writes, with no node_modules behind them: a
 * package import left in a definitions file is a type the editor silently can't resolve.
 */
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsl-defs-'));
  // The pack resolves @abuddy/* as an installed pack does
  fs.mkdirSync(path.join(dir, 'node_modules', '@abuddy'), { recursive: true });
  fs.symlinkSync(path.resolve(__dirname, '..', '..', '..', 'abuddy-sdk'), path.join(dir, 'node_modules', '@abuddy', 'sdk'));
  write('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'esnext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, noEmit: true,
      customConditions: ['@abuddy/source'], allowImportingTsExtensions: true,
    },
    include: ['src/**/*.ts'],
  }));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), content);
}

function manifest(entry: Record<string, unknown>): PackManifest {
  return { id: 'defs-pack', name: 'Defs Pack', version: '1.0.0', dsl: { console: { entry: 'src/defs/console.ts', targets: ['monaco'], ...entry } } } as PackManifest;
}

const defs = () => fs.readFileSync(path.join(dir, monacoDefsFile('console')), 'utf-8');

describe('bundleDslDefs', () => {
  it("inlines the pack's own modules and the SDK, and wraps them as the editor's module", async () => {
    write('src/local.ts', 'export interface Row { id: string }\n');
    write('src/defs/console.ts', [
      "export type { Row } from '../local.ts';",
      "export type { ArtifactItem } from '@abuddy/sdk/artifacts';",
    ].join('\n'));

    const result = await bundleDslDefs(dir, manifest({}));

    expect(result).toEqual({ success: true, files: [monacoDefsFile('console')] });
    expect(defs()).toMatch(/^declare module "@app\/defs\/console" \{/);
    expect(defs().trimEnd()).toMatch(/\}$/);
    expect(defs()).toMatch(/interface Row \{/);
    expect(defs()).toMatch(/interface ArtifactItem</);
    expect(defs()).not.toMatch(/from '@abuddy\//);
  });

  it('leaves other packages imports until the entry inlines them', async () => {
    write('src/defs/console.ts', "export type { Nested } from 'nested-dep';\n");
    write('node_modules/nested-dep/package.json', JSON.stringify({ name: 'nested-dep', version: '1.0.0', types: 'index.d.ts' }));
    write('node_modules/nested-dep/index.d.ts', 'export interface Nested { deep: true }\n');

    await bundleDslDefs(dir, manifest({}));
    expect(defs()).toMatch(/from 'nested-dep'/);

    await bundleDslDefs(dir, manifest({ inline: ['nested-dep'] }));
    expect(defs()).toMatch(/interface Nested \{/);
    expect(defs()).not.toMatch(/from 'nested-dep'/);
  });

  it('reports which DSL entry failed to bundle', async () => {
    write('src/defs/console.ts', "export type { Missing } from './gone.ts';\n");
    const result = await bundleDslDefs(dir, manifest({}));
    expect(result).toEqual({ success: false, error: expect.stringMatching(/^console: /) });
  });

  it('writes nothing for an entry no editor targets', async () => {
    write('src/defs/console.ts', 'export interface Row { id: string }\n');
    const result = await bundleDslDefs(dir, { ...manifest({}), dsl: { console: { entry: 'src/defs/console.ts', targets: [] } } } as PackManifest);
    expect(result).toEqual({ success: true, files: [] });
    expect(fs.existsSync(path.join(dir, monacoDefsFile('console')))).toBe(false);
  });
});

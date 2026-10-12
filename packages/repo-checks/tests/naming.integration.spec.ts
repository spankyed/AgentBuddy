import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { bareContextExports } from '../../../scripts/lib/naming.ts';
import { repoFiles } from './_support/repo-files.ts';

let directory: string | undefined;
afterEach(() => {
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(modules: Record<string, string>): string[] {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-'));
  return Object.entries(modules).map(([name, text]) => {
    const file = path.join(directory!, name);
    fs.writeFileSync(file, text);
    return file;
  });
}

describe('owner-qualified exported contexts', () => {
  it('rejects bare type names, renamed aliases, re-exports and barrels, including Vue scripts', () => {
    const files = fixture({
      'interface.ts': 'export interface Context { id: string }',
      'type.ts': 'export type Context = { id: string }',
      'class.ts': 'export class Context {}',
      'owned.d.ts': 'export interface Context {}',
      'alias.ts': 'interface RpcContext {}\nexport type { RpcContext as Context };',
      're-export.ts': 'export type { Context } from "./interface.ts";',
      'barrel.ts': 'export * from "./interface.ts";',
      'view.vue': '<template><div>Context</div></template>\n<script lang="ts">\ninterface CodeContext {}\nexport type { CodeContext as Context };\n</script>',
      'vue-alias.ts': 'export type { Context } from "./view.vue";',
    });
    const problems = bareContextExports(files);
    expect(problems.map(({ file }) => path.basename(file)).sort()).toEqual(files.map((file) => path.basename(file)).sort());
    expect(problems.find(({ file }) => file.endsWith('.vue'))?.line).toBe(4);
  });

  it('checks owned re-export names without scanning dependency declarations', () => {
    const files = fixture({
      'dependency.d.ts': 'export interface Context {}',
      'consumer.ts': 'export type { Context } from "./dependency.js";',
    }).filter((file) => !file.endsWith('.d.ts'));
    expect(bareContextExports(files)).toEqual([{ file: files[0], line: 1 }]);
  });

  it('permits private types, qualified exports, namespaces, native getters and optional domain queries', () => {
    const files = fixture({
      'qualified.ts': 'interface Context {}\nexport type { Context as RpcContext };\nexport namespace Code { export interface Context {} }\nexport const values = new Map<string, string>();\nexport const getValue = (key: string) => values.get(key);\nexport const findRecord = () => undefined;',
      'barrel.ts': 'export * from "./qualified.ts";',
      'view.vue': '<script lang="ts">export interface CodeContext {}</script>',
    });
    expect(bareContextExports(files)).toEqual([]);
  });

  it('fires when a qualified export is changed to a bare alias', () => {
    const [file] = fixture({ 'module.ts': 'export interface RpcContext {}' });
    expect(bareContextExports([file!])).toEqual([]);
    fs.appendFileSync(file!, '\nexport type { RpcContext as Context };');
    expect(bareContextExports([file!])).toEqual([{ file, line: 2 }]);
  });

  it('checks all owned source modules, including untracked additions', () => {
    const files = repoFiles('packages/**', 'scripts/**', 'tests/**')
      .filter((file) => /\.(?:[cm]?[jt]sx?|vue)$/.test(file) && !file.includes('/__generated__/'))
      .map((file) => path.join(REPO_ROOT, file));
    expect(files.length).toBeGreaterThan(500);
    expect(bareContextExports(files)).toEqual([]);
  });
});

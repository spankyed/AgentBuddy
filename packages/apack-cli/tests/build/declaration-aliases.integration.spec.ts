import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { bundleDeclarations } from '../../src/build/types-bundler.ts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

it.each(['models/name', 'models/*'])('inlines inherited %s aliases and baseUrl modules while retaining package imports', async alias => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-declaration-aliases-'));
  roots.push(root);
  const pack = path.join(root, 'pack');
  const write = (file: string, text: string) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  write('base.json', JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', baseUrl: '.',
    paths: { [alias]: [alias.includes('*') ? 'types/*' : 'types/name.ts'], '*': ['*', 'pack/node_modules/*'] },
  } }));
  write('pack/package.json', JSON.stringify({ name: 'declaration-aliases', type: 'module' }));
  write('pack/tsconfig.json', JSON.stringify({ extends: '../base.json', include: ['src'] }));
  write('types/name.ts', "throw new Error('type input must not execute'); export type Named = 'ALIASED';");
  write('base-kind.ts', "export type Other = 'BASE';");
  write('pack/src/index.ts', `import type { Ref } from 'vue';
import type { Stats } from 'node:fs';
export type { Named } from 'models/name';
export type { Other } from 'base-kind';
export type Published = { value: Ref<string>; file: Stats };`);
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(pack, 'node_modules'), 'dir');
  const result = await bundleDeclarations(pack, path.join(pack, 'src/index.ts'), path.join(pack, 'dist/types.d.ts'));
  expect(result.success, JSON.stringify(result)).toBe(true);
  if (!result.success) return;
  expect(result.content).toContain('ALIASED');
  expect(result.content).toContain('BASE');
  expect(result.content).toMatch(/from ['"]vue['"]/);
  expect(result.content).toMatch(/from ['"]node:fs['"]/);
  expect(result.content).not.toMatch(/from ['"](?:models\/name|base-kind)['"]/);
});

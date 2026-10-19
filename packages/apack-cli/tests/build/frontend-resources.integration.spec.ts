import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createFrontendResourceFixture, readFrontendOutput } from '../_support/frontend-resources.ts';
import { readPackBuild } from '@apackdev/host/packs';
import { callCli } from '../_support/pack-builds.ts';
import { bundlePackFE } from '../../src/build/fe-bundler.ts';
import { createBuildOutputs } from '../../src/build/build-outputs.ts';
import { captureCompilationInputs } from '../../src/build/compilation-inputs.ts';

const fixture = createFrontendResourceFixture();
const { consumer } = fixture;
let inputWorkspace: string | undefined;
afterAll(() => { if (inputWorkspace) fs.rmSync(inputWorkspace, { recursive: true, force: true }); });

it.each(['unchanged', 'edited'] as const)('uses one input view across frontend compiler paths with %s originals', async mode => {
  const { pack, helper } = consumer();
  const require = createRequire(import.meta.url);
  const vite = createRequire(require.resolve('vite/package.json'));
  fs.symlinkSync(path.dirname(vite.resolve('sass')), path.join(fixture.root, 'node_modules/sass'), 'dir');
  const files: Record<string, string> = {
    'src/frontend-entry.ts': `export {default} from './canvas.vue';`,
    'src/canvas.vue': `<script setup lang="ts">
      import {marker} from 'borrowed';
      const source = 'SOURCE_CAPTURED';
      const lazy = () => import('./lazy.ts');
      const worker = () => new Worker(new URL('./worker.ts', import.meta.url), {type: 'module'});
      const gathered = import.meta.glob('./items/*.ts', {eager: true});
      </script><template><div class="text-proof" @click="lazy">{{marker}}{{source}}{{gathered}}
      <button @click="worker">Launch</button><img src="./image.svg?no-inline" /></div></template>
      <style src="./style.css"></style><style lang="scss">@use './values.scss'; .sass-proof {content: values.$label;}</style>`,
    'src/lazy.ts': `export const marker = 'LAZY_CAPTURED';`,
    'src/worker.ts': `self.postMessage('WORKER_CAPTURED');`,
    'src/items/first.ts': `export const marker = 'GLOB_CAPTURED';`,
    'src/image.svg': '<svg xmlns="http://www.w3.org/2000/svg"><text>SVG_CAPTURED</text></svg>',
    'src/style.css': `@import './leaf.css'; .proof {background: url('./image.svg?no-inline');}`,
    'src/leaf.css': `.proof::after {content: 'STYLE_CAPTURED';}`,
    'src/values.scss': `$label: 'SASS_CAPTURED';`,
    'tailwind.config.ts': `import colors from './config-origin.cjs'; export default {content: [${JSON.stringify(path.join(pack, 'src/**/*.vue'))}], theme: {extend: {colors: {proof: colors.value}}}};`,
    'config-origin.cjs': `if (__dirname !== ${JSON.stringify(fs.realpathSync(pack))}) throw new Error('Expected original config source directory: ' + __dirname); module.exports = {value: '#123456'};`,
  };
  const write = (file: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(pack, file)), { recursive: true });
    fs.writeFileSync(path.join(pack, file), body);
  };
  for (const [file, body] of Object.entries(files)) write(file, body);
  fs.writeFileSync(helper, `export const marker = 'DEPENDENCY_CAPTURED';`);
  const outputDir = path.join(pack, 'dist/runtime');
  // Tailwind retains its jiti cache directory for the process lifetime, across these builds.
  const workspace = inputWorkspace ??= fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-frontend-inputs-')));
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(workspace, 'tmp'), { recursive: true });
  vi.stubEnv('APACK_BUILD_INPUTS_DIRECTORY', workspace);
  vi.stubEnv('TMPDIR', path.join(workspace, 'tmp'));
  const compilation = captureCompilationInputs(pack);
  try {
    if (mode === 'edited') {
      for (const [file, body] of Object.entries(files)) write(file, body.replaceAll('_CAPTURED', '_LIVE').replace('#123456', '#654321'));
      fs.writeFileSync(helper, `export const marker = 'DEPENDENCY_LIVE';`);
    }
    const result = await bundlePackFE({ packDir: pack, outputDir, entryPoint: path.join(pack, 'src/frontend-entry.ts'), compilation });
    expect(result.success, result.error).toBe(true);
    const output = ['.js', '.css', '.svg'].map(extension => readFrontendOutput(pack, extension)).join('\n');
    for (const marker of ['SOURCE', 'DEPENDENCY', 'STYLE', 'SVG', 'LAZY', 'WORKER', 'GLOB', 'SASS']) {
      expect(output, marker).toContain(`${marker}_CAPTURED`);
      expect(output, marker).not.toContain(`${marker}_LIVE`);
    }
    expect(readFrontendOutput(pack, '.css')).toContain('18 52 86');
    expect(output).not.toContain('apack-inputs-');
    if (mode === 'unchanged') expect(() => compilation.assertCurrent()).not.toThrow();
    else expect(() => compilation.assertCurrent()).toThrow('Compiler or installed package inputs changed');
  } finally { compilation.dispose(); }
});

it('copies public assets from the accepted input view instead of changed live files', async () => {
  const { pack } = consumer();
  const asset = path.join(pack, 'public', 'proof.txt');
  fs.mkdirSync(path.dirname(asset), { recursive: true });
  fs.writeFileSync(asset, 'CAPTURED');
  fs.chmodSync(asset, 0o666);
  fs.writeFileSync(path.join(pack, 'public/fe.js'), '// public placeholder overwritten by the bundle');
  const compilation = captureCompilationInputs(pack);
  try {
    fs.writeFileSync(asset, 'LIVE');
    const outputDir = path.join(pack, 'dist/runtime');
    const outputs = createBuildOutputs(outputDir);
    const result = await bundlePackFE({ packDir: pack, outputDir, entryPoint: path.join(pack, 'src/canvas.vue'), compilation, recordOutput: outputs.record });
    expect(() => outputs.assertCurrent()).not.toThrow();
    expect(result.success, result.error).toBe(true);
    expect(fs.readFileSync(path.join(outputDir, 'proof.txt'), 'utf8')).toBe('CAPTURED');
    if (process.platform !== 'win32') expect(fs.statSync(path.join(outputDir, 'proof.txt')).mode & 0o777).toBe(0o666);
    expect(fs.readFileSync(path.join(outputDir, 'fe.js'), 'utf8')).not.toContain('public placeholder');
    expect(() => compilation.assertCurrent()).toThrow('Compiler or installed package inputs changed');
  } finally { compilation.dispose(); }
});

it('rebuilds Vue styles after only an external stylesheet changes', async () => {
  const { pack } = consumer();
  const stylesheet = path.join(fixture.root, 'outside.css');
  fs.writeFileSync(stylesheet, '.outside { color: #123456; }');
  const canvas = path.join(pack, 'src/canvas.vue');
  fs.appendFileSync(canvas, '<style src="../../outside.css"></style>');
  const first = await callCli(pack, 'build');
  expect(first.code, first.output).toBe(0);
  const css = path.join(pack, 'dist/runtime/fe.css');
  expect(fs.readFileSync(css, 'utf8')).toContain('#123456');
  fs.writeFileSync(stylesheet, '.outside { color: #654321; }');
  const second = await callCli(pack, 'build');
  expect(second.code, second.output).toBe(0);
  expect(fs.readFileSync(css, 'utf8')).toContain('#654321');
  expect(fs.readFileSync(css, 'utf8')).not.toContain('#123456');
}, 2 * 60_000 + 20_000);

it.each(['css-import', 'css-url', 'template'] as const)('compiles changed external %s resources with unchanged authored sources', async kind => {
  const { pack } = consumer();
  const resource = path.join(fixture.root, kind === 'css-import' ? 'theme.css' : 'image.svg');
  const before = kind === 'css-import' ? '.theme { color: #123456; }'
    : '<svg xmlns="http://www.w3.org/2000/svg"><text>BEFORE</text></svg>';
  const after = kind === 'css-import' ? '.theme { color: #654321; }'
    : '<svg xmlns="http://www.w3.org/2000/svg"><text>AFTERX</text></svg>';
  fs.writeFileSync(resource, before);
  const canvas = path.join(pack, 'src/canvas.vue');
  if (kind === 'template') fs.writeFileSync(canvas, '<template><img src="../../image.svg?no-inline" /></template>');
  else {
    const stylesheet = path.join(fixture.root, 'outside.css');
    fs.writeFileSync(stylesheet, kind === 'css-import' ? '@import "./theme.css";'
      : '.image { background: url("./image.svg?no-inline"); }');
    fs.appendFileSync(canvas, '<style src="../../outside.css"></style>');
  }
  const compile = async () => {
    const outputDir = path.join(pack, 'dist/runtime');
    fs.rmSync(outputDir, { recursive: true, force: true });
    const result = await bundlePackFE({ packDir: pack, outputDir, entryPoint: canvas });
    expect(result.success, result.error).toBe(true);
  };
  await compile();
  expect(readFrontendOutput(pack, kind === 'css-import' ? '.css' : '.svg')).toContain(kind === 'css-import' ? '#123456' : 'BEFORE');
  fs.writeFileSync(resource, after);
  await compile();
  expect(readFrontendOutput(pack, kind === 'css-import' ? '.css' : '.svg')).toContain(kind === 'css-import' ? '#654321' : 'AFTERX');
  expect(readFrontendOutput(pack, kind === 'css-import' ? '.css' : '.svg')).not.toContain(kind === 'css-import' ? '#123456' : 'BEFORE');
});

describe('CSS dependency watching', () => {
  let pack: string;
  let stylesheet: string;
  let leaf: string;
  let publications: number;
  let errors: MockInstance<typeof console.error>;

  beforeEach(async () => {
    ({ pack } = consumer());
    stylesheet = path.join(fixture.root, 'outside.css');
    leaf = path.join(fixture.root, 'theme.css');
    fs.writeFileSync(stylesheet, '@import "./theme.css";');
    fs.writeFileSync(leaf, '.theme { color: #123456; }');
    fs.appendFileSync(path.join(pack, 'src/canvas.vue'), '<style src="../../outside.css"></style>');
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    publications = 0;
    await fixture.startWatcher(pack, { place: { env: 'test', userDataDir: path.join(fixture.root, 'profile') },
      onBuilt: async () => { publications++; } });
  }, 2 * 60_000);

  it('recovers a missing nested stylesheet while retaining the accepted build', async () => {
    const css = () => fs.readFileSync(path.join(pack, 'dist/runtime/fe.css'), 'utf8');
    const replacement = path.join(fixture.root, 'replacement.css');
    fs.writeFileSync(replacement, '.theme { color: #654321; }');
    fs.renameSync(replacement, leaf);
    await vi.waitFor(() => expect(publications > 0 || errors.mock.calls.length > 0).toBe(true), { timeout: 20_000 });
    expect(errors.mock.calls).toEqual([]);
    expect(css()).toContain('#654321');
    const accepted = readPackBuild(path.join(pack, 'dist')).revision;
    const count = publications;
    fs.writeFileSync(stylesheet, '@import "./future/theme.css";');
    await vi.waitFor(() => expect(errors).toHaveBeenCalledWith(expect.stringContaining('Build/reload failed')), { timeout: 20_000 });
    expect(publications).toBe(count);
    expect(readPackBuild(path.join(pack, 'dist')).revision).toBe(accepted);
    fs.mkdirSync(path.join(fixture.root, 'future'));
    fs.writeFileSync(path.join(fixture.root, 'future/theme.css'), '.theme { color: #abcdef; }');
    await vi.waitFor(() => expect(publications).toBeGreaterThan(count), { timeout: 20_000 });
    expect(css()).toContain('#abcdef');
  });
});

it.each(['css-url', 'template'] as const)('watches an external %s asset in a separate directory', async kind => {
  if (kind === 'template') vi.stubEnv('APACK_NO_BUILD_READS', '1');
  const { pack } = consumer();
  const assets = path.join(fixture.root, 'assets');
  fs.mkdirSync(assets);
  const asset = path.join(assets, 'image.svg');
  fs.writeFileSync(asset, '<svg xmlns="http://www.w3.org/2000/svg"><text>BEFORE</text></svg>');
  const canvas = path.join(pack, 'src/canvas.vue');
  if (kind === 'template') fs.writeFileSync(canvas, '<template><img src="../../assets/image.svg?no-inline" /></template>');
  else {
    fs.mkdirSync(path.join(fixture.root, 'styles'));
    fs.writeFileSync(path.join(fixture.root, 'styles/main.css'), '.image { background: url("../assets/image.svg?no-inline"); }');
    fs.appendFileSync(canvas, '<style src="../../styles/main.css"></style>');
  }
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  let watcher: { close(): Promise<void> } | undefined;
  let publications = 0;
  try {
    watcher = await fixture.startWatcher(pack, { place: { env: 'test', userDataDir: path.join(fixture.root, 'profile') },
      onBuilt: async () => { publications++; } });
    expect(readFrontendOutput(pack, '.svg')).toContain('BEFORE');
    if (kind === 'template') expect(fs.existsSync(path.join(pack, '.apack/reads.json'))).toBe(false);
    fs.writeFileSync(asset, '<svg xmlns="http://www.w3.org/2000/svg"><text>AFTERX</text></svg>');
    await vi.waitFor(() => expect(publications > 0 || errors.mock.calls.length > 0).toBe(true), { timeout: 20_000 });
    expect(errors.mock.calls).toEqual([]);
    expect(readFrontendOutput(pack, '.svg')).toContain('AFTERX');
    expect(readFrontendOutput(pack, '.svg')).not.toContain('BEFORE');
  } finally { await watcher?.close(); }
}, 120_000 + 20_000 + 20_000);

it('watches initially empty external Tailwind content through nested directory links', async () => {
  const { pack } = consumer();
  const content = path.join(fixture.root, 'content');
  const sources = path.join(fixture.root, 'sources');
  fs.mkdirSync(content);
  fs.mkdirSync(sources);
  fs.symlinkSync(sources, path.join(content, 'linked'), 'dir');
  const authored = path.join(pack, 'templates');
  fs.mkdirSync(authored);
  fs.writeFileSync(path.join(authored, 'page.html'), '<div class="text-indigo-500" />');
  fs.writeFileSync(path.join(pack, 'tailwind.config.js'), `export default { content: [${JSON.stringify(`${content}/**/*.html`)}] };`);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  let watcher: { close(): Promise<void> } | undefined;
  let publications = 0;
  try {
    watcher = await fixture.startWatcher(pack, { place: { env: 'test', userDataDir: path.join(fixture.root, 'profile') },
      onBuilt: async () => { publications++; } });
    expect(readFrontendOutput(pack, '.css')).not.toContain('.text-orange-500');
    expect(readFrontendOutput(pack, '.css')).not.toContain('.text-indigo-500');
    fs.mkdirSync(path.join(sources, 'nested'));
    fs.writeFileSync(path.join(sources, 'nested/page.html'), '<div class="text-orange-500" />');
    await vi.waitFor(() => expect(publications > 0 || errors.mock.calls.length > 0).toBe(true), { timeout: 20_000 });
    expect(errors.mock.calls).toEqual([]);
    expect(readFrontendOutput(pack, '.css')).toContain('.text-orange-500');
    const count = publications;
    const replacement = path.join(fixture.root, 'replacement');
    fs.symlinkSync(authored, replacement, 'dir');
    fs.renameSync(replacement, path.join(content, 'linked'));
    await vi.waitFor(() => {
      expect(publications).toBeGreaterThan(count);
      expect(readFrontendOutput(pack, '.css')).toContain('.text-indigo-500');
    }, { timeout: 20_000 });
    expect(errors.mock.calls).toEqual([]);
    expect(readFrontendOutput(pack, '.css')).not.toContain('.text-orange-500');
  } finally { await watcher?.close(); }
}, 120_000 + 2 * 20_000 + 20_000);

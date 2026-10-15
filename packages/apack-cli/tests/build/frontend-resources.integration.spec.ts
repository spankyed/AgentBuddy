import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { readPackBuild } from '@apackdev/host/packs';
import { callCli } from '../_support/pack-builds.ts';
import { vueRuntimePack } from '../_support/frontend-pack.ts';
import { startPackBuildWatcher } from '../../src/build/watch.ts';
import { filesUnder } from '../../src/build/phase-cache.ts';
import { bundlePackFE } from '../../src/build/fe-bundler.ts';
import { createFrontendWatcher } from '../../src/build/frontend-watch.ts';

let root: string | undefined;
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); if (root) fs.rmSync(root, { recursive: true, force: true }); root = undefined; });

function consumer() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-frontend-resources-'));
  return vueRuntimePack(root);
}

function output(pack: string, extension: string): string {
  const directory = path.join(pack, 'dist/runtime');
  return filesUnder(directory).filter(file => file.endsWith(extension))
    .map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n');
}

it.each([
  ['import.meta.glob("../../pages/**/*.js", { eager: true })', 'pages'],
  ['import.meta.glob([`../../pages/**/*.js`, "!../../pages/excluded/**"], { eager: true })', 'pages'],
  ['import.meta.glob("./**/*.js", { eager: true, base: "../../pages" })', 'pages'],
  ['import.meta.glob("#pages/**/*.js", { eager: true })', 'pages'],
  ['name => import(`../../pages/nested/${name}.js`)', 'pages'],
  ['name => import(`../../pages/nested/new${name}.js`)', 'pages'],
])('watches an initially empty external glob: %s', async (expression, location) => {
  const { pack } = consumer();
  const packageFile = path.join(pack, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  manifest.imports = { ...manifest.imports, '#pages/*': './pages/*' };
  fs.writeFileSync(packageFile, JSON.stringify(manifest));
  const directory = path.join(root!, location);
  fs.mkdirSync(directory);
  fs.symlinkSync(directory, path.join(pack, 'pages'), 'dir');
  const entryPoint = path.join(pack, expression.includes('#pages') ? 'canvas.vue' : 'src/canvas.vue');
  fs.writeFileSync(entryPoint, `<script setup>const pages = ${expression};</script><template><div>{{ pages }}</div></template>`);
  const changed = vi.fn();
  const watcher = createFrontendWatcher(pack, undefined, changed);
  let reported: readonly string[] = [];
  const compile = () => {
    const outputDir = path.join(pack, 'dist/runtime');
    fs.rmSync(outputDir, { recursive: true, force: true });
    return bundlePackFE({ packDir: pack, entryPoint, outputDir,
      onInputs: inputs => { reported = inputs.directories; return watcher.observe(inputs).then(() => {}); } });
  };
  try {
    const first = await compile();
    expect(first.success, first.error).toBe(true);
    const before = watcher.snapshot();
    const nested = path.join(directory, 'nested');
    fs.mkdirSync(nested);
    const page = path.join(nested, 'new.js');
    fs.writeFileSync(page, 'export const marker = "NEW_GLOB_PAGE";');
    await vi.waitFor(() => expect(changed, JSON.stringify(reported)).toHaveBeenCalled(), { timeout: 2_000 });
    expect(before.current()).toBe(false);
    const second = await compile();
    expect(second.success, second.error).toBe(true);
    expect(output(pack, '.js')).toContain('NEW_GLOB_PAGE');
    changed.mockClear();
    fs.unlinkSync(page);
    await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2_000 });
    const third = await compile();
    expect(third.success, third.error).toBe(true);
    expect(output(pack, '.js')).not.toContain('NEW_GLOB_PAGE');
  } finally { await watcher.close(); }
});

it('leaves explicitly ignored variable imports outside compiler subscriptions', async () => {
  const { pack } = consumer();
  const entryPoint = path.join(pack, 'src/canvas.vue');
  fs.writeFileSync(entryPoint, '<script setup>const load = name => import(/* @vite-ignore */ `../../pages/${name}.js`);</script><template><div>{{ load }}</div></template>');
  let directories: readonly string[] = [];
  const result = await bundlePackFE({ packDir: pack, entryPoint, outputDir: path.join(pack, 'dist/runtime'),
    onInputs: async inputs => { directories = inputs.directories; } });
  expect(result.success, result.error).toBe(true);
  expect(directories).toEqual([]);
});

it('rebuilds Vue styles after only an external stylesheet changes', async () => {
  const { pack } = consumer();
  const stylesheet = path.join(root!, 'outside.css');
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
});

it.each(['url', 'import', 'nested'] as const)('watches external %s worker dependencies', async kind => {
  const { pack } = consumer();
  const helper = path.join(root!, 'worker-value.ts');
  fs.writeFileSync(helper, 'export const marker = "WORKER_BEFORE";');
  const workerSource = 'import { marker } from "./worker-value.ts"; self.postMessage(marker);';
  fs.writeFileSync(path.join(root!, 'worker.ts'), kind === 'nested'
    ? 'new Worker(new URL("./nested-worker.ts", import.meta.url), { type: "module" });' : workerSource);
  const pages = path.join(root!, 'worker-pages');
  if (kind === 'nested') {
    fs.mkdirSync(pages);
    fs.writeFileSync(path.join(root!, 'nested-worker.ts'), `${workerSource} self.postMessage(import.meta.glob("./worker-pages/**/*.js", { eager: true }));`);
  }
  const entryPoint = path.join(pack, 'src/canvas.vue');
  const script = kind !== 'import'
    ? 'const worker = new Worker(new URL("../../worker.ts", import.meta.url), { type: "module" });'
    : 'import Worker from "../../worker.ts?worker"; const worker = new Worker();';
  fs.writeFileSync(entryPoint, `<script setup>${script}</script><template><div>{{ worker }}</div></template>`);
  const changed = vi.fn();
  const watcher = createFrontendWatcher(pack, undefined, changed);
  let lastFiles: readonly string[] = [];
  const compile = async () => {
    const outputDir = path.join(pack, 'dist/runtime');
    fs.rmSync(outputDir, { recursive: true, force: true });
    const result = await bundlePackFE({ packDir: pack, entryPoint, outputDir,
      onInputs: async inputs => { lastFiles = inputs.files; await watcher.observe(inputs); } });
    expect(result.success, result.error).toBe(true);
  };
  try {
    await compile();
    expect(output(pack, '.js')).toContain('WORKER_BEFORE');
    const before = watcher.snapshot();
    fs.writeFileSync(helper, 'export const marker = "WORKER_AFTER";');
    await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2_000 });
    expect(before.current()).toBe(false);
    await compile();
    expect(lastFiles).toContain(fs.realpathSync(helper));
    expect(output(pack, '.js')).toContain('WORKER_AFTER');
    expect(output(pack, '.js')).not.toContain('WORKER_BEFORE');
    if (kind === 'nested') {
      changed.mockClear();
      fs.writeFileSync(path.join(pages, 'new.js'), 'export const page = "NESTED_WORKER_PAGE";');
      await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2_000 });
      await compile();
      expect(output(pack, '.js')).toContain('NESTED_WORKER_PAGE');
    }
  } finally { await watcher.close(); }
});

it('retains the accepted build after a worker error and publishes its repair', async () => {
  const { pack } = consumer();
  const helper = path.join(root!, 'worker-value.ts');
  fs.writeFileSync(helper, 'export const marker = "WORKER_BEFORE";');
  fs.writeFileSync(path.join(root!, 'worker.ts'), 'import { marker } from "./worker-value.ts"; self.postMessage(marker);');
  fs.writeFileSync(path.join(pack, 'src/canvas.vue'), '<script setup>const worker = new Worker(new URL("../../worker.ts", import.meta.url), { type: "module" });</script><template><div>{{ worker }}</div></template>');
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  let watcher: { close(): Promise<void> } | undefined;
  let publications = 0;
  try {
    watcher = await startPackBuildWatcher(pack, { place: { env: 'test', userDataDir: path.join(root!, 'profile') },
      onBuilt: async () => { publications++; } });
    const accepted = readPackBuild(path.join(pack, 'dist')).revision;
    fs.writeFileSync(helper, 'export const marker = ;');
    await vi.waitFor(() => expect(errors).toHaveBeenCalledWith(expect.stringContaining('Build/reload failed')), { timeout: 20_000 });
    expect(publications).toBe(0);
    expect(readPackBuild(path.join(pack, 'dist')).revision).toBe(accepted);
    fs.writeFileSync(helper, 'export const marker = "WORKER_REPAIRED";');
    await vi.waitFor(() => expect(publications).toBeGreaterThan(0), { timeout: 20_000 });
    expect(readPackBuild(path.join(pack, 'dist')).revision).not.toBe(accepted);
    expect(output(pack, '.js')).toContain('WORKER_REPAIRED');
    expect(output(pack, '.js')).not.toContain('WORKER_BEFORE');
  } finally { await watcher?.close(); }
});

it.each(['css-import', 'css-url', 'template'] as const)('compiles changed external %s resources with unchanged authored sources', async kind => {
  const { pack } = consumer();
  const resource = path.join(root!, kind === 'css-import' ? 'theme.css' : 'image.svg');
  const before = kind === 'css-import' ? '.theme { color: #123456; }'
    : '<svg xmlns="http://www.w3.org/2000/svg"><text>BEFORE</text></svg>';
  const after = kind === 'css-import' ? '.theme { color: #654321; }'
    : '<svg xmlns="http://www.w3.org/2000/svg"><text>AFTERX</text></svg>';
  fs.writeFileSync(resource, before);
  const canvas = path.join(pack, 'src/canvas.vue');
  if (kind === 'template') fs.writeFileSync(canvas, '<template><img src="../../image.svg?no-inline" /></template>');
  else {
    const stylesheet = path.join(root!, 'outside.css');
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
  expect(output(pack, kind === 'css-import' ? '.css' : '.svg')).toContain(kind === 'css-import' ? '#123456' : 'BEFORE');
  fs.writeFileSync(resource, after);
  await compile();
  expect(output(pack, kind === 'css-import' ? '.css' : '.svg')).toContain(kind === 'css-import' ? '#654321' : 'AFTERX');
  expect(output(pack, kind === 'css-import' ? '.css' : '.svg')).not.toContain(kind === 'css-import' ? '#123456' : 'BEFORE');
});

it('watches CSS dependencies and recovers a missing nested stylesheet while retaining the accepted build', async () => {
  const { pack } = consumer();
  const stylesheet = path.join(root!, 'outside.css');
  const leaf = path.join(root!, 'theme.css');
  fs.writeFileSync(stylesheet, '@import "./theme.css";');
  fs.writeFileSync(leaf, '.theme { color: #123456; }');
  fs.appendFileSync(path.join(pack, 'src/canvas.vue'), '<style src="../../outside.css"></style>');
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  let watcher: { close(): Promise<void> } | undefined;
  let publications = 0;
  const css = () => fs.readFileSync(path.join(pack, 'dist/runtime/fe.css'), 'utf8');
  try {
    watcher = await startPackBuildWatcher(pack, { place: { env: 'test', userDataDir: path.join(root!, 'profile') },
      onBuilt: async () => { publications++; } });
    const replacement = path.join(root!, 'replacement.css');
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
    fs.mkdirSync(path.join(root!, 'future'));
    fs.writeFileSync(path.join(root!, 'future/theme.css'), '.theme { color: #abcdef; }');
    await vi.waitFor(() => expect(publications).toBeGreaterThan(count), { timeout: 20_000 });
    expect(css()).toContain('#abcdef');
  } finally { await watcher?.close(); }
});

it.each(['css-url', 'template'] as const)('watches an external %s asset in a separate directory', async kind => {
  if (kind === 'template') vi.stubEnv('APACK_NO_BUILD_READS', '1');
  const { pack } = consumer();
  const assets = path.join(root!, 'assets');
  fs.mkdirSync(assets);
  const asset = path.join(assets, 'image.svg');
  fs.writeFileSync(asset, '<svg xmlns="http://www.w3.org/2000/svg"><text>BEFORE</text></svg>');
  const canvas = path.join(pack, 'src/canvas.vue');
  if (kind === 'template') fs.writeFileSync(canvas, '<template><img src="../../assets/image.svg?no-inline" /></template>');
  else {
    fs.mkdirSync(path.join(root!, 'styles'));
    fs.writeFileSync(path.join(root!, 'styles/main.css'), '.image { background: url("../assets/image.svg?no-inline"); }');
    fs.appendFileSync(canvas, '<style src="../../styles/main.css"></style>');
  }
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  let watcher: { close(): Promise<void> } | undefined;
  let publications = 0;
  try {
    watcher = await startPackBuildWatcher(pack, { place: { env: 'test', userDataDir: path.join(root!, 'profile') },
      onBuilt: async () => { publications++; } });
    expect(output(pack, '.svg')).toContain('BEFORE');
    if (kind === 'template') expect(fs.existsSync(path.join(pack, '.apack/reads.json'))).toBe(false);
    fs.writeFileSync(asset, '<svg xmlns="http://www.w3.org/2000/svg"><text>AFTERX</text></svg>');
    await vi.waitFor(() => expect(publications > 0 || errors.mock.calls.length > 0).toBe(true), { timeout: 20_000 });
    expect(errors.mock.calls).toEqual([]);
    expect(output(pack, '.svg')).toContain('AFTERX');
    expect(output(pack, '.svg')).not.toContain('BEFORE');
  } finally { await watcher?.close(); }
});

it('watches initially empty external Tailwind content through nested directory links', async () => {
  const { pack } = consumer();
  const content = path.join(root!, 'content');
  const sources = path.join(root!, 'sources');
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
    watcher = await startPackBuildWatcher(pack, { place: { env: 'test', userDataDir: path.join(root!, 'profile') },
      onBuilt: async () => { publications++; } });
    expect(output(pack, '.css')).not.toContain('.text-orange-500');
    expect(output(pack, '.css')).not.toContain('.text-indigo-500');
    fs.mkdirSync(path.join(sources, 'nested'));
    fs.writeFileSync(path.join(sources, 'nested/page.html'), '<div class="text-orange-500" />');
    await vi.waitFor(() => expect(publications > 0 || errors.mock.calls.length > 0).toBe(true), { timeout: 20_000 });
    expect(errors.mock.calls).toEqual([]);
    expect(output(pack, '.css')).toContain('.text-orange-500');
    const count = publications;
    const replacement = path.join(root!, 'replacement');
    fs.symlinkSync(authored, replacement, 'dir');
    fs.renameSync(replacement, path.join(content, 'linked'));
    await vi.waitFor(() => {
      expect(publications).toBeGreaterThan(count);
      expect(output(pack, '.css')).toContain('.text-indigo-500');
    }, { timeout: 20_000 });
    expect(errors.mock.calls).toEqual([]);
    expect(output(pack, '.css')).not.toContain('.text-orange-500');
  } finally { await watcher?.close(); }
});

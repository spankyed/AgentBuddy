import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { packFixture } from '@apack/sdk/testing/pack-fixture';
import { population } from '@apack/sdk/testing';
import { bundlePackFE } from '../../src/build/fe-bundler';
import { bundleExternals } from '../_support/pack-builds';
import { PACKAGES_BUILT, REPO_ROOT, installPublishedPackages } from '@app/publish-checks';

const EARS_SOURCE = path.join(REPO_ROOT, 'packages', 'apack-ears');
const SDK_SOURCE = path.join(REPO_ROOT, 'packages', 'apack-sdk');
const UI_SOURCE = path.join(REPO_ROOT, 'packages', 'apack-ui');
let installed: string | undefined;

const LAYOUTS = [
  // A pack resolves the packages' published dist whether they are linked from the workspace or installed
  { name: 'workspace install', earsDir: () => EARS_SOURCE, sdkDir: () => SDK_SOURCE, uiDir: () => UI_SOURCE, ext: 'js' },
  ...(PACKAGES_BUILT ? [{
    name: 'published package',
    earsDir: () => path.join(installed!, 'node_modules', '@apack', 'ears'),
    sdkDir: () => path.join(installed!, 'node_modules', '@apack', 'sdk'),
    uiDir: () => path.join(installed!, 'node_modules', '@apack', 'ui'),
    ext: 'js',
  }] : []),
];

beforeAll(() => {
  if (PACKAGES_BUILT) installed = installPublishedPackages();
});

afterAll(() => {
  if (installed) fs.rmSync(installed, { recursive: true, force: true });
});

const tmpDirs: string[] = [];

function makePack(layout: { earsDir: () => string; sdkDir: () => string; uiDir: () => string }, entrySource: string, manifest: Record<string, unknown> = {}): { packDir: string; entry: string } {
  // Its own `node_modules/@apack/*` link tree, so the fixture writes the pack and this links the packages
  const packDir = packFixture({ manifest: { id: 'fixture-pack', name: 'Fixture', ...manifest } });
  tmpDirs.push(packDir);
  fs.mkdirSync(path.join(packDir, 'node_modules', '@apack'), { recursive: true });
  fs.symlinkSync(layout.earsDir(), path.join(packDir, 'node_modules', '@apack', 'ears'), 'dir');
  fs.symlinkSync(layout.sdkDir(), path.join(packDir, 'node_modules', '@apack', 'sdk'), 'dir');
  fs.symlinkSync(layout.uiDir(), path.join(packDir, 'node_modules', '@apack', 'ui'), 'dir');
  const entry = path.join(packDir, 'src', 'entry.ts');
  fs.writeFileSync(entry, entrySource);
  return { packDir, entry };
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe.each(LAYOUTS)('bundlePackFE host binding guard ($name)', (layout) => {
  it('fails when pack FE code inlines an SDK module that needs the host binding', async () => {
    const { packDir, entry } = makePack(layout,
      // onLog needs the bound app (createLogger alone doesn't: unbound, it writes to the console)
      `import { onLog } from '@apack/sdk/logger';\nexport const subscribe = onLog;\n`,
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No host is bound');
    expect(result.error).toContain('Import chain: src/entry.ts → @apack/sdk/logger');
  });

  it('uses the host\'s @apack/ui instead of bundling it', async () => {
    const { packDir, entry } = makePack(layout, [
      "import TiptapEditor from '@apack/ui/components/tiptap/TiptapEditor';",
      "import { useDebounce } from '@apack/ui/composables/useDebounce';",
      'export const ui = { TiptapEditor, useDebounce };',
    ].join('\n'));

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    // Left for the host to resolve, which is what gives the pack the app's instance
    expect(await bundleExternals(path.join(packDir, 'dist', 'fe.js'))).toEqual(
      expect.arrayContaining(['@apack/ui/components/tiptap/TiptapEditor', '@apack/ui/composables/useDebounce']));
    // No UI code: the editor's extensions, its styles or the debounce implementation
    expect(output).not.toMatch(/createExtensions|ProseMirror|clearTimeout/);
  });

  it('bundles @apack/ui with build.bundleUi and still leaves the shared SDK modules it imports to the host', async () => {
    const { packDir, entry } = makePack(layout,
      `import { createEditorClickHandler } from '@apack/ui/components/tiptap/composables/createEditorClickHandler';\n` +
      `export const handler = createEditorClickHandler({ noteLinkClick() {}, imageClick() {} });\n`,
      { build: { bundleUi: true } },
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    expect(await bundleExternals(path.join(packDir, 'dist', 'fe.js'))).toContain('@apack/sdk/fe');
    expect(output).toContain('createEditorClickHandler');
  });

  it("uses the host's ProseMirror and tiptap menus when a pack bundles @apack/ui", async () => {
    const { packDir, entry } = makePack(layout,
      "import TiptapEditor from '@apack/ui/components/tiptap/TiptapEditor';\nexport default TiptapEditor;\n",
      { build: { bundleUi: true } },
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    expect(await bundleExternals(path.join(packDir, 'dist', 'fe.js'))).toEqual(
      expect.arrayContaining(['@tiptap/pm/state', '@tiptap/vue-3/menus']));
    // prosemirror-model's own code (its content-expression error) isn't inlined
    expect(output).not.toContain('Invalid content for node');
  });

  it.each([
    { bundleUi: true, packConfig: false, generated: true },
    { bundleUi: true, packConfig: true, generated: true },
    { bundleUi: false, packConfig: false, generated: false },
  ])('generates the Tailwind classes @apack/ui components use (bundleUi: $bundleUi, own tailwind config: $packConfig)', async ({ bundleUi, packConfig, generated }) => {
    const { packDir, entry } = makePack(layout,
      "import TiptapEditor from '@apack/ui/components/tiptap/TiptapEditor';\nexport default TiptapEditor;\n",
      { build: { bundleUi } },
    );
    if (packConfig) {
      fs.writeFileSync(path.join(packDir, 'tailwind.config.js'), `export default { content: ['${packDir}/src/**/*.ts'] };\n`);
    }

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    const css = fs.readdirSync(path.join(packDir, 'dist')).filter((f) => f.endsWith('.css'))
      .map((f) => fs.readFileSync(path.join(packDir, 'dist', f), 'utf-8')).join('\n');
    // A class only @apack/ui templates use (TiptapSearchBar's input), not the pack's
    expect(css.includes('.placeholder-neutral-500::')).toBe(generated);
  });

  it('compiles no @apack/ui SFC when a pack bundles @apack/ui', async () => {
    const { packDir, entry } = makePack(layout,
      "import TiptapEditor from '@apack/ui/components/tiptap/TiptapEditor';\nexport default TiptapEditor;\n",
      { build: { bundleUi: true } },
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    const { sources } = JSON.parse(fs.readFileSync(path.join(packDir, 'dist', 'fe.js.map'), 'utf-8')) as { sources: string[] };
    const uiSources = sources.filter((source) => source.includes('@apack/ui/') || source.includes('apack-ui/'));
    population('@apack/ui sources in the pack bundle', uiSources);
    // @apack/ui ships compiled components, and a pack reads those whichever way it has the package
    expect(uiSources.filter((source) => /\.vue(\?|$)/.test(source))).toEqual([]);
  });

  it('drops the generated EARS facade from FE code that only uses the EARS constants', async () => {
    const { packDir, entry } = makePack(layout, `import { EARS } from './ears';\nexport const kind = EARS.Entity.Memo;\n`);
    // Shape of #generated/ears: the EARS namespace plus the pure typed-helpers factory call
    fs.writeFileSync(path.join(packDir, 'src', 'ears.ts'), [
      "export namespace EARS { export namespace Entity { export const Memo = 'Memo'; } }",
      "import { defineEars } from '@apack/ears';",
      "export const { qx, findById, findAll } = /*#__PURE__*/ defineEars<{ Memo: { text: string } }>();",
    ].join('\n'));

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error, result.error).toBeUndefined();
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    expect(output).not.toContain('defineEars');
    expect(output).toContain('Memo');
  });

  it('builds when SDK imports are left to the host', async () => {
    const { packDir, entry } = makePack(layout,
      `import { bindFeHost } from '@apack/sdk/runtime';\nimport { compareVersions } from '@apack/sdk/utils/pure';\n` +
      // What #generated/events imports: a pack's frontend sends through the host's transport
      `import { defineEvents } from '@apack/sdk/events';\n` +
      `export const x = [bindFeHost, compareVersions, defineEvents({})];\n`,
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(await bundleExternals(path.join(packDir, 'dist', 'fe.js'))).toEqual(
      expect.arrayContaining(['@apack/sdk/runtime', '@apack/sdk/events']));
  });
});

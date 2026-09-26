import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bundlePackFE } from '../../src/build/fe-bundler';
import { PACKAGES_BUILT, REPO_ROOT, installPublishedPackages } from '@app/publish-checks';

const EARS_SOURCE = path.join(REPO_ROOT, 'packages', 'abuddy-ears');
const SDK_SOURCE = path.join(REPO_ROOT, 'packages', 'abuddy-sdk');
const UI_SOURCE = path.join(REPO_ROOT, 'packages', 'abuddy-ui');
let installed: string | undefined;

const LAYOUTS = [
  // A pack resolves the packages' published dist whether they are linked from the workspace or installed
  { name: 'workspace install', earsDir: () => EARS_SOURCE, sdkDir: () => SDK_SOURCE, uiDir: () => UI_SOURCE, ext: 'js' },
  ...(PACKAGES_BUILT ? [{
    name: 'published package',
    earsDir: () => path.join(installed!, 'node_modules', '@abuddy', 'ears'),
    sdkDir: () => path.join(installed!, 'node_modules', '@abuddy', 'sdk'),
    uiDir: () => path.join(installed!, 'node_modules', '@abuddy', 'ui'),
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
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-fe-bundler-'));
  tmpDirs.push(packDir);
  fs.writeFileSync(path.join(packDir, 'package.json'), JSON.stringify({ name: 'fixture-pack', type: 'module' }));
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: 'fixture-pack', name: 'Fixture', version: '1.0.0', ...manifest }));
  fs.mkdirSync(path.join(packDir, 'node_modules', '@abuddy'), { recursive: true });
  fs.symlinkSync(layout.earsDir(), path.join(packDir, 'node_modules', '@abuddy', 'ears'), 'dir');
  fs.symlinkSync(layout.sdkDir(), path.join(packDir, 'node_modules', '@abuddy', 'sdk'), 'dir');
  fs.symlinkSync(layout.uiDir(), path.join(packDir, 'node_modules', '@abuddy', 'ui'), 'dir');
  fs.mkdirSync(path.join(packDir, 'src'));
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
      `import { onLog } from '@abuddy/sdk/logger';\nexport const subscribe = onLog;\n`,
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No host is bound');
    expect(result.error).toContain('Import chain: src/entry.ts → @abuddy/sdk/logger');
  });

  it('uses the host\'s @abuddy/ui instead of bundling it', async () => {
    const { packDir, entry } = makePack(layout, [
      "import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor';",
      "import { useDebounce } from '@abuddy/ui/composables/useDebounce';",
      'export const ui = { TiptapEditor, useDebounce };',
    ].join('\n'));

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    expect(output).toContain('window.__abuddy?.["@abuddy/ui/components/tiptap/TiptapEditor"]');
    expect(output).toContain('window.__abuddy?.["@abuddy/ui/composables/useDebounce"]');
    // No UI code: the editor's extensions, its styles or the debounce implementation
    expect(output).not.toMatch(/createExtensions|ProseMirror|clearTimeout/);
  });

  it('bundles @abuddy/ui with fe.bundleUi and proxies the shared SDK modules it imports', async () => {
    const { packDir, entry } = makePack(layout,
      `import { createEditorClickHandler } from '@abuddy/ui/components/tiptap/composables/createEditorClickHandler';\n` +
      `export const handler = createEditorClickHandler({ noteLinkClick() {}, imageClick() {} });\n`,
      { fe: { bundleUi: true } },
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    expect(output).toContain('window.__abuddy?.["sdkFe"]');
    expect(output).toContain('createEditorClickHandler');
  });

  it("uses the host's ProseMirror and tiptap menus when a pack bundles @abuddy/ui", async () => {
    const { packDir, entry } = makePack(layout,
      "import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor';\nexport default TiptapEditor;\n",
      { fe: { bundleUi: true } },
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    expect(output).toContain('window.__abuddy?.["@tiptap/pm/state"]');
    expect(output).toContain('window.__abuddy?.["@tiptap/vue-3/menus"]');
    // prosemirror-model's own code (its content-expression error) isn't inlined
    expect(output).not.toContain('Invalid content for node');
  });

  it.each([
    { bundleUi: true, packConfig: false, generated: true },
    { bundleUi: true, packConfig: true, generated: true },
    { bundleUi: false, packConfig: false, generated: false },
  ])('generates the Tailwind classes @abuddy/ui components use (bundleUi: $bundleUi, own tailwind config: $packConfig)', async ({ bundleUi, packConfig, generated }) => {
    const { packDir, entry } = makePack(layout,
      "import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor';\nexport default TiptapEditor;\n",
      { fe: { bundleUi } },
    );
    if (packConfig) {
      fs.writeFileSync(path.join(packDir, 'tailwind.config.js'), `export default { content: ['${packDir}/src/**/*.ts'] };\n`);
    }

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    const css = fs.readdirSync(path.join(packDir, 'dist')).filter((f) => f.endsWith('.css'))
      .map((f) => fs.readFileSync(path.join(packDir, 'dist', f), 'utf-8')).join('\n');
    // A class only @abuddy/ui templates use (TiptapSearchBar's input), not the pack's
    expect(css.includes('.placeholder-neutral-500::')).toBe(generated);
  });

  it('compiles no @abuddy/ui SFC when a pack bundles @abuddy/ui', async () => {
    const { packDir, entry } = makePack(layout,
      "import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor';\nexport default TiptapEditor;\n",
      { fe: { bundleUi: true } },
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    const { sources } = JSON.parse(fs.readFileSync(path.join(packDir, 'dist', 'fe.js.map'), 'utf-8')) as { sources: string[] };
    const uiSources = sources.filter((source) => source.includes('@abuddy/ui/') || source.includes('abuddy-ui/'));
    expect(uiSources.length).toBeGreaterThan(0);
    // @abuddy/ui ships compiled components, and a pack reads those whichever way it has the package
    expect(uiSources.filter((source) => /\.vue(\?|$)/.test(source))).toEqual([]);
  });

  it('drops the generated EARS facade from FE code that only uses the EARS constants', async () => {
    const { packDir, entry } = makePack(layout, `import { EARS } from './ears';\nexport const kind = EARS.Entity.Memo;\n`);
    // Shape of #generated/ears: the EARS namespace plus the pure typed-helpers factory call
    fs.writeFileSync(path.join(packDir, 'src', 'ears.ts'), [
      "export namespace EARS { export namespace Entity { export const Memo = 'Memo'; } }",
      "import { defineEars } from '@abuddy/ears';",
      "export const { qx, findById, findAll } = /*#__PURE__*/ defineEars<{ Memo: { text: string } }>();",
    ].join('\n'));

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error, result.error).toBeUndefined();
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    expect(output).not.toContain('defineEars');
    expect(output).toContain('Memo');
  });

  it('builds when SDK imports go through host-shared proxies', async () => {
    const { packDir, entry } = makePack(layout,
      `import { bindFeHost } from '@abuddy/sdk/runtime';\nimport { compareVersions } from '@abuddy/sdk/utils/pure';\n` +
      // What #generated/events imports: a pack's frontend sends through the host's transport
      `import { defineEvents } from '@abuddy/sdk/events';\n` +
      `export const x = [bindFeHost, compareVersions, defineEvents({})];\n`,
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    expect(output).toContain('window.__abuddy?.["sdkRuntime"]');
    expect(output).toContain('window.__abuddy?.["sdkEvents"]');
  });
});

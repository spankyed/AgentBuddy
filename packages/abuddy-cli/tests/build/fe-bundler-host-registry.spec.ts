import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bundlePackFE } from '../../src/build/fe-bundler';
import { PACKAGES_BUILT, REPO_ROOT, installPublishedPackages } from '../helpers/published-packages';

const SDK_SOURCE = path.join(REPO_ROOT, 'packages', 'abuddy-sdk');
const UI_SOURCE = path.join(REPO_ROOT, 'packages', 'abuddy-ui');
let installed: string | undefined;

const LAYOUTS = [
  { name: 'workspace source', sdkDir: () => SDK_SOURCE, uiDir: () => UI_SOURCE, ext: 'ts' },
  ...(PACKAGES_BUILT ? [{
    name: 'published package',
    sdkDir: () => path.join(installed!, 'node_modules', '@abuddy', 'sdk'),
    uiDir: () => path.join(installed!, 'node_modules', '@abuddy', 'ui'),
    ext: 'js',
  }] : []),
];

beforeAll(() => {
  if (PACKAGES_BUILT) installed = installPublishedPackages();
}, 120_000);

afterAll(() => {
  if (installed) fs.rmSync(installed, { recursive: true, force: true });
});

const tmpDirs: string[] = [];

function makePack(layout: { sdkDir: () => string; uiDir: () => string }, entrySource: string): { packDir: string; entry: string } {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-fe-bundler-'));
  tmpDirs.push(packDir);
  fs.writeFileSync(path.join(packDir, 'package.json'), JSON.stringify({ name: 'fixture-pack', type: 'module' }));
  fs.mkdirSync(path.join(packDir, 'node_modules', '@abuddy'), { recursive: true });
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

describe.each(LAYOUTS)('bundlePackFE host registry guard ($name)', (layout) => {
  const { ext } = layout;
  it('fails when pack FE code inlines an SDK module that needs the host registry', async () => {
    const { packDir, entry } = makePack(layout,
      `import { createLogger } from '@abuddy/sdk/logger';\nexport const log = createLogger('fixture');\n`,
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SDK host module');
    expect(result.error).toContain(`Import chain: src/entry.ts → @abuddy/sdk/logger/index.${ext} → @abuddy/sdk/runtime/host.${ext}`);
  }, 60_000);

  it('inlines @abuddy/ui modules and proxies the shared SDK modules they import', async () => {
    const { packDir, entry } = makePack(layout,
      `import { createEditorClickHandler } from '@abuddy/ui/components/tiptap/composables/createEditorClickHandler';\n` +
      `export const handler = createEditorClickHandler({ noteLinkClick() {}, imageClick() {} });\n`,
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    expect(output).toContain('window.__abuddy.sdkFe');
    expect(output).toContain('createEditorClickHandler');
  }, 60_000);

  it('drops the generated EARS facade from FE code that only uses the EARS constants', async () => {
    const { packDir, entry } = makePack(layout, `import { EARS } from './ears';\nexport const kind = EARS.Entity.Memo;\n`);
    // Shape of #generated/ears: the EARS namespace plus the pure typed-helpers factory call
    fs.writeFileSync(path.join(packDir, 'src', 'ears.ts'), [
      "export namespace EARS { export namespace Entity { export const Memo = 'Memo'; } }",
      "import { defineEars } from '@abuddy/sdk/ears';",
      "export const { qx, findById, findAll } = /*#__PURE__*/ defineEars<{ Memo: { text: string } }>();",
    ].join('\n'));

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error, result.error).toBeUndefined();
    const output = fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8');
    expect(output).not.toContain('defineEars');
    expect(output).toContain('Memo');
  }, 60_000);

  it('builds when SDK imports go through host-shared proxies', async () => {
    const { packDir, entry } = makePack(layout,
      `import { trpc } from '@abuddy/sdk/rpc';\nimport { compareVersions } from '@abuddy/sdk/utils/pure';\n` +
      `export const x = [trpc, compareVersions];\n`,
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8')).toContain('window.__abuddy.sdkRpc');
  }, 60_000);
});

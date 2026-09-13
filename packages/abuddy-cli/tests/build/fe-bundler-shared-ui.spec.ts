import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as hostMonacoConfig from '@abuddy/ui/components/monaco-config';
import { bundlePackFE } from '../../src/build/fe-bundler';
import { REPO_ROOT } from '../helpers/published-packages';

/**
 * A pack's @abuddy/ui imports resolve to the host's modules at runtime, so stateful UI modules
 * (monaco-config's registered DSL libs, initialized languages, …) have one instance app-wide.
 */
const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  delete (globalThis as { window?: unknown }).window;
});

async function buildPack(manifest: Record<string, unknown>): Promise<Record<string, unknown>> {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-shared-ui-'));
  tmpDirs.push(packDir);
  fs.writeFileSync(path.join(packDir, 'package.json'), JSON.stringify({ name: 'shared-ui-pack', type: 'module' }));
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: 'shared-ui-pack', name: 'Shared UI', version: '1.0.0', ...manifest }));
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(packDir, 'node_modules'), 'dir');
  fs.mkdirSync(path.join(packDir, 'src'));
  const entry = path.join(packDir, 'src', 'entry.ts');
  fs.writeFileSync(entry, "export { getMonacoState, resetMonacoState } from '@abuddy/ui/components/monaco-config';\n");

  const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });
  expect(result.error).toBeUndefined();
  // What the renderer puts on window.__abuddy (virtual:host-deps)
  (globalThis as { window?: unknown }).window = {
    __abuddy: new Proxy({ '@abuddy/ui/components/monaco-config': hostMonacoConfig }, {
      get: (target, key) => (target as Record<string | symbol, unknown>)[key] ?? {},
    }),
  };
  return import(pathToFileURL(path.join(packDir, 'dist', 'fe.js')).href);
}

describe('pack FE code and @abuddy/ui state', () => {
  it("uses the host's instance of a stateful @abuddy/ui module", async () => {
    const pack = await buildPack({});
    expect(pack.getMonacoState).toBe(hostMonacoConfig.getMonacoState);
    expect(pack.resetMonacoState).toBe(hostMonacoConfig.resetMonacoState);
  }, 60_000);

  it('has its own instance with fe.bundleUi', async () => {
    const pack = await buildPack({ fe: { bundleUi: true } });
    expect(typeof pack.getMonacoState).toBe('function');
    expect(pack.getMonacoState).not.toBe(hostMonacoConfig.getMonacoState);
  }, 60_000);
});

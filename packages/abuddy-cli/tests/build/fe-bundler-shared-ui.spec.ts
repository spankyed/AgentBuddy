import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as hostMonacoConfig from '@abuddy/ui/components/monaco-config';
import * as hostSdkFe from '@abuddy/sdk/fe';
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

/** What the renderer puts on window.__abuddy (virtual:host-deps) */
const HOST_GLOBALS: Record<string, unknown> = { '@abuddy/ui/components/monaco-config': hostMonacoConfig, sdkFe: hostSdkFe };

async function buildPack(manifest: Record<string, unknown>, host: Record<string, unknown> = HOST_GLOBALS): Promise<Record<string, unknown>> {
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
  (globalThis as { window?: unknown }).window = { __abuddy: host };
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

  it("fails with a clear message on a host that doesn't provide the module", async () => {
    await expect(buildPack({}, {})).rejects.toThrow(/monaco-config isn't provided by this AgentBuddy/);
  }, 60_000);

  it('warns once per export an older host lacks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { getMonacoState: _, ...older } = hostMonacoConfig;
      const pack = await buildPack({}, { ...HOST_GLOBALS, '@abuddy/ui/components/monaco-config': older });
      expect(pack.getMonacoState).toBeUndefined();
      // once, which is the point of the test; the sentence around it is not
      expect(warn.mock.calls).toHaveLength(1);
      expect(warn.mock.calls[0]![0]).toMatch(/has no export "getMonacoState"/);
    } finally {
      warn.mockRestore();
    }
  }, 60_000);
});

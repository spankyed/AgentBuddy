import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bundlePackFE } from '../../src/build/fe-bundler';

const SDK_DIR = path.resolve(__dirname, '..', '..', '..', 'abuddy-sdk');

const tmpDirs: string[] = [];

function makePack(entrySource: string): { packDir: string; entry: string } {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-fe-bundler-'));
  tmpDirs.push(packDir);
  fs.writeFileSync(path.join(packDir, 'package.json'), JSON.stringify({ name: 'fixture-pack', type: 'module' }));
  fs.mkdirSync(path.join(packDir, 'node_modules', '@abuddy'), { recursive: true });
  fs.symlinkSync(SDK_DIR, path.join(packDir, 'node_modules', '@abuddy', 'sdk'), 'dir');
  fs.mkdirSync(path.join(packDir, 'src'));
  const entry = path.join(packDir, 'src', 'entry.ts');
  fs.writeFileSync(entry, entrySource);
  return { packDir, entry };
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('bundlePackFE host registry guard', () => {
  it('fails when pack FE code inlines an SDK module that needs the host registry', async () => {
    const { packDir, entry } = makePack(
      `import { createLogger } from '@abuddy/sdk/logger';\nexport const log = createLogger('fixture');\n`,
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SDK host module');
    expect(result.error).toMatch(/Import chain: src\/entry\.ts → @abuddy\/sdk\/logger\/index\.ts → @abuddy\/sdk\/runtime\/host\.ts/);
  }, 60_000);

  it('builds when SDK imports go through host-shared proxies', async () => {
    const { packDir, entry } = makePack(
      `import { trpc } from '@abuddy/sdk/rpc';\nimport { compareVersions } from '@abuddy/sdk/utils/pure';\n` +
      `export const x = [trpc, compareVersions];\n`,
    );

    const result = await bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: entry });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(packDir, 'dist', 'fe.js'), 'utf-8')).toContain('window.__abuddy.sdkRpc');
  }, 60_000);
});

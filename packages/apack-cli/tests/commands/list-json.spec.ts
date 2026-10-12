import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { resolveAppContext } from '@apackdev/sdk/env';
import { recordCliInstall } from '../../src/app/installed-packs';
import { list } from '../../src/commands/list';

it('prints one structured inventory for the selected data directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-list-json-'));
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubEnv('APACK_USER_DATA_DIR', root);
  vi.stubEnv('APACK_CLI_CHANNEL', 'production');
  try {
    const context = resolveAppContext({ env: 'production', userDataDir: root });
    await list(['--json']);
    expect(JSON.parse(output.mock.calls[0]![0]).packs).toEqual([]);
    expect(fs.existsSync(context.packsDir)).toBe(false);
    const dir = path.join(context.packsDir, 'demo');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'apack.json'), JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0', features: {} }));
    recordCliInstall(context.installedPacksFile, 'demo', 'owner/repo');
    output.mockClear();
    await list(['--json']);
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output.mock.calls[0]![0])).toMatchObject({ profile: 'production', packs: [{ id: 'demo', version: '1.0.0', enabled: true, source: 'owner/repo' }] });
    await expect(list(['--json', '--json'])).rejects.toThrow('Usage');
    fs.writeFileSync(path.join(dir, 'apack.json'), '{broken');
    await expect(list(['--json'])).rejects.toThrow();
  } finally { output.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); }
});

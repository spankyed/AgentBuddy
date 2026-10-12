import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { inspectApp } from '../../src/commands/doctor';

it('prints one structured report even when installation health fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-doctor-json-'));
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await expect(inspectApp('beta', { applications: root, dataDir: path.join(root, 'data'), json: true })).rejects.toThrow('health check failed');
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output.mock.calls[0]![0])).toMatchObject({
      channel: 'beta', healthy: false,
      checks: [{ label: 'Installation', ok: false }, { label: 'Data directory', ok: true }, { label: 'Runtime', ok: true }],
    });
    expect(fs.existsSync(path.join(root, 'data'))).toBe(false);
  } finally { output.mockRestore(); fs.rmSync(root, { recursive: true, force: true }); }
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { findDatabaseWriter, publishRunningApp } from '@apackdev/host/database';
import { withPackMutation } from '../../src/app/pack-mutation';

it('serializes pack changes with database writes and refuses a running app', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-pack-mutation-'));
  const context = resolveAppEnvironment({ env: 'production', userDataDir: root });
  const run = vi.fn();
  try {
    await withPackMutation(context, 'install', async () => {
      expect(findDatabaseWriter(root)).not.toBeNull();
      await expect(withPackMutation(context, 'uninstall', run)).rejects.toThrow();
      expect(run).not.toHaveBeenCalled();
    });
    expect(findDatabaseWriter(root)).toBeNull();
    const stop = publishRunningApp(root);
    try {
      await expect(withPackMutation(context, 'install', run)).rejects.toThrow('Quit the app');
      expect(run).not.toHaveBeenCalled();
      expect(findDatabaseWriter(root)).toBeNull();
    } finally { stop(); }
    await expect(withPackMutation(context, 'upgrade', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect(findDatabaseWriter(root)).toBeNull();
    await withPackMutation(context, 'uninstall', run);
    expect(run).toHaveBeenCalledOnce();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

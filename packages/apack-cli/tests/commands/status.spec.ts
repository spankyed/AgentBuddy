import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { appStatus } from '../../src/commands/status';

it('reports an absent app without creating its installation or data directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-status-'));
  try {
    const dataDir = path.join(root, 'data');
    expect(appStatus('preview', { applications: root, dataDir })).toMatchObject({
      channel: 'preview', installed: false, version: null, running: false, dataDir,
      appPath: path.join(root, 'apack Preview.app'),
    });
    expect(fs.existsSync(dataDir)).toBe(false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

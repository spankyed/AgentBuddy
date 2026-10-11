import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root: string;
vi.mock('../../src/app/pack-host', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/app/pack-host')>(),
  cliDirs: () => ({ cache: path.join(root, 'cache'), data: path.join(root, 'data') }),
  resolveRepositoryHost: () => ({ kind: 'source', root }),
}));
vi.mock('../../src/app/profile-secrets.ts', () => ({
  copySecretsInto: () => { throw new Error('secret copy failed'); },
}));
import { holdSession } from '../../src/commands/dev';
import { drive } from '../../src/commands/drive';
import { publishSession } from '@apackdev/host/dev-session';
import { listProfiles } from '../../src/app/profiles';

const signals = ['SIGINT', 'SIGTERM'] as const;
let exitListeners: NodeJS.ExitListener[];
let listeners: { event: NodeJS.Signals; before: NodeJS.SignalsListener[] }[];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-cleanup-'));
  fs.mkdirSync(path.join(root, 'packages'));
  fs.writeFileSync(path.join(root, 'packages/entry-point.mjs'), '');
  fs.mkdirSync(path.join(root, 'drive'));
  fs.writeFileSync(path.join(root, 'drive/look.ts'), '');
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  for (const key of ['APACK_HOST', 'APACK_HOST_ROOT', 'APACK_HOST_EXECUTABLE', 'APACK_APP', 'APACK_CHANNEL', 'APACK_BUILD']) {
    vi.stubEnv(key, undefined);
  }
  exitListeners = process.listeners('exit');
  listeners = signals.map(event => ({ event, before: process.listeners(event) }));
});
afterEach(() => {
  for (const listener of process.listeners('exit')) {
    if (!exitListeners.includes(listener)) process.removeListener('exit', listener);
  }
  for (const { event, before } of listeners) {
    for (const listener of process.listeners(event)) {
      if (!before.includes(listener)) process.removeListener(event, listener);
    }
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each(['open', 'drive'])('cleans an ephemeral %s profile when secret copying fails', async operation => {
  const args = ['--fresh', '--rm', '--with-secrets'];
  const run = operation === 'open' ? holdSession(args, 'app') : drive(args);
  await expect(run).rejects.toThrow('secret copy failed');
  expect(listProfiles({ cache: path.join(root, 'cache'), data: path.join(root, 'data') })).toEqual([]);
});

it.each(['--rm', '--with-secrets'])('refuses %s when a live question would only attach', async flag => {
  const dataDir = path.join(root, 'data/profiles/work');
  fs.mkdirSync(dataDir, { recursive: true });
  publishSession({ host: { kind: 'source', root }, env: 'development', dataDir,
    debugPort: 1234, supervisorPid: process.pid, startedBy: 'dev' });
  await expect(drive(['--state', '--spawn', '--profile', 'work', flag])).rejects.toThrow('require a new session');
  expect(fs.existsSync(path.join(dataDir, 'session.json'))).toBe(true);
});

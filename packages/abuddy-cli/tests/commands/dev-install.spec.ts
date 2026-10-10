import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const installPackFromLocal = vi.fn(async () => ({ dir: '/installed', missingDependencies: [] }));
vi.mock('@abuddy/host/packs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@abuddy/host/packs')>()),
  installPackFromLocal,
}));

let userDataDir: string;
vi.mock('@abuddy/sdk/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@abuddy/sdk/env')>()),
  resolveAppContext: () => ({
    env: 'development', userDataDir, packsDir: path.join(userDataDir, 'packs'),
    apiPortFile: path.join(userDataDir, 'api-port'), apiTokenFile: path.join(userDataDir, 'api-token'),
  }),
}));

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-install-'));
  installPackFromLocal.mockClear();
});
afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

describe('abuddy dev', () => {
  it("installs with the version and pack format of the dev app that last used the data dir, so both are checked", async () => {
    const { recordHostInfo } = await import('@abuddy/host/packs');
    recordHostInfo(userDataDir, { version: '0.9.1', packFormat: 3 });
    const { installToApp } = await import('../../src/commands/dev');

    await installToApp('/pack');

    expect(installPackFromLocal).toHaveBeenCalledWith('/pack', path.join(userDataDir, 'packs'), { hostVersion: '0.9.1', packFormat: 3 });
  });

  it('reads the version at each install, as the dev app may start in between', async () => {
    const { recordHostInfo } = await import('@abuddy/host/packs');
    const { installToApp } = await import('../../src/commands/dev');
    await installToApp('/pack');
    recordHostInfo(userDataDir, { version: '1.0.0', packFormat: 1 });
    await installToApp('/pack');

    expect(installPackFromLocal.mock.calls.map((call) => (call as unknown[])[2])).toEqual([
      { hostVersion: undefined, packFormat: undefined },
      { hostVersion: '1.0.0', packFormat: 1 },
    ]);
  });
});

describe('abuddy dev reloads', () => {
  /** A stand-in for the dev app's API, recording each reload request */
  async function fakeApi(status: number): Promise<{ port: number; requests: Array<{ url?: string; token?: string | string[]; body: string }>; close: () => void }> {
    const requests: Array<{ url?: string; token?: string | string[]; body: string }> = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        requests.push({ url: req.url, token: req.headers['x-abuddy-api-token'], body });
        res.writeHead(status).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { port: (server.address() as { port: number }).port, requests, close: () => server.close() };
  }

  it("send the pack id with the token from the dev app's token file", async () => {
    const { API_TOKEN_HEADER } = await import('@abuddy/sdk/utils/pure');
    expect(API_TOKEN_HEADER).toBe('x-abuddy-api-token');
    const api = await fakeApi(200);
    try {
      fs.writeFileSync(path.join(userDataDir, 'api-port'), JSON.stringify({ port: api.port, pid: process.pid }));
      fs.writeFileSync(path.join(userDataDir, 'api-token'), 'the-dev-token\n');
      const { reloadPack } = await import('../../src/build/dev-reload.ts');

      expect(await reloadPack('my-pack')).toEqual({ status: 'reloaded' });
      expect(api.requests).toEqual([{ url: '/dev/reload', token: 'the-dev-token', body: JSON.stringify({ packId: 'my-pack' }) }]);
    } finally {
      api.close();
    }
  });

  // Each of these needs something different of the author — start the app, read its logs, look at what
  // holds the port — so the status alone was not enough to act on
  it('report a refused reload, a missing port or token file, and an app that no longer answers, and say which', async () => {
    const { reloadPack } = await import('../../src/build/dev-reload.ts');
    expect(await reloadPack('my-pack')).toMatchObject({ status: 'not-running', detail: expect.stringContaining('api-port') });

    const api = await fakeApi(403);
    fs.writeFileSync(path.join(userDataDir, 'api-port'), JSON.stringify({ port: api.port, pid: process.pid }));
    expect(await reloadPack('my-pack'), 'no token file')
      .toMatchObject({ status: 'not-running', detail: expect.stringContaining('api-token') });
    fs.writeFileSync(path.join(userDataDir, 'api-token'), '\n');
    expect(await reloadPack('my-pack'), 'an empty token file')
      .toMatchObject({ status: 'not-running', detail: expect.stringContaining('is empty') });
    fs.writeFileSync(path.join(userDataDir, 'api-token'), 'the-dev-token');
    try {
      expect(await reloadPack('my-pack')).toMatchObject({ status: 'failed', detail: expect.stringContaining('403') });
    } finally {
      api.close();
    }
    expect(await reloadPack('my-pack')).toMatchObject({ status: 'unreachable', detail: expect.stringContaining(`127.0.0.1:${api.port}`) });
  });
});

/**
 * `dev` does not decide the environment, the app does — which is what keeps production out of reach. A
 * packaged build stamps its own channel at build time, so the only two answers are a checkout's
 * `development` and a Beta's `beta`, and no flag or variable this command reads adds a third.
 */
describe('the environment abuddy dev targets', () => {
  it('follows the app it resolved', async () => {
    const { appEnv } = await import('../../src/commands/dev');
    expect(appEnv({ kind: 'source', root: '/repo' })).toBe('development');
    expect(appEnv({ kind: 'packaged', executable: '/Applications/AgentBuddy Beta.app', version: '0.4.0-beta.1' }))
      .toBe('beta');
  });

  it('never targets production', async () => {
    const { appEnv } = await import('../../src/commands/dev');
    const every = [
      { kind: 'source', root: '/repo' },
      { kind: 'packaged', executable: '/Applications/AgentBuddy Beta.app', version: '0.4.0-beta.1' },
    ] as const;
    expect(every.map(appEnv)).not.toContain('production');
  });
});

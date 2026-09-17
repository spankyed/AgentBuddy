// The API takes calls only from clients with its token, which Electron main creates for each app run: the app's
// windows send it when connecting, local tools with POST /dev/reload. A web page (the in-app browser's included)
// can't learn it. /dev/reload is also only for development and test apps, and the server listens on loopback only.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-dev-reload-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
process.env.ABUDDY_API_TOKEN = 'the-run-token';
const { API_HOST, acceptsConnection, devReloadRefusal } = await import('@/setup/websocket');
const { apiToken, isApiToken } = await import('@/setup/config');
const { API_TOKEN_HEADER } = await import('@abuddy/sdk/env');
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const TOKEN = 'the-run-token';
const withToken = (token: string) => ({ [API_TOKEN_HEADER]: token });

describe('the API token', () => {
  it("is the app run's, and the API refuses to start without one", () => {
    expect(apiToken()).toBe(TOKEN);
    delete process.env.ABUDDY_API_TOKEN;
    try {
      expect(() => apiToken()).toThrow('ABUDDY_API_TOKEN is unset');
    } finally {
      process.env.ABUDDY_API_TOKEN = TOKEN;
    }
  });

  it('matches only itself', () => {
    expect(isApiToken(TOKEN, TOKEN)).toBe(true);
    expect(isApiToken('the-run-toke', TOKEN)).toBe(false);
    expect(isApiToken('the-run-tokenX', TOKEN)).toBe(false);
    expect(isApiToken('', TOKEN)).toBe(false);
    expect(isApiToken(undefined, TOKEN)).toBe(false);
  });
});

describe('WebSocket connections', () => {
  it('open with the token in the URL', () => {
    expect(acceptsConnection(`/?token=${TOKEN}`, TOKEN)).toBe(true);
    expect(acceptsConnection(`/?token=${encodeURIComponent('a b&c')}`, 'a b&c')).toBe(true);
  });

  it('are refused without it, or with another', () => {
    expect(acceptsConnection('/', TOKEN)).toBe(false);
    expect(acceptsConnection(undefined, TOKEN)).toBe(false);
    expect(acceptsConnection('/?token=guess', TOKEN)).toBe(false);
  });
});

describe('POST /dev/reload', () => {
  it('is taken with the token by a development or test app', () => {
    expect(devReloadRefusal(withToken(TOKEN), 'development', TOKEN)).toBeNull();
    expect(devReloadRefusal(withToken(TOKEN), 'test', TOKEN)).toBeNull();
    // The app environment and the token default to the process's
    expect(devReloadRefusal(withToken(TOKEN))).toBeNull();
  });

  it('is refused without the token, or with another', () => {
    expect(devReloadRefusal({}, 'development', TOKEN)).toMatch(/token is missing or wrong/);
    expect(devReloadRefusal(withToken('guess'), 'development', TOKEN)).toMatch(/token is missing or wrong/);
  });

  it('is refused by a production or beta app, token or not', () => {
    expect(devReloadRefusal(withToken(TOKEN), 'production', TOKEN)).toMatch(/development builds \(this one is production\)/);
    expect(devReloadRefusal(withToken(TOKEN), 'beta', TOKEN)).toMatch(/this one is beta/);
  });
});

it('listens on loopback only', () => {
  expect(API_HOST).toBe('127.0.0.1');
});

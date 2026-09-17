// POST /dev/reload reloads a pack's runtime. Only a development or test app takes it, and only from a local tool:
// a web page (the in-app browser's included) sends an Origin header and is refused. The server listens on loopback only.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-dev-reload-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { API_HOST, devReloadRefusal } = await import('@/setup/websocket');
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('POST /dev/reload', () => {
  it('is taken from a local tool by a development or test app', () => {
    expect(devReloadRefusal({ 'content-type': 'application/json' }, 'development')).toBeNull();
    expect(devReloadRefusal({}, 'test')).toBeNull();
  });

  it('is refused by a production or beta app', () => {
    expect(devReloadRefusal({}, 'production')).toMatch(/development builds \(this one is production\)/);
    expect(devReloadRefusal({}, 'beta')).toMatch(/this one is beta/);
  });

  it('is refused from a web page, which sends an Origin', () => {
    expect(devReloadRefusal({ origin: 'https://example.com' }, 'development')).toMatch(/not web pages/);
    expect(devReloadRefusal({ origin: 'null' }, 'test')).toMatch(/not web pages/);
  });

  it('reads the app environment when none is given', () => {
    expect(devReloadRefusal({})).toBeNull();
  });

  it('listens on loopback only', () => {
    expect(API_HOST).toBe('127.0.0.1');
  });
});

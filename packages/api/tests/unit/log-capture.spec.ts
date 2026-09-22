// The API prints each log event once, whether it comes from @abuddy/sdk/logger, an error report or a console call,
// and every one of them reaches the log event stream
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-log-capture-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('@/runtime');
const { store } = openAppStore();
const { createLogger, reportError } = await import('@abuddy/sdk/logger');
const { rootEvents } = await import('@/transport/emitter');
const { originalConsole, initializeLogCapture, restoreConsole } = await import('@/adapters/logging');

afterAll(() => {
  store.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('log capture', () => {
  it('prints each log event once, and emits one event per entry', () => {
    const printed = (['log', 'debug', 'warn', 'error'] as const).map((method) => vi.spyOn(originalConsole, method).mockImplementation(() => {}));
    const logged: Array<{ level: string; message: string; source?: string }> = [];
    const stop = rootEvents.onLog((event) => { logged.push(event); });
    initializeLogCapture();
    try {
      createLogger('spec').info('from the logger', { id: 1 });
      console.warn('from the console', 2);
      console.log('logged');
      reportError({ error: new Error('boom'), source: 'spec' });
    } finally {
      restoreConsole();
      stop();
    }
    const [log, debug, warn, error] = printed.map((spy) => spy.mock.calls);
    vi.restoreAllMocks();

    expect(log).toEqual([['[spec]', 'from the logger', { id: 1 }], ['logged']]);
    expect(warn).toEqual([['from the console 2']]);
    expect(error).toEqual([['[spec]', 'boom', expect.objectContaining({ severity: 'error' })]]);
    expect(debug).toEqual([]);
    expect(logged.map(({ level, message, source }) => ({ level, message, source }))).toEqual([
      { level: 'info', message: 'from the logger', source: 'spec' },
      { level: 'warn', message: 'from the console 2', source: undefined },
      { level: 'info', message: 'logged', source: undefined },
      { level: 'error', message: 'boom', source: 'spec' },
    ]);
  });
});

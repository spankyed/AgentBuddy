// The __NAME__ system under the app's bus, without the app (@apack/testing/harness)
import { describe, expect, it } from 'vitest';
import { startApp } from '@apack/testing/harness';

describe('__NAME__ system', () => {
  it('sends its connected data when a client connects', async () => {
    const app = await startApp({ systems: ['__NAME__'] });
    await app.connect();
    expect(await app.nextEmit('__NAME__', '__CONNECTED_EVENT__')).toMatchObject({ data: {} });
  });
});

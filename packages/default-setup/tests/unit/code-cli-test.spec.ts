// Testing a CLI provider belongs to the code feature: `resolve-cli` is its own, and so are the stored paths
// (`plugins['default-setup/code'].cliPaths`). The Settings view asks for it and is told the result, which is why
// the code system declares the send (abuddy.json `sendsTo`). It lived in the settings system until settings
// became the app's.
//
// What this covers is the routing, not `resolve-cli`: whether a CLI is on this machine's PATH is not the
// system's behaviour, so the case that asserts an outcome is the one that needs no CLI at all.
import { describe, expect, it } from 'vitest';
import { services } from '@/__generated__/services';
import { ref } from '@/__generated__/ref';
import { startApp } from '@abuddy/testing/harness';

const cliPaths = () => services.settings.forFeature<{ cliPaths?: Record<string, string> }>(ref('code')).cliPaths ?? {};

describe('TEST_CLI_PROVIDER', () => {
  // A name no CLI answers to is the user's to fix, so it is answered rather than reported as a system error
  it('answers an unknown provider on the settings plugin, and stores nothing', async () => {
    const app = await startApp({ systems: ['code', 'host/settings'] });
    await app.connect();

    await app.send('code', { type: 'TEST_CLI_PROVIDER', provider: 'not-a-cli' });

    expect(await app.nextEmit('host/settings', 'CLI_TEST_RESULT')).toMatchObject({
      type: 'CLI_TEST_RESULT', provider: 'not-a-cli', success: false, error: 'Unknown CLI provider: not-a-cli',
    });
    expect(cliPaths()['not-a-cli']).toBeUndefined();
  });

  // The move's real risk: the code system takes the event at all, and its answer reaches the settings plugin
  // rather than its own. Whether the CLI is found depends on the machine, so only the address is asserted.
  it('takes a known provider and answers the settings plugin, not its own', async () => {
    const app = await startApp({ systems: ['code', 'host/settings'] });
    await app.connect();

    await app.send('code', { type: 'TEST_CLI_PROVIDER', provider: 'claude' });

    expect(await app.nextEmit('host/settings', 'CLI_TEST_RESULT')).toMatchObject({ type: 'CLI_TEST_RESULT', provider: 'claude' });
    expect(app.emitted('code').filter((e) => e.type === 'CLI_TEST_RESULT')).toEqual([]);
  });
});

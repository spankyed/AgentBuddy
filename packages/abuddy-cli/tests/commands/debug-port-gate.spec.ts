// The single assertion standing between this design and an open port on a user's installed app.
//
// `--remote-debugging-port` is unauthenticated control of the renderer, and the renderer holds the app's API
// token — so what decides it has to be the resolved environment and nothing else. Its subject is input, so
// it needs a case that *fires*: `development` is the only answer that gets a port, and the three that must
// not are what this asserts.
import { describe, expect, it } from 'vitest';
import { debugPortArgs } from '../../src/commands/dev';

describe('the debug port', () => {
  it('is given to a development app', () => {
    expect(debugPortArgs({ env: 'development' })).toEqual(['--remote-debugging-port=0']);
  });

  it.each(['production', 'beta', 'test'] as const)('is refused to a %s app', (env) => {
    expect(debugPortArgs({ env })).toEqual([]);
  });

  /**
   * A profile is storage, never identity: `--profile probe` on a production app is still production, and a
   * data dir cannot earn a port. This is the case that would fail if the gate ever read the place's dir — the
   * one field a caller controls freely — rather than asking the resolver what the app *is*.
   */
  it('is not earned by naming a data dir', () => {
    expect(debugPortArgs({ env: 'production', userDataDir: '/tmp/anything' })).toEqual([]);
    expect(debugPortArgs({ env: 'test', userDataDir: '/tmp/anything' })).toEqual([]);
  });

  /**
   * `0`, never a number. Chromium picks a free port and writes it where the launcher reads it; a fixed one
   * collides with whatever holds it and with a second app, and a port named here would be a port someone
   * could arrange to be listening on first.
   */
  it('asks Chromium to choose, rather than naming one', () => {
    expect(debugPortArgs({ env: 'development' })).toEqual([expect.stringMatching(/=0$/)]);
  });
});

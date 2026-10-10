// What makes `--spawn` safe to point at the development data dir.
//
// One app per data dir, and the app exits on the second — so a spawned one-shot that kept the dir would make
// the developer's own `abuddy dev` refuse, with the blame landing on the command they just ran. `dev` takes
// it back; the question is only *whose* app it may take, and the answer has to be "one a tool started for
// itself" and nothing else. Both halves, because reclaiming unconditionally is the failure.
import { describe, expect, it } from 'vitest';
import { mayReclaim } from '../../src/commands/dev';
import type { DevSession } from '@abuddy/host/dev-session';

const session = (startedBy: DevSession['startedBy']): DevSession => ({
  debugPort: 51873, dataDir: '/tmp/whatever', supervisorPid: process.pid, startedBy,
});

describe('what dev may reclaim', () => {
  it('takes an app a question started', () => {
    expect(mayReclaim(session('drive'))).toBe(true);
  });

  // A person's app is not a tool's to take. This is the case an unconditional reclaim would break, and the
  // one that matters most: what it protects is a window somebody is looking at
  it('leaves an app a person started', () => {
    expect(mayReclaim(session('dev'))).toBe(false);
  });

  /**
   * No session is no app. `readSession` already answers nothing for a record whose supervisor has gone, for
   * a malformed one and for an absent one, so every one of those arrives here as `undefined` — and the
   * answer must be the one that launches rather than the one that signals a pid out of a file it could not
   * read.
   */
  it('reclaims nothing when there is no session', () => {
    expect(mayReclaim(undefined)).toBe(false);
  });
});

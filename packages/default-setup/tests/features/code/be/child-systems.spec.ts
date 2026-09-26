// The code system spawns a child per panel (explorer, search, commit, …), each claiming a system id other
// systems route events to. XState tracks a parent's children by their own id, so each spawn names one:
// without it they share a key, the parent holds only the last, and stopping it leaves the rest running with
// their system ids taken — which is what a pack reload then collides with.
import { describe, expect, it } from 'vitest';
import { startApp } from '@abuddy/testing/harness';

describe('the code system’s child systems', () => {
  it('are tracked by their own ids, and released when it stops', async () => {
    const app = await startApp({ systems: ['code'] });
    const children = app.system('code').getSnapshot().children as Record<string, unknown>;

    const keys = Object.keys(children);
    expect(keys, `children were ${JSON.stringify(keys)}`).not.toContain('undefined');
    expect(new Set(keys).size, 'each child holds its own id').toBe(keys.length);
    expect(keys.length).toBeGreaterThan(1);

    app.stop();

    // A stopped system releases every id it and its children held, so the next start can claim them again
    const restarted = await startApp({ systems: ['code'] });
    expect(Object.keys(restarted.system('code').getSnapshot().children as Record<string, unknown>).sort())
      .toEqual([...keys].sort());
  });
});

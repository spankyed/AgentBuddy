import { describe, expect, it } from 'vitest';
import {
  ENGINE_READY,
  engineRecipe,
  RECIPE_READ_PATH,
  RECIPE_WRITE_PATH,
  type EngineMarker,
} from '../../src/engine/marker.ts';

/**
 * The printed recipe, which is the first thing an agent copies.
 *
 * It listed the verbs by hand and had drifted four ways: `/qx` and `/system` were gone, `/tx` had been
 * renamed, the three drains had become POST while it still said GET, and eleven verbs added after it was
 * written were missing. The first line it printed was a 404. So the list is derived from the table the
 * engine answers from, and these cases are about that derivation rather than about any particular verb.
 */

const MARKER: EngineMarker = { port: 4321, token: 'a-token', pid: 99, host: '127.0.0.1' };
const recipe = (verbs: Record<string, { readonly method: string }>) =>
  engineRecipe('drive/results/engine.json', MARKER, 'x-token', verbs);

describe('the engine recipe', () => {
  it('groups the table it was given by method', () => {
    const lines = recipe({
      '/state': { method: 'GET' },
      '/query': { method: 'POST' },
      '/events': { method: 'POST' },
    });

    expect(lines).toContain('POST /events /query');
    expect(lines).toContain('GET  /state');
  });

  /**
   * A drain reads *and clears*, so it is a POST despite being a read — the one place the vocabulary makes
   * an exception. A recipe that called it GET sent an agent to a 405.
   */
  it('prints a verb under the method it actually answers, not the one it reads like', () => {
    const lines = recipe({ '/drops': { method: 'POST' }, '/state': { method: 'GET' } });

    expect(lines).toContain('POST /drops');
    expect(lines).not.toContain('GET  /drops');
  });

  it("includes a caller's own verbs, since the table it is given already holds them", () => {
    expect(recipe({ '/note': { method: 'POST' }, '/state': { method: 'GET' } })).toContain('/note');
  });

  it('shows the address, the marker path and a curl for each of the two shapes', () => {
    const lines = recipe({ '/state': { method: 'GET' }, '/query': { method: 'POST' } });

    expect(lines).toContain('http://127.0.0.1:4321');
    expect(lines).toContain('drive/results/engine.json');
    // the token is substituted from the marker rather than printed into whatever captures this
    expect(lines).toContain('-H "x-token: $(node -p "require(\'./drive/results/engine.json\').token")"');
    expect(lines).toContain(`${RECIPE_READ_PATH} -H`);
    expect(lines).toContain(`${RECIPE_WRITE_PATH} -H`);
  });

  it('prints nothing for a method the table has none of, rather than an empty list', () => {
    expect(recipe({ '/state': { method: 'GET' } })).not.toContain('POST \n');
  });
});

/**
 * The ready line is a readiness signal something waits for, so the recipe has to keep printing it.
 *
 * `abuddy drive --eval` starts a session and reads this off its stdout. Reword the first line of
 * `engineRecipe` without moving `ENGINE_READY` and every one-shot hangs to its 180s deadline with no other
 * symptom — which is the edit this case exists to fail.
 */
it('opens the recipe with the line a parent waits for', () => {
  const recipe = engineRecipe(
    '/tmp/run/drive/results/engine.json',
    { host: '127.0.0.1', port: 1234, token: 't', pid: 9 },
    'x-abuddy-drive-token',
    { '/state': { method: 'GET' } },
  );

  expect(recipe.split('\n')[0]).toContain(ENGINE_READY);
});

// The shape of the drive wire: what a reader may assume when guessing a verb they have not used.
//
// Guessing is the whole value. An agent that has called `/query` should be able to reach for `/transact`
// and for `{ code }` without reading the table again — which is exactly what the surface did not allow:
// `/eval` took `body` where `/query` took `code`, `/state` answered with `activePluginId` while the only
// verb consuming a plugin rejected that name, and `/send` and `/system` were two verbs for one act.
import { describe, expect, it, vi } from 'vitest';
import { answer, engineVerbs, ENGINE_TOKEN_HEADER } from '../../src/engine/server.ts';
import { engineRecipe, RECIPE_READ_PATH, RECIPE_WRITE_PATH } from '../../src/engine/marker.ts';
import type { EngineResult, EngineSession } from '../../src/engine/session.ts';

const TOKEN = 'a-token';

/**
 * What each path is, which is what decides its method.
 *
 * - `reads` — answers and changes nothing, so it is a GET and a retry is free.
 * - `verb` — does something, so it is a POST.
 * - `drain` — answers *and* clears, so it is a POST named for what it drains. The one place a POST is a
 *   noun, because the alternative is a GET whose second call answers differently, and that is worse than
 *   an irregular name. Three of them and no more: a fourth is a decision, not a default.
 */
const SHAPES: Record<string, 'reads' | 'verb' | 'drain'> = {
  '/eval': 'verb',
  '/send': 'verb',
  '/query': 'verb',
  '/transact': 'verb',
  '/wait': 'verb',
  '/navigate': 'verb',
  '/plugin': 'verb',
  '/click': 'verb',
  '/fill': 'verb',
  '/press': 'verb',
  '/logs': 'verb',
  '/set-setting': 'verb',
  '/screenshot': 'verb',
  '/reload': 'verb',
  '/close': 'verb',
  '/set-viewport': 'verb',
  '/state': 'reads',
  '/snapshot': 'reads',
  '/settings': 'reads',
  '/viewport': 'reads',
  '/events': 'drain',
  '/drops': 'drain',
  '/errors': 'drain',
};

/**
 * Every field name the wire uses, in requests and in responses alike.
 *
 * Closed on purpose: a verb that wants a field outside it is either reusing a concept under a new name —
 * the defect this list exists to stop — or introducing one, which is a line here and a moment's thought.
 */
const VOCABULARY = [
  'code',      // any source the session runs: in the window, or against the database
  'event',     // a bus event
  'to',        // a system's ref
  'plugin',    // a plugin's ref, in requests and in responses alike
  'section',   // a settings section a pack registered, which is the other place a setting lives
  'path',      // a dotted path into a structure, to read one part of it or to write one
  'state',     // a dotted path through a machine's state
  'selector',  // a CSS selector into the page
  'text',      // what to type
  'key',       // what to press
  'since',     // a line the caller already saw, so the answer is what followed it
  'source',    // which part of the app a log line came from
  'name',      // a file name
  'timeoutMs',
  'value',     // what to write
  'width',     // a size in pixels, in requests and in responses alike
  'height',
] as const;

/** A session whose every verb answers, so what the assertions see is the table rather than the app */
function fakeSession() {
  const ok = (): EngineResult => ({ ok: true, value: null });
  return {
    ready: vi.fn(async () => undefined),
    evaluate: ok, send: ok, system: ok, qx: ok, tx: ok, state: ok, wait: ok, navigate: ok,
    screenshot: ok, reload: ok, drainEvents: ok, drainDrops: ok, drainErrors: ok, close: ok,
    plugin: ok, click: ok, fill: ok, press: ok, snapshot: ok, logs: ok, settings: ok, setSetting: ok,
    viewport: ok, setViewport: ok,
    stop: vi.fn(),
  } as unknown as EngineSession;
}

const verbs = () => engineVerbs(fakeSession());

/** Asks a path with an empty body, which is what makes a required field report itself */
const askEmpty = (path: string, method: string) => answer(
  verbs(),
  TOKEN,
  { method, url: path, headers: { [ENGINE_TOKEN_HEADER]: TOKEN } },
  async () => '{}',
);

describe('the drive wire', () => {
  it('classifies every path, and classifies nothing that is not one', () => {
    const paths = Object.keys(verbs()).sort();

    expect(paths.length, 'a table that walked nothing would satisfy every rule below').toBeGreaterThan(10);
    expect(paths).toEqual(Object.keys(SHAPES).sort());
  });

  it('answers a GET only where nothing changes', () => {
    for (const [path, verb] of Object.entries(verbs())) {
      expect(verb.method, `${path} is a ${SHAPES[path]}`).toBe(SHAPES[path] === 'reads' ? 'GET' : 'POST');
    }
  });

  /**
   * Every field the table reads, asked of the table rather than read out of its source.
   *
   * Two scans came before this and each was blind in its own way. The first asked every verb with an empty
   * body and read the field its error named, which sees exactly *one* field per verb because `required`
   * throws on the first one missing — six of thirteen names were declared below and never checked. The
   * second matched `(body, '<field>')` in `engineVerbs.toString()`, which is blind to any verb whose body
   * parameter is not literally named `body`, and `Verb` names no parameter. A verb declares its fields now
   * (`verb()`, `server.ts`), so there is nothing left to look for them in.
   */
  it('reads only fields in the shared vocabulary', () => {
    const read = [...new Set(Object.values(verbs()).flatMap((entry) => entry.fields))];

    expect(read.length, 'the table declared almost nothing, so this checked almost nothing').toBeGreaterThan(9);
    for (const field of read) {
      expect(VOCABULARY, `"${field}" is a new name for something; add it here or reuse a name`).toContain(field);
    }
  });

  /**
   * The behavioural half: a required field says its own name when it is missing, so the names a verb
   * declares are the ones a caller is actually told about. This is what keeps the declaration honest about
   * the readers — a verb could declare a field and ignore it, and this is where that would show.
   */
  it('names the field it wanted when a verb is asked with an empty body', async () => {
    const named: string[] = [];
    for (const [path, verb] of Object.entries(verbs())) {
      const { status, payload } = await askEmpty(path, verb.method);
      if (status !== 400) continue;
      const found = /"(\w+)"/.exec(String((payload as { error?: string }).error));
      expect(found, `${path} refused an empty body without naming the field it wanted`).not.toBeNull();
      named.push(found![1]);
    }

    expect(named.length, 'no verb required anything, so this checked nothing').toBeGreaterThan(4);
    expect(VOCABULARY).toEqual(expect.arrayContaining(named));
  });
});

/**
 * And what the session *prints* about itself, which is the only description of the wire most agents read.
 *
 * `marker.spec.ts` covers the derivation; this covers the half that needs the real table: that the two
 * paths the recipe shows a curl for are verbs that exist. Both were wrong at once before the recipe was
 * derived — it offered `/qx`, which had become `/query`, so the first line an agent copied answered 404.
 */
describe('the printed recipe', () => {
  const printed = () => engineRecipe('drive/results/engine.json', { port: 1, token: 't', pid: 2, host: '127.0.0.1' }, ENGINE_TOKEN_HEADER, verbs());

  it('shows a curl only for verbs that exist', () => {
    const table = verbs();

    for (const shown of [RECIPE_READ_PATH, RECIPE_WRITE_PATH]) {
      expect(Object.keys(table), `the recipe curls ${shown}, which is not a verb`).toContain(shown);
    }
  });

  it('shows each of those two under the method the table gives it', () => {
    const table = verbs();

    expect(table[RECIPE_READ_PATH]!.method, 'the read example is curled without a body').toBe('GET');
    expect(table[RECIPE_WRITE_PATH]!.method, 'the write example is curled with -d').toBe('POST');
  });

  it('lists every verb the table answers, and nothing it does not', () => {
    const listed = printed()
      .split('\n')
      .filter((line) => /^\s+(POST|GET)\s/.test(line))
      .flatMap((line) => line.trim().split(/\s+/).slice(1));

    expect(listed.sort()).toEqual(Object.keys(verbs()).sort());
  });
});

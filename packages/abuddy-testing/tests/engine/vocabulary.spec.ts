// The shape of the drive wire: what a reader may assume when guessing a verb they have not used.
//
// Guessing is the whole value. An agent that has called `/query` should be able to reach for `/transact`
// and for `{ code }` without reading the table again — which is exactly what the surface did not allow:
// `/eval` took `body` where `/query` took `code`, `/state` answered with `activePluginId` while the only
// verb consuming a plugin rejected that name, and `/send` and `/system` were two verbs for one act.
import { describe, expect, it, vi } from 'vitest';
import { answer, engineVerbs, ENGINE_TOKEN_HEADER } from '../../src/engine/server.ts';
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

/**
 * Every field name a verb table reads, from its source.
 *
 * Two halves because there are two ways to read one: through a named helper, where the field is a string
 * literal, and as a plain property. The first is the robust half — the literals survive any transform —
 * and the second is why the case above asserts a count rather than trusting the scan.
 *
 * The helper half matches *any* name called with `(body, '<field>')` rather than a list of the helpers
 * there happen to be, because a list is a thing to forget: adding `pixels` for `/set-viewport` would have
 * left `width` and `height` unread while every case still passed. Over-matching costs a name that has to
 * be in the vocabulary, which fails out loud; under-matching is silent.
 */
const fieldsRead = (source: string): string[] => {
  const viaHelper = [...source.matchAll(/\b\w+\s*\(\s*body\s*,\s*['"]([^'"]+)['"]/g)];
  const viaProperty = [...source.matchAll(/\bbody\.(\w+)/g)];
  return [...new Set([...viaHelper, ...viaProperty].map((match) => match[1]))];
};

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
   * Every field the table reads, taken from the table's own source.
   *
   * The first version of this asked each verb with an empty body and read the field its error named. That
   * sees exactly *one* field per verb, because `required` throws on the first one missing — so `text`,
   * `path`, `value`, `since`, `source` and `timeoutMs` were all declared below and never checked, and a
   * verb could have introduced `txt` beside `text` and passed. Reading the source sees every one.
   */
  it('reads only fields in the shared vocabulary', () => {
    const read = fieldsRead(engineVerbs.toString());

    expect(read.length, 'the scan found almost nothing, so it is looking in the wrong place').toBeGreaterThan(9);
    for (const field of read) {
      expect(VOCABULARY, `"${field}" is a new name for something; add it here or reuse a name`).toContain(field);
    }
  });

  // The scan is a scan, so it is mutated here rather than trusted: one that matched nothing would pass the
  // case above over an empty list, and one that missed a helper would pass over a field it never saw
  it('finds a field however the table asks for it', () => {
    const doctored = `{
      '/a': { run: (body) => required(body, 'txt') },
      '/b': { run: (body) => optionalText(body, 'wat') },
      '/c': { run: (body) => present(body, 'val') },
      '/d': { run: (body) => body.raw },
    }`;

    expect(fieldsRead(doctored).sort()).toEqual(['raw', 'txt', 'val', 'wat']);
  });

  /**
   * The behavioural half: a required field says its own name when it is missing, so the names in the
   * source are the ones a caller is actually told about.
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

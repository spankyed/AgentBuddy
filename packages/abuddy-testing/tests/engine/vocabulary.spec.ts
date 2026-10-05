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
  '/state': 'reads',
  '/snapshot': 'reads',
  '/settings': 'reads',
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
] as const;

/** A session whose every verb answers, so what the assertions see is the table rather than the app */
function fakeSession() {
  const ok = (): EngineResult => ({ ok: true, value: null });
  return {
    ready: vi.fn(async () => undefined),
    evaluate: ok, send: ok, system: ok, qx: ok, tx: ok, state: ok, wait: ok, navigate: ok,
    screenshot: ok, reload: ok, drainEvents: ok, drainDrops: ok, drainErrors: ok, close: ok,
    plugin: ok, click: ok, fill: ok, press: ok, snapshot: ok, logs: ok, settings: ok, setSetting: ok,
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
   * Derived from what each verb demands rather than from a list beside it: a verb is asked with an empty
   * body, and the protocol error it raises names the field. A declared list would go stale the first time
   * a field was renamed; this cannot.
   */
  it('asks only for fields in the shared vocabulary', async () => {
    const asked: string[] = [];
    for (const [path, verb] of Object.entries(verbs())) {
      const { status, payload } = await askEmpty(path, verb.method);
      if (status !== 400) continue;
      const named = /"(\w+)"/.exec(String((payload as { error?: string }).error));
      expect(named, `${path} refused an empty body without naming the field it wanted`).not.toBeNull();
      asked.push(named![1]);
    }

    expect(asked.length, 'no verb required anything, so this checked nothing').toBeGreaterThan(4);
    for (const field of asked) {
      expect(VOCABULARY, `"${field}" is a new name for something; add it here or reuse a name`).toContain(field);
    }
  });
});

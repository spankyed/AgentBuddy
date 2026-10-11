// The app appends four log files beside electron-log's own, and electron-log's 10 MB cap covers only its
// own. Without a cap of their own they grow for as long as the app is ever run.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendCappedLine, LOG_FILE_MAX_BYTES } from '../../src/logs.ts';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capped-log-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const size = (name: string) => fs.statSync(path.join(dir, name), { throwIfNoEntry: false })?.size ?? 0;

describe('appendCappedLine', () => {
  it('creates the file and its directory, and appends to it', () => {
    const nested = path.join(dir, 'logs');

    appendCappedLine(nested, 'app-events.log', 'one\n');
    appendCappedLine(nested, 'app-events.log', 'two\n');

    expect(fs.readFileSync(path.join(nested, 'app-events.log'), 'utf-8')).toBe('one\ntwo\n');
  });

  // Two generations and no more, whatever the app writes: the old one is there to read back what led to a
  // crash, and the pair is bounded at twice the cap however long the app runs
  it('rotates once past the cap, and keeps only one old generation', () => {
    const line = `${'x'.repeat(99)}\n`;
    for (let written = 0; written <= 300; written++) appendCappedLine(dir, 'main.jsonl', line, 100);

    expect(fs.readdirSync(dir).sort()).toEqual(['main.jsonl', 'main.jsonl.old']);
    expect(size('main.jsonl')).toBeLessThanOrEqual(100);
    expect(size('main.jsonl.old')).toBeLessThanOrEqual(100);
  });

  it('caps at electron-log\'s own limit by default', () => {
    expect(LOG_FILE_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it('says nothing when it cannot write, since logging must not break what it logs about', () => {
    fs.mkdirSync(path.join(dir, 'app-events.log'));

    expect(() => appendCappedLine(dir, 'app-events.log', 'a line\n')).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { MIME_TYPES } from '../src/modules/pack-protocol/PackProtocol.js';

describe('PackProtocol MIME types', () => {

  it('resolves common file extensions to correct MIME types', () => {
    const cases: [string, string][] = [
      ['plugin.js', 'application/javascript'],
      ['module.mjs', 'application/javascript'],
      ['styles.css', 'text/css'],
      ['manifest.json', 'application/json'],
      ['index.html', 'text/html'],
      ['icon.svg', 'image/svg+xml'],
      ['logo.png', 'image/png'],
      ['font.woff2', 'font/woff2'],
    ];

    for (const [filename, expected] of cases) {
      const ext = path.extname(filename);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      expect(contentType).toBe(expected);
    }
  });

  it('falls back to octet-stream for unknown extensions', () => {
    const unknowns = ['.xyz', '.bin', '.dat', '.wasm'];
    for (const ext of unknowns) {
      expect(MIME_TYPES[ext] || 'application/octet-stream').toBe('application/octet-stream');
    }
  });
});

/**
 * Still asserts Node's `path`, not this module's guard.
 *
 * `createPackProtocol()` builds `path.join(packsDir, packId) + path.sep` and rejects a resolved path that
 * does not start with it, inline in the request handler. These two tests rebuild that expression and check
 * `path.resolve` and `startsWith` behave — which they do, and would whatever this module did. Making them
 * real means extracting the check as a named export and calling it, which is a change to the product rather
 * than to where a spec lives: deferred by `goal-test-cleanup.md`'s Decision 7 and left deferred here. The
 * MIME describe above was the half that could be fixed by an export, and was.
 */
describe('PackProtocol path traversal prevention', () => {
  it('trailing separator prevents pack prefix collision', () => {
    const packsDir = '/home/user/.agentbuddy/packs';
    const packId = 'fo';

    const allowedPrefix = path.join(packsDir, packId) + path.sep;
    const legitimate = path.resolve(packsDir, packId, 'dist/plugin.js');
    const attack = path.resolve(packsDir, 'foobar', 'dist/plugin.js');

    expect(legitimate.startsWith(allowedPrefix)).toBe(true);
    expect(attack.startsWith(allowedPrefix)).toBe(false);
  });

  it('rejects directory traversal in file path', () => {
    const packsDir = '/home/user/.agentbuddy/packs';
    const packId = 'my-pack';
    const allowedPrefix = path.join(packsDir, packId) + path.sep;

    const traversal = path.resolve(packsDir, packId, '../../etc/passwd');
    expect(traversal.startsWith(allowedPrefix)).toBe(false);
  });
});

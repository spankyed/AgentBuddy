import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MIME_TYPES, packRequestTarget, resolvePackFile } from '../src/modules/pack-protocol/PackProtocol.ts';

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
// Which pack a request addresses, which `resolvePackFile` then trusts: it puts `packId` into every prefix it
// compares against, so a host that is not a plain segment moves the root rather than being refused by it.
//
// **These cases pin the guard against Node's parse, and that is not Chromium's.** They run under vitest, so
// `new URL` here is Node's and an Electron scheme privilege cannot reach it. The two differ in exactly one
// way that matters here, measured 2026-10-08: `pack` is a standard scheme, so the renderer **lowercases the
// host** where Node preserves it. `pack://My-Pack/x` is therefore refused by this guard under Node and
// reaches the `my-pack` pack in the renderer — which is what http does with hosts, and why it is not in the
// list below. Everything else below parses the same in both.
//
// So these hold the guard against a parse that is stable and nearby; the pack E2E suites are what hold it
// against the one that actually serves.
describe('which pack a request addresses', () => {
  it('takes the pack id from the host and the file from the path', () => {
    expect(packRequestTarget('pack://my-pack/runtime/fe.js'))
      .toEqual({ packId: 'my-pack', filePath: '/runtime/fe.js' });
  });

  it('decodes the path, so an encoded space names the file it means', () => {
    expect(packRequestTarget('pack://my-pack/a%20b.js')?.filePath).toBe('/a b.js');
  });

  // The case the guard exists for: `..` as a host would resolve the pack dir to the data dir itself
  it('refuses a host that is not a plain pack id', () => {
    for (const url of ['pack://../x', 'pack://a%2F..%2Fb/x', 'pack://1pack/x', 'pack://-pack/x', 'pack://pack_x/y']) {
      expect(packRequestTarget(url), url).toBeNull();
    }
  });

  it('refuses a request with no pack at all', () => {
    for (const url of ['pack:///runtime/fe.js', 'pack://', 'not a url']) {
      expect(packRequestTarget(url), url).toBeNull();
    }
  });
});

describe('the file a pack:// request serves', () => {
  // Over real directories and through `resolvePackFile` itself. The two cases here before re-derived the
  // handler's own `path.join(packsDir, packId) + path.sep` inside the test and asserted `startsWith` on it,
  // so they held whatever the handler did — including, after a second root was added, the arithmetic it had
  // stopped using.
  let tmp: string;
  let packsDir: string;
  let shippedDir: string;
  const write = (file: string, body = 'x') => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  };
  const serve = (packId: string, filePath: string) => resolvePackFile({ packsDir, shippedDir, packId, filePath });

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pack-protocol-')));
    packsDir = path.join(tmp, 'data', 'packs');
    shippedDir = path.join(tmp, 'app', 'packages');
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('serves an installed pack from its own directory', () => {
    const file = path.join(packsDir, 'my-pack', 'runtime', 'fe.js');
    write(file);

    expect(serve('my-pack', '/runtime/fe.js')).toBe(file);
  });

  // A pack the app ships has not been staged, so its layout is still under dist/. The id is synthetic on
  // purpose: naming the real shipped pack beside a `dist` segment is how `chain-inputs`' scan recognises a
  // suite that reads that pack's build output, and this suite builds its own under a temp root
  it("serves a pack the app ships from its dist, before it is installed", () => {
    const file = path.join(shippedDir, 'shipped-pack', 'dist', 'runtime', 'fe.js');
    write(file);

    expect(serve('shipped-pack', '/runtime/fe.js')).toBe(file);
  });

  it('prefers the installed copy when both roots hold the file', () => {
    const installed = path.join(packsDir, 'shipped-pack', 'runtime', 'fe.js');
    write(installed, 'installed');
    write(path.join(shippedDir, 'shipped-pack', 'dist', 'runtime', 'fe.js'), 'shipped');

    expect(serve('shipped-pack', '/runtime/fe.js')).toBe(installed);
  });

  it('serves nothing for a file neither root holds', () => {
    write(path.join(packsDir, 'my-pack', 'runtime', 'fe.js'));

    expect(serve('my-pack', '/runtime/missing.js')).toBeNull();
  });

  it('serves nothing for a path that climbs out of the pack', () => {
    const outside = path.join(tmp, 'data', 'secrets.json');
    write(outside, 'secret');
    write(path.join(packsDir, 'my-pack', 'runtime', 'fe.js'));

    expect(serve('my-pack', '/../../secrets.json')).toBeNull();
    expect(serve('my-pack', '/runtime/../../../secrets.json')).toBeNull();
  });

  // `fo` must not reach `foobar`'s files: the prefix each candidate is checked against ends in a separator
  it('serves nothing from a pack whose id merely starts with the one asked for', () => {
    write(path.join(packsDir, 'foobar', 'runtime', 'fe.js'));

    expect(serve('fo', '/runtime/fe.js')).toBeNull();
    expect(serve('fo', '../foobar/runtime/fe.js')).toBeNull();
  });

  it('serves nothing for the pack root itself', () => {
    write(path.join(packsDir, 'my-pack', 'runtime', 'fe.js'));

    expect(serve('my-pack', '/')).toBeNull();
  });
});

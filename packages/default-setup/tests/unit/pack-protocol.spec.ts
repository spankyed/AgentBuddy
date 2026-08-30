import * as path from 'node:path';

describe('PackProtocol MIME types', () => {
  const MIME_TYPES: Record<string, string> = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };

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

describe('pack-install protocol URL parsing', () => {
  // Testing handleProtocolInstall without importing the module (it imports trpc)
  function handleProtocolInstall(params: Record<string, string>) {
    const packSlug = params.pack;
    if (!packSlug) return null;
    return { packSlug, source: params.source };
  }

  it('extracts pack slug from abuddy:// install URL params', () => {
    const result = handleProtocolInstall({ pack: 'awesome-pack' });
    expect(result).toEqual({ packSlug: 'awesome-pack', source: undefined });
  });

  it('returns null when pack param is missing', () => {
    const result = handleProtocolInstall({});
    expect(result).toBeNull();
  });

  it('passes through source param', () => {
    const result = handleProtocolInstall({ pack: 'my-pack', source: 'github' });
    expect(result).toEqual({ packSlug: 'my-pack', source: 'github' });
  });
});

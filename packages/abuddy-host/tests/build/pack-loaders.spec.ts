// A packaged app reaches its built-in packs only through the loader map the API's bundle carries (the API's
// tsup config generates it with this, from the build-time scan). A pack missing from it is a pack the packaged app
// doesn't have, which no run from source would show: from source each pack's built runtime is loaded instead.
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtInPackLoadersModule, type BuiltInPackBuildInfo } from '../../src/build/discover.ts';

const pack = (id: string, entryPath: string | null): BuiltInPackBuildInfo => ({
  id,
  dir: `/packages/${id}`,
  srcDir: `/packages/${id}/src`,
  entryPath,
});

/** Where the generated module sits: the API's src/runtime, which imports it */
const FROM = '/packages/api/src/runtime';

describe('the built-in pack loaders a packaged app loads through', () => {
  it('imports each pack that has an entry, by a path relative to the module that imports it', () => {
    const module = builtInPackLoadersModule(
      [pack('default-setup', '/packages/default-setup/src/__generated__/pack-entry'), pack('extras', '/packages/extras/src/__generated__/pack-entry')],
      FROM,
    );

    expect(module).toBe([
      'export default {',
      `  "default-setup": () => import('${path.relative(FROM, '/packages/default-setup/src/__generated__/pack-entry')}'),`,
      `  "extras": () => import('${path.relative(FROM, '/packages/extras/src/__generated__/pack-entry')}'),`,
      '};',
      '',
    ].join('\n'));
  });

  // A pack whose entry the scan didn't find has nothing to import: `abuddy build` writes it (npm run compile)
  it('leaves out a pack with no entry', () => {
    const module = builtInPackLoadersModule([pack('default-setup', '/packages/default-setup/src/__generated__/pack-entry'), pack('unbuilt', null)], FROM);

    expect(module).toContain('"default-setup"');
    expect(module).not.toContain('"unbuilt"');
  });

  it('refuses to generate a bundle with no pack to load', () => {
    expect(() => builtInPackLoadersModule([pack('unbuilt', null)], FROM)).toThrow('would have no packs to load');
    expect(() => builtInPackLoadersModule([], FROM)).toThrow('would have no packs to load');
  });
});

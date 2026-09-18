// What counts as one of the app's key values is the host's to say. That used to hold because the module
// installing the check was exported only under the @abuddy/source condition, which a pack never sets; now a
// pack resolves the same dist the repo does, so the guarantee rests on the setter having no route to pack
// code. These assertions are that route check: the barrels a pack can import, and the loader's bridge.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as utils from '../../src/utils/index.ts';
import * as pure from '../../src/utils/pure.ts';

const SETTER = 'setSecretValueMatcher';
const manifest = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf-8')) as {
  exports: Record<string, { '@abuddy/source'?: string } | string>;
};

describe("the check redaction uses for the app's key values", () => {
  it('is not on the barrels a pack imports', () => {
    expect(Object.keys(utils)).not.toContain(SETTER);
    expect(Object.keys(pure)).not.toContain(SETTER);
  });

  it('is not reachable through any published export', () => {
    const reached: string[] = [];
    for (const [subpath, target] of Object.entries(manifest.exports)) {
      const source = typeof target === 'string' ? target : target['@abuddy/source'];
      if (!source?.endsWith('.ts')) continue;
      const file = path.join(import.meta.dirname, '../..', source);
      if (!fs.existsSync(file)) continue;
      // An entry re-exporting the setter, directly or through a star, would hand it to any pack
      const text = fs.readFileSync(file, 'utf-8');
      if (new RegExp(`export[^;]*\\b${SETTER}\\b`).test(text)) reached.push(subpath);
    }
    expect(reached).toEqual([]);
  });
});

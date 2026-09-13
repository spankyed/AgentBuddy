import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, REPO_ROOT } from '../helpers/published-packages';

/**
 * Sources import `./x.ts`; the published JS must name the emitted `./x.js` (tsc's
 * rewriteRelativeImportExtensions for @abuddy/sdk, tsdown for @abuddy/ui, esbuild for the CLI
 * and testing bundles that inline @abuddy/host).
 */
const OUTPUTS = ['packages/abuddy-sdk/dist', 'packages/abuddy-ui/dist', 'packages/abuddy-cli/dist/package/dist', 'packages/abuddy-testing/dist/package/dist'];
const RELATIVE_TS = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']\.{1,2}\/[^"']+\.ts["']/;

describe.skipIf(!PACKAGES_BUILT)('published JS', () => {
  it.each(OUTPUTS)('has no relative .ts specifier in %s', (output) => {
    const dir = path.join(REPO_ROOT, output);
    const offenders = fs.readdirSync(dir, { recursive: true, encoding: 'utf-8' })
      .filter((file) => /\.(m?js)$/.test(file))
      .filter((file) => RELATIVE_TS.test(fs.readFileSync(path.join(dir, file), 'utf-8')));
    expect(offenders).toEqual([]);
  });
});

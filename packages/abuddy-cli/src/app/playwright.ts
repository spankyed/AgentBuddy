import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

function tryResolve(from: string, specifier: string): string | undefined {
  try {
    return createRequire(from).resolve(specifier);
  } catch {
    return undefined;
  }
}

/**
 * The Playwright CLI that belongs to the pack's @abuddy/testing, so the runner and the fixture
 * share one @playwright/test (two copies make Playwright refuse to run the tests).
 */
export function resolvePlaywrightCli(packDir: string): string {
  const fromPack = path.join(packDir, 'package.json');
  const testing = tryResolve(fromPack, '@abuddy/testing')
    // Packs written before the split import the deprecated @abuddy/sdk/testing re-export
    ?? (() => {
      const legacy = tryResolve(fromPack, '@abuddy/sdk/testing');
      return legacy && tryResolve(legacy, '@abuddy/testing');
    })();
  if (!testing) {
    throw new Error('@abuddy/testing is not installed in this pack. Run: npm i -D @abuddy/testing @playwright/test');
  }

  const playwrightPkg = tryResolve(testing, '@playwright/test/package.json');
  if (!playwrightPkg) {
    throw new Error('@playwright/test is not installed next to @abuddy/testing. Run: npm i -D @playwright/test');
  }
  const cli = path.join(path.dirname(playwrightPkg), JSON.parse(fs.readFileSync(playwrightPkg, 'utf-8')).bin.playwright);
  return fs.realpathSync(cli);
}

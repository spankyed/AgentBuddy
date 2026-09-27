import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { FileMatcher } from 'app-builder-lib/out/fileMatcher.js';
import { beforeAll, describe, expect, it } from 'vitest';

// What the app installs, asked of the matcher electron-builder itself builds from `electron-builder.mjs`.
//
// Nothing else looks at that file: it is named by no chain step on purpose (`chain-inputs.spec.ts`'s
// `NOT_A_CHAIN_INPUT` — it is read by `npm run build-prod`, which is not one), and its patterns have gone wrong
// silently before. The exclusion of `.ts` files once stripped the CLI's scaffold templates out of the installed
// app, which is why `abuddy-cli/tests/commands/scaffold-templates.spec.ts` asserts where that include sits. That
// check compares two string offsets, so it passes whether or not the pattern it names does anything; this one runs
// the filter, so it can only pass for the right reason. Both read the one config — the other file is the place
// for a claim about the templates themselves.
//
// `FileMatcher` is app-builder-lib's, reached by its internal path, which an electron-builder upgrade may move.
// That fails here, loudly, naming itself — against a text comparison that cannot fail for the right reason at
// all, it is the better trade. This package declares `app-builder-lib` at electron-builder's own version rather
// than reaching it through hoisting, so the coupling is in a manifest where an upgrade has to look at it.
//
// Line comments, not a doc block: half the subject matter is glob patterns, and a `*` before a `/` ends one.
let ships: (relative: string) => boolean;

beforeAll(async () => {
  // By URL rather than a relative specifier, as `abuddy-cli/tests/app/beta-app.spec.ts` reads the same config
  const config = (await import(pathToFileURL(path.join(REPO_ROOT, 'electron-builder.mjs')).href)).default as { files: string[] };
  // `from` is the directory the patterns are relative to; the macro expander is identity, because none of these
  // patterns carries a macro. The filter reads nothing off a stat but whether it is a directory.
  const filter = new FileMatcher(REPO_ROOT, 'app', (pattern) => pattern, config.files).createFilter();
  ships = (relative) => filter(path.join(REPO_ROOT, relative), { isDirectory: () => false } as never);
});

describe("the packaged app's file list", () => {
  it("ships each package's compiled output", () => {
    expect(ships('packages/abuddy-sdk/dist/index.js')).toBe(true);
    expect(ships('packages/renderer/dist/index.html')).toBe(true);
  });

  // The trees `stagePublishTree` writes so `npm publish` has something to publish. The app never loads one — it
  // resolves `@abuddy/sdk` through `node_modules` to `packages/abuddy-sdk/dist` — and the recursive include of
  // `packages` took all three until the publish exclusion was added, because electron-builder reads no
  // `.gitignore`. Measured before it was: 597 files, 1.66MB of them surviving the other exclusions.
  it('ships no tree staged for npm', () => {
    expect(ships('packages/abuddy-sdk/publish/dist/index.js')).toBe(false);
    expect(ships('packages/abuddy-sdk/publish/package.json')).toBe(false);
    expect(ships('packages/abuddy-ui/publish/dist/design/button.js')).toBe(false);
  });

  it("keeps the CLI's scaffold templates, which the exclusion above them would strip", () => {
    expect(ships('packages/abuddy-cli/dist/package/templates/pack/src/env.d.ts')).toBe(true);
  });

  it('ships no package source', () => {
    expect(ships('packages/abuddy-sdk/src/index.ts')).toBe(false);
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { callsHelper, declaresKey } from './_support/config-code.ts';
import { repoFiles } from './_support/repo-files.ts';

/**
 * A Playwright config is a call to a helper, not a copy of one.
 *
 * The sibling of `pack-test-config.spec.ts`, and it exists because the vitest half of this question was
 * answered and the Playwright half was not. There were six of these: the repo's own E2E config, the one
 * `abuddy init-tests` scaffolds, both fixture packs', and the drive layer's two — and the repo's own had
 * already drifted to a `use` block giving it screenshots and traces that the three packs' lacked. Nobody
 * decided that; it is what six copies do.
 *
 * One helper per kind of run (`@abuddy/testing/playwright`), because a setting means something different
 * to each: an E2E suite has a budget to hold, a driving run has no timeout at all because someone is
 * watching it, and a serving session has four settings its HTTP handshake depends on.
 */

const HELPERS = ['definePackE2EConfig', 'defineDriveConfig', 'defineEngineConfig'] as const;

/** The settings a helper owns, which a config restating one has stopped delegating */
const OWNED_KEYS = ['testDir', 'testMatch', 'workers', 'timeout', 'outputDir'] as const;

/**
 * A config that assembles its own anyway, and why.
 *
 * Empty, and meant to stay small: an entry is a config that needs something no helper can express, which
 * is a reason to widen a helper at least as often as it is a reason to escape one.
 */
const ASSEMBLES_ITS_OWN: Record<string, string> = {};

const read = (file: string): string => fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');

/**
 * Every Playwright config this repo tracks, derived from the tree rather than listed.
 *
 * A listed population is the failure this check is here to prevent — a seventh copy is a `cp` away, and a
 * hand-written list would not see it.
 */
const playwrightConfigs = (): string[] => [
  ...repoFiles('*playwright.config.ts'),
  ...repoFiles('*engine.config.mts'),
].sort();

const delegates = (file: string): boolean => HELPERS.some((helper) => callsHelper(read(file), helper));

describe('a Playwright config calls its helper', () => {
  it('there are configs to check, so this is not vacuous', () => {
    // Six at the time of writing: the root, the scaffolded template, two fixture packs, and drive's pair
    expect(playwrightConfigs().length).toBeGreaterThan(4);
  });

  it('leaves none of them assembling their own', () => {
    const copies = playwrightConfigs()
      .filter((config) => !delegates(config))
      .filter((config) => !(config in ASSEMBLES_ITS_OWN));

    expect(copies, 'these restate what @abuddy/testing/playwright holds, so a change there will not reach '
      + 'them. Call the helper for their kind of run instead: what a config needs on top is an argument')
      .toEqual([]);
  });

  it('leaves none of them restating a setting its helper owns', () => {
    const restated = playwrightConfigs()
      .filter((config) => !(config in ASSEMBLES_ITS_OWN))
      .flatMap((config) => OWNED_KEYS
        .filter((key) => declaresKey(read(config), key))
        .map((key) => `${config} declares ${key}`));

    expect(restated, 'pass what this config needs to its helper as an argument, or record it in '
      + 'ASSEMBLES_ITS_OWN with what no helper can express').toEqual([]);
  });

  it('lists no exception that has stopped applying', () => {
    const stale = Object.keys(ASSEMBLES_ITS_OWN)
      .filter((config) => !fs.existsSync(path.join(REPO_ROOT, config)) || delegates(config));

    expect(stale, 'these are gone or now delegate; drop them from ASSEMBLES_ITS_OWN').toEqual([]);
  });

  /**
   * And the configs a pack author is *given*, which matter most: every pack outside this repo starts as a
   * copy of one, so a template that assembled its own would put the drift back at the source.
   *
   * All three are files under `templates/`, which is the stronger subject — the drive pair were string
   * literals in the command until this check wanted to read them. `scaffold-templates.spec.ts` holds the
   * other half, that each one is still rendered by a call site.
   */
  it.each([
    ['pack/playwright.config.ts', 'definePackE2EConfig'],
    ['drive/playwright.config.ts', 'defineDriveConfig'],
    ['drive/engine.config.mts', 'defineEngineConfig'],
  ])('is what the %s scaffold writes', (template, helper) => {
    const source = read(path.join('packages', 'abuddy-cli', 'templates', template));

    expect(callsHelper(source, helper), `the ${template} template assembles its own`).toBe(true);
    for (const key of OWNED_KEYS) {
      expect(declaresKey(source, key), `the ${template} template restates ${key}`).toBe(false);
    }
  });

  /**
   * The engine's session filename is declared twice, and this is what keeps the two together.
   *
   * `@abuddy/testing`'s helper needs it for `testMatch` and `@abuddy/cli`'s `drive.ts` needs it to know
   * which file to write. Making them one declaration would mean the CLI importing `@abuddy/testing` at
   * runtime — a dependency on the published CLI for one string — so they are two, and this compares them.
   * Drift here scaffolds a session the serving config does not collect, which Playwright reports as
   * finding no tests.
   */
  /**
   * The same bind, for the wire vocabulary a one-shot needs.
   *
   * `abuddy drive --eval` talks to a session over HTTP from Node, which means knowing the token header,
   * the marker's filename and the line a listening session prints. `@abuddy/cli` cannot import
   * `@abuddy/testing` to get them — it is a devDependency, and `bundle-package.ts` refuses an external it
   * cannot find in `dependencies` — so they are declared twice and compared here, as the session filename
   * above is. Drift is a one-shot that hangs to its deadline (the ready line) or is refused (the header).
   *
   * A loop over a declared list, so the next string added is covered without editing the case.
   */
  it('names one wire vocabulary across the two packages that spell it', () => {
    const engine = [
      ['ENGINE_TOKEN_HEADER', path.join('packages', 'abuddy-testing', 'src', 'engine', 'server.ts')],
      ['MARKER_FILE', path.join('packages', 'abuddy-testing', 'src', 'engine', 'marker.ts')],
      ['ENGINE_READY', path.join('packages', 'abuddy-testing', 'src', 'engine', 'marker.ts')],
    ] as const;
    const cli = read(path.join('packages', 'abuddy-cli', 'src', 'app', 'drive-engine.ts'));
    const named = (source: string, declaration: string): string | undefined =>
      new RegExp(`${declaration}\\s*=\\s*'([^']+)'`).exec(codeOrEmpty(source))?.[1];

    for (const [declaration, file] of engine) {
      const inEngine = named(read(file), declaration);
      const inCli = named(cli, declaration);
      expect(inEngine, `${file} no longer declares ${declaration} under that name`).toBeDefined();
      expect(inCli, `drive-engine.ts no longer declares ${declaration} under that name`).toBeDefined();
      expect(inCli, `${declaration} has drifted between the engine and the CLI that talks to it`).toBe(inEngine);
    }
  });

  it('names one engine session file across the two packages that spell it', () => {
    const helper = read(path.join('packages', 'abuddy-testing', 'src', 'playwright.ts'));
    const cli = read(path.join('packages', 'abuddy-cli', 'src', 'commands', 'drive.ts'));
    const named = (source: string, declaration: string): string | undefined =>
      new RegExp(`${declaration}\\s*=\\s*'([^']+)'`).exec(codeOrEmpty(source))?.[1];

    const inHelper = named(helper, 'ENGINE_SESSION_FILE');
    const inCli = named(cli, 'ENGINE_SESSION_FILE');

    expect(inHelper, 'the helper no longer declares ENGINE_SESSION_FILE under that name').toBeDefined();
    expect(inCli, 'drive.ts no longer declares ENGINE_SESSION_FILE under that name').toBeDefined();
    expect(inCli, 'the file the CLI writes and the file the serving config collects have drifted apart')
      .toBe(inHelper);
  });
});

/** Both sources are read for a declaration, so a commented-out one must not answer */
function codeOrEmpty(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { driveScripts, DRIVE_USAGE, scaffold, takeServeFlag, writeEngineFiles } from '../../src/commands/drive';

let root: string;

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-drive-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const write = (name: string) => {
  fs.mkdirSync(path.join(root, 'drive'), { recursive: true });
  fs.writeFileSync(path.join(root, 'drive', name), '');
};

/**
 * What decides whether `abuddy drive` has anything to do. It used to scaffold the directory and then run
 * Playwright against it regardless, so the first run in any pack ended in `No tests found` and exit 1 —
 * after a full pack build and an app launch. The question is the scripts that exist, not whether this
 * call created the directory: a pack whose author deleted their last script hits the same wall.
 */
describe('the driving scripts a pack has', () => {
  it('is empty before anything is written, and when the directory is not there at all', () => {
    expect(driveScripts(root)).toEqual([]);
    fs.mkdirSync(path.join(root, 'drive'));
    expect(driveScripts(root)).toEqual([]);
  });

  it("doesn't count the config the scaffold writes, which is there from the first run", () => {
    write('playwright.config.ts');
    write('README.md');
    write('.gitignore');
    expect(driveScripts(root)).toEqual([]);
  });

  it('counts a script beside it', () => {
    write('playwright.config.ts');
    write('look.ts');
    expect(driveScripts(root)).toEqual(['look.ts']);
  });

  // The config this scaffolds is `testDir: '.'` with `testMatch: '**/*.ts'`, so Playwright collects a
  // nested script. A shallow read here would refuse to run one it would have found.
  it('counts one in a subdirectory, as the config that runs them does', () => {
    write('playwright.config.ts');
    fs.mkdirSync(path.join(root, 'drive', 'flows'), { recursive: true });
    fs.writeFileSync(path.join(root, 'drive', 'flows', 'checkout.ts'), '');
    expect(driveScripts(root)).toEqual([path.join('flows', 'checkout.ts')]);
  });
});

/**
 * `--serve` is this command's own, so it has to be taken out of the arguments.
 *
 * Everything left over is forwarded to the Playwright CLI verbatim (`flags.args`), which would be asked
 * about a flag it has never heard of — and Playwright's answer to that is to fail the run.
 */
/**
 * The session file is where a verb of the pack's own goes, so it is a file its owner keeps.
 *
 * It was rewritten on every `--serve`, which made the one file worth extending the one that could not be:
 * an agent added a verb, ran the session again, and the verb was gone with no diagnostic. The rule used
 * for every other scaffolded file — write when absent — is what it needed.
 */
describe('the engine files the serve flag scaffolds', () => {
  const session = () => path.join(root, 'drive', 'engine-session.mts');

  it('writes the pair the first time', () => {
    writeEngineFiles(root);

    expect(fs.readFileSync(session(), 'utf-8')).toContain('driveEngineBody');
    expect(fs.existsSync(path.join(root, 'drive', 'engine.config.mts'))).toBe(true);
  });

  it('keeps a session file that has been extended, rather than writing over it', () => {
    writeEngineFiles(root);
    const extended = `${fs.readFileSync(session(), 'utf-8')}\n// a verb of my own\n`;
    fs.writeFileSync(session(), extended);

    writeEngineFiles(root);

    expect(fs.readFileSync(session(), 'utf-8')).toBe(extended);
  });

  it('writes one that was deleted, so a pack is never left without it', () => {
    writeEngineFiles(root);
    fs.rmSync(session());

    writeEngineFiles(root);

    expect(fs.readFileSync(session(), 'utf-8')).toContain('driveEngineBody');
  });
});

describe('the serve flag', () => {
  it('is off by default, and takes nothing with it', () => {
    expect(takeServeFlag(['look.ts', '--instance', 'x'])).toEqual({
      serve: false, rest: ['look.ts', '--instance', 'x'],
    });
  });

  it('is taken out of the arguments when present', () => {
    expect(takeServeFlag(['--serve', '--instance', 'x'])).toEqual({ serve: true, rest: ['--instance', 'x'] });
  });

  it('leaves every other argument in place and in order', () => {
    const { rest } = takeServeFlag(['--app-root', '/a', '--serve', '--instance', 'probe', '-g', 'x']);
    expect(rest).toEqual(['--app-root', '/a', '--instance', 'probe', '-g', 'x']);
  });

  it('does not match a flag that merely starts the same way', () => {
    // `--serve-forever` is not this flag, and silently eating it would send the caller looking at
    // Playwright for the reason their argument vanished
    expect(takeServeFlag(['--serve-forever'])).toEqual({ serve: false, rest: ['--serve-forever'] });
  });
});

/**
 * The help text and the behaviour, held together.
 *
 * `USAGE` in `src/index.ts`, this constant, the CLI's `CLAUDE.md` table and `docs/public-facing/cli.md`
 * are four hand-kept copies, and nothing checks any of them. These are the claims a reader acts on
 * directly — the flag, where the address is, and how to end a session — so they are the ones pinned.
 */
describe('the help text', () => {
  it('names the flag it documents', () => {
    expect(DRIVE_USAGE).toContain('--serve');
  });

  it('says where the address and the token are, since nothing else tells the caller', () => {
    expect(DRIVE_USAGE).toContain('drive/results/engine.json');
  });

  it('says how a session ends, which is the one thing a caller cannot guess', () => {
    expect(DRIVE_USAGE).toContain('/close');
  });
});

/**
 * What a scaffolder says about a config it kept.
 *
 * Both files are write-if-absent, which is right — one holds a pack's own verbs and the other is a call
 * to a helper that owns every setting — but it means one written before the helper existed is never
 * updated and nothing notices. That was the finding: "never regenerated and nothing owns it". Reporting
 * is what makes the delegation reachable for a pack that already has a config.
 */
describe('a config that has stopped delegating', () => {
  const writeConfig = (name: string, body: string) => {
    fs.mkdirSync(path.join(root, 'drive'), { recursive: true });
    fs.writeFileSync(path.join(root, 'drive', name), body);
  };

  it('is named, with the engine config it kept', () => {
    writeConfig('engine.config.mts', "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ workers: 1 });\n");

    expect(writeEngineFiles(root).keptStale).toEqual([path.join('drive', 'engine.config.mts')]);
  });

  it('is named for the driving config too, which scaffold keeps', () => {
    writeConfig('playwright.config.ts', "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.' });\n");

    expect(scaffold(root).keptStale).toEqual([path.join('drive', 'playwright.config.ts')]);
  });

  /**
   * The case a plain `includes` gets wrong, and the reason this reads the code. The config this command
   * writes *mentions* its helper in the comment above the call, so a config that went back to assembling
   * its own and kept the comment would have passed.
   *
   * Mutation check: drop `codeOf` from `configCallsHelper` and this is the case that fails.
   */
  it('is still named when it only mentions the helper in a comment', () => {
    writeConfig('engine.config.mts', "// every setting is defineEngineConfig()'s\nimport { defineConfig } from '@playwright/test';\nexport default defineConfig({ workers: 1 });\n");

    expect(writeEngineFiles(root).keptStale).toEqual([path.join('drive', 'engine.config.mts')]);
  });

  it('is silent about one that delegates', () => {
    writeConfig('engine.config.mts', "import { defineEngineConfig } from '@abuddy/testing/playwright';\nexport default defineEngineConfig();\n");

    expect(writeEngineFiles(root).keptStale).toEqual([]);
  });

  it('is silent about the session file, which is the pack author\'s to write however they like', () => {
    writeConfig('engine-session.mts', 'whatever the author put here');

    expect(writeEngineFiles(root).keptStale).toEqual([]);
  });

  it('reports what it created, so a caller can tell a first run from a later one', () => {
    const first = writeEngineFiles(root);
    const second = writeEngineFiles(root);

    expect(first.created).toEqual([path.join('drive', 'engine.config.mts'), path.join('drive', 'engine-session.mts')]);
    expect(second.created).toEqual([]);
    expect(second.keptStale, 'what it wrote itself calls the helper').toEqual([]);
  });
});

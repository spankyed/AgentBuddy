import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { driveScripts, DRIVE_USAGE, scaffold, takeOneShotFlags } from '../../src/commands/drive';

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
 * The help text and the behaviour, held together.
 *
 * `USAGE` in `src/index.ts`, this constant, the CLI's `CLAUDE.md` table and `docs/public-facing/cli.md`
 * are four hand-kept copies, and nothing checks any of them. These are the claims a reader acts on
 * directly — the flag, where the address is, and how to end a session — so they are the ones pinned.
 */
describe('the help text', () => {
  /**
   * The claim a caller cannot guess and will otherwise discover by being refused: that a question is asked
   * of an app something else is holding, and what to do when there is none.
   */
  it('says what to do when no app is running', () => {
    expect(DRIVE_USAGE).toContain('--spawn');
    expect(DRIVE_USAGE).toContain('abuddy dev');
  });

  // One per claim a reader acts on, which is this file's existing bar for the usage text
  it('says what a one-shot asks, what it prints and what the input is', () => {
    for (const flag of ['--eval', '--query', '--state', '--spawn']) expect(DRIVE_USAGE).toContain(flag);
    // The trap: a body without `return` answers no value rather than failing
    expect(DRIVE_USAGE).toContain('body');
    expect(DRIVE_USAGE).toContain('return');
    // The output contract a caller parses against: the fields, and that stdout carries nothing else
    expect(DRIVE_USAGE).toContain('stdout');
    for (const field of ['value', 'state', 'startedBy', 'supervisorPid']) expect(DRIVE_USAGE).toContain(field);
    // The three exit codes, since a caller that cannot tell a miss from a failure retries the wrong one
    expect(DRIVE_USAGE).toMatch(/3 when\s+no app is running/);
    expect(DRIVE_USAGE).toContain('1 when the verb failed');
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

  it('is named, so a pack that has one can be told it has drifted', () => {
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
    writeConfig('playwright.config.ts', "// every setting is defineDriveConfig()'s\nimport { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.' });\n");

    expect(scaffold(root).keptStale).toEqual([path.join('drive', 'playwright.config.ts')]);
  });

  it('is silent about one that delegates', () => {
    writeConfig('playwright.config.ts', "import { defineDriveConfig } from '@abuddy/testing/playwright';\nexport default defineDriveConfig();\n");

    expect(scaffold(root).keptStale).toEqual([]);
  });

  it('reports what it created, so a caller can tell a first run from a later one', () => {
    const first = scaffold(root);
    const second = scaffold(root);

    expect(first.created).toContain(path.join('drive', 'playwright.config.ts'));
    expect(second.created).toEqual([]);
    expect(second.keptStale, 'what it wrote itself calls the helper').toEqual([]);
  });
});

// Everything a one-shot decides before it launches anything, and the two places it can silently do nothing.

/**
 * The question a one-shot asks, taken out of the arguments before anything else sees them.
 *
 * Everything left over is forwarded to the Playwright CLI verbatim, which would be asked about a flag it
 * has never heard of — and Playwright's answer to that is to fail the run.
 */
describe('takeOneShotFlags', () => {
  it('consumes nothing when no question is asked, and keeps the order', () => {
    const argv = ['look.ts', '--grep', 'x'];

    expect(takeOneShotFlags(argv)).toEqual({ spawn: false, rest: ['look.ts', '--grep', 'x'] });
  });

  it('takes a value as the next argument or inline, to the same answer', () => {
    expect(takeOneShotFlags(['--eval', 'return 1'])).toEqual({ ask: 'eval', argument: 'return 1', spawn: false, rest: [] });
    expect(takeOneShotFlags(['--eval=return 1'])).toEqual({ ask: 'eval', argument: 'return 1', spawn: false, rest: [] });
  });

  // The firing case. An implementation matching on a prefix passes every other case here and fails only
  // this one, and the cost of that is an argument vanishing on its way to the Playwright CLI
  it('leaves a flag that merely starts with one of its own', () => {
    const argv = ['--evaluate', '--state-dump'];

    expect(takeOneShotFlags(argv)).toEqual({ spawn: false, rest: ['--evaluate', '--state-dump'] });
  });

  it('leaves every other argument in place and in order', () => {
    const { rest } = takeOneShotFlags(['--eval', 'return 1', '--profile', 'probe', '--grep', 'n']);

    expect(rest).toEqual(['--profile', 'probe', '--grep', 'n']);
  });

  it('refuses a second question, a value --state cannot take, and a missing value', () => {
    expect(() => takeOneShotFlags(['--eval', 'a', '--query', 'b'])).toThrow(/--query can't be combined with --eval/);
    expect(() => takeOneShotFlags(['--eval', 'a', '--eval', 'b'])).toThrow(/--eval was given twice/);
    expect(() => takeOneShotFlags(['--state=x'])).toThrow(/--state does not take a value/);
    // The message names `return`, because a body without one answers `{"ok":true}` rather than failing
    expect(() => takeOneShotFlags(['--eval'])).toThrow(/`return` is required/);
  });

    /**
   * `--spawn` is the opt-in that turns a miss from a refusal into a launch, so it is taken here with the
   * question rather than left among the arguments the runner is handed.
   */
  it('takes --spawn, in either order, and defaults to not asked for', () => {
    expect(takeOneShotFlags(['--state', '--spawn'])).toEqual({ ask: 'state', spawn: true, rest: [] });
    expect(takeOneShotFlags(['--spawn', '--eval', 'return 1']))
      .toEqual({ ask: 'eval', argument: 'return 1', spawn: true, rest: [] });
    // The default is the whole point: a question that acquires a process without being told to is what
    // the flag exists to prevent
    expect(takeOneShotFlags(['--state']).spawn).toBe(false);
  });
});

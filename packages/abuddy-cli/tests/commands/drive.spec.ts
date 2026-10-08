import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { driveScripts, DRIVE_USAGE, scaffold, takeOneShotFlags, takeServeFlag, writeEngineFiles } from '../../src/commands/drive';
import { oneShotOutcome, readEngineMarker } from '../../src/app/drive-engine';
import { whenReady } from '../../src/app/drive-one-shot';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

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

  // One per claim a reader acts on, which is this file's existing bar for the usage text
  it('says what a one-shot asks, what it prints and what the input is', () => {
    for (const flag of ['--eval', '--query', '--state', '--attach']) expect(DRIVE_USAGE).toContain(flag);
    // The trap: a body without `return` answers ok:true with no value rather than failing
    expect(DRIVE_USAGE).toContain('body');
    expect(DRIVE_USAGE).toContain('return');
    // The output contract a caller parses against
    expect(DRIVE_USAGE).toContain('stdout');
    expect(DRIVE_USAGE).toContain('{"ok":true,"value":"Agent X"}');
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

// Everything a one-shot decides before it launches anything, and the two places it can silently do nothing.
describe('asking one question', () => {
  describe('takeOneShotFlags', () => {
    it('consumes nothing when no question is asked, and keeps the order', () => {
      const argv = ['look.ts', '--grep', 'x'];

      expect(takeOneShotFlags(argv)).toEqual({ attach: false, rest: ['look.ts', '--grep', 'x'] });
    });

    it('takes a value as the next argument or inline, to the same answer', () => {
      expect(takeOneShotFlags(['--eval', 'return 1'])).toEqual({ ask: 'eval', argument: 'return 1', attach: false, rest: [] });
      expect(takeOneShotFlags(['--eval=return 1'])).toEqual({ ask: 'eval', argument: 'return 1', attach: false, rest: [] });
    });

    // The firing case. An implementation matching on a prefix passes every other case here and fails only
    // this one, and the cost of that is an argument vanishing on its way to the Playwright CLI
    it('leaves a flag that merely starts with one of its own', () => {
      const argv = ['--evaluate', '--state-dump'];

      expect(takeOneShotFlags(argv)).toEqual({ attach: false, rest: ['--evaluate', '--state-dump'] });
    });

    it('leaves every other argument in place and in order', () => {
      const { rest } = takeOneShotFlags(['--eval', 'return 1', '--instance', 'probe', '--grep', 'n']);

      expect(rest).toEqual(['--instance', 'probe', '--grep', 'n']);
    });

    it('refuses a second question, a value --state cannot take, and a missing value', () => {
      expect(() => takeOneShotFlags(['--eval', 'a', '--query', 'b'])).toThrow(/--query can't be combined with --eval/);
      expect(() => takeOneShotFlags(['--eval', 'a', '--eval', 'b'])).toThrow(/--eval was given twice/);
      expect(() => takeOneShotFlags(['--state=x'])).toThrow(/--state does not take a value/);
      // The message names `return`, because a body without one answers `{"ok":true}` rather than failing
      expect(() => takeOneShotFlags(['--eval'])).toThrow(/`return` is required/);
    });

    it('takes --attach without taking the question with it', () => {
      expect(takeOneShotFlags(['--attach', '--state'])).toEqual({ ask: 'state', attach: true, rest: [] });
    });
  });

  /**
   * The exit code comes from the envelope, never from the status — and this is the case that proves it.
   *
   * The engine wraps every verb in `attempt`, which turns a verb that *threw* into `ok: false` with status
   * **200**. An implementation that reads the status exits 0 on every real failure, and nothing downstream
   * notices: `npm run drive:eval -- 'throw 1' && echo ok` would print ok.
   */
  describe('oneShotOutcome', () => {
    it('exits 1 for a failed verb the engine answered 200 with', () => {
      const outcome = oneShotOutcome({ status: 200, body: { ok: false, error: 'eval: boom' } });

      expect(outcome.code).toBe(1);
      expect(JSON.parse(outcome.line)).toEqual({ ok: false, error: 'eval: boom' });
    });

    it('exits 0 for an answer, and passes the envelope through unchanged', () => {
      const outcome = oneShotOutcome({ status: 200, body: { ok: true, value: { a: 1 } } });

      expect(outcome.code).toBe(0);
      expect(JSON.parse(outcome.line)).toEqual({ ok: true, value: { a: 1 } });
    });

    it("prints a refusal's own words rather than rewording it", () => {
      const outcome = oneShotOutcome({ status: 401, body: { ok: false, error: 'missing or wrong x-abuddy-drive-token' } });

      expect(outcome.code).toBe(1);
      expect(outcome.line).toContain('missing or wrong x-abuddy-drive-token');
    });

    it('synthesises an envelope only where there is no answer at all', () => {
      expect(oneShotOutcome({ unreachable: 'nothing answered' })).toEqual({ line: '{"ok":false,"error":"nothing answered"}', code: 1 });
      // Something that is not an envelope is not passed off as one
      expect(oneShotOutcome({ status: 200, body: 'hello' }).code).toBe(1);
    });
  });

  describe('whenReady', () => {
    const fakeChild = (): { child: any; stdout: PassThrough } => {
      const stdout = new PassThrough();
      const child = Object.assign(new EventEmitter(), { stdout, kill: () => {} });
      return { child, stdout };
    };

    it('settles when the session says it is listening', async () => {
      const { child, stdout } = fakeChild();
      const ready = whenReady(child, () => {}, 5_000);

      stdout.write('drive engine listening on http://127.0.0.1:1234 — drive/results/engine.json\n');

      await expect(ready).resolves.toBeUndefined();
    });

    // The firing case: a readiness marker can straddle a chunk boundary, and a per-chunk `includes` —
    // which is what `packages/main`'s ProcessManager does — never fires. The symptom is a 180s hang
    it('settles when the line arrives in two pieces', async () => {
      const { child, stdout } = fakeChild();
      const ready = whenReady(child, () => {}, 5_000);

      stdout.write('drive engine listen');
      stdout.write('ing on http://127.0.0.1:1234 — drive/results/engine.json\n');

      await expect(ready).resolves.toBeUndefined();
    });

    it('reports a session that died instead of starting, with what it printed', async () => {
      const { child, stdout } = fakeChild();
      const ready = whenReady(child, () => {}, 5_000);

      stdout.write('Error: no tests found\n');
      child.emit('exit', 1);

      await expect(ready).rejects.toThrow(/exited \(1\) before it was listening[\s\S]*no tests found/);
    });

    it('gives up on the bound rather than waiting for a session that never speaks', async () => {
      const { child } = fakeChild();

      await expect(whenReady(child, () => {}, 20)).rejects.toThrow(/did not start within/);
    });
  });

  describe('reading a session marker', () => {
    it('names the command this caller would run when there is no session', () => {
      const read = readEngineMarker(path.join(root, 'drive', 'results'), 'npm run drive:serve');

      expect(read).toEqual({ problem: expect.stringContaining('npm run drive:serve') });
      expect((read as { problem: string }).problem).toContain('drop --attach');
    });

    it('reports a file that is not a marker rather than crashing on it', () => {
      const dir = path.join(root, 'drive', 'results');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'engine.json'), '{"host":"127.0.0.1"}');

      expect(readEngineMarker(dir, 'x')).toEqual({ problem: expect.stringContaining('needs a host, a port and a token') });
    });

    it('reads a real one', () => {
      const dir = path.join(root, 'drive', 'results');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'engine.json'), JSON.stringify({ host: '127.0.0.1', port: 1, token: 't', pid: 2 }));

      expect(readEngineMarker(dir, 'x')).toEqual({ marker: { host: '127.0.0.1', port: 1, token: 't', pid: 2 } });
    });
  });
});

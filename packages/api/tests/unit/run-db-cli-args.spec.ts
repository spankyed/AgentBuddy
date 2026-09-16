// scripts/db/cli/run-db-cli.ts: arguments after the script path belong to the script
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// The CLI's database module opens the app's stores: point them at a throwaway data dir
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-run-db-cli-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { splitDbCliArgs } = await import('../../scripts/db/cli/run-db-cli');

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('splitDbCliArgs', () => {
  it("passes a script's own flags, -e included, to the script", () => {
    expect(splitDbCliArgs(['--script', 'scripts/db/export-data.ts', '-e', 'Settings', '-o', './out'])).toEqual({
      cliArgs: ['--script', 'scripts/db/export-data.ts'],
      scriptArgs: ['-e', 'Settings', '-o', './out'],
    });
  });

  it('keeps CLI options before the script path and drops one leading --', () => {
    expect(splitDbCliArgs(['--no-confirm', '-v', '-s', 'x.ts', '--', '--type', 'Flow'])).toEqual({
      cliArgs: ['--no-confirm', '-v', '-s', 'x.ts'],
      scriptArgs: ['--type', 'Flow'],
    });
    expect(splitDbCliArgs(['--script=x.ts', '--entity', 'Flow-1'])).toEqual({
      cliArgs: ['--script=x.ts'],
      scriptArgs: ['--entity', 'Flow-1'],
    });
  });

  it("doesn't split at an option value that looks like --script", () => {
    expect(splitDbCliArgs(['-e', '-s', 'extra'])).toEqual({ cliArgs: ['-e', '-s', 'extra'], scriptArgs: [] });
  });

  it('leaves exec and interactive arguments to the CLI', () => {
    expect(splitDbCliArgs(['--no-confirm', '-e', 'return 1'])).toEqual({ cliArgs: ['--no-confirm', '-e', 'return 1'], scriptArgs: [] });
  });
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolvePlaywrightCli } from '../../src/app/playwright';

let pack: string;

function writePackage(dir: string, manifest: Record<string, unknown>, files: Record<string, string> = {}): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), content);
}

const playwright = (dir: string) =>
  writePackage(dir, { name: '@playwright/test', version: '1.0.0', bin: { playwright: 'cli.js' } }, { 'cli.js': '' });

beforeEach(() => {
  pack = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-playwright-')));
  writePackage(pack, { name: 'pack' });
});

afterEach(() => {
  fs.rmSync(pack, { recursive: true, force: true });
});

describe('resolvePlaywrightCli', () => {
  it('runs the @playwright/test that @abuddy/testing resolves, not another copy', () => {
    const testing = path.join(pack, 'node_modules', '@abuddy', 'testing');
    writePackage(testing, { name: '@abuddy/testing', main: 'index.js' }, { 'index.js': '' });
    playwright(path.join(testing, 'node_modules', '@playwright', 'test'));
    playwright(path.join(pack, 'node_modules', '@playwright', 'test')); // a second, mismatched copy

    expect(resolvePlaywrightCli(pack)).toBe(path.join(testing, 'node_modules', '@playwright', 'test', 'cli.js'));
  });

  it('tells the author what to install', () => {
    expect(() => resolvePlaywrightCli(pack)).toThrow('npm i -D @abuddy/testing @playwright/test');
  });
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { driveScripts } from '../../src/commands/drive';

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
});

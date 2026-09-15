import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkSeedRuntimeLoads } from '../../src/build/seed-runtime-check';

let root: string;
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const checkDirs = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('abuddy-seed-runtime-check-'));

describe('checkSeedRuntimeLoads', () => {
  it("fails with a build error, and leaves no temp dir, when the pack's @abuddy/sdk doesn't resolve", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-no-sdk-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'no-sdk', type: 'module' }));
    const before = checkDirs();
    const result = await checkSeedRuntimeLoads(root, path.join(root, 'dist/build/seed-runtime.mjs'));
    expect(result).toEqual({ success: false, error: expect.stringContaining(`dist/build/seed-runtime.mjs can't be checked: @abuddy/sdk doesn't resolve from ${root}`) });
    expect(checkDirs()).toEqual(before);
  });
});

import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Set while a test wants the swap into place to fail, the one step this file is about */
const refuseSwap = { on: false };

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const renameSync: typeof actual.renameSync = (from, to) => {
    if (refuseSwap.on && path.basename(String(from)).includes('.publishing-')) throw new Error('rename refused');
    return actual.renameSync(from, to);
  };
  return { ...actual, default: { ...actual, renameSync }, renameSync };
});

const fs = await import('node:fs');
const { publishHostPackOutput } = await import('../../src/packs/pack-layout.ts');

let tmp: string;

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-host-output-')); });
afterEach(() => {
  refuseSwap.on = false;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A built-in pack's dist as its build leaves it, with `steps` marking which build it is */
function builtInPack(steps: string): string {
  const dir = path.join(tmp, `built-in-${steps.length}`);
  fs.mkdirSync(path.join(dir, 'dist', 'build'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'snapshot.json'), JSON.stringify({ manifest: { id: 'base-pack', version: '1.0.0' } }));
  fs.writeFileSync(path.join(dir, 'dist', 'build', 'steps.build.mjs'), steps);
  return dir;
}

describe('publishHostPackOutput', () => {
  // Deleting the published copy before renaming the new one in leaves a window with no published output
  // at all, and a pack build resolving the dependency in that window reads one that does not exist
  it('leaves the published copy in place when the swap fails', () => {
    const dest = path.join(tmp, 'host-packs', 'base-pack');
    expect(publishHostPackOutput(builtInPack('export const steps = ["v1"];'), dest)).toBe(true);

    refuseSwap.on = true;
    expect(() => publishHostPackOutput(builtInPack('export const steps = ["v2"];'), dest)).toThrow('rename refused');

    expect(fs.readFileSync(path.join(dest, 'build', 'steps.build.mjs'), 'utf-8')).toContain('v1');
    // and nothing of the attempt is left beside it
    expect(fs.readdirSync(path.dirname(dest))).toEqual(['base-pack']);
  });

  it('publishes the new output once the swap succeeds again', () => {
    const dest = path.join(tmp, 'host-packs', 'base-pack');
    publishHostPackOutput(builtInPack('export const steps = ["v1"];'), dest);

    expect(publishHostPackOutput(builtInPack('export const steps = ["v2"];'), dest)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'build', 'steps.build.mjs'), 'utf-8')).toContain('v2');
    expect(fs.readdirSync(path.dirname(dest))).toEqual(['base-pack']);
  });
});

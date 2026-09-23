import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activationProblem } from '../../../src/packs/runtime/activation-outcome.ts';

let tmpDir: string;
const saved = { env: process.env.ABUDDY_ENV, dir: process.env.ABUDDY_USER_DATA_DIR };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'activation-outcome-'));
  process.env.ABUDDY_ENV = 'test';
  process.env.ABUDDY_USER_DATA_DIR = tmpDir;
});

afterEach(() => {
  for (const [key, value] of [['ABUDDY_ENV', saved.env], ['ABUDDY_USER_DATA_DIR', saved.dir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeRegistry(entry: Record<string, unknown>) {
  fs.writeFileSync(path.join(tmpDir, 'installed-packs.json'), JSON.stringify({
    packs: [{ name: 'p', version: '1.0.0', dir: '', enabled: true, installedAt: '', ...entry }],
  }));
}

/** A registry that recorded `problems` as the packs' load problems */
const registry = (problems: Record<string, string> = {}) => ({ loadProblem: (packId: string) => problems[packId] });

describe('activationProblem', () => {
  it('reports a pack whose runtime failed to load, which records no seed error', () => {
    writeRegistry({ id: 'broken' });
    expect(activationProblem(registry(), 'broken', false)).toMatch(/failed to load/);
  });

  it('says why a pack failed to load when the registry recorded it', () => {
    writeRegistry({ id: 'broken' });
    expect(activationProblem(registry({ broken: 'its snapshot is format 2' }), 'broken', false)).toBe('failed to load: its snapshot is format 2');
  });

  it("reports the seed error of a pack that activated", () => {
    writeRegistry({ id: 'bad-seed', lastError: 'flows: invalid' });
    expect(activationProblem(registry(), 'bad-seed', true)).toBe('its data failed to seed:\nflows: invalid');
  });

  it('is undefined for a pack that activated and seeded', () => {
    writeRegistry({ id: 'fine' });
    expect(activationProblem(registry(), 'fine', true)).toBeUndefined();
  });
});

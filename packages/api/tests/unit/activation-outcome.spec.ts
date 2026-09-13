import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activationProblem } from '@/packs/activation-outcome';

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
  fs.writeFileSync(path.join(tmpDir, 'pack-registry.json'), JSON.stringify({
    packs: [{ name: 'p', version: '1.0.0', dir: '', enabled: true, registeredAt: '', ...entry }],
  }));
}

describe('activationProblem', () => {
  it('reports a pack whose runtime failed to load, which records no seed error', () => {
    writeRegistry({ id: 'broken' });
    expect(activationProblem('broken', false)).toMatch(/failed to load/);
  });

  it("reports the seed error of a pack that activated", () => {
    writeRegistry({ id: 'bad-seed', lastError: 'flows: invalid' });
    expect(activationProblem('bad-seed', true)).toBe('its data failed to seed:\nflows: invalid');
  });

  it('is undefined for a pack that activated and seeded', () => {
    writeRegistry({ id: 'fine' });
    expect(activationProblem('fine', true)).toBeUndefined();
  });
});

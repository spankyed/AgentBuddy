import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ears/builtin-repositories.ts', () => ({
  builtinRepository: { promptQueries: { all: () => [] }, flowsCommands: {} },
}));

const { createFlowSeeder } = await import('../../src/seed/flow-seeder.ts');
const { stepRegistry } = await import('../../src/steps/registry.ts');
const { listenerTrigger, actionStep } = await import('../build/helpers/test-steps.ts');
stepRegistry.register(listenerTrigger);
stepRegistry.register(actionStep);
const { seedPath } = await import('../../src/build/manifest.ts');

let tmp: string | undefined;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
  vi.restoreAllMocks();
});

describe('flow seeder', () => {
  it('reports an invalid flow as a seed error instead of skipping it silently', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-seeder-'));
    const file = seedPath(tmp, 'flows');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      'Broken Flow': { tracks: [{ event: 'flow.entry', label: 'Flow Entry', exits: [[{ type: 'no_such_step' }]] }] },
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const seeder = createFlowSeeder();
    const counts = seeder.seed({ compiledDir: tmp, mode: 'replace-on-collision', log: () => {} });

    expect(counts.errors).toEqual([expect.stringMatching(/^Flow "Broken Flow" is invalid: /)]);
    expect(counts.created).toBe(0);
  });
});

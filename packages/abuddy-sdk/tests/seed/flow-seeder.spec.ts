import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEarsEngine, installEngine } from '@abuddy/ears';

const { createFlowSeeder } = await import('../../src/seed/flow-seeder.ts');
const { startTestRuntime, testPacks } = await import('../../src/testing/index.ts');
const { listenerTrigger, actionStep } = await import('../build/helpers/test-steps.ts');
// The registered steps the seeder compiles flows with
startTestRuntime();
testPacks.steps.set(listenerTrigger.type, listenerTrigger);
testPacks.steps.set(actionStep.type, actionStep);
const { seedPath } = await import('../../src/build/manifest.ts');

let tmp: string | undefined;
// The seeder reads and writes the installed engine: a fresh one per test
beforeEach(() => {
  installEngine(createEarsEngine({ isEntityType: (name) => ['Flow', 'Node', 'Action', 'Prompt', 'Relation'].includes(name) }).query);
});
afterEach(() => {
  installEngine(undefined);
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
  vi.restoreAllMocks();
});

describe('flow seeder', () => {
  it('reports an invalid flow as a seed error instead of skipping it silently', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-seeder-'));
    const file = seedPath(tmp, 'flows');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'seeds.json'), JSON.stringify({ version: 1, packId: 'demo', seeds: [] }));
    fs.writeFileSync(file, JSON.stringify({
      'Broken Flow': { tracks: [{ event: 'flow.entry', label: 'Flow Entry', exits: [[{ type: 'no_such_step' }]] }] },
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const seeder = createFlowSeeder();
    const counts = seeder.seed({ compiledDir: tmp, mode: 'replace-on-collision', log: () => {} });

    expect(counts.errors).toEqual([expect.stringMatching(/^Flow "Broken Flow" is invalid: /)]);
    expect(counts.created).toBe(0);
  });

  it('fails with a rebuild error when the compiled seeds name no pack', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-seeder-'));
    const file = seedPath(tmp, 'flows');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'seeds.json'), JSON.stringify({ version: 1, seeds: [] }));
    fs.writeFileSync(file, JSON.stringify({}));

    expect(() => createFlowSeeder().seed({ compiledDir: tmp!, mode: 'replace-on-collision', log: () => {} }))
      .toThrow(/doesn't name the pack that compiled these seeds: rebuild the pack/);
  });
});

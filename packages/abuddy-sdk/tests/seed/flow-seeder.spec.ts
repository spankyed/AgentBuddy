import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEarsEngine, installEngine, installedEngine } from '@abuddy/ears';

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
  /** A pack's compiled flows, one valid flow whose `sourceHash` is its version */
  function compiledFlows(name: string, version = 'v1'): string {
    tmp ??= fs.mkdtempSync(path.join(os.tmpdir(), 'flow-seeder-'));
    const file = seedPath(tmp, 'flows');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'seeds.json'), JSON.stringify({ version: 1, packId: 'demo', seeds: [] }));
    fs.writeFileSync(file, JSON.stringify({
      [name]: {
        sourceHash: `${name}-${version}`,
        tracks: [{ event: 'flow.entry', label: 'Flow Entry', exits: [[{ type: actionStep.type, action: 'Noop' }]] }],
      },
    }));
    return tmp;
  }

  /** The Flow rows with this label, through the installed engine's finder as the seeder reads them */
  const flows = (label: string) =>
    installedEngine().findWhere<{ id: string; label: string }>('Flow' as never, 'label', label);

  /**
   * **A flow is destroyed rather than trashed, so the record of the key is all there is to go on.** The
   * generic seeder can read a trashed row; `flowRepository.deleteFlow` ends in `destroy()`, and then the keys
   * the last run defined (`SeedKeyRecord`) are what say the user deleted this one.
   */
  it('leaves a deleted flow deleted when the last run defined its key', async () => {
    const { flowRepository } = await import('../../src/repositories/index.ts');
    const seeder = createFlowSeeder();
    const firstRun = { before: new Set<string>(), defined: new Set<string>() };
    expect(seeder.apply({ compiledDir: compiledFlows('Demo Flow'), mode: 'replace-on-collision', keyRecord: firstRun, log: () => {} }))
      .toMatchObject({ created: 1 });
    flowRepository.deleteFlow(flows('Demo Flow')[0].id as never, { allowRoot: true });
    expect(flows('Demo Flow'), 'a destroyed flow leaves nothing behind, which is the premise').toEqual([]);

    const counts = seeder.apply({
      compiledDir: compiledFlows('Demo Flow', 'v2'),
      mode: 'replace-on-collision',
      keyRecord: { before: firstRun.defined, defined: new Set<string>() },
      log: () => {},
    });

    expect(counts).toMatchObject({ created: 0, skipped: 1 });
    expect(flows('Demo Flow'), 'the seed created the flow the user deleted').toEqual([]);
  });

  /** And an import carrying no record puts it back, which is what asking for a pack's data back is */
  it('seeds a deleted flow again for an import with no key record', async () => {
    const { flowRepository } = await import('../../src/repositories/index.ts');
    const seeder = createFlowSeeder();
    seeder.apply({ compiledDir: compiledFlows('Demo Flow'), mode: 'replace-on-collision', log: () => {} });
    flowRepository.deleteFlow(flows('Demo Flow')[0].id as never, { allowRoot: true });

    const counts = seeder.apply({ compiledDir: compiledFlows('Demo Flow', 'v2'), mode: 'replace-on-collision', log: () => {} });

    expect(counts).toMatchObject({ created: 1 });
    expect(flows('Demo Flow').length, 'the data the user asked for was not put back').toBe(1);
  });

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
    const counts = seeder.apply({ compiledDir: tmp, mode: 'replace-on-collision', log: () => {} });

    expect(counts.errors).toEqual([expect.stringMatching(/^Flow "Broken Flow" is invalid: /)]);
    expect(counts.created).toBe(0);
  });

});

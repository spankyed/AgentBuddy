import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEarsEngine, findRelations, installEngine, installedEngine, untypedTx } from '@abuddy/ears';
import type { AppliedItem } from '../../src/utils/index.ts';

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
   * **The three parts a flow is made of, over the walk its stored digest is taken from.** `stampSeededGraph`
   * hands them back rather than a second function re-walking, so the parts and `seededGraph.hash` cannot
   * describe different reads.
   */
  it('records the flow, a part per node, and the wiring', async () => {
    const { createFlowSeeder: make } = await import('../../src/seed/flow-seeder.ts');
    const applied = new Map<string, AppliedItem>();
    make().apply({ compiledDir: compiledFlows('Demo Flow'), mode: 'replace-on-collision', applied, log: () => {} });

    const [[, item]] = [...applied];
    const paths = Object.keys(item.parts).sort();
    expect(paths.filter((p) => !p.startsWith('node:'))).toEqual(['edges', 'fields']);
    expect(paths.filter((p) => p.startsWith('node:')).length, 'a part per compiled node').toBeGreaterThan(0);
    expect(item).toMatchObject({ entityType: 'Flow', sourceHash: 'Demo Flow-v1' });
  });

  /**
   * **A rewired edge moves `edges` and nothing else**, which is the whole reason the wiring is its own part:
   * the stored digest can only say that something in the flow moved.
   */
  it('moves only `edges` when the wiring changes', async () => {
    const { createFlowSeeder: make } = await import('../../src/seed/flow-seeder.ts');
    const { driftedGraphParts } = await import('../../src/seed/flow-seeder.ts');
    const applied = new Map<string, AppliedItem>();
    make().apply({ compiledDir: compiledFlows('Demo Flow'), mode: 'replace-on-collision', applied, log: () => {} });
    const [[, item]] = [...applied];
    const flowId = flows('Demo Flow')[0].id as never;

    const nodeId = findRelations({ sourceEntity: flowId, relationType: 'contains' as never })[0].targetEntity;
    untypedTx(flowId).link('transitions_to' as never, nodeId as never, { sourceHandle: 'branch-9' });

    expect(driftedGraphParts(item, flowId)).toEqual(['edges']);
  });

  /**
   * **A node added or removed is drift too**, which is why the comparison is over both sides' part paths and
   * not only the recorded ones: a node the user added has a path the record has never seen, and one they
   * removed has a recorded path the database no longer answers for.
   */
  it('reports a node the user added, and one they removed', async () => {
    const { createFlowSeeder: make } = await import('../../src/seed/flow-seeder.ts');
    const { driftedGraphParts } = await import('../../src/seed/flow-seeder.ts');
    const applied = new Map<string, AppliedItem>();
    make().apply({ compiledDir: compiledFlows('Demo Flow'), mode: 'replace-on-collision', applied, log: () => {} });
    const [[, item]] = [...applied];
    const flowId = flows('Demo Flow')[0].id as never;
    const nodeId = findRelations({ sourceEntity: flowId, relationType: 'contains' as never })[0].targetEntity;

    const added = installedEngine().createEntityWithDefaults('Node' as never, { label: 'mine' }).id;
    untypedTx(flowId).link('contains' as never, added as never);
    // Both, and that is right: a node arrives with the `contains` edge that holds it, so the wiring moved too
    expect(driftedGraphParts(item, flowId), 'a node the user added').toEqual(['edges', `node:${added}`]);

    untypedTx(flowId).unlinkIf('contains' as never, added as never);
    untypedTx(flowId).unlinkIf('contains' as never, nodeId as never);
    expect(driftedGraphParts(item, flowId), 'a node the user removed, and the wiring that named it')
      .toEqual(['edges', `node:${nodeId}`]);
  });

  /**
   * **A flow a seeder wrote agrees with itself**: every part it recorded still matches what the entity holds,
   * so nothing reads as the user's the moment it was written. The companion of the two cases above — without
   * it they would both pass for a derivation that reported constants.
   */
  it('records parts that agree with the database it just wrote', async () => {
    const { createFlowSeeder: make } = await import('../../src/seed/flow-seeder.ts');
    const { driftedGraphParts } = await import('../../src/seed/flow-seeder.ts');
    const applied = new Map<string, AppliedItem>();
    make().apply({ compiledDir: compiledFlows('Demo Flow'), mode: 'replace-on-collision', applied, log: () => {} });

    const [[, item]] = [...applied];
    expect(driftedGraphParts(item, flows('Demo Flow')[0].id as never)).toEqual([]);
  });

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

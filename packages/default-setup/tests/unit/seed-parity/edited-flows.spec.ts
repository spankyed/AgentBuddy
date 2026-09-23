// Seeded flows someone edited or renamed survive a seed change. The flow seeder records what it
// wrote for each flow (its row, its nodes and their relations); a changed sourceHash replaces only a
// flow whose graph still holds that, and finds a flow by its seed key, not its label.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_INDEX_FILE, seedFile } from '@abuddy/sdk/build';
import { createFlowSeeder, createSeeder } from '@abuddy/sdk/seed';
import { seedData } from '@abuddy/sdk/utils';
import { registerPack, unregisterPack } from '@abuddy/testing/harness';
import { findWhere } from '@/__generated__/ears';
import { dropAttribute } from '@abuddy/sdk/testing';
import { findRelations, untypedTx } from '@abuddy/ears';
import { repository } from '@/__generated__/repository';
import { PACK_DIR, resetDatabase } from './harness';

type FlowRow = { id: never; label: string; sourceHash?: string };
const flow = (label: string) => findWhere('Flow' as never, 'label', label) as FlowRow[];
const nodesOf = (label: string) => repository.flowsQueries.flowNodes(flow(label)[0].id);

const dirs: string[] = [];
// Another installed pack seeding flows: its own seeders read the seeds it compiled
registerPack({
  id: 'other-pack',
  seeders: [createSeeder({ key: 'actions', entities: ['Action'], identity: ['label'] }), createSeeder({ key: 'prompts', entities: ['Prompt'], identity: ['label'] }), createFlowSeeder()],
});
afterAll(() => {
  unregisterPack('other-pack');
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * default-setup's compiled actions, prompts and flows; `changed` flows get a new sourceHash (per `version`), as a changed source would.
 * `only` keeps just those flows, and `packId` names another pack that compiled them.
 */
function compiled(changed: string[] = [], version = 'changed', { only, packId = 'default-setup' }: { only?: string[]; packId?: string } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-seed-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, SEED_INDEX_FILE), JSON.stringify({ version: 1, packId, seeds: [] }));
  for (const key of ['actions', 'prompts']) fs.copyFileSync(path.join(PACK_DIR, 'dist', seedFile(key)), path.join(dir, seedFile(key)));
  const all = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'dist', seedFile('flows')), 'utf-8')) as Record<string, { sourceHash?: string }>;
  const flows = only ? Object.fromEntries(only.map((name) => [name, all[name]])) : all;
  for (const name of changed) flows[name] = { ...flows[name], sourceHash: `${version}-${flows[name].sourceHash}` };
  fs.writeFileSync(path.join(dir, seedFile('flows')), JSON.stringify(flows));
  return dir;
}

const seedFlows = (dir: string) => seedData({ compiledDir: dir, mode: 'replace-on-collision' }).flows;

beforeEach(() => {
  resetDatabase();
  seedFlows(compiled());
});

describe('re-seeding edited flows', () => {
  it('replaces a changed flow nobody edited, and still tracks it after', () => {
    const counts = seedFlows(compiled(['Codex', 'Claude Code']));
    expect(counts).toMatchObject({ updated: 2, skipped: 3 });
    expect(counts.errors).toBeUndefined();
    expect(flow('Codex')[0].sourceHash).toMatch(/^changed-/);
    // Tracked again: an edit after this replacement is detected
    repository.flowsCommands.updateNode(nodesOf('Codex')[0].id, { description: 'My note' } as never);
    expect(seedFlows(compiled(['Codex', 'Claude Code'], 'changed-again'))).toMatchObject({ updated: 1, skipped: 4 });
    expect(flow('Codex')[0].sourceHash).not.toMatch(/^changed-again-/);
  });

  it("leaves a flow alone when one of its nodes was edited, and still replaces the others", () => {
    const node = nodesOf('Codex')[0];
    repository.flowsCommands.updateNode(node.id, { description: 'My note' } as never);
    const counts = seedFlows(compiled(['Codex', 'Claude Code']));
    expect(counts).toMatchObject({ updated: 1, skipped: 4 });
    expect(repository.flowsQueries.node(node.id)).toMatchObject({ description: 'My note' });
    expect(flow('Codex')[0].sourceHash).not.toMatch(/^changed-/);
  });

  it("runs the flows a replaced flow's subflows name, when this seed doesn't replace those flows", () => {
    expect(seedFlows(compiled(['Root Flow']))).toMatchObject({ updated: 1 })
    const subflowRefs = nodesOf('Root Flow').filter((node) => node.nodeType === 'subflow').map((node) => (node as { flowRef?: string }).flowRef)
    expect(subflowRefs.sort()).toEqual(['Claude Code', 'Codex', 'Command Listener', 'Onboarding Flow'].map((label) => flow(label)[0].id).sort())
  });

  it('leaves a flow alone when a node was removed from it', () => {
    repository.flowsCommands.deleteNode(nodesOf('Codex').at(-1)!.id);
    expect(seedFlows(compiled(['Codex']))).toMatchObject({ updated: 0 });
  });

  it("finds a renamed flow instead of seeding a copy, and leaves it as renamed", () => {
    repository.flowsCommands.updateFlowLabel(flow('Codex')[0].id, 'My Codex');
    const counts = seedFlows(compiled(['Codex']));
    expect(counts.created).toBe(0);
    expect(flow('Codex')).toEqual([]);
    expect(flow('My Codex')).toHaveLength(1);
  });

  it("doesn't count relations stored in another order as an edit", () => {
    // Relinking a transition (as loading relations from disk in another order would) keeps its content
    const [transition] = nodesOf('Codex').flatMap((node) => findRelations({ sourceEntity: node.id, relationType: 'transitions_to' as never }));
    untypedTx(transition.sourceEntity).unlinkIf('transitions_to' as never, transition.targetEntity);
    untypedTx(transition.sourceEntity).link('transitions_to' as never, transition.targetEntity, transition.info as never);
    expect(seedFlows(compiled(['Codex']))).toMatchObject({ updated: 1 });
  });

  it("leaves a changed flow alone when its seeded graph wasn't recorded: it can't be checked for edits", () => {
    dropAttribute(flow('Codex')[0].id, 'seededGraph');
    expect(seedFlows(compiled(['Codex']))).toMatchObject({ updated: 0 });
    expect(flow('Codex')[0].sourceHash).not.toMatch(/^changed-/);
  });

  it("points a replaced flow's subflow steps at a seeded flow the user renamed", () => {
    const codex = flow('Codex')[0].id;
    repository.flowsCommands.updateFlowLabel(codex, 'My Codex');
    expect(seedFlows(compiled(['Root Flow']))).toMatchObject({ updated: 1, created: 0 });
    const refs = nodesOf('Root Flow').filter((node) => node.nodeType === 'subflow').map((node) => (node as { flowRef?: string }).flowRef);
    expect(refs).toContain(codex);
    expect(refs).not.toContain('Codex');
  });

  it("points a replaced flow's subflow steps at the seeded flow, not a user's flow with its label", () => {
    const codex = flow('Codex')[0].id;
    const mine = repository.flowsCommands.createFlow({ label: 'Codex' } as never).id;
    expect(seedFlows(compiled(['Root Flow']))).toMatchObject({ updated: 1 });
    const refs = nodesOf('Root Flow').filter((node) => node.nodeType === 'subflow').map((node) => (node as { flowRef?: string }).flowRef);
    expect(refs).toContain(codex);
    expect(refs).not.toContain(mine);
  });

  it("runs a user's flow with a seeded flow's name when the seed left that flow alone for it", () => {
    repository.flowsCommands.deleteFlow(flow('Codex')[0].id);
    const mine = repository.flowsCommands.createFlow({ label: 'Codex' } as never).id;
    const counts = seedFlows(compiled(['Root Flow', 'Codex']));
    expect(counts).toMatchObject({ updated: 1, created: 0 });
    expect(counts.errors).toBeUndefined();
    const refs = nodesOf('Root Flow').filter((node) => node.nodeType === 'subflow').map((node) => (node as { flowRef?: string }).flowRef);
    expect(refs).toContain(mine);
    expect(refs).not.toContain('Codex');
  });
});

describe('a flow whose name another flow already has', () => {
  const graph = (label: string) => ({ row: flow(label)[0], nodes: nodesOf(label) });

  it("isn't seeded over another pack's flow: the other flow is left as it is, and the seed reports it", () => {
    const before = graph('Codex');
    const counts = seedFlows(compiled(['Codex'], 'other', { only: ['Codex'], packId: 'other-pack' }));
    expect(counts).toMatchObject({ created: 0, updated: 0 });
    expect(counts.errors).toEqual(['Flow "Codex": a flow with this name already exists (seeded by default-setup)']);
    expect(graph('Codex')).toEqual(before);
    // default-setup still owns and updates its flow
    expect(seedFlows(compiled(['Codex']))).toMatchObject({ updated: 1 });
    expect(flow('Codex')[0].sourceHash).toMatch(/^changed-/);
  });

  it("isn't seeded over a user's flow with the ids the seed would write", () => {
    // A user's flow that has the compiled flow's ids, under another name
    const codex = flow('Codex')[0].id;
    for (const attr of ['sourceHash', 'seedKey', 'seededGraph']) dropAttribute(codex, attr);
    repository.flowsCommands.updateFlowLabel(codex, 'My Codex');
    const before = graph('My Codex');
    const counts = seedFlows(compiled(['Codex']));
    expect(counts.created).toBe(0);
    expect(counts.errors).toEqual(['Flow "Codex": a flow with this name already exists (created by the user)']);
    expect(graph('My Codex')).toEqual(before);
    expect(flow('Codex')).toEqual([]);
  });

  it("leaves a user's flow with the name alone", () => {
    const pack = compiled(['Codex'], 'other', { only: ['Codex'], packId: 'other-pack' });
    // No default-setup flows: only the actions and prompts flows use
    resetDatabase();
    seedFlows(compiled([], 'changed', { only: [] }));
    const mine = repository.flowsCommands.createFlow({ label: 'Codex' } as never).id;
    const before = graph('Codex');
    expect(seedFlows(pack)).toMatchObject({ created: 0, skipped: 1 });
    expect(flow('Codex')).toEqual([before.row]);
    expect(before.row.id).toBe(mine);
    expect(nodesOf('Codex')).toEqual(before.nodes);
  });
});

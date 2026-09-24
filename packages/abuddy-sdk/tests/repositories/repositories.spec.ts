// The repositories of the SDK's entities, on the in-memory runtime: imported flows with their root role,
// nodes and edges, step results on TNodes, and actions and prompts
import * as os from 'node:os';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findRelations, installedEngine, untypedTx, untypedQx } from '@abuddy/ears';
import { actionRepository, flowRepository, promptRepository, tnodeRepository, trash } from '../../src/repositories/index.ts';
import { compile as compileFlowDSL } from '../../src/build/compilers/flow-compiler.ts';
import { resetTestData, startTestRuntime, testPacks } from '../../src/testing/index.ts';
import { EARS } from '../../src/types/entities.ts';
import { actionStep, listenerTrigger } from '../build/helpers/test-steps.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();

beforeAll(() => {
  testPacks.steps.set(listenerTrigger.type, listenerTrigger);
  testPacks.steps.set(actionStep.type, actionStep);
});

beforeEach(() => resetTestData());

/** Imports a root flow whose entry runs the action, and returns its id */
function importRootFlow(actionId: EARS.EntityId): EARS.EntityId {
  const compiled = compileFlowDSL(
    { 'Root Flow': { root: true, tracks: [{ event: 'flow.entry', exits: [[{ type: 'action', action: 'Greet' }]] }] } },
    { actions: new Map([['Greet', actionId]]) },
  );
  const { flowIds: [flowId] } = flowRepository.importFromDSL(compiled);
  return flowId;
}

describe('flowRepository', () => {
  it('imports compiled flows with the root role, their nodes, edges and related actions', () => {
    const action = actionRepository.create({ label: 'Greet', actionFn: 'return 1' });
    const flowId = importRootFlow(action.id);

    expect(flowRepository.rootFlow()).toBe(flowId);
    const nodes = flowRepository.flowNodes(flowId);
    expect(nodes.map((node) => node.nodeType).sort()).toEqual(['action', 'listener']);
    const actionNode = nodes.find((node) => node.nodeType === 'action')!;
    expect(actionNode.actionId).toBe(action.id);
    expect(flowRepository.getNodeActionId(actionNode.id)).toBe(action.id);
    expect(flowRepository.flowEdges(flowId)).toEqual([expect.objectContaining({ kind: EARS.RelKind.TRANSITIONS_TO, target: actionNode.id })]);
  });

  it('changes a node\'s related action only when the update names it', () => {
    const action = actionRepository.create({ label: 'Greet', actionFn: 'return 1' });
    const other = actionRepository.create({ label: 'Wave', actionFn: 'return 2' });
    const actionNode = flowRepository.flowNodes(importRootFlow(action.id)).find((node) => node.nodeType === 'action')!;

    flowRepository.updateNode(actionNode.id, { label: 'Renamed' });
    expect(flowRepository.getNodeActionId(actionNode.id)).toBe(action.id);

    flowRepository.updateNode(actionNode.id, { actionId: other.id });
    expect(flowRepository.getNodeActionId(actionNode.id)).toBe(other.id);

    flowRepository.updateNode(actionNode.id, { actionId: undefined });
    expect(flowRepository.getNodeActionId(actionNode.id)).toBeUndefined();
    // The node no longer names the action it was linked to
    expect(flowRepository.node(actionNode.id)?.actionId).toBeUndefined();
  });

  it('keeps the root flow unless deleting it is allowed, then removes its nodes and relations', () => {
    const flowId = importRootFlow(actionRepository.create({ label: 'Greet', actionFn: 'return 1' }).id);
    const nodeIds = flowRepository.flowNodes(flowId).map((node) => node.id);

    expect(() => flowRepository.deleteFlow(flowId)).toThrow('Cannot delete the root flow');
    flowRepository.deleteFlow(flowId, { allowRoot: true });

    expect(flowRepository.rootFlow()).toBeUndefined();
    expect(untypedQx(EARS.Entity.Flow).ids()).toEqual([]);
    for (const id of nodeIds) expect(untypedQx([id]).count()).toBe(0);
    expect(findRelations({ sourceEntity: flowId })).toEqual([]);
  });

  it('moves the root role to the flow granted it', () => {
    const first = flowRepository.createFlow({ label: 'First' });
    const second = flowRepository.createFlow({ label: 'Second' });
    flowRepository.grantRootFlowRole(first.id);
    flowRepository.grantRootFlowRole(second.id);
    expect(untypedQx().withRole(EARS.RoleKind.Custom('root_flow')).ids()).toEqual([second.id]);
  });

  it("connects nodes, refusing a trigger target and a busy handle, and renumbers a node's handles", () => {
    const flow = flowRepository.createFlow();
    const entry = flowRepository.createNode(flow.id, { nodeType: 'listener', label: 'Entry' });
    const step = flowRepository.createNode(flow.id, { nodeType: 'action' });
    const other = flowRepository.createNode(flow.id, { nodeType: 'action' });
    expect(step.label).toBe('New Node');

    expect(() => flowRepository.createEdge(step.id, entry.id)).toThrow('Trigger nodes cannot receive incoming connections');
    flowRepository.createEdge(step.id, other.id, { sourceHandle: 'case-0' });
    expect(() => flowRepository.createEdge(step.id, other.id, { sourceHandle: 'case-0' })).toThrow('Edge already exists');

    flowRepository.reindexHandles(step.id, 'case', 0, 1);
    expect(findRelations({ sourceEntity: step.id, relationType: EARS.RelKind.TRANSITIONS_TO }).map((rel) => (rel.info as { sourceHandle: string }).sourceHandle)).toEqual(['case-1']);

    flowRepository.deleteNode(other.id);
    expect(flowRepository.flowEdges(flow.id)).toEqual([]);
    expect(flowRepository.flowNodes(flow.id).map((node) => node.id).sort()).toEqual([entry.id, step.id].sort());
  });

  it('moves an edge in place with its handles, and refuses a move that isn\'t allowed, leaving the edge as it was', () => {
    const flow = flowRepository.createFlow();
    const entry = flowRepository.createNode(flow.id, { nodeType: 'listener', label: 'Entry' });
    const a = flowRepository.createNode(flow.id, { nodeType: 'action' });
    const b = flowRepository.createNode(flow.id, { nodeType: 'action' });
    const c = flowRepository.createNode(flow.id, { nodeType: 'action' });
    const { relId } = flowRepository.createEdge(a.id, b.id, { sourceHandle: 'case-0' });
    flowRepository.createEdge(a.id, c.id, { sourceHandle: 'case-1' });
    const edges = () => findRelations({ sourceEntity: a.id, relationType: EARS.RelKind.TRANSITIONS_TO })
      .map((rel) => ({ id: rel.id, target: rel.targetEntity, sourceHandle: (rel.info as { sourceHandle?: string }).sourceHandle }));

    // Onto another handle and target: the same edge, its own handle not counted as busy
    flowRepository.updateEdge(relId, { source: a.id, target: c.id, sourceHandle: 'case-2' });
    expect(edges()).toContainEqual({ id: relId, target: c.id, sourceHandle: 'case-2' });
    flowRepository.updateEdge(relId, { source: a.id, target: c.id, sourceHandle: 'case-2' });

    const before = edges();
    expect(() => flowRepository.updateEdge(relId, { source: a.id, target: entry.id, sourceHandle: 'case-2' }))
      .toThrow('Trigger nodes cannot receive incoming connections');
    expect(() => flowRepository.updateEdge(relId, { source: a.id, target: b.id, sourceHandle: 'case-1' }))
      .toThrow('Source handle already has an outgoing connection');
    expect(edges()).toEqual(before);
  });
});

describe('tnodeRepository', () => {
  it("records a step's result on its TNode, truncated, beside what's there", () => {
    const tNodeId = 'TNode-1' as EARS.EntityId;
    untypedTx(tNodeId, true).put('entityType', EARS.Entity.TNode).put('nodeAttributes', { input: 'hi' });

    tnodeRepository.updateTNodeResult(tNodeId, { text: 'x'.repeat(20000) });

    expect(untypedQx(tNodeId).pickOne(['nodeAttributes'])?.nodeAttributes).toEqual({
      input: 'hi',
      result: { text: expect.objectContaining({ _truncated: true, _type: 'string', _originalLength: 20000 }) },
    });
  });

  it('leaves a TNode that does not exist alone', () => {
    tnodeRepository.updateTNodeResult('TNode-missing' as EARS.EntityId, { ok: true });
    expect(untypedQx(['TNode-missing' as EARS.EntityId]).count()).toBe(0);
  });
});

describe('actionRepository and promptRepository', () => {
  it('create, find by label, update and soft-delete', () => {
    const action = actionRepository.create({ label: 'Greet', actionFn: 'return 1' });
    const prompt = promptRepository.create({ label: 'Hello', templateFn: 'return "hi"' });
    expect(action).toMatchObject({ entityType: 'Action', input: {}, shortCode: expect.stringMatching(/^ACT/) });
    expect(actionRepository.byLabel('Greet')?.id).toBe(action.id);
    expect(promptRepository.byLabel('Hello')?.id).toBe(prompt.id);

    actionRepository.update(action.id, { description: 'Says hi' });
    expect(actionRepository.byId(action.id)?.description).toBe('Says hi');

    actionRepository.delete(action.id);
    promptRepository.delete(prompt.id);
    expect(actionRepository.all()).toEqual([]);
    expect(promptRepository.all()).toEqual([]);
    expect(untypedQx([action.id]).pickOne(['deleted'])?.deleted).toBe(true);
  });

  it('refuse an action or prompt without its label or body, and a missing id', () => {
    expect(() => actionRepository.create({ label: ' ', actionFn: 'return 1' })).toThrow('Label is required');
    expect(() => promptRepository.create({ label: 'P', templateFn: '' })).toThrow('Template is required');
    expect(() => actionRepository.update('Action-missing' as EARS.EntityId, {})).toThrow('Action Action-missing not found');
    expect(() => promptRepository.delete('Prompt-missing' as EARS.EntityId)).toThrow('Prompt Prompt-missing not found');
  });
});

describe('trash', () => {
  // Any entity type: prompts here
  const note = (title: string) => untypedTx(`Prompt-${title}` as EARS.EntityId, true).put('entityType', 'Prompt').put('title', title).id();
  const findById = (id: EARS.EntityId) => installedEngine().findById<Record<string, unknown>>(id);
  const findByIdRaw = (id: EARS.EntityId) => installedEngine().findByIdRaw(id);

  it('moves entities to the trash, where finders skip them, and restores them unmarked', () => {
    const [a, b] = [note('a'), note('b')];

    expect(trash.move([a, b, 'Prompt-missing' as EARS.EntityId], 1000)).toEqual([a, b]);
    expect(trash.move([a], 2000)).toEqual([]);
    expect(findById(a)).toBeUndefined();
    expect(installedEngine().findAll('Prompt')).toEqual([]);
    expect(findByIdRaw(a)).toMatchObject({ deleted: true, deletedAt: 1000 });
    expect(trash.isTrashed(a)).toBe(true);
    expect(trash.list('Prompt').map((n) => n.id).sort()).toEqual([a, b].sort());

    expect(trash.restore([a, 'Prompt-missing' as EARS.EntityId])).toEqual([a]);
    expect(trash.restore([a])).toEqual([]);
    const restored = findById(a);
    expect(restored).toMatchObject({ title: 'a' });
    expect(restored).not.toHaveProperty('deleted');
    expect(restored).not.toHaveProperty('deletedAt');
    expect(trash.isTrashed(a)).toBe(false);
    expect(trash.list('Prompt').map((n) => n.id)).toEqual([b]);
  });

  it('lists the entities trashed longer ago than an age', () => {
    const [old, recent] = [note('old'), note('recent')];
    trash.move([old], 1_000);
    trash.move([recent], 9_000);
    expect(trash.olderThan('Prompt', 5_000, 10_000).map((n) => n.id)).toEqual([old]);
  });
});

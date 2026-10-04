// The brain view's node details: a reply that names the node it describes, against a view that has
// already moved on.
//
// Every `GET_TNODE_DETAILS` leaves `selectedStepNode.id` as the node being waited on — the click sets it,
// and the refresh path only asks about the node already selected. So the reply is identifiable without a
// new field; a handler that takes whatever arrives shows the wrong panel after two quick clicks.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('#generated/events.ts', () => ({ sendToSystem }));

const { default: brainState } = await import('#features/brain/fe/state.ts');

const details = (id: string) => ({ id, label: id }) as never;

/**
 * A started plugin in `ready`, which is where node clicks are handled.
 *
 * `RECEIVE_PLUGIN_DATA` is what moves it there, and `normalizeFlowTNodeData` tolerates a missing
 * `tNodeTree`, so nothing here has to build a tree to ask about correlation.
 */
function ready() {
  const actor = createActor(brainState).start();
  actor.send({
    type: 'RECEIVE_PLUGIN_DATA',
    data: { flowTNodeId: 'f1', possibleEvents: [], flowHierarchy: [] },
  } as never);
  return actor;
}

beforeEach(() => {
  sendToSystem.mockReset();
});

it('shows the node last clicked, not the answer that arrived last', () => {
  const actor = ready();

  actor.send({ type: 'NODE.CLICK', nodeId: 'n1' } as never);
  actor.send({ type: 'NODE.CLICK', nodeId: 'n2' } as never);
  expect(actor.getSnapshot().context.selectedStepNode?.id, 'the click sets it at once').toBe('n2');

  // n2 answers, then n1's older answer turns up
  actor.send({ type: 'TNODE_DETAILS', tNodeId: 'n2', details: details('n2') } as never);
  actor.send({ type: 'TNODE_DETAILS', tNodeId: 'n1', details: details('n1') } as never);

  expect(actor.getSnapshot().context.selectedStepNode?.id).toBe('n2');
});

it('takes the details for the node it is waiting on', () => {
  const actor = ready();
  actor.send({ type: 'NODE.CLICK', nodeId: 'n1' } as never);

  actor.send({ type: 'TNODE_DETAILS', tNodeId: 'n1', details: details('n1') } as never);
  expect(actor.getSnapshot().context.selectedStepNode).toMatchObject({ id: 'n1', label: 'n1' });
});

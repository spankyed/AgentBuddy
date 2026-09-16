// Action code runs in one sandbox (runActionCode) whether a flow's action step or services.action runs it:
// `params`, `services` with a logger named after the action, `z`, and `flowId` from a flow step
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import type { LogEvent } from '@abuddy/sdk/logger';
import type { ActionEntity } from '@abuddy/sdk';
import { services } from '@abuddy/sdk/services';
import { repository } from '@/__generated__/repository';
import { testRootEvents } from '@abuddy/sdk/testing';
import { handler } from '../../src/extensions/steps/action/runtime';
import { actionService } from '../../src/features/actions/be/services/action';

// Logs what it can reach, and returns it
const ACTION = `
  const reached = {
    z: typeof z.string === 'function',
    flowId,
    repository: typeof services.repository.actionQueries.all,
    param: params.name,
  };
  services.logger.info('ran', reached);
  return reached;
`;

const logs: LogEvent[] = [];
let stopLogs: () => void;
beforeAll(() => { stopLogs = testRootEvents.onLog((event) => logs.push(event)); });
afterAll(() => stopLogs());
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  logs.length = 0;
  vi.restoreAllMocks();
});

describe('the action sandbox', () => {
  it("runs a flow's inline action with z, the flow id and a logger named after the step", async () => {
    const sent: Array<{ type: string; result?: unknown }> = [];
    const tNode = { id: 'TNode-action', nodeAttributes: {} } as unknown as TNodeEntity;
    const ctx = { flowTNodeId: 'TNode-flow', event: { type: 'go', name: 'from-event' }, runtime: { getAppServices: () => services } } as unknown as ExecutionContext;

    await handler(tNode, { id: 'Node-1', label: 'Greet', nodeType: 'action', mode: 'code', actionFn: ACTION.replace('params.name', 'params.event.name') }, ctx, { send: (event: { type: string }) => sent.push(event) });

    const reached = { z: true, flowId: 'TNode-flow', repository: 'function', param: 'from-event' };
    expect(sent).toEqual([{ type: 'COMPLETE', result: reached }]);
    expect(logs).toContainEqual({ level: 'info', message: 'ran', source: 'action:Greet', meta: reached });
  });

  it('runs a stored action through services.action with z and a logger named after the action', async () => {
    vi.spyOn(repository.actionQueries, 'all').mockReturnValue([{ label: 'Say Hi', actionFn: ACTION } as ActionEntity]);

    const result = await actionService.getAndExecute('Say Hi', { name: 'direct' });

    const reached = { z: true, flowId: undefined, repository: 'function', param: 'direct' };
    expect(result).toEqual(reached);
    expect(logs).toContainEqual({ level: 'info', message: 'ran', source: 'action:Say Hi', meta: reached });
  });
});

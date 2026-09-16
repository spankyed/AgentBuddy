import { z } from 'zod';
import { createLogger } from '@abuddy/sdk/logger';

export interface ActionRun {
  /** Names the action's logger: `action:<label>` */
  label: string;
  params: Record<string, unknown>;
  /** The services the code receives; its `services.logger` is replaced with the action's logger */
  services: object;
  /** The running flow's TNode, when a flow step runs the action */
  flowId?: string;
}

type ActionFunction = (params: Record<string, unknown>, services: object, zod: typeof z, flowId: string | undefined) => Promise<unknown>;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => ActionFunction;

/**
 * Runs action code, an async function body, with `params`, `services`, `z` and `flowId`: how a flow's action
 * step and `services.action` run an action.
 */
export function runActionCode(actionFn: string, { label, params, services, flowId }: ActionRun): Promise<unknown> {
  const logger = createLogger(`action:${label}`);
  const actionServices = new Proxy(services, {
    get: (target, prop, receiver) => (prop === 'logger' ? logger : Reflect.get(target, prop, receiver)),
  });
  return new AsyncFunction('params', 'services', 'z', 'flowId', actionFn)(params, actionServices, z, flowId);
}

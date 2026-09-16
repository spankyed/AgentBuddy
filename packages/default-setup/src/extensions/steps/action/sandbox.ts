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

/**
 * Runs action code, an async function body, with `params`, `services`, `z` and `flowId`: how a flow's action
 * step and `services.action` run an action.
 */
export function runActionCode(actionFn: string, { label, params, services, flowId }: ActionRun): Promise<unknown> {
  const logger = createLogger(`action:${label}`);
  const actionServices = new Proxy(services, {
    get: (target, prop, receiver) => (prop === 'logger' ? logger : Reflect.get(target, prop, receiver)),
    has: (target, prop) => prop === 'logger' || Reflect.has(target, prop),
    ownKeys: (target) => {
      const keys = Reflect.ownKeys(target);
      return keys.includes('logger') ? keys : [...keys, 'logger'];
    },
    getOwnPropertyDescriptor: (target, prop) => (prop === 'logger'
      ? { configurable: true, enumerable: true, writable: true, value: logger }
      : Reflect.getOwnPropertyDescriptor(target, prop)),
  });
  // `z` and `flowId` sit in an outer scope so the code can declare its own; redeclaring `params` or `services` fails
  const run = new Function('params', 'services', '__abuddyZ', '__abuddyFlowId', `const z = __abuddyZ, flowId = __abuddyFlowId;
return (async (params, services) => {
${actionFn}
})(params, services);`) as ActionFunction;
  return run(params, actionServices, z, flowId);
}

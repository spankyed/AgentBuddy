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

/**
 * Runs action code, an async function body, with `params`, `services`, `z` and `flowId`: how a flow's action
 * step and `services.action` run an action.
 */
export function runActionCode(actionFn: string, { label, params, services, flowId }: ActionRun): Promise<unknown> {
  const logger = createLogger(`action:${label}`);
  const actionServices = new Proxy(services, {
    get: (target, prop, receiver) => (prop === 'logger' ? logger : Reflect.get(target, prop, receiver)),
  });
  // `z` and `flowId` come from an enclosing scope, so the code can declare its own
  const scoped = new Function('z', 'flowId', `return async function (params, services) {\n${actionFn}\n};`);
  return scoped(z, flowId)(params, actionServices);
}

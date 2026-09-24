import { z } from 'zod';
import { createLogger } from '@abuddy/sdk/logger';
import { createActionEmitter } from '@abuddy/sdk/services';
import { packId } from '@/__generated__/ref';

export interface ActionRun {
  /** Names the action's logger and stamps its sends: `action:<label>` */
  label: string;
  params: Record<string, unknown>;
  /**
   * The services the code receives; its `services.logger` and `services.emitter` are replaced with ones that know
   * which action is running
   */
  services: object;
  /** The running flow's TNode, when a flow step runs the action */
  flowId?: string;
}

/**
 * Runs action code, an async function body, with `params`, `services`, `z` and `flowId`: how a flow's action
 * step and `services.action` run an action.
 *
 * This is where an action stops being anonymous. Its code is a string from the database, so nothing downstream
 * can work out who wrote a message it sends; here both halves are in hand, and go on every message as the pack
 * (`Message.from`) and the action (`Message.via`).
 */
export function runActionCode(actionFn: string, { label, params, services, flowId }: ActionRun): Promise<unknown> {
  // One string names the action's logger and stamps its sends, so a dropped send and the action's own log lines
  // are found by the same grep
  const source = `action:${label}`;
  const logger = createLogger(source);
  const emitter = createActionEmitter({ from: packId, via: source });
  const actionServices = new Proxy(services, {
    get: (target, prop, receiver) => {
      if (prop === 'logger') return logger;
      if (prop === 'emitter') return emitter;
      return Reflect.get(target, prop, receiver);
    },
  });
  // `z` and `flowId` come from an enclosing scope, so the code can declare its own
  const scoped = new Function('z', 'flowId', `return async function (params, services) {\n${actionFn}\n};`);
  return scoped(z, flowId)(params, actionServices);
}

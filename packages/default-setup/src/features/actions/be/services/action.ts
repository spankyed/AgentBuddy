import { repository } from '@/__generated__/repository';
import type { ActionEntity } from '@abuddy/sdk';
import { services as appServices } from '@abuddy/sdk/services';

export class ActionService {
  getByLabel(label: string) {
    const allActions = repository.actionQueries.all();
    return allActions.find((action: ActionEntity) => action.label === label);
  }

  async executeAction(actionFn: string, params: Record<string, any> = {}): Promise<any> {
    try {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction('params', 'services', actionFn);
      const services = appServices;
      return await fn(params, services);
    } catch (error) {
      throw new Error(`Failed to execute action: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }

  async getAndExecute(label: string, params: Record<string, any> = {}): Promise<any | undefined> {
    const action = this.getByLabel(label);
    if (!action) {
      return undefined;
    }
    return this.executeAction(action.actionFn, params);
  }
}

export const actionService = new ActionService();
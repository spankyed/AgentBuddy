import { repository } from '@/repository';
import type { ActionEntity } from '@/systems/actions/types';
import { EARS } from '@/core/types';

// Lazy services getter to avoid circular dependency
function getServices() {
  return require('./index').default;
}

export class ActionService {
  async getById(id: EARS.EntityId): Promise<ActionEntity | undefined> {
    return repository.actionQueries.byId(id);
  }

  async getByLabel(label: string): Promise<ActionEntity | undefined> {
    const allActions = repository.actionQueries.all();
    return allActions.find(action => action.label === label);
  }

  async getByCategory(category: string): Promise<ActionEntity[]> {
    return repository.actionQueries.byCategory(category);
  }

  async executeAction(actionFn: string, params: Record<string, any> = {}): Promise<any> {
    try {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction('params', 'services', actionFn);
      const services = getServices();
      return await fn(params, services);
    } catch (error) {
      throw new Error(`Failed to execute action: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAndExecute(label: string, params: Record<string, any> = {}): Promise<any | undefined> {
    const action = await this.getByLabel(label);
    if (!action) {
      return undefined;
    }
    return this.executeAction(action.actionFn, params);
  }
}

export const actionService = new ActionService();
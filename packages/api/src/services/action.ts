import { repository } from '@/repository';
import type { ActionEntity } from '@/systems/actions/types';
import { EARS } from '@/core/types';

// Lazy services getter — merges built-in + user-installed services
function getServices() {
  const mod = require('./index');
  return mod.getServicesWithUser(mod.default);
}

export class ActionService {
  getById(id: EARS.EntityId) {
    return repository.actionQueries.byId(id);
  }

  getByLabel(label: string) {
    const allActions = repository.actionQueries.all();
    return allActions.find(action => action.label === label);
  }

  getByCategory(category: string) {
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
    const action = this.getByLabel(label);
    if (!action) {
      return undefined;
    }
    return this.executeAction(action.actionFn, params);
  }
}

export const actionService = new ActionService();
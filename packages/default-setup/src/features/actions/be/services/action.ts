import { repository } from '@/__generated__/repository';
import type { ActionEntity } from '@abuddy/sdk';
import { services as appServices } from '@abuddy/sdk/services';
import { runActionCode } from '@/extensions/steps/action/sandbox';
import { errorMessage } from '@abuddy/sdk/utils/pure';

export class ActionService {
  getByLabel(label: string) {
    const allActions = repository.actionQueries.all();
    return allActions.find((action: ActionEntity) => action.label === label);
  }

  /** Runs action code; `label` names its logger (`action:<label>`) */
  async executeAction(actionFn: string, params: Record<string, any> = {}, { label = 'inline' }: { label?: string } = {}): Promise<any> {
    try {
      return await runActionCode(actionFn, { label, params, services: appServices });
    } catch (error) {
      throw new Error(`Failed to execute action: ${errorMessage(error)}`, { cause: error });
    }
  }

  async getAndExecute(label: string, params: Record<string, any> = {}): Promise<any | undefined> {
    const action = this.getByLabel(label);
    if (!action) {
      return undefined;
    }
    return this.executeAction(action.actionFn, params, { label: action.label });
  }
}

export const actionService = new ActionService();
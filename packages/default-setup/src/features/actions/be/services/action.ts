import { repository } from '#generated/repository.ts';
import type { ActionEntity } from '@apackdev/sdk';
import { services as appServices } from '@apackdev/sdk/services';
import { runActionCode } from '#extensions/steps/action/sandbox.ts';
import { errorMessage } from '@apackdev/sdk/utils/pure';

export class ActionService {
  findByLabel(label: string) {
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

  async executeIfFound(label: string, params: Record<string, any> = {}): Promise<any | undefined> {
    const action = this.findByLabel(label);
    if (!action) {
      return undefined;
    }
    return this.executeAction(action.actionFn, params, { label: action.label });
  }
}

export const actionService = new ActionService();
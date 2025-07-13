import { loggerAction, loggerService } from './logger';
import type { ActionEntity } from '@/systems/actions/types';
import type { EARS } from '@/core/types';

const services = {
  logger: loggerService,
}

const actions = ([
  loggerAction,
] as Omit<ActionEntity, 'createdAt' | 'entityType'>[]).map(function transformToActionEntity(
  partialAction
): ActionEntity {
  return {
    ...partialAction,
    entityType: 'Action' as EARS.Entity.Action,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
})

export default services;
export {
  actions
}
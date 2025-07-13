import { loggerAction, loggerService } from './logger';
import type { ActionEntity } from '@/systems/actions/types';
import type { EARS } from '@/core/types';

const services = {
  logger: loggerService,
}

const actions = [
  loggerAction,
].map(function transformToActionEntity(
  partialAction: Omit<ActionEntity, 'createdAt' | 'entityType'>
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
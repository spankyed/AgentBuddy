import { loggerAction, loggerService } from './logger';
import * as llm from './llm';
import * as emitter from './event-emitter';
import * as database from './database';
import { promptService } from './prompt';
import { actionService } from './action';
import { libraryService } from './library';
import * as browser from './browser';
import type { ActionEntity } from '@/systems/actions/types';
import { EARS } from '@/core/types';

const services = {
  logger: loggerService,
  llm,
  emitter,
  database,
  prompt: promptService,
  action: actionService,
  library: libraryService,
  browser,
}

const actions = ([
  loggerAction,
] as Omit<ActionEntity, 'createdAt' | 'entityType'>[]).map(function transformToActionEntity(
  partialAction
): ActionEntity {
  return {
    ...partialAction,
    entityType: EARS.Entity.Action,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
})

export default services;
export {
  actions
}

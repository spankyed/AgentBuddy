/**
 * Action DSL Export Module
 *
 * Type definitions for Monaco Editor action DSL intellisense.
 * All pack-specific types flow through generated barrels.
 */

import { featureServices } from '@/__generated__/services';
import { loggerService } from '@/services/logger';
import * as emitter from '@/services/event-emitter';
import { repositoryService } from '@/services/repository';

export interface ActionParams {
  [key: string]: any;
}

export const services = {
  logger: loggerService,
  emitter,
  repository: repositoryService,
  ...featureServices,
};
export type Services = typeof services;
export const params: ActionParams = undefined as any;

export type { ActionEntity, SettingsData } from '@/__generated__/types';

export { z } from 'zod';

import type { z as _z } from 'zod';
export type Z = typeof _z;

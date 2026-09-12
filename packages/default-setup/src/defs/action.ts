/**
 * Action DSL Export Module
 *
 * Type definitions for Monaco Editor action DSL intellisense.
 * All pack-specific types flow through generated barrels.
 */

import { featureServices } from '@/__generated__/services';
import { createLogger } from '@abuddy/sdk/logger';
import * as emitter from '@abuddy/sdk/services';
import { repository } from '@abuddy/sdk/ears';

export interface ActionParams {
  [key: string]: any;
}

export const services = {
  logger: createLogger('action-dsl'),
  emitter,
  repository,
  ...featureServices,
};
export type Services = typeof services;
export const params: ActionParams = undefined as any;

export type { ActionEntity, SettingsData } from '@/__generated__/types';

export { z } from 'zod';

import type { z as _z } from 'zod';
export type Z = typeof _z;

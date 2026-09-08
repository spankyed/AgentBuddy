/**
 * Action DSL Export Module
 * This module exports all types and functions needed for the Action DSL
 * Used to generate type definitions for Monaco Editor
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

export { ActionService } from '@/features/actions/be/services/action';
export { PromptService } from '@/features/prompts/be/services/prompt';
export { LibraryService } from '@/features/library/be/services/library';
export type { ActionEntity } from '@/features/actions/be/types';
export type { SettingsData } from '@/features/settings/be/types';

export { z } from 'zod';

import type { z as _z } from 'zod';
export type Z = typeof _z;

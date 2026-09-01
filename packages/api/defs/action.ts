/**
 * Action DSL Export Module
 * This module exports all types and functions needed for the Action DSL
 * Used to generate type definitions for Monaco Editor
 */

import importedServices from '@/services/index';

export interface ActionParams {
  [key: string]: any;
}

export const services = importedServices;
export type Services = typeof services;
export const params: ActionParams = undefined as any;

export { ActionService } from '@/plugins/actions/be/services/action';
export { PromptService } from '@/plugins/prompts/be/services/prompt';
export { LibraryService } from '@/plugins/library/be/services/library';
export type { ActionEntity } from '@/plugins/actions/be/types';
export type { SettingsData } from '@/plugins/settings/be/types';

export { z } from 'zod';

import type { z as _z } from 'zod';
export type Z = typeof _z;

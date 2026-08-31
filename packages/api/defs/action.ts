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

export { ActionService } from '@/features/actions/be/services/action';
export { PromptService } from '@/features/prompts/be/services/prompt';
export { LibraryService } from '@/features/library/be/services/library';
export type { ActionEntity } from '@/features/actions/be/types';
export type { SettingsData } from '@/features/settings/be/types';

export { z } from 'zod';

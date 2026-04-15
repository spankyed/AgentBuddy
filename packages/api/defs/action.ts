/**
 * Action DSL Export Module
 * This module exports all types and functions needed for the Action DSL
 * Used to generate type definitions for Monaco Editor
 */

// Import services and zod for type definitions
import type importedServices from '@/services/index';
import { z } from 'zod';

// Type definitions that match what's available in action context
export interface ActionParams {
  [key: string]: any;
}

// Service type definitions (these will be extracted from the actual implementations)
export type Services = typeof importedServices;


// Re-export service interfaces for better type generation
export { ActionService } from '@/services/action';
export { PromptService } from '@/services/prompt';
export { LibraryService } from '@/services/library';
export type { ActionEntity } from '@/systems/actions/types';
export type { SettingsData } from '@/systems/settings/types';

// Export runtime placeholders for Monaco Editor intellisense
// These will be available when the module is imported
export const services: Services = undefined as any;
export const params: ActionParams = undefined as any;

// Re-export zod directly so it's available in the module
export { z } from 'zod';
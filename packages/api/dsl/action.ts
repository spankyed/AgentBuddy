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

// Re-export zod for Monaco Editor intellisense
export { z };

// Re-export service interfaces for better type generation
export { ActionService } from '@/services/action';
export { PromptService } from '@/services/prompt';
export { LibraryService } from '@/services/library';
export type { ActionEntity } from '@/systems/actions/types';

// Monaco Editor intellisense namespace (no naming conflicts)
export namespace ActionDSL {
  export const services: Services = undefined as any;
  export const params: ActionParams = undefined as any;
  export const z: typeof import('zod').z = undefined as any;
}

// Global declarations for the DSL context
declare global {
  const params: ActionParams;
  const services: Services;
  const z: typeof import('zod').z;
}
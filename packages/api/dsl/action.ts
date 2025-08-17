/**
 * Action DSL Export Module
 * This module exports all types and functions needed for the Action DSL
 * Used to generate type definitions for Monaco Editor
 */

// Import services
import services from '@/services/index';

// Import zod for validation
import { z } from 'zod';

// Re-export services as a const to match the DSL expectation
export const servicesConst = services;

// Re-export zod
export { z };

// Type definitions that match what's available in action context
export interface ActionParams {
  [key: string]: any;
}

// Service type definitions (these will be extracted from the actual implementations)
export type Services = typeof services;

// Re-export service interfaces for better type generation
export { ActionService } from '@/services/action';
export { PromptService } from '@/services/prompt';
export { LibraryService } from '@/services/library';
export type { ActionEntity } from '@/systems/actions/types';

// Global declarations for the DSL context
declare global {
  const params: ActionParams;
  const services: Services;
  const z: typeof import('zod').z;
}
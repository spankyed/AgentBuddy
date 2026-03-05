import type services from '../src/services/index';
import type { z } from 'zod';

export type Services = typeof services;
export type Z = typeof z;

export interface ActionParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;
  required?: boolean;
  default?: any;
  placeholder?: string;
}

export interface ActionMeta {
  label: string;
  description?: string;
  category?: string;
  input: Record<string, ActionParameter>;
  output?: any;
}

export interface TemplateInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;
  required?: boolean;
  defaultValue?: any;
  commonSources?: string[];
  example?: any;
}

export interface PromptMeta {
  label: string;
  description?: string;
  category?: string;
  inputs: Record<string, TemplateInput>;
  outputSchema?: any;
}

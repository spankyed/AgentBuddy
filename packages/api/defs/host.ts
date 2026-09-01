/**
 * Host Platform Types
 *
 * Pure host types available to every pack — no default-setup dependency.
 * Contains EARS, zod, and base service interfaces.
 */

export { EARS, type BaseEntity } from '@/core/types';
export { z } from 'zod';
import type { z as _z } from 'zod';
export type Z = typeof _z;

export { loggerService } from '@/services/logger';
export * as emitter from '@/services/event-emitter';
export { repositoryService } from '@/services/repository';

/**
 * Action DSL type surface for Monaco intellisense.
 * Defines what's available as globals in the action code editor.
 */

import { sendToPlugin } from '@/__generated__/events';
import { featureServices } from '@/__generated__/services';
import { createLogger } from '@abuddy/sdk/logger';
import { sendToBrainSystem, sendToSystem, onOutgoing, onIncoming, type InferenceService } from '@abuddy/sdk/services';
import { repository } from '@/__generated__/repository';

export const services = {
  logger: createLogger('action-dsl'),
  emitter: { sendToPlugin, sendToBrainSystem, sendToSystem, onOutgoing, onIncoming },
  repository,
  // Host-implemented: the type is what the editor needs
  inference: undefined as unknown as InferenceService,
  ...featureServices,
};

export type Services = typeof services;
export type ActionParams = Record<string, any>;
export const params = undefined as unknown as ActionParams;

export type { ActionEntity } from '@abuddy/sdk';
export type { SettingsData } from '@/__generated__/types';

export { z, type z as Z } from 'zod';

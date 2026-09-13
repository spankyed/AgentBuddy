/**
 * Action DSL type surface for Monaco intellisense.
 * Defines what's available as globals in the action code editor.
 */

import { sendToPlugin } from '@/__generated__/events';
import { featureServices } from '@/__generated__/services';
import { createLogger } from '@abuddy/sdk/logger';
import { sendToBrainSystem, sendToSystem, onOutgoing, onIncoming } from '@abuddy/sdk/services';
import { repository } from '@abuddy/sdk/ears';

export const services = {
  logger: createLogger('action-dsl'),
  emitter: { sendToPlugin, sendToBrainSystem, sendToSystem, onOutgoing, onIncoming },
  repository,
  ...featureServices,
};

export type Services = typeof services;
export type ActionParams = Record<string, any>;
export const params = undefined as unknown as ActionParams;

export type { ActionEntity, SettingsData } from '@/__generated__/types';

export { z, type z as Z } from 'zod';

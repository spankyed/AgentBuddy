/**
 * Action DSL type surface for Monaco intellisense.
 * Defines what's available as globals in the action code editor.
 */

import type { Services } from '@/__generated__/services';

// What actions receive as `services`: the pack's generated type, host services included (as seed actions import it)
export const services = undefined as unknown as Services;
export type { Services };
export type ActionParams = Record<string, any>;
export const params = undefined as unknown as ActionParams;

export type { ActionEntity } from '@abuddy/sdk';
export type { SettingsData } from '@/__generated__/types';

export { z, type z as Z } from 'zod';

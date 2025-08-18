import { createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/utils/actor-helpers';
import { SettingsData } from './types';
import { settingsQueries, settingsCommands } from './repository';
import { z } from 'zod';

const typeOf = safeEvents<ReceivableEvents>();

export const settings = 'settings' as const;

const busEvent = systemBus(settings);

export const IncomingSettingsEvents = [
  busEvent('GET_SETTINGS', {}),
  busEvent('UPDATE_SETTINGS', {
    entityType: z.enum(['general', 'plugin']),
    label: z.string(),
    path: z.array(z.string()),
    value: z.any()
  }),
  busEvent('RESET_SETTINGS', {}),
] as const

export type SettingsInternalEvents = 
  | SystemEvents

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsData }
  | { type: 'SETTINGS_UPDATED'; data: SettingsData }
  | { type: 'SETTINGS_RESET'; data: SettingsData }

export const SettingsSystemEvents = fromSystem(IncomingSettingsEvents)<OutgoingSettingsEvents, typeof settings>()
type ReceivableEvents = MergeReceivable<typeof IncomingSettingsEvents, SettingsInternalEvents>;

export const settingsSystem = setup({
  types: {
    context: {} as {},
    events: {} as ReceivableEvents,
  },
  actions: {
    sendSettingsStartupData: ({ system }) => {
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, { 
        type: 'SETTINGS_LOADED',
        data
      }));
    },
    
    getSettings: ({ system, event }) => {
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_LOADED',
        data
      }));
    },
    
    updateSettings: ({ system, event }) => {
      const ev = typeOf('UPDATE_SETTINGS', event);
      settingsCommands.updateSettings(ev.entityType, ev.label, ev.path, ev.value);
      
      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));
    },
    
    resetSettings: ({ system, event }) => {
      settingsCommands.resetSettings();
      
      // After reset, get the new settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_RESET',
        data
      }));
    },
  },
}).createMachine({
  id: settings,
  initial: 'idle',
  context: {},
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: 'sendSettingsStartupData',
        },
        GET_SETTINGS: {
          actions: 'getSettings',
        },
        UPDATE_SETTINGS: {
          actions: 'updateSettings',
        },
        RESET_SETTINGS: {
          actions: 'resetSettings',
        },
      },
    },
  },
});
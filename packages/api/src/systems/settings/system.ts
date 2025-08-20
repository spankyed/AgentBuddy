import { createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/utils/actor-helpers';
import { Category, SettingsData, ThreadStatusOption } from './types';
import { settingsQueries, settingsCommands, setupDevelopmentSettings } from './repository';
import { z } from 'zod';

const typeOf = safeEvents<ReceivableEvents>();

export const settings = 'settings' as const;

// Simple, generic API
type DiffResult<T> =
  | null
  | {
      renames: Array<{ from: string; to: string }>;
      added: T[];
      removed: T[];
    };

export const detectChanges = <T>(
  prev: T[] | undefined,
  next: T[] | undefined,
  id: (x: T) => string,     // identity (label/name)
  key: (x: T) => string     // match key (e.g., color)
): DiffResult<T> => {
  if (!prev || !next) return null;

  const pid = (x: T) => id(x);
  const pkey = (x: T) => key(x);

  const prevById = new Map(prev.map(x => [pid(x), x]));
  const nextById = new Map(next.map(x => [pid(x), x]));
  const nextIdByKey = new Map(next.map(x => [pkey(x), pid(x)]));

  // renames: missing by id but present by key, to a *new* id
  const renames = prev
    .filter(p => !nextById.has(pid(p)))
    .map(p => ({ from: pid(p), to: nextIdByKey.get(pkey(p)) }))
    .filter((r): r is { from: string; to: string } => !!r.to && !prevById.has(r.to));

  const fromSet = new Set(renames.map(r => r.from));
  const toSet   = new Set(renames.map(r => r.to));

  const added   = next.filter(x => !prevById.has(pid(x)) && !toSet.has(pid(x)));
  const removed = prev.filter(x => !nextById.has(pid(x)) && !fromSet.has(pid(x)));

  return renames.length || added.length || removed.length ? { renames, added, removed } : null;
};

// Thin, DRY wrappers
export const detectStatusChanges = (prev?: ThreadStatusOption[], next?: ThreadStatusOption[]) =>
  detectChanges(prev, next, s => s.label, s => s.color);

export const detectCategoryChanges = (prev?: Category[], next?: Category[]) =>
  detectChanges(prev, next, c => c.name,  c => c.color);

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
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: SettingsData['general']['hotkeys'] }

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
      
      // Send settings to the settings plugin
      system.get(bus).send(emit(settings, { 
        type: 'SETTINGS_LOADED',
        data
      }));
      
      // Send hotkeys to the application
      system.get(bus).send(emit('application', {
        type: 'APPLICATION_HOTKEYS' as const,
        hotkeys: data.general.hotkeys
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
      
      // Get previous settings for comparison
      const previousSettings = ev.entityType === 'plugin' 
        ? settingsQueries.getPluginSettings(ev.label) 
        : null;
      
      settingsCommands.updateSettings(ev.entityType, ev.label, ev.path, ev.value);
      
      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));
      
      // If hotkeys were updated, send them to the application
      // Check if updating entire hotkeys object (label === 'hotkeys') or a specific property
      if (ev.entityType === 'general' && (ev.label === 'hotkeys' || ev.path[0] === 'hotkeys')) {
        system.get(bus).send(emit('application', {
          type: 'APPLICATION_HOTKEYS',
          hotkeys: data.general.hotkeys
        }));
      }
      
      // If plugin settings were updated, forward to both backend and frontend
      if (ev.entityType === 'plugin' && data.plugins) {
        const pluginSettings = data.plugins[ev.label as keyof typeof data.plugins];
        if (pluginSettings) {
          // Detect changes using the appropriate detector
          const changes = 
            ev.label === 'threads' ? detectStatusChanges(previousSettings?.statuses, pluginSettings?.statuses) :
            previousSettings?.categories ? detectCategoryChanges(previousSettings.categories, pluginSettings.categories) :
            null;
          
          // Send to backend system (if it exists)
          const backendActor = system.get(ev.label as any);
          if (backendActor) {
            const eventType = `${ev.label.toUpperCase()}_SETTINGS_UPDATED`;
            backendActor.send({
              type: eventType,
              settings: pluginSettings,
              changes
            });
          }
          
          // Send settings update event to the frontend plugin
          const eventType = `${ev.label.toUpperCase()}_SETTINGS_UPDATED`;
          system.get(bus).send(emit(ev.label as any, {
            type: eventType,
            settings: pluginSettings
          } as any));
        }
      }
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
  entry: () => {
    // Initialize development settings if needed
    // setupDevelopmentSettings();
  },
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
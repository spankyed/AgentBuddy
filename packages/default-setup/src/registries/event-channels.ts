/**
 * Plugin event registry augmentation.
 *
 * Maps plugin IDs to their outgoing event types so that
 * `emit(pluginId, event)` constrains events per-plugin at compile time.
 *
 * Import this file (side-effect) to activate the augmentation:
 *   import '@app/default-setup/src/registries/event-channels';
 */
import type { OutgoingCalendarEvents } from '../features/calendar/be/system';
import type { OutgoingThreadsEvents } from '../features/threads/be/system';
import type { OutgoingCodeEvents } from '../features/code/be/system';
import type { OutgoingSettingsEvents } from '../features/settings/be/system';
import type { OutgoingDatabaseEvents } from '../features/database/be/system';
import type { OutgoingBrainEvents } from '../features/brain/be/system';
import type { OutgoingFlowsEvents } from '../features/flows/be/system';
import type { OutgoingLibraryEvents } from '../features/library/be/system';
import type { OutgoingLogsEvents } from '../features/logs/be/system';
import type { OutgoingNotesEvents } from '../features/notes/be/system';
import type { OutgoingBrowserEvents } from '../features/browser/be/system';
import type { OutgoingPromptEvents } from '../features/prompts/be/system';
import type { OutgoingActionEvents } from '../features/actions/be/system';

declare module '@abuddy/sdk/types' {
  interface PluginEventRegistry {
    'calendar': OutgoingCalendarEvents;
    'threads': OutgoingThreadsEvents;
    'code': OutgoingCodeEvents;
    'settings': OutgoingSettingsEvents;
    'database': OutgoingDatabaseEvents;
    'brain': OutgoingBrainEvents;
    'flows': OutgoingFlowsEvents;
    'library': OutgoingLibraryEvents;
    'logs': OutgoingLogsEvents;
    'notes': OutgoingNotesEvents;
    'browser': OutgoingBrowserEvents;
    'prompts': OutgoingPromptEvents;
    'actions': OutgoingActionEvents;
  }
}

export {};

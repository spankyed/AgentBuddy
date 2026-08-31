/**
 * Plugin event registry augmentation.
 *
 * Maps plugin IDs to their outgoing event types so that
 * `emit(pluginId, event)` constrains events per-plugin at compile time.
 *
 * Import this file (side-effect) to activate the augmentation:
 *   import '@app/default-setup/src/registries/event-channels';
 */
import type { OutgoingCalendarEvents } from '../plugins/calendar/be/system';
import type { OutgoingThreadsEvents } from '../plugins/threads/be/system';
import type { OutgoingCodeEvents } from '../plugins/code/be/system';
import type { OutgoingSettingsEvents } from '../plugins/settings/be/system';
import type { OutgoingDatabaseEvents } from '../plugins/database/be/system';
import type { OutgoingBrainEvents } from '../plugins/brain/be/system';
import type { OutgoingFlowsEvents } from '../plugins/flows/be/system';
import type { OutgoingLibraryEvents } from '../plugins/library/be/system';
import type { OutgoingLogsEvents } from '../plugins/logs/be/system';
import type { OutgoingNotesEvents } from '../plugins/notes/be/system';
import type { OutgoingBrowserEvents } from '../plugins/browser/be/system';
import type { OutgoingPromptEvents } from '../plugins/prompts/be/system';
import type { OutgoingActionEvents } from '../plugins/actions/be/system';

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

// @generated from abuddy.json — do not edit by hand
// Regenerate: node scripts/generate-entries.js

import type { OutgoingThreadsEvents } from '../features/threads/be/system';
import type { OutgoingCodeEvents } from '../features/code/be/system';
import type { OutgoingNotesEvents } from '../features/notes/be/system';
import type { OutgoingCalendarEvents } from '../features/calendar/be/system';
import type { OutgoingBrowserEvents } from '../features/browser/be/system';
import type { OutgoingLibraryEvents } from '../features/library/be/system';
import type { OutgoingFlowsEvents } from '../features/flows/be/system';
import type { OutgoingActionEvents } from '../features/actions/be/system';
import type { OutgoingPromptEvents } from '../features/prompts/be/system';
import type { OutgoingBrainEvents } from '../features/brain/be/system';
import type { OutgoingDatabaseEvents } from '../features/database/be/system';
import type { OutgoingLogsEvents } from '../features/logs/be/system';
import type { OutgoingSettingsEvents } from '../features/settings/be/system';

declare module '@abuddy/sdk/types' {
  interface PluginEventRegistry {
    'threads': OutgoingThreadsEvents;
    'code': OutgoingCodeEvents;
    'notes': OutgoingNotesEvents;
    'calendar': OutgoingCalendarEvents;
    'browser': OutgoingBrowserEvents;
    'library': OutgoingLibraryEvents;
    'flows': OutgoingFlowsEvents;
    'actions': OutgoingActionEvents;
    'prompts': OutgoingPromptEvents;
    'brain': OutgoingBrainEvents;
    'database': OutgoingDatabaseEvents;
    'logs': OutgoingLogsEvents;
    'settings': OutgoingSettingsEvents;
  }
}

export {};

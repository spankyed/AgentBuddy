import { toPackSystemDefs } from '@abuddy/sdk/framework';
import { settingsEntry } from '../features/settings/be/system';
import { brainEntry } from '../features/brain/be/system';
import { threadsEntry } from '../features/threads/be/system';
import { flowsEntry } from '../features/flows/be/system';
import { databaseEntry } from '../features/database/be/system';
import { promptsEntry } from '../features/prompts/be/system';
import { actionsEntry } from '../features/actions/be/system';
import { libraryEntry } from '../features/library/be/system';
import { codeEntry } from '../features/code/be/system';
import { notesEntry } from '../features/notes/be/system';
import { browserEntry } from '../features/browser/be/system';
import { calendarEntry } from '../features/calendar/be/system';

const entries = [
  settingsEntry, brainEntry, threadsEntry, flowsEntry,
  databaseEntry, promptsEntry, actionsEntry, libraryEntry,
  codeEntry, notesEntry, browserEntry, calendarEntry,
];

export function buildSystemDefs() {
  return toPackSystemDefs(entries);
}

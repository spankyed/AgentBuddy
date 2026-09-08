// @generated from abuddy.json — do not edit by hand
// Regenerate: abuddy generate-entries

import type { PackRegistration } from '@abuddy/sdk/framework';
import { toPackSystemDefs } from '@abuddy/sdk/framework';

import { settingsEntry } from '../features/settings/be/system';
import { threadsEntry } from '../features/threads/be/system';
import { codeEntry } from '../features/code/be/system';
import { notesEntry } from '../features/notes/be/system';
import { calendarEntry } from '../features/calendar/be/system';
import { browserEntry } from '../features/browser/be/system';
import { libraryEntry } from '../features/library/be/system';
import { flowsEntry } from '../features/flows/be/system';
import { actionsEntry } from '../features/actions/be/system';
import { promptsEntry } from '../features/prompts/be/system';
import { brainEntry } from '../features/brain/be/system';
import { databaseEntry } from '../features/database/be/system';
import { logsEntry } from '../features/logs/be/system';

import { featureServices } from './services';
import { EARS } from './ears';
import { createDefaultSettings } from '../features/settings/be/repository';
import { terminalService } from '../features/code/be/services/terminal';
import { runBootSeed } from './seeders';
import { migrations } from '../migrations/index';
import { steps } from '../extensions/steps/register';
import { artifacts } from '../extensions/artifacts/register';
import { blocks } from '../extensions/blocks/register';

export const registration: PackRegistration = {
  id: 'default-setup',
  systems: toPackSystemDefs([settingsEntry, threadsEntry, codeEntry, notesEntry, calendarEntry, browserEntry, libraryEntry, flowsEntry, actionsEntry, promptsEntry, brainEntry, databaseEntry]),
  services: featureServices,
  steps,
  artifacts,
  blocks,
  ears: {
    entities: Object.fromEntries(
      Object.entries(EARS.Entity).filter(([k, v]) => typeof v === 'string' && k !== 'Custom') as [string, string][]
    ),
    relKinds: Object.fromEntries(
      Object.entries(EARS.RelKind).filter(([k, v]) => typeof v === 'string' && k !== 'Custom') as [string, string][]
    ),
    partitionPolicy: {
      excludedEntityTypes: ["TNode"],
      secretEntityTypes: ["Secret"],
    },
  },
  boot: {
    earlySystem: logsEntry.machine,
    createDefaultSettings,
    seed: runBootSeed,
    shutdown: () => terminalService.killAll(),
  },
  migrations,
  features: [
  {
    id: 'threads',
    hasSystem: true,
    designation: 'threads',
    plugin: { label: 'Threads', icon: 'BotMessageSquare' },
    services: ['chat', 'artifact', 'threads'],
  },
  {
    id: 'code',
    hasSystem: true,
    plugin: { label: 'Code', icon: 'Code2' },
    services: ['cli', 'codex'],
  },
  {
    id: 'notes',
    hasSystem: true,
    plugin: { label: 'Notes', icon: 'NotebookText' },
    services: [],
  },
  {
    id: 'calendar',
    hasSystem: true,
    plugin: { label: 'Calendar', icon: 'Calendar' },
    services: [],
  },
  {
    id: 'browser',
    hasSystem: true,
    designation: 'browser',
    plugin: { label: 'Browser', icon: 'Globe' },
    services: ['browser'],
  },
  {
    id: 'library',
    hasSystem: true,
    plugin: { label: 'Library', icon: 'Library', isPinned: true },
    services: ['library'],
  },
  {
    id: 'flows',
    hasSystem: true,
    plugin: { label: 'Flows', icon: 'Network', isPinned: true },
    services: [],
  },
  {
    id: 'actions',
    hasSystem: true,
    plugin: { label: 'Actions', icon: 'Play', isPinned: true },
    services: ['action'],
  },
  {
    id: 'prompts',
    hasSystem: true,
    plugin: { label: 'Prompts', icon: 'Sparkle', isPinned: true },
    services: ['prompt'],
  },
  {
    id: 'brain',
    hasSystem: true,
    designation: 'brain',
    plugin: { label: 'Brain', icon: 'Brain', isPinned: true },
    services: ['llm', 'brain'],
  },
  {
    id: 'database',
    hasSystem: true,
    plugin: { label: 'Database', icon: 'Database', isPinned: true },
    services: ['database'],
  },
  {
    id: 'logs',
    hasSystem: true,
    plugin: { label: 'Logs', icon: 'ScrollText', isPinned: true },
    services: [],
  },
  {
    id: 'settings',
    hasSystem: true,
    designation: 'settings',
    plugin: { label: 'Settings', icon: 'Settings' },
    services: ['settings'],
  },
  ],
};

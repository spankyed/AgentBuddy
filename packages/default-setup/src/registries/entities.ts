import { entities as threadEntities } from '../features/threads/entities';
import { entities as brainEntities } from '../features/brain/entities';
import { entities as libraryEntities } from '../features/library/entities';
import { entities as codeEntities } from '../features/code/entities';
import { entities as settingsEntities } from '../features/settings/entities';
import { entities as calendarEntities } from '../features/calendar/entities';
import { entities as browserEntities } from '../features/browser/entities';
import { entities as notesEntities } from '../features/notes/entities';
import { entities as actionsEntities } from '../features/actions/entities';
import { entities as promptsEntities } from '../features/prompts/entities';

export const AllEntities = {
  Relation: 'Relation',
  ...threadEntities,
  ...brainEntities,
  ...libraryEntities,
  ...codeEntities,
  ...settingsEntities,
  ...calendarEntities,
  ...browserEntities,
  ...notesEntities,
  ...actionsEntities,
  ...promptsEntities,
} as const;

export type AllEntities = typeof AllEntities[keyof typeof AllEntities];

export namespace Entity {
  // Core
  export const Relation = AllEntities.Relation;
  export type Relation = typeof Relation;

  // Threads
  export const Agent = AllEntities.Agent;
  export type Agent = typeof Agent;
  export const Thread = AllEntities.Thread;
  export type Thread = typeof Thread;
  export const Message = AllEntities.Message;
  export type Message = typeof Message;
  export const Artifact = AllEntities.Artifact;
  export type Artifact = typeof Artifact;

  // Brain
  export const Brain = AllEntities.Brain;
  export type Brain = typeof Brain;
  export const Flow = AllEntities.Flow;
  export type Flow = typeof Flow;
  export const Node = AllEntities.Node;
  export type Node = typeof Node;
  export const TNode = AllEntities.TNode;
  export type TNode = typeof TNode;

  // Library
  export const Document = AllEntities.Document;
  export type Document = typeof Document;
  export const Collection = AllEntities.Collection;
  export type Collection = typeof Collection;
  export const SearchIndex = AllEntities.SearchIndex;
  export type SearchIndex = typeof SearchIndex;
  export const IndexedDoc = AllEntities.IndexedDoc;
  export type IndexedDoc = typeof IndexedDoc;

  // Code
  export const Terminal = AllEntities.Terminal;
  export type Terminal = typeof Terminal;
  export const Directory = AllEntities.Directory;
  export type Directory = typeof Directory;

  // Settings
  export const Settings = AllEntities.Settings;
  export type Settings = typeof Settings;
  export const Secret = AllEntities.Secret;
  export type Secret = typeof Secret;
  export const FAQ = AllEntities.FAQ;
  export type FAQ = typeof FAQ;

  // Calendar
  export const CalendarEvent = AllEntities.CalendarEvent;
  export type CalendarEvent = typeof CalendarEvent;

  // Browser
  export const BrowserTab = AllEntities.BrowserTab;
  export type BrowserTab = typeof BrowserTab;
  export const BrowserBookmark = AllEntities.BrowserBookmark;
  export type BrowserBookmark = typeof BrowserBookmark;

  // Notes
  export const Note = AllEntities.Note;
  export type Note = typeof Note;

  // Actions
  export const Action = AllEntities.Action;
  export type Action = typeof Action;

  // Prompts
  export const Prompt = AllEntities.Prompt;
  export type Prompt = typeof Prompt;
}

export type Entity = typeof Entity[keyof typeof Entity];

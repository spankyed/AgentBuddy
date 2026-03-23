import { BaseEntity, EARS } from '@/core/types';

export const REFERENCES = EARS.RelKind.Custom('references');

export interface NoteEntity extends BaseEntity {
  entityType: EARS.Entity.Note;
  title: string;
  content: string;
  icon: string | null;
  noteType: 'note' | 'tasklist' | 'task';
  completed: boolean;
  hideCompletedChildren: boolean;
  displayOrder: number;
  savedDisplayOrder?: number;
  createdAt: number;
  updatedAt: number;
  lastSeen: number;
  deleted?: boolean;
  deletedAt?: number;
}

export interface NoteDTO {
  id: string;
  title: string;
  content: string;
  icon: string | null;
  noteType: 'note' | 'tasklist' | 'task';
  completed: boolean;
  hideCompletedChildren: boolean;
  parentId: string | null;
  displayOrder: number;
  savedDisplayOrder: number | null;
  childCount: number;
  createdAt: number;
  updatedAt: number;
  lastSeen: number;
}

export type OutgoingNotesSearchEvent = { type: 'NOTES_SEARCH_RESULTS'; results: NoteDTO[] }

export interface NotesConnectedData {
  notes: NoteDTO[];
}

import { BaseEntity, EARS } from '@/core/types';

export const REFERENCES = EARS.RelKind.Custom('references');

export interface NoteEntity extends BaseEntity {
  entityType: EARS.Entity.Note;
  title: string;
  content: string;
  icon: string | null;
  displayOrder: number;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
  deletedAt?: number;
}

export interface NoteDTO {
  id: string;
  title: string;
  content: string;
  icon: string | null;
  parentId: string | null;
  displayOrder: number;
  childCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface NotesConnectedData {
  notes: NoteDTO[];
}

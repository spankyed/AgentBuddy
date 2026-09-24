import type { MemoNoteDTO } from './memo-notes';
import type { BaseEntity, EARS } from '#generated/ears';

export interface MemoEntity extends BaseEntity {
  entityType: EARS.Entity.Memo;
  /** Seeded memos have a title; seeds match existing rows by it */
  title?: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemoDTO {
  id: string;
  text: string;
  createdAt: number;
}

export type IncomingMemosEvents =
  | { type: 'ADD_MEMO'; text: string }
  | { type: 'ADD_MEMO_NOTE'; text: string }
  | { type: 'ANNOUNCE_MEMO'; text: string };

export type OutgoingMemosEvents =
  | { type: 'MEMOS_CONNECTED'; memos: MemoDTO[] }
  | { type: 'MEMO_ADDED'; memo: MemoDTO }
  /** `note` is null when the note written through @abuddy/ears isn't found through the SDK */
  | { type: 'MEMO_NOTE_ADDED'; text: string; note: MemoNoteDTO | null };

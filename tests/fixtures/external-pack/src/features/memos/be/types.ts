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

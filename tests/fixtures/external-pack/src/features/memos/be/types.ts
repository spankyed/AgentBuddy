import type { BaseEntity, EARS } from '#generated/ears';

export interface MemoEntity extends BaseEntity {
  entityType: EARS.Entity.Memo;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemoDTO {
  id: string;
  text: string;
  createdAt: number;
}

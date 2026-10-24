import { query, create, EARS, type EntityShape } from '#generated/ears.ts';
import type { MemoDTO } from './types.ts';

/** A memo as a read gives it back: its shape's fields and the short code the engine numbered it with */
function toDTO(memo: EntityShape<'Memo'>): MemoDTO {
  return { id: memo.id, shortCode: memo.shortCode, text: memo.text, createdAt: memo.createdAt };
}

// Declared in apack.json (features[].repositories); systems use them through #generated/repository
export const memoQueries = {
  all: (): MemoDTO[] => query(EARS.Entity.Memo).pickAll().map(toDTO),
};

export const memoCommands = {
  add: (text: string): MemoDTO => toDTO(create(EARS.Entity.Memo, { text }).row()),
};

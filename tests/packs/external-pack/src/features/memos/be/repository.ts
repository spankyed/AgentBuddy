import { findAll, createEntityWithDefaults, EARS } from '#generated/ears.ts';
import type { MemoDTO, MemoEntity } from './types.ts';

function toDTO(memo: MemoEntity): MemoDTO {
  return { id: memo.id, text: memo.text, createdAt: memo.createdAt };
}

// Declared in apack.json (features[].repositories); systems use them through #generated/repository
export const memoQueries = {
  all: (): MemoDTO[] => findAll(EARS.Entity.Memo).map(toDTO),
};

export const memoCommands = {
  add: (text: string): MemoDTO => toDTO(createEntityWithDefaults(EARS.Entity.Memo, { text }, 'MEMO')),
};

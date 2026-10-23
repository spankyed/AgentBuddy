import { query, findById, create, EARS } from '#generated/ears.ts';
import type { MemoDTO, MemoEntity } from './types.ts';

function toDTO(memo: MemoEntity): MemoDTO {
  return { id: memo.id, text: memo.text, createdAt: memo.createdAt };
}

// Declared in apack.json (features[].repositories); systems use them through #generated/repository
export const memoQueries = {
  all: (): MemoDTO[] => query(EARS.Entity.Memo).pickAll().map(toDTO),
};

export const memoCommands = {
  add: (text: string): MemoDTO => toDTO(findById(create(EARS.Entity.Memo, { text }).id())!),
};

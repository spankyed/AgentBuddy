import { findAll } from '#generated/ears';
import { EARS } from '#generated/ears';
import { createEntityWithDefaults } from '@abuddy/sdk/ears';
import type { MemoDTO, MemoEntity } from './types';

function toDTO(memo: MemoEntity): MemoDTO {
  return { id: memo.id, text: memo.text, createdAt: memo.createdAt };
}

export const memoQueries = {
  all: (): MemoDTO[] => findAll<MemoEntity>(EARS.Entity.Memo).map(toDTO),
};

export const memoCommands = {
  add: (text: string): MemoDTO =>
    toDTO(createEntityWithDefaults<MemoEntity>(EARS.Entity.Memo, { text }, 'MEMO')),
};

import { repository } from '#generated/repository.ts';

export const memoStamp = {
  write: (text: string) => repository.memoCommands.add(text),
};

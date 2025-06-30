import type { Rows } from '@/shared/types';
import { threadRows } from './mock-data/threads';
import { flowRows } from './mock-data/flows';
// import { brainRows } from './mock-data/brain';
import { promptRows } from './mock-data/prompts';

export const rows: Rows = composeData([
  threadRows,
  flowRows,
  promptRows,
  // brainRows,
]);


export function composeData(sources: Partial<Rows>[]) {
  return sources.reduce<Rows>(
    (acc, source) => ({
      entity: [...acc.entity, ...(source.entity || [])],
      role: [...acc.role, ...(source.role || [])],
      relation: [...acc.relation, ...(source.relation || [])],
    }),
    { entity: [], role: [], relation: [] }
  );
}

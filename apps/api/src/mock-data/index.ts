import type { Rows } from '@/shared/types';
import { threadRows } from './data/threads';
import { flowRows } from './data/flows';
// import { brainRows } from './mock-data/brain';
import { promptRows } from './data/prompts';
import { actionRows } from './data/actions';

export const rows: Rows = composeData([
  threadRows,
  flowRows,
  promptRows,
  actionRows,
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

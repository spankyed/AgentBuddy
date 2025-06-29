import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';
import { threadRows } from './mock-data/threads';
import { flowRows } from './mock-data/flows';
import { brainRows } from './mock-data/brain';
import { promptRows } from './mock-data/prompts';

const nowMs = Date.now();
export const now = new Date(nowMs);

export const rows: Rows = {
  entity: [
    ...threadRows.entity,
    ...flowRows.entity,
    ...promptRows.entity,
    // ...brainRows.entity,
  ],

  role: [
    ...threadRows.role,
    ...flowRows.role,
    ...promptRows.role,
    // ...brainRows.role,
  ],
  
  relation: [
    ...threadRows.relation,
    ...flowRows.relation,
    ...promptRows.relation,
    // ...brainRows.relation,
  ],
};

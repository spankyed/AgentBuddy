import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';
import { threadRows } from '../threads/repository/mock-data';
import { flowRows } from '../flows/repository/mock-data';
import { brainRows } from '../brain/repository/mock-data';

const nowMs = Date.now();
export const now = new Date(nowMs);

export const rows: Rows = {
  entity: [
    ...threadRows.entity,
    ...flowRows.entity,
    ...brainRows.entity,
  ],

  role: [
    ...threadRows.role,
    ...flowRows.role,
    ...brainRows.role,
  ],
  
  relation: [
    ...threadRows.relation,
    ...flowRows.relation,
    ...brainRows.relation,
  ],
};

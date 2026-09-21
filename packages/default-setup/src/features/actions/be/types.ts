import type { Category } from '@/__generated__/types';

import type { ActionEntity } from '@abuddy/sdk';

export interface ActionsStartupData {
  actions: ActionEntity[];
  page: number;
  totalPages: number;
  totalCount: number;
  categories?: Category[];
}

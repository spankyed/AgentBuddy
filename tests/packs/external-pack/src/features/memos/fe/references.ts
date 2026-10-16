import { usePluginState } from '#generated/fe.ts';
import type { ReferenceItem } from '@apackdev/sdk/fe/references';

export const useItems = () => usePluginState('memos', (state): ReferenceItem[] => state.memos.map(memo => ({
  id: memo.id, label: memo.text, shortCode: memo.id, type: 'memo',
})));

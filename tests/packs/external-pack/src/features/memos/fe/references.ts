// What an editor can link to among this feature's things. Declared at `features.memos.references`, and
// registered through the pack's frontend entry, so an external pack's reference type reaches the app's editor
// the way a built-in pack's does — which is the thing this fixture exists to prove.
import { Stamp } from 'lucide-vue-next';
import { openPlugin, usePluginState } from '#generated/fe.ts';
import { id as memos } from './state.ts';
import type { ReferenceTypeConfig, CategoryConfig, CategoryItemsProvider, ReferenceItem } from '@apackdev/sdk/fe/references';

export const referenceTypes: Record<string, ReferenceTypeConfig> = {
  memo: {
    protocol: 'memo',
    category: 'memos',
    icon: Stamp,
    svgElements: [
      ['rect', { x: '4', y: '4', width: '16', height: '16', rx: '2' }],
      ['path', { d: 'M8 12h8' }],
    ],
    navigate: (refId: string) => {
      openPlugin(memos, { type: 'MEMO.HIGHLIGHT', memoId: refId });
    },
  },
};

export const categories: CategoryConfig[] = [
  { id: 'memos', label: 'Memos', primaryIcon: Stamp },
];

export const itemsProviders: CategoryItemsProvider[] = [{
  category: 'memos',
  useItems: () => usePluginState('memos', (state): ReferenceItem[] =>
    state.memos.map((memo) => ({
      id: memo.id,
      shortCode: memo.id,
      label: memo.text,
      type: 'memo' as const,
    }))),
}];

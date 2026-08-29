import BrainInspectPanel from '../features/brain/fe/panel.vue';
import { id as brainId } from '../features/brain/fe/state';
import { id as settingsId } from '../features/settings/fe/state';
import { id as threadsId } from '../features/threads/fe/state';
import { threadsFromStore } from '../features/threads/fe/state';
import { isJsonLike, isJsonString, isJsonObject, isJsonArray, formatJsonValue } from '../features/database/fe/components/simple-table/utils/json-detection';
import DataRenderer from '../features/logs/fe/data-renderer.vue';
import { getNodeConfig, nodeConfigs, getInspectionItemClasses, getPaletteIconClasses, getPaletteIconComponentClasses, getPaletteGlowClasses, getPaletteGradientClasses, getNodeStatusClasses } from '../features/flows/fe/canvas/nodes';

import { refTypes as threadRefTypes, categories as threadCategories, itemsProvider as threadItemsProvider } from '../features/threads/fe/references';
import { refTypes as libraryRefTypes, categories as libraryCategories, itemsProvider as libraryItemsProvider } from '../features/library/fe/references';
import { refTypes as notesRefTypes, categories as notesCategories, itemsProvider as notesItemsProvider, NOTE_TYPE_TO_REF_TYPE } from '../features/notes/fe/references';
import type { RefTypeConfig, CategoryConfig, CategoryItemsProvider } from './reference-types';

export { BrainInspectPanel, brainId };
export { settingsId };
export { threadsId, threadsFromStore };
export { isJsonLike, isJsonString, isJsonObject, isJsonArray, formatJsonValue };
export { DataRenderer };
export { getNodeConfig, nodeConfigs };
export { getInspectionItemClasses, getPaletteIconClasses, getPaletteIconComponentClasses, getPaletteGlowClasses, getPaletteGradientClasses, getNodeStatusClasses };

export const REF_TYPES: Record<string, RefTypeConfig> = {
  ...threadRefTypes,
  ...libraryRefTypes,
  ...notesRefTypes,
};

export const CATEGORIES: CategoryConfig[] = [
  ...threadCategories,
  ...libraryCategories,
  ...notesCategories,
];

export const ITEMS_PROVIDERS: CategoryItemsProvider[] = [
  threadItemsProvider,
  libraryItemsProvider,
  notesItemsProvider,
];

export const PROTOCOL_TO_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(REF_TYPES).map(([type, cfg]) => [cfg.protocol, type])
);

export const ALL_PROTOCOLS: string[] = Object.values(REF_TYPES).map((cfg) => cfg.protocol);

export function categoryOfType(type: string): string {
  return REF_TYPES[type]?.category ?? '';
}

export { NOTE_TYPE_TO_REF_TYPE };
export type { RefTypeConfig, CategoryConfig, CategoryItemsProvider } from './reference-types';

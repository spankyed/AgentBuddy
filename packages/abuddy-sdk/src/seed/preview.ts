import * as fs from 'fs';
import { loadJSON } from '../utils/index';
import { seedPath } from '../build/manifest';
import type { SetupPackPreview, SetupPackType, SetupPackPreviewItem } from '../build/preview';

export type { SetupPackPreview, SetupPackPreviewItem, SetupPackType, SetupPackItemKind } from '../build/preview';

function previewCollection(directory: string, key: string): SetupPackPreviewItem[] | null {
  const data = loadJSON<any[]>(seedPath(directory, key));
  if (!data) return null;
  return data.map(item => ({
    key: item.label ?? item.name,
    description: item.description,
  }));
}

export function previewPackSeeds(directory: string): SetupPackPreview {
  const preview: SetupPackPreview = {
    directory,
    actions: [],
    prompts: [],
    flows: [],
    library: [],
    notes: [],
    settings: [],
    missing: [],
  };

  for (const key of ['actions', 'prompts'] as SetupPackType[]) {
    const items = previewCollection(directory, key);
    if (!items) {
      preview.missing.push(key);
    } else {
      preview[key] = items;
    }
  }

  const flowsData = loadJSON<Record<string, any>>(seedPath(directory, 'flows'));
  if (!flowsData) {
    preview.missing.push('flows');
  } else {
    preview.flows = Object.keys(flowsData).map(key => {
      const entry = flowsData[key];
      return {
        key,
        description: typeof entry?.description === 'string' ? entry.description : undefined,
      };
    });
  }

  const libraryData = loadJSON<any>(seedPath(directory, 'library'));
  if (!libraryData) {
    preview.missing.push('library');
  } else {
    const items: any[] = Array.isArray(libraryData) ? libraryData : libraryData.items ?? [];
    preview.library = items
      .filter((item: any) => item.type !== 'symlink')
      .map((item: any) => {
        if (item.type === 'collection') {
          return {
            key: item.name,
            kind: 'collection' as const,
            description: item.description,
            childCount: item.children?.length ?? 0,
          };
        }
        return { key: item.name, kind: 'document' as const };
      });
  }

  const notesData = loadJSON<any>(seedPath(directory, 'notes'));
  if (!notesData) {
    preview.missing.push('notes');
  } else {
    const topLevel: any[] = Array.isArray(notesData?.notes) ? notesData.notes : [];
    preview.notes = topLevel.map((note: any) => ({
      key: note.title,
      kind: note.type,
      childCount: note.children?.length ?? 0,
    }));
  }

  const settingsPath = seedPath(directory, 'settings');
  if (fs.existsSync(settingsPath)) {
    preview.settings = [{ key: 'default-settings', description: 'Application defaults' }];
  } else {
    preview.missing.push('settings');
  }

  return preview;
}

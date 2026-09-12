import * as fs from 'fs';
import { loadJSON } from '../utils/index';
import { seedPath } from '../build/manifest';
import type { PackSeedsPreview, PackSeedPreviewItem, PackSeedItemKind } from '../build/preview';

export type { PackSeedsPreview, PackSeedPreviewItem, PackSeedType, PackSeedItemKind } from '../build/preview';

const KEY_FIELDS = ['label', 'name', 'title', 'question', 'id'] as const;

function findKeyField(item: Record<string, any>): string | undefined {
  for (const f of KEY_FIELDS) {
    if (typeof item[f] === 'string') return f;
  }
  return undefined;
}

function unwrapArray(data: any): any[] | null {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const val of Object.values(data)) {
      if (Array.isArray(val)) return val as any[];
    }
  }
  return null;
}

function previewTreeItem(item: any): PackSeedPreviewItem {
  if (item.type === 'collection') {
    return {
      key: item.name,
      kind: 'collection' as PackSeedItemKind,
      description: item.description,
      childCount: item.children?.length ?? 0,
    };
  }
  return {
    key: item.name ?? item.title ?? item.id,
    kind: item.type === 'document' ? 'document' as PackSeedItemKind : item.type,
    childCount: item.children?.length,
  };
}

function previewSeedType(directory: string, key: string): PackSeedPreviewItem[] | null {
  const filePath = seedPath(directory, key);
  if (key === 'settings') {
    return fs.existsSync(filePath)
      ? [{ key: 'default-settings', description: 'Application defaults' }]
      : null;
  }

  const data = loadJSON<any>(filePath);
  if (data === null) return null;

  if (typeof data === 'object' && !Array.isArray(data)) {
    const arr = unwrapArray(data);
    if (arr && arr.length > 0 && typeof arr[0] === 'object') {
      const hasTree = arr.some((i: any) => i.type === 'collection' || i.type === 'document');
      if (hasTree) {
        return arr
          .filter((i: any) => i.type !== 'symlink')
          .map(previewTreeItem);
      }
      const keyField = findKeyField(arr[0]);
      if (keyField) {
        return arr.map((item: any) => ({
          key: item[keyField],
          description: item.description,
        }));
      }
    }
    return Object.keys(data).map(k => ({
      key: k,
      description: typeof data[k]?.description === 'string' ? data[k].description : undefined,
    }));
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    const first = data[0];
    if (typeof first === 'object') {
      const keyField = findKeyField(first);
      if (keyField) {
        return data.map((item: any) => ({
          key: item[keyField],
          description: item.description,
        }));
      }
    }
    return data.map((item: any, i: number) => ({
      key: typeof item === 'string' ? item : String(i),
    }));
  }

  return null;
}

export function previewPackSeeds(directory: string, seedKeys?: string[]): PackSeedsPreview {
  const keys = seedKeys ?? ['actions', 'prompts', 'flows', 'library', 'notes', 'settings'];
  const preview: PackSeedsPreview = {
    directory,
    seeds: {},
    missing: [],
  };

  for (const key of keys) {
    const items = previewSeedType(directory, key);
    if (items === null) {
      preview.missing.push(key);
    } else {
      preview.seeds[key] = items;
    }
  }

  return preview;
}

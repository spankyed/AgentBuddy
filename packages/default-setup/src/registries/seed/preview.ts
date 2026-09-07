/**
 * Setup Pack Preview — reads compiled artifacts from a directory and
 * reports the top-level items available for selective import.
 */

import * as fs from 'fs';
import type { FlowDSL } from '../../features/flows/be/dsl';
import type { ExportedLibrary, ExportedItem } from '../../features/library/be/export-types';
import type { ExportedNotes } from '../../features/notes/be/export-types';
import { loadJSON } from './index';
import { seedPath, type SetupPackPreview, type SetupPackType } from '@abuddy/sdk/build';

export type { SetupPackPreview, SetupPackPreviewItem, SetupPackType, SetupPackItemKind } from '@abuddy/sdk/build';

interface CompiledActionLike { label: string; description?: string }
interface CompiledPromptLike { label: string; description?: string }

export function previewSetupPack(directory: string): SetupPackPreview {
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

  // --- Actions ---
  const actionsPath = seedPath(directory, 'actions');
  const actionsData = loadJSON<CompiledActionLike[]>(actionsPath);
  if (actionsData === null) {
    preview.missing.push('actions');
  } else {
    preview.actions = actionsData.map(item => ({
      key: item.label,
      description: item.description,
    }));
  }

  // --- Prompts ---
  const promptsPath = seedPath(directory, 'prompts');
  const promptsData = loadJSON<CompiledPromptLike[]>(promptsPath);
  if (promptsData === null) {
    preview.missing.push('prompts');
  } else {
    preview.prompts = promptsData.map(item => ({
      key: item.label,
      description: item.description,
    }));
  }

  // --- Flows ---
  const flowsPath = seedPath(directory, 'flows');
  const flowsData = loadJSON<FlowDSL>(flowsPath);
  if (flowsData === null) {
    preview.missing.push('flows');
  } else {
    preview.flows = Object.keys(flowsData).map(key => {
      const entry: any = (flowsData as any)[key];
      return {
        key,
        description: typeof entry?.description === 'string' ? entry.description : undefined,
      };
    });
  }

  // --- Library (top-level only) ---
  const libraryPath = seedPath(directory, 'library');
  const libraryData = loadJSON<ExportedLibrary | ExportedItem[]>(libraryPath);
  if (libraryData === null) {
    preview.missing.push('library');
  } else {
    const items = Array.isArray(libraryData) ? libraryData : libraryData.items ?? [];
    preview.library = items
      .filter(item => item.type !== 'symlink')
      .map(item => {
        if (item.type === 'collection') {
          return {
            key: item.name,
            kind: 'collection' as const,
            description: item.description,
            childCount: item.children?.length ?? 0,
          };
        }
        return {
          key: item.name,
          kind: 'document' as const,
        };
      });
  }

  // --- Notes (top-level only) ---
  const notesPath = seedPath(directory, 'notes');
  const notesData = loadJSON<ExportedNotes>(notesPath);
  if (notesData === null) {
    preview.missing.push('notes');
  } else {
    const topLevel = Array.isArray(notesData?.notes) ? notesData.notes : [];
    preview.notes = topLevel.map(note => ({
      key: note.title,
      kind: note.type,
      childCount: note.children?.length ?? 0,
    }));
  }

  // --- Settings ---
  const settingsPath = seedPath(directory, 'settings');
  if (fs.existsSync(settingsPath)) {
    preview.settings = [{ key: 'default-settings', description: 'Application defaults' }];
  } else {
    preview.missing.push('settings');
  }

  return preview;
}

/**
 * Setup Pack Preview — reads compiled artifacts from a directory and
 * reports the top-level items available for selective import.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FlowDSL } from '@/systems/flows/dsl';
import type { ExportedLibrary, ExportedItem } from '@/systems/library/export-types';
import type { ExportedNotes } from '@/systems/notes/export-types';

export type SetupPackType = 'actions' | 'prompts' | 'flows' | 'library' | 'notes';

export type SetupPackItemKind = 'collection' | 'document' | 'tasklist' | 'task';

export interface SetupPackPreviewItem {
  key: string;
  description?: string;
  kind?: SetupPackItemKind;
  childCount?: number;
}

export interface SetupPackPreview {
  directory: string;
  actions: SetupPackPreviewItem[];
  prompts: SetupPackPreviewItem[];
  flows: SetupPackPreviewItem[];
  library: SetupPackPreviewItem[];
  notes: SetupPackPreviewItem[];
  missing: SetupPackType[];
}

interface CompiledActionLike { label: string; description?: string }
interface CompiledPromptLike { label: string; description?: string }

function loadJSON<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

export function previewSetupPack(directory: string): SetupPackPreview {
  const preview: SetupPackPreview = {
    directory,
    actions: [],
    prompts: [],
    flows: [],
    library: [],
    notes: [],
    missing: [],
  };

  // --- Actions ---
  const actionsPath = path.join(directory, 'compiled-actions.json');
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
  const promptsPath = path.join(directory, 'compiled-prompts.json');
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
  const flowsPath = path.join(directory, 'compiled-flows.json');
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
  const libraryPath = path.join(directory, 'compiled-library.json');
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
            kind: 'collection',
            description: item.description,
            childCount: item.children?.length ?? 0,
          };
        }
        // document
        return {
          key: item.name,
          kind: 'document',
        };
      });
  }

  // --- Notes (top-level only) ---
  const notesPath = path.join(directory, 'compiled-notes.json');
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

  return preview;
}

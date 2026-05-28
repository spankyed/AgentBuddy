import type {LucideIcon} from 'lucide-react';
import {Icons} from '../primitives/Icon';

// Mirrors packages/renderer/src/core/components/tiptap/reference-config.ts.
export type ReferenceCategory = 'threads' | 'documents' | 'notes';
export type ReferenceRefType = 'thread' | 'document' | 'folder' | 'note' | 'task' | 'tasklist';

export type ReferenceTypeConfig = {
  category: ReferenceCategory;
  icon: LucideIcon;
  plugin: string;
  protocol: string;
};

export const REFERENCE_TYPES = {
  thread: {
    protocol: 'thread',
    category: 'threads',
    plugin: 'threads',
    icon: Icons.History,
  },
  document: {
    protocol: 'doc',
    category: 'documents',
    plugin: 'library',
    icon: Icons.Library,
  },
  folder: {
    protocol: 'folder',
    category: 'documents',
    plugin: 'library',
    icon: Icons.Folder,
  },
  note: {
    protocol: 'note',
    category: 'notes',
    plugin: 'notes',
    icon: Icons.NotebookText,
  },
  task: {
    protocol: 'task',
    category: 'notes',
    plugin: 'notes',
    icon: Icons.CircleCheck,
  },
  tasklist: {
    protocol: 'tasklist',
    category: 'notes',
    plugin: 'notes',
    icon: Icons.ListChecks,
  },
} as const satisfies Record<ReferenceRefType, ReferenceTypeConfig>;

export const REFERENCE_CATEGORIES: Array<{id: ReferenceCategory; label: string; primaryIcon: LucideIcon}> = [
  {id: 'threads', label: 'Threads', primaryIcon: Icons.History},
  {id: 'documents', label: 'Library', primaryIcon: Icons.Library},
  {id: 'notes', label: 'Notes', primaryIcon: Icons.NotebookText},
];

export const PROTOCOL_TO_TYPE: Record<string, ReferenceRefType> = Object.fromEntries(
  Object.entries(REFERENCE_TYPES).map(([type, config]) => [config.protocol, type as ReferenceRefType])
) as Record<string, ReferenceRefType>;

export const ALL_PROTOCOLS: string[] = Object.values(REFERENCE_TYPES).map(config => config.protocol);

export const NOTE_TYPE_TO_REF_TYPE: Record<string, ReferenceRefType> = {
  document: 'note',
  task: 'task',
  tasklist: 'tasklist',
};

export function referenceIconFor(refType: ReferenceCategory | ReferenceRefType) {
  const category = REFERENCE_CATEGORIES.find(item => item.id === refType);
  if (category) return category.primaryIcon;
  return REFERENCE_TYPES[refType as ReferenceRefType]?.icon ?? Icons.History;
}

export function referenceTypeForProtocol(protocol: string): ReferenceRefType | null {
  return PROTOCOL_TO_TYPE[protocol] ?? null;
}

export function categoryOfType(type: ReferenceRefType): ReferenceCategory {
  return REFERENCE_TYPES[type].category;
}

export function referenceCategoryLabel(category: ReferenceCategory | null) {
  return REFERENCE_CATEGORIES.find(item => item.id === category)?.label ?? '';
}

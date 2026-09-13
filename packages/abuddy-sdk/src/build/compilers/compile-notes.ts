import * as fs from 'fs';
import * as path from 'path';
import { toDisplayName } from './library-utils.ts';

export interface ExportedNote {
  id?: string;
  type: 'document' | 'tasklist' | 'task';
  title: string;
  content: string;
  icon: string | null;
  completed: boolean;
  hideCompletedChildren: boolean;
  favorite: boolean;
  displayOrder?: number;
  savedDisplayOrder?: number;
  children: ExportedNote[];
}

export interface ExportedNotes {
  version: number;
  notes: ExportedNote[];
}

interface Frontmatter {
  title?: string;
  type: 'document' | 'tasklist' | 'task';
  icon: string | null;
  favorite: boolean;
  hideCompletedChildren: boolean;
  completed: boolean;
}

const DEFAULTS: Frontmatter = {
  type: 'document',
  icon: null,
  favorite: false,
  hideCompletedChildren: false,
  completed: false,
};

function parseFrontmatter(content: string): { meta: Frontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?/);
  if (!match) return { meta: { ...DEFAULTS }, body: content };

  const fm = match[1];
  const body = content.slice(match[0].length);

  const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const titleMatch = fm.match(/title:\s*"((?:[^"\\]|\\.)*)"/)
  const typeMatch = fm.match(/type:\s*(\w+)/);
  const iconMatch = fm.match(/icon:\s*"((?:[^"\\]|\\.)*)"/)
  const favoriteMatch = fm.match(/favorite:\s*true/);
  const hideMatch = fm.match(/hideCompletedChildren:\s*true/);
  const completedMatch = fm.match(/completed:\s*true/);

  return {
    meta: {
      title: titleMatch?.[1] ? unescape(titleMatch[1]) : undefined,
      type: (typeMatch?.[1] as Frontmatter['type']) ?? 'document',
      icon: iconMatch?.[1] ? unescape(iconMatch[1]) : null,
      favorite: !!favoriteMatch,
      hideCompletedChildren: !!hideMatch,
      completed: !!completedMatch,
    },
    body,
  };
}

function walkDirectory(dir: string): ExportedNote[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const notes: ExportedNote[] = [];

  for (const entry of entries) {
    if (entry.name === 'media') continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const indexPath = path.join(fullPath, 'index.md');
      let meta = { ...DEFAULTS };
      let body = '';

      if (fs.existsSync(indexPath)) {
        const parsed = parseFrontmatter(fs.readFileSync(indexPath, 'utf-8'));
        meta = parsed.meta;
        body = parsed.body;
      }

      notes.push({
        ...meta,
        title: meta.title || toDisplayName(entry.name),
        content: body,
        children: walkDirectory(fullPath),
      });
    } else if (entry.name.endsWith('.md') && entry.name !== 'index.md') {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);

      notes.push({
        ...meta,
        title: meta.title || toDisplayName(entry.name.replace(/\.md$/, '')),
        content: body,
        children: [],
      });
    }
  }

  return notes;
}

export function compileNotesFromDir(notesDir: string): ExportedNotes {
  if (!fs.existsSync(notesDir)) {
    return { version: 1, notes: [] };
  }
  return { version: 1, notes: walkDirectory(notesDir) };
}

export function copyNotesMedia(notesDir: string, outputDir: string): void {
  const mediaSrc = path.join(notesDir, 'media');
  if (fs.existsSync(mediaSrc)) {
    const mediaDest = path.join(outputDir, 'media');
    fs.cpSync(mediaSrc, mediaDest, { recursive: true });
  }
}

export function countNotes(notes: ExportedNote[]): number {
  return notes.reduce((sum, note) => sum + 1 + countNotes(note.children), 0);
}

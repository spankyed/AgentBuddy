// The SDK's build and apply modules know no pack's entity types: library, notes and FAQ applying
// belong to default-setup (its content entries, compiler modules and content writers). A new name here
// needs a reason in ALLOWED, not a quiet exception.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '../../src');
const SCANNED = ['build', 'content'];

/** Library, notes and FAQ entity types, their shapes, compiled content formats, repositories and content keys */
const FORBIDDEN = /\b(Document|Collection|Note|Symlink|FAQ|DocumentEntity|CollectionEntity|NoteEntity|ContentSection|FieldContent|ListContent|MarkdownContent|TextContent|CodeContent|DocumentShortCode|Exported(Item|Document|Collection|Symlink|Library|Note|Notes)|CompiledFAQ|library(Commands|Queries)|note(Commands|Queries)|(compile|import)(Library|Notes|Faq)\w*|create(Library|Notes)ContentApplier|parseMarkdownSections|library|notes|faqs?)\b/gi;

/** `file:line` substrings that name one of them for another reason */
const ALLOWED: Record<string, string> = {
  'build/manifest-schema.ts:(e.g. "notes", "calendarEvents")': 'an example feature id',
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : entry.name.endsWith('.ts') ? [file] : [];
  });
}

function findPackContentSpecifics(root: string = SRC): string[] {
  const found: string[] = [];
  for (const file of SCANNED.flatMap((dir) => sourceFiles(path.join(root, dir)))) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    fs.readFileSync(file, 'utf-8').split('\n').forEach((line, index) => {
      if (!FORBIDDEN.test(line)) return;
      FORBIDDEN.lastIndex = 0;
      if (Object.keys(ALLOWED).some((allowed) => {
        const [allowedFile, text] = [allowed.slice(0, allowed.indexOf(':')), allowed.slice(allowed.indexOf(':') + 1)];
        return allowedFile === relative && line.includes(text);
      })) return;
      found.push(`${relative}:${index + 1}: ${line.trim()}`);
    });
    FORBIDDEN.lastIndex = 0;
  }
  return found;
}

describe('SDK build and apply modules', () => {
  it("name no library, notes or FAQ types, formats, repositories or content keys", () => {
    expect(findPackContentSpecifics()).toEqual([]);
  });

});

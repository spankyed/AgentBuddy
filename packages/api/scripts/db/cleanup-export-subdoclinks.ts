/**
 * Removes subdocument links from task and tasklist notes in an exported notes directory.
 *
 * Usage: npx tsx packages/api/scripts/db/cleanup-export-subdoclinks.ts <export-dir>
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const TYPES_TO_CLEAN = new Set(['task', 'tasklist']);
const DOCUMENT_LINK_PATTERN = /\n?\n?\\?\[([^\]\\]*)\\?\]\(document:\/\/[^)]+\)/g;

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseFrontmatterType(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const typeMatch = match[1].match(/^type:\s*(.+)$/m);
  return typeMatch ? typeMatch[1].trim() : null;
}

async function cleanupFile(filePath: string): Promise<boolean> {
  const content = await readFile(filePath, 'utf-8');
  const noteType = parseFrontmatterType(content);

  if (!noteType || !TYPES_TO_CLEAN.has(noteType)) return false;

  const cleaned = content.replace(DOCUMENT_LINK_PATTERN, '');
  if (cleaned === content) return false;

  await writeFile(filePath, cleaned, 'utf-8');
  return true;
}

async function main() {
  const exportDir = process.argv[2];
  if (!exportDir) {
    console.error('Usage: npx tsx packages/api/scripts/db/cleanup-export-subdoclinks.ts <export-dir>');
    process.exit(1);
  }

  const dirStat = await stat(exportDir).catch(() => null);
  if (!dirStat?.isDirectory()) {
    console.error(`Not a directory: ${exportDir}`);
    process.exit(1);
  }

  const files = await collectMarkdownFiles(exportDir);
  console.log(`Found ${files.length} markdown files`);

  let modified = 0;
  for (const file of files) {
    const wasModified = await cleanupFile(file);
    if (wasModified) {
      modified++;
      console.log(`Cleaned: ${file}`);
    }
  }

  console.log(`\nDone. Modified ${modified} of ${files.length} files.`);
}

main();

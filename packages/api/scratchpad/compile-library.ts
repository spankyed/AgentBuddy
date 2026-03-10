import * as fs from 'fs';
import * as path from 'path';

const LIBRARY_DIR = path.join(import.meta.dirname, 'library');
const OUTPUT_FILE = path.join(import.meta.dirname, 'compiled', 'compiled-library.json');

interface CompiledLibraryItem {
  name: string;
  content: Array<{ type: 'markdown'; text: string }>;
  tags: string[];
}

function toTitleCase(str: string): string {
  return str
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function compileLibrary(): void {
  console.log(`Compiling library docs from: ${LIBRARY_DIR}`);

  if (!fs.existsSync(LIBRARY_DIR)) {
    console.error('Library directory not found:', LIBRARY_DIR);
    process.exit(1);
  }

  const mdFiles = fs.readdirSync(LIBRARY_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  console.log(`Found ${mdFiles.length} markdown file(s): ${mdFiles.join(', ')}`);

  const items: CompiledLibraryItem[] = [];

  for (const file of mdFiles) {
    const filePath = path.join(LIBRARY_DIR, file);
    const name = toTitleCase(file.replace(/\.md$/, ''));
    const text = fs.readFileSync(filePath, 'utf-8');

    items.push({
      name,
      content: [{ type: 'markdown', text }],
      tags: ['scratchpad'],
    });

    console.log(`  + ${file} → "${name}"`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2) + '\n');
  console.log(`\nWrote ${items.length} library doc(s) to ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}

// Run directly
compileLibrary();

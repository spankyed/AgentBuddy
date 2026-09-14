import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

/** A markdown file or directory, as `compileMarkdownTree` reads it */
export interface MarkdownItem {
  /** A directory (whose own file, if any, gives its frontmatter and body) or a markdown file */
  kind: 'branch' | 'leaf';
  /** The file or directory name, without `.md` */
  filename: string;
  /** `filename` with dashes turned into spaces */
  displayName: string;
  /** Path relative to the walked directory, with `/` separators */
  path: string;
  frontmatter: Record<string, unknown>;
  /** The markdown after the frontmatter block (the whole file when it has none) */
  body: string;
  /** The file's full text; empty for a directory without its own file */
  text: string;
  children: MarkdownItem[];
}

export interface MarkdownTreeOptions {
  /** A directory's own file (e.g. `index.md`, `_meta.md`). Without it, directories carry no frontmatter or body. */
  branch?: string;
  /** Walk subdirectories. Default true; false reads only the directory's markdown files. */
  recursive?: boolean;
}

/** The directory copied as media rather than read as seeds */
export const MEDIA_DIR = 'media';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n\n?/;

/** `-` becomes a space: `getting-started` reads as `getting started` */
export function toDisplayName(filename: string): string {
  return filename.replace(/-/g, ' ');
}

/** Splits a markdown file into YAML frontmatter (YAML 1.2) and body */
export function parseMarkdownFile(text: string, file = '<markdown>'): { frontmatter: Record<string, unknown>; body: string } {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, body: text };
  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch (err) {
    throw new Error(`${file}: invalid frontmatter: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
    throw new Error(`${file}: frontmatter must be a YAML mapping`);
  }
  return { frontmatter: (parsed ?? {}) as Record<string, unknown>, body: text.slice(match[0].length) };
}

/**
 * Reads a directory of markdown into a tree: each `.md` file is a leaf, each subdirectory a branch
 * (its `options.branch` file supplying the branch's frontmatter and body). Entries are sorted by
 * name; the `media` directory is skipped. A missing directory reads as empty.
 */
export function compileMarkdownTree(dir: string, options: MarkdownTreeOptions = {}): MarkdownItem[] {
  if (!fs.existsSync(dir)) return [];
  return walk(dir, '', { branch: options.branch, recursive: options.recursive ?? true });
}

function walk(root: string, relative: string, options: { branch?: string; recursive: boolean }): MarkdownItem[] {
  const dir = path.join(root, relative);
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const items: MarkdownItem[] = [];
  for (const entry of entries) {
    const itemPath = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === MEDIA_DIR || !options.recursive) continue;
      const branchFile = options.branch ? path.join(dir, entry.name, options.branch) : undefined;
      const text = branchFile && fs.existsSync(branchFile) ? fs.readFileSync(branchFile, 'utf-8') : '';
      const { frontmatter, body } = text ? parseMarkdownFile(text, branchFile) : { frontmatter: {}, body: '' };
      items.push({
        kind: 'branch',
        filename: entry.name,
        displayName: toDisplayName(entry.name),
        path: itemPath,
        frontmatter,
        body,
        text,
        children: walk(root, itemPath, options),
      });
    } else if (entry.name.endsWith('.md') && entry.name !== options.branch) {
      const file = path.join(dir, entry.name);
      const text = fs.readFileSync(file, 'utf-8');
      const { frontmatter, body } = parseMarkdownFile(text, file);
      const filename = entry.name.replace(/\.md$/, '');
      items.push({
        kind: 'leaf',
        filename,
        displayName: toDisplayName(filename),
        path: itemPath,
        frontmatter,
        body,
        text,
        children: [],
      });
    }
  }
  return items;
}

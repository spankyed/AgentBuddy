import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackManifest } from './manifest.ts';
import type { HelpDocument } from '../framework/pack-help.ts';
import { parseMarkdownFile } from './content/markdown-tree.ts';

/** Build help into the registration; installed packs need neither Markdown sources nor a dataset loader. */
export function compileHelp(root: string, manifest: PackManifest): HelpDocument[] {
  if (!manifest.help) return [];
  const dir = path.resolve(root, manifest.help.path);
  const inside = (base: string, file: string) => { const relative = path.relative(base, file); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
  if (!inside(path.resolve(root), dir) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory() || !inside(fs.realpathSync(root), fs.realpathSync(dir))) {
    throw new Error(`Help directory "${manifest.help.path}" must exist inside the pack.`);
  }
  const files: string[] = [];
  function walk(folder: string): void {
    for (const item of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(folder, item.name);
      if (item.isSymbolicLink()) throw new Error(`${file}: help does not follow symbolic links.`);
      if (item.isDirectory()) walk(file);
      else if (item.isFile() && item.name.endsWith('.md')) files.push(file);
    }
  }
  walk(dir);
  const ids = new Set<string>();
  const documents = files.map(file => {
    const { body, frontmatter: meta } = parseMarkdownFile(fs.readFileSync(file, 'utf8'), file);
    const heading = body.trimStart().match(/^#[ \t]+([^\r\n]+)(?:\r?\n|$)/);
    if (!heading || !heading[1].trim()) throw new Error(`${file}: help requires a first H1 title.`);
    const id = meta.id ?? path.relative(dir, file).replace(/\\/g, '/').slice(0, -3);
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(id)) throw new Error(`${file}: invalid help id.`);
    if (ids.has(id)) throw new Error(`${file}: duplicate help id "${id}".`);
    ids.add(id);
    if (meta.order !== undefined && (typeof meta.order !== 'number' || !Number.isFinite(meta.order))) throw new Error(`${file}: order must be a finite number.`);
    if (meta.features !== undefined && (!Array.isArray(meta.features) || meta.features.some(f => typeof f !== 'string' || !manifest.features?.[f]))) {
      throw new Error(`${file}: features must name features declared by this pack.`);
    }
    return { file, article: { id, title: heading[1].trim(), body: body.trimStart().slice(heading[0].length).trim(),
      ...(meta.features !== undefined ? { features: meta.features as string[] } : {}),
      ...(meta.order !== undefined ? { order: meta.order as number } : {}),
    } satisfies HelpDocument };
  });
  const byFile = new Map(documents.map(d => [d.file, d.article.id]));
  for (const { file, article } of documents) {
    // Rewrite Markdown article destinations to an internal HTTPS-shaped URL the safe viewer accepts.
    // Both inline links and reference definitions retain their labels and optional fragments.
    const resolveLink = (href: string): string => {
      const [target, fragment] = href.split('#', 2);
      if (!target.endsWith('.md') || /^[a-z]+:/i.test(target)) return href;
      const id = byFile.get(path.resolve(path.dirname(file), decodeURIComponent(target)));
      if (!id) throw new Error(`${file}: help link "${href}" does not name an article in this pack.`);
      return `https://help.apack.invalid/${encodeURIComponent(manifest.id)}/${encodeURIComponent(id)}${fragment ? `#${fragment}` : ''}`;
    };
    let fence = false;
    article.body = article.body.split('\n').map(line => {
      if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
      if (fence) return line;
      return line.replace(/(?<!!)\]\(([^\s)]+)([^)]*)\)/g, (_, href: string, suffix: string) => `](${resolveLink(href)}${suffix})`)
        .replace(/^(\s*\[[^\]]+\]:\s*)(\S+)(.*)$/, (_, prefix: string, href: string, suffix: string) => `${prefix}${resolveLink(href)}${suffix}`);
    }).join('\n');
  }
  return documents.map(d => d.article);
}

// Compiles src/seeds/library (the `library` seed entry in abuddy.json): directories become Collections
// (named by their _meta.md frontmatter) and markdown files Documents, with their content parsed into sections.
import { compileMarkdownTree, sourceHash, type MarkdownItem, type SeedCompileContext, type SeedRecord } from '@abuddy/sdk/build';
import { parseMarkdownSections } from '../utils';

const text = (value: unknown): string | undefined => (value === undefined || value === null || value === '' ? undefined : String(value));

function toRecords(items: MarkdownItem[]): SeedRecord[] {
  return items.map((item) => {
    if (item.kind === 'branch') {
      const name = text(item.frontmatter.name) ?? item.displayName;
      const description = text(item.frontmatter.description);
      const children = toRecords(item.children);
      return {
        entity: 'Collection',
        name,
        ...(description && { description }),
        children,
        sourceHash: sourceHash({ name, description, children: children.map((child) => child.sourceHash) }),
      };
    }
    const name = text(item.frontmatter.name) ?? item.displayName;
    const content = parseMarkdownSections(item.body || item.text);
    const tags = Array.isArray(item.frontmatter.tags) ? item.frontmatter.tags.map(String) : [];
    const resolvedTags = tags.length ? tags : ['default'];
    return { entity: 'Document', name, content, tags: resolvedTags, sourceHash: sourceHash({ name, content, tags: resolvedTags }) };
  });
}

export default function compileLibrary({ path }: SeedCompileContext): SeedRecord[] {
  return toRecords(compileMarkdownTree(path, { branch: '_meta.md' }));
}

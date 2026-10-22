// Compiles src/content/library (the `library` content entry in apack.json): directories become Collections
// (named by their _meta.md frontmatter) and markdown files Documents, with their content parsed into sections.
import { compileMarkdownTree, contentHash, type MarkdownItem, type ContentCompileContext, type ContentItem } from '@apackdev/sdk/build';
import { parseMarkdownSections } from '../../features/library/be/utils.ts';

const text = (value: unknown): string | undefined => (value === undefined || value === null || value === '' ? undefined : String(value));

function toRecords(items: MarkdownItem[]): ContentItem[] {
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
        contentHash: contentHash({ name, description, children: children.map((child) => child.contentHash) }),
      };
    }
    const name = text(item.frontmatter.name) ?? item.displayName;
    const content = parseMarkdownSections(item.body || item.text);
    const tags = Array.isArray(item.frontmatter.tags) ? item.frontmatter.tags.map(String) : [];
    const resolvedTags = tags.length ? tags : ['default'];
    // What the document is, declared in its own frontmatter rather than inferred from where it sits. In
    // the hash with everything else, so changing it is a content change the apply offers.
    const documentType = text(item.frontmatter.type);
    return { entity: 'Document', name, content, tags: resolvedTags, ...(documentType && { documentType }),
      contentHash: contentHash({ name, content, tags: resolvedTags, documentType }) };
  });
}

export default function compileLibrary({ path, format }: ContentCompileContext): ContentItem[] {
  return toRecords(compileMarkdownTree(path, { branch: '_meta.md', media: format.media }));
}

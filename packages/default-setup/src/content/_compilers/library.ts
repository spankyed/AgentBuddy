// Compiles the library-shaped content entries in apack.json: directories become Collections (named by their
// _meta.md frontmatter) and markdown files Documents, with their content parsed into sections. `commands.ts`
// beside this is the same compiler over documents that are command lists.
import { compileMarkdownTree, contentHash, type MarkdownItem, type ContentCompileContext, type ContentItem } from '@apackdev/sdk/build';
import { parseMarkdownSections } from '../../features/library/be/utils.ts';

const text = (value: unknown): string | undefined => (value === undefined || value === null || value === '' ? undefined : String(value));

function toRecords(items: MarkdownItem[], documentType?: string): ContentItem[] {
  return items.map((item) => {
    if (item.kind === 'branch') {
      const name = text(item.frontmatter.name) ?? item.displayName;
      const description = text(item.frontmatter.description);
      const children = toRecords(item.children, documentType);
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
    // What the document is comes from the format that compiled it, so a file cannot be in the commands
    // source and fail to be a command list, or become one by naming a type somewhere else. In the hash
    // with everything else, so changing it is a content change the apply offers.
    return { entity: 'Document', name, content, tags: resolvedTags, ...(documentType && { documentType }),
      contentHash: contentHash({ name, content, tags: resolvedTags, documentType }) };
  });
}

/** The records a library-shaped entry compiles to, with `documentType` stamped on every Document */
export function compileLibraryTree(context: ContentCompileContext, documentType?: string): ContentItem[] {
  return toRecords(compileMarkdownTree(context.path, { branch: '_meta.md', media: context.format.media }), documentType);
}

export default function compileLibrary(context: ContentCompileContext): ContentItem[] {
  return compileLibraryTree(context);
}

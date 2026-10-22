// Compiles the library-shaped content entries in apack.json: directories become Collections (named by their
// _meta.md frontmatter) and markdown files Documents, with their content parsed into sections. `commands.ts`
// beside this is the same compiler with a default document type.
import { compileMarkdownTree, contentHash, type MarkdownItem, type ContentCompileContext, type ContentItem } from '@apackdev/sdk/build';
import { parseMarkdownSections } from '../../features/library/be/utils.ts';

const text = (value: unknown): string | undefined => (value === undefined || value === null || value === '' ? undefined : String(value));

function toRecords(items: MarkdownItem[], defaultDocumentType?: string): ContentItem[] {
  return items.map((item) => {
    if (item.kind === 'branch') {
      const name = text(item.frontmatter.name) ?? item.displayName;
      const description = text(item.frontmatter.description);
      const children = toRecords(item.children, defaultDocumentType);
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
    // What the document is, which is the document's own property: its frontmatter says so, and the
    // format supplies a default for a source whose documents are all one kind — so a file in the commands
    // source cannot fail to be a command list, and a document anywhere else can still declare it is one.
    // In the hash with everything else, so changing it is a content change the apply offers.
    const documentType = text(item.frontmatter.type) ?? defaultDocumentType;
    return { entity: 'Document', name, content, tags: resolvedTags, ...(documentType && { documentType }),
      contentHash: contentHash({ name, content, tags: resolvedTags, documentType }) };
  });
}

/** The records a library-shaped entry compiles to, with `defaultDocumentType` for documents that declare none */
export function compileLibraryTree(context: ContentCompileContext, defaultDocumentType?: string): ContentItem[] {
  return toRecords(compileMarkdownTree(context.path, { branch: '_meta.md', media: context.format.media }), defaultDocumentType);
}

export default function compileLibrary(context: ContentCompileContext): ContentItem[] {
  return compileLibraryTree(context);
}

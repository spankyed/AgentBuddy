// Compiles src/content/commands (the `commands` entry in apack.json) with the library compiler, stamping
// every Document as a command list. The format is what makes a document one, so a file in this source
// cannot omit it and a file in another source cannot claim it.
import type { ContentCompileContext, ContentItem } from '@apackdev/sdk/build';
import { compileLibraryTree } from './library.ts';

/** The document type whose field sections the `commands` designation's owner reads as commands */
const COMMANDS_DOCUMENT_TYPE = 'commands';

export default function compileCommands(context: ContentCompileContext): ContentItem[] {
  return compileLibraryTree(context, COMMANDS_DOCUMENT_TYPE);
}

// Compiles src/content/commands (the `commands` entry in apack.json) with the library compiler, defaulting
// every Document to a command list. A file in this source therefore cannot fail to be one by omitting the
// type — and a command is only a document with a type, so a library document that declares it is one too,
// and a file here that declares something else is what it says.
import type { ContentCompileContext, ContentItem } from '@apackdev/sdk/build';
import { compileLibraryTree } from './library.ts';
import { COMMANDS_DOCUMENT_TYPE } from '@apackdev/sdk/commands';

export default function compileCommands(context: ContentCompileContext): ContentItem[] {
  return compileLibraryTree(context, COMMANDS_DOCUMENT_TYPE);
}

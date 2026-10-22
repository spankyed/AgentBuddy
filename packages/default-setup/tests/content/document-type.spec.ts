// What a compiled document says it is, which is how the chat's slash commands are found: the
// `commands` designation's owner serves every document of `documentType: 'commands'`.
//
// **A command is only a document with a type**, so the type belongs to the document and its frontmatter
// is what declares it. The format supplies a default where a whole source is one kind, which is what
// stops a file in `src/content/commands` from failing to be a command list by saying nothing — but it
// is a default, so a library document may declare the type and be served, and a document that declares
// nothing is just a document.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import type { ContentCompileContext } from '@apackdev/sdk/build';
import compileCommands from '../../src/content/_compilers/commands.ts';
import compileLibrary from '../../src/content/_compilers/library.ts';

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); });

/** A source directory holding one markdown file per `[name, frontmatter]` */
function source(files: Array<[string, string]>): ContentCompileContext {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'document-type-'));
  dirs.push(dir);
  for (const [name, frontmatter] of files) {
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nname: ${name}\n${frontmatter}---\n<!-- section:field -->\n**thing**: Arguments\n`);
  }
  return { key: 'fixture', path: dir, packDir: dir, format: {} };
}

const typesOf = (records: Array<Record<string, unknown>>) =>
  Object.fromEntries(records.map(record => [record.name, record.documentType]));

it('defaults a document in the commands source to a command list, and takes what one declares', () => {
  const records = compileCommands(source([['quiet', ''], ['declared', 'type: notes\n']]));

  expect(typesOf(records)).toEqual({ quiet: 'commands', declared: 'notes' });
});

it('leaves a library document untyped unless it says what it is', () => {
  const records = compileLibrary(source([['plain', ''], ['claimed', 'type: commands\n']]));

  // The one the goal exists for: a command is a document with a type, so a library document that
  // declares it is served beside the pack's own without living in the commands source
  expect(typesOf(records)).toEqual({ plain: undefined, claimed: 'commands' });
});

// `apack pack add command` and `add document` both write a markdown document into a content source — the
// friction they remove is the directory, the format reference and the frontmatter convention, none of which
// is the thing being added. They share `content-document.ts`; what differs is the format and the body.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { ManifestSchema } from '@apackdev/sdk/build';
import { addCommand } from '../../src/commands/add/command.ts';
import { addDocument } from '../../src/commands/add/document.ts';

function pack(manifest: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'add-command-'));
  fs.writeFileSync(path.join(root, 'apack.json'), JSON.stringify({ id: 'memo-pack', name: 'Memos', version: '1.0.0', ...manifest }));
  return root;
}
const manifestOf = (root: string) => JSON.parse(fs.readFileSync(path.join(root, 'apack.json'), 'utf-8'));
const read = (root: string, file: string) => fs.readFileSync(path.join(root, file), 'utf-8');

it("declares a source naming its dependency's format, and writes the document", async () => {
  const root = pack({ dependencies: { 'default-setup': '*' } });

  await addCommand(['standup', '--placeholder', 'Topic'], root);

  const manifest = manifestOf(root);
  expect(manifest.content.sources.commands).toEqual({ path: 'src/content/commands', format: 'default-setup:commands' });
  expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  expect(read(root, 'src/content/commands/commands.md')).toBe(
    '---\nname: Commands\n---\n<!-- section:field -->\n**standup**: Topic\n');
});

// The source is the declaration, so a second command joins the entry that already compiles command
// documents rather than declaring another one
it('writes a second document into the source already declared', async () => {
  const root = pack({ dependencies: { 'default-setup': '*' },
    content: { sources: { slash: { path: 'src/content/slash', format: 'default-setup:commands' } } } });

  await addCommand(['retro', '--document', 'team'], root);

  expect(Object.keys(manifestOf(root).content.sources)).toEqual(['slash']);
  expect(read(root, 'src/content/slash/team.md')).toContain('**retro**: Arguments');
});

// A pack's own format counts too — the pack that serves the commands declares one
it("uses the pack's own commands format when it has one", async () => {
  const root = pack({ content: { formats: { commands: { compiler: 'src/content/_compilers/commands.ts', entity: ['Collection', 'Document'], identity: ['name'] } } } });

  await addCommand(['own'], root);

  expect(manifestOf(root).content.sources.commands.format).toBe('commands');
});

// Without a format nothing would compile the document, so it refuses rather than writing a file the
// apply never reaches
it('refuses when no format writes command documents', async () => {
  const root = pack({});

  await expect(addCommand(['orphan'], root)).rejects.toThrow(/No content format writes "commands" documents/);
  expect(fs.existsSync(path.join(root, 'src/content/commands'))).toBe(false);
  expect(manifestOf(root).content).toBeUndefined();
});

// Default-setup's own command documents live a folder down, so the scaffold has to be able to put one there
it('nests a document in the folder it is given, which the format reads as a collection', async () => {
  const root = pack({ dependencies: { 'default-setup': '*' } });

  await addCommand(['standup', '--folder', 'internal'], root);

  expect(read(root, 'src/content/commands/internal/commands.md')).toContain('**standup**: Arguments');
});

it('refuses a folder that is not a name', async () => {
  const root = pack({ dependencies: { 'default-setup': '*' } });

  await expect(addCommand(['standup', '--folder', '../escaped'], root)).rejects.toThrow(/Folder name must be lowercase/);
});

it("writes a library document through the same source resolution, and declares a library entry", async () => {
  const root = pack({ dependencies: { 'default-setup': '*' } });

  await addDocument(['getting-started', '--folder', 'guides'], root);

  expect(manifestOf(root).content.sources.library).toEqual({ path: 'src/content/library', format: 'default-setup:library' });
  const body = read(root, 'src/content/library/guides/getting-started.md');
  expect(body).toContain('name: Getting Started');
  expect(body).toContain('<!-- section:text -->');
});

// The two formats are separate entries, so adding one kind never declares the other's source
it('declares only the source for the kind being added', async () => {
  const root = pack({ dependencies: { 'default-setup': '*' } });

  await addDocument(['notes'], root);

  expect(Object.keys(manifestOf(root).content.sources)).toEqual(['library']);
});

// These are mostly run by an agent, which has the content in hand: scaffolding boilerplate for it to edit
// afterwards would be two steps where one does
it('writes the body it is given, in the section it is given', async () => {
  const root = pack({ dependencies: { 'default-setup': '*' } });

  await addDocument(['runbook', '--content', 'Restart the API, then reload the pack.', '--section', 'code'], root);

  expect(read(root, 'src/content/library/runbook.md')).toBe(
    '---\nname: Runbook\ntags: [default]\n---\n<!-- section:code -->\nRestart the API, then reload the pack.\n');
});

// Without content it explains the convention instead, which is what a person opening the file needs
it('explains the section convention when given no body', async () => {
  const root = pack({ dependencies: { 'default-setup': '*' } });

  await addDocument(['notes'], root);

  expect(read(root, 'src/content/library/notes.md')).toContain('A `<!-- section:<type> -->` marker starts a section');
});

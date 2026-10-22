// `apack pack add command` writes a slash command, which is content: a document whose field section holds
// one `**name**: placeholder` line. The friction it removes is the directory, the format reference and that
// convention — a pack with two commands to add should not have to know any of them.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { ManifestSchema } from '@apackdev/sdk/build';
import { addCommand } from '../../src/commands/add/command.ts';

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

  await expect(addCommand(['orphan'], root)).rejects.toThrow(/No content format writes command documents/);
  expect(fs.existsSync(path.join(root, 'src/content/commands'))).toBe(false);
  expect(manifestOf(root).content).toBeUndefined();
});

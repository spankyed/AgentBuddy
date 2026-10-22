// The chat's slash commands are the fields of every document that says it is a command list
// (`documentType: 'commands'`, from a content file's frontmatter): the threads system sends them when a
// client connects, and again whenever a library change alters them.
//
// **One source.** They used to be these documents merged with `extensions.commands` declarations, keyed so
// a document could not shadow a declared one. Commands are content now — the two that were manifest
// entries are `src/content/commands/chat.md` — so there is no merge, no precedence, and no folder path
// deciding what a document is.
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { registerPack, startApp, unregisterPack, type TestApp } from '@apackdev/testing/harness'
import { importCompiledContent } from '@apackdev/sdk/utils'
import { createFormatApplier } from '@apackdev/sdk/content'
import { repository } from '#generated/repository.ts'
import { services } from '#generated/services.ts'
import manifest from '../../../../apack.json'

/** Where `apack pack build` writes this pack's compiled content */
const DIST = path.resolve(import.meta.dirname, '../../../../dist', 'runtime', 'content')

const commandNames = (event: unknown) => ((event as { commands: Array<{ name: string }> }).commands).map((command) => command.name)
const commandDocuments = () => repository.libraryQueries.getDocuments().filter((document) => document.documentType === 'commands')
const field = (key: string, value: string) => [{ type: 'field' as const, fields: [{ key, value }] }]
const documentNamed = (name: string) => repository.libraryQueries.getDocuments().find((document) => document.name === name)!

/**
 * The dependent pack, registered as the app registers an installed pack: its appliers for default-setup's
 * formats, as its registration carries them. It declares no commands — a pack contributes them as content
 * now, with `"format": "default-setup:commands"`.
 */
function registerTeamNotes(): void {
  registerPack({
    id: 'team-notes',
    appliers: [
      createFormatApplier({ key: 'library', entities: ['Collection', 'Document'], identity: ['name'], media: true }),
      createFormatApplier({ key: 'commands', entities: ['Collection', 'Document'], identity: ['name'] }),
      createFormatApplier({ key: 'notes', entities: ['Note'], identity: ['title', 'parent'], relKind: 'contains' }),
    ],
  })
}
registerTeamNotes()
function reregisterTeamNotes(): void {
  unregisterPack('team-notes')
  registerTeamNotes()
}
afterEach(() => reregisterTeamNotes())

const dependentDirs: string[] = []
afterAll(() => {
  unregisterPack('team-notes')
  for (const dir of dependentDirs) fs.rmSync(dir, { recursive: true, force: true })
})

/** A pack depending on default-setup, with its library records compiled as its `library` format writes them */
function dependentPack(records: unknown[], key = 'library'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dependent-commands-'))
  dependentDirs.push(dir)
  fs.writeFileSync(path.join(dir, 'content.json'), JSON.stringify({ version: 1, packId: 'team-notes', entries: [] }))
  fs.writeFileSync(path.join(dir, `${key}.content.json`), JSON.stringify({ records }))
  return dir
}

const document = (name: string, command: string) =>
  ({ entity: 'Document', name, content: field(command, 'Team argument'), tags: [],
    documentType: 'commands', contentHash: `team-${command}` })

/** Its own command document, written with default-setup's `commands` format */
const dependentPackCommands = (documentName: string, command: string) =>
  dependentPack([document(documentName, command)], 'commands')

async function appliedApp(): Promise<TestApp> {
  importCompiledContent({ compiledDir: DIST, include: { commands: true } })
  // threads checks onboarding with the brain when a client connects
  const app = await startApp({ systems: ['library', 'threads', 'brain', 'host/settings', 'host/packs'] })
  await app.connect()
  return app
}

describe('slash commands from the library commands folder', () => {
  it("lists the commands default-setup declares, then its Claude Code and Codex documents'", async () => {
    const app = await appliedApp()
    expect(commandDocuments().map((document) => document.name).sort()).toEqual(['Chat commands', 'Claude Code commands', 'Codex commands'])

    const connected = app.emitted('threads').find((event) => event.type === 'AGENT_CONNECTED') as unknown as { data: { commands: Array<{ name: string }> } }
    const names = connected.data.commands.map((command) => command.name)
    // Document order then name, so the chat's own document leads
    expect(names.slice(0, 2)).toEqual(['pr2md', 'instructions'])
    expect(names).toEqual(expect.arrayContaining(['cc-resume', 'cc-goal', 'cdx-resume', 'cdx-goal']))
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(services.library.commands().map((command) => command.name))
  })

  it('lists a command from any command document, wherever it sits', async () => {
    await appliedApp()
    repository.libraryCommands.createDocument('elsewhere', field('loose', 'Anywhere'), [], undefined, undefined, undefined, 'commands')

    expect(services.library.commands().map((command) => command.name)).toContain('loose')
  })

  it('adds the commands of a document created in the folder, and sends the chat the new list', async () => {
    const app = await appliedApp()
    await app.send('library', { type: 'CREATE_DOCUMENT', name: 'mine', content: field('my-command', 'Arguments'), tags: [], documentType: 'commands' })
    const updated = await app.nextEmit('threads', 'COMMANDS_UPDATED')
    expect(commandNames(updated)).toContain('my-command')
    expect(commandNames(updated)).toContain('cc-resume')
  })

  it('removes the commands of a deleted document, and sends the chat the new list', async () => {
    const app = await appliedApp()
    await app.send('library', { type: 'DELETE_ITEMS', ids: [documentNamed('Claude Code commands').id] })
    const afterDelete = commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))
    expect(afterDelete).not.toContain('cc-resume')
    expect(afterDelete).toContain('pr2md')
  })

  // What a document is travels with it, which is the point of typing it rather than its folder
  it('keeps a command document its commands when it moves', async () => {
    const app = await appliedApp()
    const before = services.library.commands().map((command) => command.name)
    await app.send('library', { type: 'MOVE_ITEMS', ids: [documentNamed('Codex commands').id], targetFolderId: undefined })
    await app.settle()
    expect(services.library.commands().map((command) => command.name)).toEqual(before)
  })

  it("reports only failure for content that does not name its pack, even when no section is selected", async () => {
    // With every section deselected no applier runs, so nothing else reads the missing pack id
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unnamed-content-'))
    dependentDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'content.json'), JSON.stringify({ version: 1, entries: [] }))
    const nothing = Object.fromEntries(Object.keys(manifest.content.sources).map((key) => [key, []]))
    const app = await startApp({ systems: ['library', 'threads', 'brain', 'host/settings', 'host/packs'] })
    await app.connect()

    await app.send('host/packs', { type: 'IMPORT_PACK_CONTENT', directory: dir, include: nothing, mode: 'replace-on-collision', restartBrain: false })
    const failed = await app.nextEmit('host/settings', 'PACK_CONTENT_IMPORT_FAILED') as unknown as { error: string }

    expect(failed.error).toContain('packId')
    expect(app.emitted('host/settings').map((event) => event.type)).not.toContain('PACK_CONTENT_IMPORTED')
  })

  it("reports the records a content import couldn't write, with the counts of the rest", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failing-content-'))
    dependentDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'content.json'), JSON.stringify({ version: 1, packId: manifest.id, entries: [] }))
    const note = (title: string) => ({ entity: 'Note', title, noteType: 'document', content: 'x', contentHash: `hash-${title}` })
    fs.writeFileSync(path.join(dir, 'notes.content.json'), JSON.stringify({ records: [note(''), note('kept')] }))
    const app = await startApp({ systems: ['library', 'threads', 'brain', 'host/settings', 'host/packs'] })
    await app.connect()

    await app.send('host/packs', { type: 'IMPORT_PACK_CONTENT', directory: dir, include: { notes: null }, mode: 'replace-on-collision', restartBrain: false })
    const imported = await app.nextEmit('host/settings', 'PACK_CONTENT_IMPORTED') as unknown as { result: Record<string, { created: number }>; errors: string[] }

    expect(imported.result.notes.created).toBe(1)
    expect(imported.errors).toHaveLength(1)
    expect(imported.errors[0]).toMatch(/^notes: .*Title is required/)
  })

  it('sends the chat the commands a pack content import brings', async () => {
    const app = await startApp({ systems: ['library', 'threads', 'brain', 'host/settings', 'host/packs'] })
    await app.connect()
    await app.send('host/packs', { type: 'IMPORT_PACK_CONTENT', directory: DIST, include: { commands: null }, mode: 'replace-on-collision', restartBrain: false })
    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))).toContain('cdx-goal')
  })

  it("keeps the chat's own commands when the CLI documents are gone", async () => {
    const app = await appliedApp()
    await app.send('library', { type: 'DELETE_ITEMS', ids: [documentNamed('Claude Code commands').id, documentNamed('Codex commands').id] })

    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))).toEqual(['pr2md', 'instructions'])
  })

  it("sends nothing for a change that doesn't alter the commands", async () => {
    const app = await appliedApp()
    await app.send('library', { type: 'CREATE_DOCUMENT', name: 'notes', content: field('not-a-command', 'x'), tags: [] })
    await app.nextEmit('library', 'DOCUMENT_CREATED')
    await app.settle()
    expect(app.emitted('threads').filter((event) => event.type === 'COMMANDS_UPDATED')).toEqual([])
    expect(services.library.commands().map((command) => command.name)).not.toContain('not-a-command')
  })

  it("nests a dependent pack's command document in default-setup's folders, and lists its commands", async () => {
    await appliedApp()
    const before = repository.libraryQueries.getCollections()

    importCompiledContent({ compiledDir: dependentPackCommands('Team commands', 'team-standup') })

    const collections = repository.libraryQueries.getCollections()
    expect(collections.filter((collection) => collection.name === 'internal')).toHaveLength(1)
    expect(collections.find((collection) => collection.name === 'internal')!.id).toBe(before.find((collection) => collection.name === 'internal')!.id)
    expect(commandDocuments().map((document) => document.name)).toContain('Team commands')
    expect(services.library.commands().map((command) => command.name)).toEqual(expect.arrayContaining(['team-standup', 'cc-resume']))
  })

  // The bus asks every system to publish when a pack is installed, updated or rebuilt while the app runs
  it('sends the chat the commands a pack written while the app runs brings', async () => {
    const app = await appliedApp()
    importCompiledContent({ compiledDir: dependentPackCommands('Team commands', 'team-standup') })

    await app.send('threads', { type: 'SEND_STATE' })

    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))).toContain('team-standup')
  })

  it("sends nothing when asked to publish without the commands having altered", async () => {
    const app = await appliedApp()

    await app.send('threads', { type: 'SEND_STATE' })
    await app.settle()

    expect(app.emitted('threads').filter((event) => event.type === 'COMMANDS_UPDATED')).toEqual([])
  })

  it("sends the library surface its index again when asked to publish, with what the pack written", async () => {
    const app = await appliedApp()
    importCompiledContent({ compiledDir: dependentPackCommands('Team commands', 'team-standup') })

    const sentBefore = app.emitted('library').filter((event) => event.type === 'LIBRARY_CONNECTED').length

    // What a pack change comes down to for this system: the bus asks every system to publish after one
    await app.send('library', { type: 'SEND_STATE' })
    await app.settle()

    const sent = app.emitted('library').filter((event) => event.type === 'LIBRARY_CONNECTED') as unknown as Array<{ data: { index: { documents: Array<{ name: string }> } } }>
    expect(sent).toHaveLength(sentBefore + 1)
    expect(sent.at(-1)!.data.index.documents.map((document) => document.name)).toContain('Team commands')
  })



  it('keeps the first definition of a command two documents define', async () => {
    await appliedApp()
    const original = services.library.commands().find((command) => command.name === 'cc-resume')!
    repository.libraryCommands.createDocument('zz-override', field('cc-resume', 'Shadowed'), [], undefined, undefined, undefined, 'commands')
    expect(services.library.commands().filter((command) => command.name === 'cc-resume')).toEqual([original])
  })
})

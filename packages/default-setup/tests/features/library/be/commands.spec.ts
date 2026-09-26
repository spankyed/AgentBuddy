// The chat's slash commands are the ones registered packs declare (abuddy.json `commands`) and the
// fields of every document in the library's internal/commands folder: the threads system sends them when a
// client connects, and again whenever a library change or a pack changing (the bus's PACK_CHANGED) alters them
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { registerPack, startApp, unregisterPack, type TestApp } from '@abuddy/testing/harness'
import { importCompiledSeeds } from '@abuddy/sdk/utils'
import { createSeeder } from '@abuddy/sdk/seed'
import type { PackCommand } from '@abuddy/sdk/framework'
import { repository } from '@/__generated__/repository'
import { services } from '@/__generated__/services'
import manifest from '../../../../abuddy.json'

const DIST = path.resolve(import.meta.dirname, '../../../../dist')

const commandNames = (event: unknown) => ((event as { commands: Array<{ name: string }> }).commands).map((command) => command.name)
const commandDocuments = () => repository.libraryQueries.getDocuments().filter((document) => document.collectionPath?.join('/') === 'internal/commands')
const commandsFolderId = () => commandDocuments()[0].collectionId!
const internalFolderId = () => repository.libraryQueries.getCollections().find((collection) => collection.name === 'internal' && !collection.parentId)!.id
const field = (key: string, value: string) => [{ type: 'field' as const, fields: [{ key, value }] }]
const documentNamed = (name: string) => repository.libraryQueries.getDocuments().find((document) => document.name === name)!

/**
 * The dependent pack, registered as the app registers an installed pack: its seeders for default-setup's formats,
 * as its registration carries them, and the commands it declares
 */
function registerTeamNotes(commands: PackCommand[] = []): void {
  registerPack({
    id: 'team-notes',
    seeders: [
      createSeeder({ key: 'library', entities: ['Collection', 'Document'], identity: ['name'], media: true }),
      createSeeder({ key: 'notes', entities: ['Note'], identity: ['title', 'parent'], relKind: 'contains' }),
    ],
    commands,
  })
}
registerTeamNotes()
/** Registers the dependent pack again, with `commands` */
function reregisterTeamNotes(commands: PackCommand[] = []): void {
  unregisterPack('team-notes')
  registerTeamNotes(commands)
}
// A pack another test registered would still be declaring its commands in the next one
afterEach(() => reregisterTeamNotes())

const dependentDirs: string[] = []
afterAll(() => {
  unregisterPack('team-notes')
  for (const dir of dependentDirs) fs.rmSync(dir, { recursive: true, force: true })
})

/** A pack depending on default-setup, with its library records compiled as its `library` format writes them */
function dependentPack(records: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dependent-commands-'))
  dependentDirs.push(dir)
  fs.writeFileSync(path.join(dir, 'seeds.json'), JSON.stringify({ version: 1, packId: 'team-notes', seeds: [] }))
  fs.writeFileSync(path.join(dir, 'library.seed.json'), JSON.stringify({ records }))
  return dir
}

const document = (name: string, command: string) =>
  ({ entity: 'Document', name, content: field(command, 'Team argument'), tags: [], sourceHash: `team-${command}` })

const folder = (name: string, children: unknown[]) => ({ entity: 'Collection', name, sourceHash: `team-${name}`, children })

/** Its own command document, under the internal/commands folders default-setup seeds */
const dependentPackCommands = (documentName: string, command: string) =>
  dependentPack([folder('internal', [folder('commands', [document(documentName, command)])])])

async function seededApp(): Promise<TestApp> {
  importCompiledSeeds({ compiledDir: DIST, include: { library: new Set(['internal']) } })
  // threads checks onboarding with the brain when a client connects
  const app = await startApp({ systems: ['library', 'threads', 'brain', 'host/settings'] })
  await app.connect()
  return app
}

describe('slash commands from the library commands folder', () => {
  it("lists the commands default-setup declares, then its Claude Code and Codex documents'", async () => {
    const app = await seededApp()
    expect(commandDocuments().map((document) => document.name).sort()).toEqual(['Claude Code commands', 'Codex commands'])

    const connected = app.emitted('threads').find((event) => event.type === 'AGENT_CONNECTED') as unknown as { data: { commands: Array<{ name: string }> } }
    const names = connected.data.commands.map((command) => command.name)
    // The manifest's come first, in the order the pack declares them
    expect(names.slice(0, 2)).toEqual(['pr2md', 'instructions'])
    expect(names).toEqual(expect.arrayContaining(['cc-resume', 'cc-goal', 'cdx-resume', 'cdx-goal']))
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(services.library.commands().map((command) => command.name))
  })

  it("ignores a document that repeats a declared command, so a pack's own placeholder stands", async () => {
    await seededApp()
    repository.libraryCommands.createDocument('aa-override', field('pr2md', 'Shadowed'), [], commandsFolderId())

    expect(services.library.commands().filter((command) => command.name === 'pr2md'))
      .toEqual([{ name: 'pr2md', placeholder: 'PR number or GitHub URL (optional)' }])
  })

  it('adds the commands of a document created in the folder, and sends the chat the new list', async () => {
    const app = await seededApp()
    await app.send('library', { type: 'CREATE_DOCUMENT', name: 'mine', content: field('my-command', 'Arguments'), tags: [], collectionId: commandsFolderId() })
    const updated = await app.nextEmit('threads', 'COMMANDS_UPDATED')
    expect(commandNames(updated)).toContain('my-command')
    expect(commandNames(updated)).toContain('cc-resume')
  })

  it('removes the commands of a document moved out of the folder, and of one deleted', async () => {
    const app = await seededApp()
    await app.send('library', { type: 'MOVE_ITEMS', ids: [documentNamed('Codex commands').id], targetFolderId: internalFolderId() })
    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED')).some((name) => name.startsWith('cdx-'))).toBe(false)

    await app.send('library', { type: 'DELETE_ITEMS', ids: [documentNamed('Claude Code commands').id] })
    const afterDelete = commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))
    expect(afterDelete).not.toContain('cc-resume')
    expect(afterDelete).toContain('pr2md')
  })

  it("drops the documents' commands when the folder itself is renamed, keeping the declared ones", async () => {
    const app = await seededApp()
    await app.send('library', { type: 'RENAME_ITEM', id: commandsFolderId(), name: 'old-commands', itemType: 'folder' })
    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))).toEqual(['pr2md', 'instructions'])
  })

  it("reports only a failure for seeds that don't name their pack, even when no section is selected", async () => {
    // With every section deselected no seeder runs, so nothing else reads the missing pack id
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unnamed-seeds-'))
    dependentDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'seeds.json'), JSON.stringify({ version: 1, seeds: [] }))
    const nothing = Object.fromEntries(Object.keys(manifest.boot.seed).map((key) => [key, []]))
    const app = await startApp({ systems: ['library', 'threads', 'brain', 'host/settings'] })
    await app.connect()

    await app.send('host/settings', { type: 'IMPORT_PACK_SEEDS', directory: dir, include: nothing, mode: 'replace-on-collision', restartBrain: false })
    const failed = await app.nextEmit('host/settings', 'PACK_SEEDS_IMPORT_FAILED') as unknown as { error: string }

    expect(failed.error).toContain("doesn't name the pack that compiled these seeds")
    expect(app.emitted('host/settings').map((event) => event.type)).not.toContain('PACK_SEEDS_IMPORTED')
  })

  it("reports the records an import from Settings couldn't seed, with the counts of the rest", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failing-seeds-'))
    dependentDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'seeds.json'), JSON.stringify({ version: 1, packId: manifest.id, seeds: [] }))
    const note = (title: string) => ({ entity: 'Note', title, noteType: 'document', content: 'x', sourceHash: `hash-${title}` })
    fs.writeFileSync(path.join(dir, 'notes.seed.json'), JSON.stringify({ records: [note(''), note('kept')] }))
    const app = await startApp({ systems: ['library', 'threads', 'brain', 'host/settings'] })
    await app.connect()

    await app.send('host/settings', { type: 'IMPORT_PACK_SEEDS', directory: dir, include: { notes: null }, mode: 'replace-on-collision', restartBrain: false })
    const imported = await app.nextEmit('host/settings', 'PACK_SEEDS_IMPORTED') as unknown as { result: Record<string, { created: number }>; errors: string[] }

    expect(imported.result.notes.created).toBe(1)
    expect(imported.errors).toHaveLength(1)
    expect(imported.errors[0]).toMatch(/^notes: .*Title is required/)
  })

  it('sends the chat the commands pack seeds imported from Settings bring', async () => {
    const app = await startApp({ systems: ['library', 'threads', 'brain', 'host/settings'] })
    await app.connect()
    await app.send('host/settings', { type: 'IMPORT_PACK_SEEDS', directory: DIST, include: { library: ['internal'] }, mode: 'replace-on-collision', restartBrain: false })
    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))).toContain('cdx-goal')
  })

  it("keeps the commands default-setup declares when its documents are gone", async () => {
    const app = await seededApp()
    await app.send('library', { type: 'DELETE_ITEMS', ids: [documentNamed('Claude Code commands').id, documentNamed('Codex commands').id] })

    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))).toEqual(['pr2md', 'instructions'])
  })

  it("sends nothing for a change that doesn't alter the commands", async () => {
    const app = await seededApp()
    await app.send('library', { type: 'CREATE_DOCUMENT', name: 'notes', content: field('not-a-command', 'x'), tags: [], collectionId: internalFolderId() })
    await app.nextEmit('library', 'DOCUMENT_CREATED')
    await app.settle()
    expect(app.emitted('threads').filter((event) => event.type === 'COMMANDS_UPDATED')).toEqual([])
    expect(services.library.commands().map((command) => command.name)).not.toContain('not-a-command')
  })

  it("nests a dependent pack's command document in default-setup's folders, and lists its commands", async () => {
    await seededApp()
    const before = repository.libraryQueries.getCollections()

    importCompiledSeeds({ compiledDir: dependentPackCommands('Team commands', 'team-standup') })

    const collections = repository.libraryQueries.getCollections()
    expect(collections.filter((collection) => collection.name === 'internal')).toHaveLength(1)
    expect(collections.find((collection) => collection.name === 'internal')!.id).toBe(before.find((collection) => collection.name === 'internal')!.id)
    expect(commandDocuments().map((document) => document.name)).toContain('Team commands')
    expect(services.library.commands().map((command) => command.name)).toEqual(expect.arrayContaining(['team-standup', 'cc-resume']))
  })

  // A pack registers when it's installed or enabled, and unregisters when it's disabled or uninstalled; the
  // host raises PACK_CHANGED once either is complete
  it("sends the chat a pack's declared commands when it registers, and drops them when it goes", async () => {
    const app = await seededApp()

    reregisterTeamNotes([{ name: 'team-standup', placeholder: 'Topic' }])
    await app.send('threads', { type: 'PACK_CHANGED', packId: 'team-notes' })
    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))).toContain('team-standup')

    reregisterTeamNotes()
    await app.send('threads', { type: 'PACK_CHANGED', packId: 'team-notes' })
    const afterUnregister = commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))
    expect(afterUnregister).not.toContain('team-standup')
    expect(afterUnregister).toContain('pr2md')
  })

  // The bus raises PACK_CHANGED when a pack is installed, updated or rebuilt while the app runs
  it('sends the chat the commands a pack seeded while the app runs brings', async () => {
    const app = await seededApp()
    importCompiledSeeds({ compiledDir: dependentPackCommands('Team commands', 'team-standup') })

    await app.send('threads', { type: 'PACK_CHANGED', packId: 'team-notes' })

    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))).toContain('team-standup')
  })

  it("sends nothing when a pack changes without altering the commands", async () => {
    const app = await seededApp()

    await app.send('threads', { type: 'PACK_CHANGED', packId: 'team-notes' })
    await app.settle()

    expect(app.emitted('threads').filter((event) => event.type === 'COMMANDS_UPDATED')).toEqual([])
  })

  it("sends the library plugin its index again when a pack changes, with what the pack seeded", async () => {
    const app = await seededApp()
    importCompiledSeeds({ compiledDir: dependentPackCommands('Team commands', 'team-standup') })

    const sentBefore = app.emitted('library').filter((event) => event.type === 'LIBRARY_CONNECTED').length

    await app.send('library', { type: 'PACK_CHANGED', packId: 'team-notes' })
    await app.settle()

    const sent = app.emitted('library').filter((event) => event.type === 'LIBRARY_CONNECTED') as unknown as Array<{ data: { index: { documents: Array<{ name: string }> } } }>
    expect(sent).toHaveLength(sentBefore + 1)
    expect(sent.at(-1)!.data.index.documents.map((document) => document.name)).toContain('Team commands')
  })

  it("keeps a folder of the same name elsewhere out of it: a name matches within its parent", async () => {
    await seededApp()

    // The dependent pack's own root-level commands folder, not default-setup's internal/commands
    importCompiledSeeds({ compiledDir: dependentPack([folder('commands', [document('Team commands', 'team-standup')])]) })

    const named = repository.libraryQueries.getCollections()
    expect(named.filter((collection) => collection.name === 'commands')).toHaveLength(1)
    expect(named.find((collection) => collection.name === 'internal')!.childCollections.map((child) => child.name)).toEqual(['commands'])
    expect(services.library.commands().map((command) => command.name)).not.toContain('team-standup')
  })

  it("matches a document by name in its folder, not one the user keeps elsewhere", async () => {
    await seededApp()
    const mine = repository.libraryCommands.createDocument('Team commands', field('mine', 'Untouched'), [], undefined)

    importCompiledSeeds({ compiledDir: dependentPackCommands('Team commands', 'team-standup') })

    expect(commandDocuments().map((document) => document.name)).toContain('Team commands')
    expect(services.library.commands().map((command) => command.name)).toContain('team-standup')
    expect(repository.libraryQueries.getDocument(mine.id)).toMatchObject({ content: field('mine', 'Untouched'), collectionId: undefined })
  })

  it('keeps the first definition of a command two documents define', async () => {
    await seededApp()
    const original = services.library.commands().find((command) => command.name === 'cc-resume')!
    repository.libraryCommands.createDocument('zz-override', field('cc-resume', 'Shadowed'), [], commandsFolderId())
    expect(services.library.commands().filter((command) => command.name === 'cc-resume')).toEqual([original])
  })
})

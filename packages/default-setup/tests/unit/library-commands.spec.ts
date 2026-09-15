// The chat's slash commands are the fields of every document in the library's internal/commands folder: the
// threads system sends them when a client connects, and again when a library change alters them
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { startApp, type TestApp } from '@abuddy/testing/harness'
import { seedData } from '@abuddy/sdk/utils'
import { repository } from '@/__generated__/repository'
import { services } from '@/__generated__/services'

const DIST = path.resolve(import.meta.dirname, '../../dist')

const commandNames = (event: unknown) => ((event as { commands: Array<{ name: string }> }).commands).map((command) => command.name)
const commandDocuments = () => repository.libraryQueries.getDocuments().filter((document) => document.collectionPath?.join('/') === 'internal/commands')
const commandsFolderId = () => commandDocuments()[0].collectionId!
const internalFolderId = () => repository.libraryQueries.getCollections().find((collection) => collection.name === 'internal' && !collection.parentId)!.id
const field = (key: string, value: string) => [{ type: 'field' as const, fields: [{ key, value }] }]
const documentNamed = (name: string) => repository.libraryQueries.getDocuments().find((document) => document.name === name)!

async function seededApp(): Promise<TestApp> {
  seedData({ compiledDir: DIST, include: { library: new Set(['internal']) } })
  // threads checks onboarding with the brain when a client connects
  const app = await startApp({ systems: ['library', 'threads', 'brain', 'settings'] })
  await app.connect()
  return app
}

describe('slash commands from the library commands folder', () => {
  it("lists default-setup's general, Claude Code and Codex commands, from one document each", async () => {
    const app = await seededApp()
    expect(commandDocuments().map((document) => document.name).sort()).toEqual(['Claude Code commands', 'Codex commands', 'General commands'])

    const connected = app.emitted('threads').find((event) => event.type === 'AGENT_CONNECTED') as unknown as { data: { commands: Array<{ name: string }> } }
    const names = connected.data.commands.map((command) => command.name)
    expect(names).toEqual(expect.arrayContaining(['pr2md', 'instructions', 'cc-resume', 'cc-goal', 'cdx-resume', 'cdx-goal']))
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(services.library.commands().map((command) => command.name))
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

    await app.send('library', { type: 'DELETE_ITEMS', ids: [documentNamed('General commands').id] })
    const afterDelete = commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))
    expect(afterDelete).not.toContain('pr2md')
    expect(afterDelete).toContain('cc-resume')
  })

  it('drops every command when the folder itself is renamed', async () => {
    const app = await seededApp()
    await app.send('library', { type: 'RENAME_ITEM', id: commandsFolderId(), name: 'old-commands', itemType: 'folder' })
    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))).toEqual([])
  })

  it('sends the chat the commands pack seeds imported from Settings bring', async () => {
    const app = await startApp({ systems: ['library', 'threads', 'brain', 'settings'] })
    await app.connect()
    await app.send('settings', { type: 'IMPORT_PACK_SEEDS', directory: DIST, include: { library: ['internal'] }, mode: 'replace-on-collision', restartBrain: false })
    expect(commandNames(await app.nextEmit('threads', 'COMMANDS_UPDATED'))).toContain('cdx-goal')
  })

  it("sends nothing for a change that doesn't alter the commands", async () => {
    const app = await seededApp()
    await app.send('library', { type: 'CREATE_DOCUMENT', name: 'notes', content: field('not-a-command', 'x'), tags: [], collectionId: internalFolderId() })
    await app.nextEmit('library', 'DOCUMENT_CREATED')
    await app.settle()
    expect(app.emitted('threads').filter((event) => event.type === 'COMMANDS_UPDATED')).toEqual([])
    expect(services.library.commands().map((command) => command.name)).not.toContain('not-a-command')
  })

  it('keeps the first definition of a command two documents define', async () => {
    await seededApp()
    const original = services.library.commands().find((command) => command.name === 'cc-resume')!
    repository.libraryCommands.createDocument('zz-override', field('cc-resume', 'Shadowed'), [], commandsFolderId())
    expect(services.library.commands().filter((command) => command.name === 'cc-resume')).toEqual([original])
  })
})

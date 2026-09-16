// The library index is every document and folder by name: the panel's stats and the reference picker
// read it, so the system sends it when a client connects and whenever one asks for it again
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { startApp, type TestApp } from '@abuddy/testing/harness'
import { seedData } from '@abuddy/sdk/utils'
import { repository } from '@/__generated__/repository'
import type { LibraryIndex } from '@/features/library/be/types'

const DIST = path.resolve(import.meta.dirname, '../../dist')

const indexOf = (event: unknown) => (event as { data: { index: LibraryIndex } }).data.index
const folderNamed = (name: string) => repository.libraryQueries.getCollections().find((collection) => collection.name === name)!.id

async function seededApp(): Promise<TestApp> {
  seedData({ compiledDir: DIST, include: { library: new Set(['internal']) } })
  const app = await startApp({ systems: ['library'] })
  await app.connect()
  return app
}

describe('the library index', () => {
  it('names every document and folder when a client connects, with each document’s tags', async () => {
    const app = await seededApp()
    await app.send('library', { type: 'CREATE_DOCUMENT', name: 'Tagged', content: [], tags: ['note', 'draft'], collectionId: folderNamed('internal') })
    await app.send('library', { type: 'GET_LIBRARY_INDEX' })

    const index = indexOf(await app.nextEmit('library', 'LIBRARY_INDEX_LOADED'))
    const tagged = index.documents.find((document) => document.name === 'Tagged')!
    expect(tagged.tags).toEqual(['note', 'draft'])
    expect(tagged.shortCode).toMatch(/^DOC-\d+$/)
    expect(index.documents.map((document) => document.name)).toEqual(
      expect.arrayContaining(['Tagged', 'Codex commands']),
    )
    expect(index.folders.map((folder) => folder.name)).toEqual(expect.arrayContaining(['internal', 'commands']))
  })

  it('lists a document in the index however deep its folder is, not only the open one', async () => {
    const app = await seededApp()
    const connected = indexOf(await app.nextEmit('library', 'LIBRARY_CONNECTED'))
    // The commands documents live two folders down, in internal/commands
    expect(connected.documents.map((document) => document.name)).toEqual(expect.arrayContaining(['Claude Code commands']))
  })

  it('drops a deleted document from the index', async () => {
    const app = await seededApp()
    await app.send('library', { type: 'CREATE_DOCUMENT', name: 'Temporary', content: [], tags: [], collectionId: folderNamed('internal') })
    const created = repository.libraryQueries.getDocuments().find((document) => document.name === 'Temporary')!

    await app.send('library', { type: 'DELETE_ITEMS', ids: [created.id] })
    await app.send('library', { type: 'GET_LIBRARY_INDEX' })

    const index = indexOf(await app.nextEmit('library', 'LIBRARY_INDEX_LOADED'))
    expect(index.documents.map((document) => document.name)).not.toContain('Temporary')
  })
})

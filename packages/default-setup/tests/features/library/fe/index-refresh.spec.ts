// The library index (every document and folder by name) backs the panel's stats, its tag counts and the
// tiptap reference picker. Nothing else refetches it, so every event that changes a name, a tag or the set
// of rows has to ask the backend for it again — otherwise the picker keeps offering stale names until the
// plugin is reactivated.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'

const sendToSystem = vi.hoisted(() => vi.fn())
vi.mock('@/__generated__/events', () => ({ sendToSystem }))

const { librarySystem } = await import('@/features/library/fe/state')

beforeEach(() => {
  sendToSystem.mockReset()
})

describe('the library index is refetched whenever it can go stale', () => {
  // Only DOCUMENT_UPDATED reads its payload here — it compares the updated id against the open document
  it.each([
    ['DOCUMENT_CREATED', {}],
    ['DOCUMENT_UPDATED', { data: { document: { id: 'Document-1' } } }],
    ['COLLECTION_CREATED', {}],
    ['ITEM_RENAMED', {}],
    ['ITEMS_DELETED', {}],
    ['ITEMS_MOVED', {}],
  ])('%s asks for it again', (eventType, payload) => {
    const actor = createActor(librarySystem).start()
    // whatever starting asked for is not what this is about
    sendToSystem.mockReset()

    actor.send({ type: eventType, ...payload } as Parameters<typeof actor.send>[0])

    expect(sendToSystem).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'GET_LIBRARY_INDEX' }))
  })
})

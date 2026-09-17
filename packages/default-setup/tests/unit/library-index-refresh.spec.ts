// The library index (every document and folder by name) backs the panel's stats, its tag counts and the
// tiptap reference picker. Nothing else refetches it, so every event that changes a name, a tag or the set
// of rows has to ask the backend for it again — otherwise the picker keeps offering stale names until the
// plugin is reactivated.
import { describe, expect, it } from 'vitest'
import { librarySystem } from '@/features/library/fe/state'

/** The actions a top-level event runs on the library plugin's machine */
function actionsFor(eventType: string): string[] {
  const transition = (librarySystem.config.on as Record<string, { actions?: unknown } | undefined>)[eventType]
  expect(transition, `the library machine handles ${eventType}`).toBeDefined()
  const actions = transition!.actions
  return (Array.isArray(actions) ? actions : [actions]).map((action) =>
    typeof action === 'string' ? action : (action as { type?: string })?.type ?? '',
  )
}

describe('the library index is refetched whenever it can go stale', () => {
  it.each([
    'DOCUMENT_CREATED',
    'DOCUMENT_UPDATED',
    'COLLECTION_CREATED',
    'ITEM_RENAMED',
    'ITEMS_DELETED',
    'ITEMS_MOVED',
  ])('%s asks for it again', (eventType) => {
    expect(actionsFor(eventType)).toContain('requestIndex')
  })

  it('and LIBRARY_INDEX_LOADED is what stores it', () => {
    expect(actionsFor('LIBRARY_INDEX_LOADED')).toContain('setIndex')
  })
})

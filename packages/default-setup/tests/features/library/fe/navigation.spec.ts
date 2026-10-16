import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { DocumentDTO, DocumentItem } from '#generated/types.ts';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('#generated/events.ts', () => ({ sendToSystem }));
const { librarySystem: libraryState } = await import('#features/library/fe/state.ts');
const actors: ReturnType<typeof createActor<typeof libraryState>>[] = [];
const view = () => { const actor = createActor(libraryState).start(); actors.push(actor); return actor; };
const document = (id: `Document-${string}`): DocumentDTO => ({ id, name: id, shortCode: 'DOC-1',
  content: [], tags: [], displayOrder: 0, createdAt: '2026-10-16', updatedAt: '2026-10-16' });
const loaded = (id: `Document-${string}`) => ({ type: 'DOCUMENT_LOADED' as const, data: { document: document(id) } });
beforeEach(() => { sendToSystem.mockClear(); });
afterEach(() => actors.splice(0).forEach(actor => actor.stop()));

it('does not open an editor for a document requested by another window', () => {
  const actor = view();
  actor.send(loaded('Document-other-window'));
  expect(actor.getSnapshot().matches('browser')).toBe(true);
  expect(actor.getSnapshot().context.editingDocument).toBeUndefined();
});

it('keeps the current document target when an older document finishes loading', () => {
  const actor = view();
  actor.send({ type: 'OPEN_ENTITY', id: 'Document-first' });
  actor.send({ type: 'OPEN_ENTITY', id: 'Document-second' });
  actor.send(loaded('Document-first'));
  expect(actor.getSnapshot().context.editingDocument).toBeUndefined();
  actor.send(loaded('Document-second'));
  expect(actor.getSnapshot().context.editingDocument?.id).toBe('Document-second');
});

it('does not reopen an abandoned editor after navigating to a collection', () => {
  const actor = view();
  actor.send({ type: 'OPEN_ENTITY', id: 'Document-first' });
  actor.send({ type: 'OPEN_ENTITY', id: 'Collection-second' });
  actor.send(loaded('Document-first'));
  expect(actor.getSnapshot().matches('browser')).toBe(true);
  expect(actor.getSnapshot().context.currentFolderId).toBe('Collection-second');
});

it('opens cached document data without a redundant fetch', () => {
  const actor = view();
  const item = { ...document('Document-cached'), type: 'document', parentId: null, size: '0 B', kind: 'Document', displayOrder: 7 } satisfies DocumentItem;
  actor.send({ type: 'FOLDER_CONTENTS_LOADED', data: { items: [item], currentFolderId: null, currentPath: [], breadcrumbs: [] } });
  actor.send({ type: 'OPEN_ENTITY', id: 'Document-cached' });
  expect(actor.getSnapshot().context.editingDocument).toMatchObject({ id: 'Document-cached', displayOrder: 7 });
  expect(sendToSystem.mock.calls.filter(([, event]) => event.type === 'GET_DOCUMENT')).toEqual([]);
});

it('keeps the document available to a save while retiring its editor target', () => {
  const actor = view();
  actor.send({ type: 'OPEN_ENTITY', id: 'Document-first' }); actor.send(loaded('Document-first'));
  actor.send({ type: 'SAVE_DOCUMENT', name: 'Saved', content: [], tags: [] });
  expect(sendToSystem).toHaveBeenCalledWith('library', expect.objectContaining({ type: 'UPDATE_DOCUMENT', id: 'Document-first', name: 'Saved' }));
  actor.send(loaded('Document-first'));
  expect(actor.getSnapshot().matches('browser')).toBe(true);
});
